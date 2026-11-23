# SPDX-FileCopyrightText: 2026 Optimey CommV
# SPDX-License-Identifier: GPL-3.0-or-later
"""End-to-end test of the Chrome extension against a local stand-in for VIES.

Requirements: Python 3.10+, `pip install playwright`, and a Chromium build that still
accepts --load-extension (Chromium, or Chrome for Testing; branded Chrome refuses it).

    python tests/test_extension.py [--chrome /path/to/chrome] [--screenshot docs/popup.png]
"""

import argparse
import asyncio
import json
import os
import shutil
import sys
import tempfile
from pathlib import Path

from playwright.async_api import async_playwright

sys.path.insert(0, str(Path(__file__).parent))
import mock_vies  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
PORT = 8765


def prepare_extension(target: Path) -> Path:
    ext = target / "extension"
    shutil.copytree(ROOT / "extension", ext)
    cfg = ext / "config.js"
    cfg.write_text(
        cfg.read_text(encoding="utf-8").replace(
            "https://ec.europa.eu/taxation_customs/vies/rest-api", f"http://127.0.0.1:{PORT}"
        ),
        encoding="utf-8",
    )
    manifest = json.loads((ext / "manifest.json").read_text(encoding="utf-8"))
    manifest["host_permissions"].append("http://127.0.0.1/*")
    (ext / "manifest.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    return ext


def check_language_files() -> None:
    lang = ROOT / "extension" / "lang"
    en = json.loads((lang / "en.json").read_text(encoding="utf-8"))
    for f in sorted(lang.glob("*.json")):
        d = json.loads(f.read_text(encoding="utf-8"))
        assert set(d) == set(en), f"{f.name}: keys differ from en.json"
        for k, v in d.items():
            assert "\u2014" not in v and "\u2013" not in v, f"{f.name}:{k} contains a dash"
    print(f"ok  {len(list(lang.glob('*.json')))} language files have the same keys")


async def text(page, el_id):
    return await page.evaluate("id => document.getElementById(id).textContent", el_id)


async def pulses(page) -> bool:
    """Sample a point beside the lens a few times; the swelling wave changes its colour."""
    seen = set()
    for _ in range(6):
        px = await page.evaluate(
            "() => Array.from(document.getElementById('icon').getContext('2d').getImageData(82, 22, 1, 1).data).join(',')"
        )
        seen.add(px)
        await asyncio.sleep(0.25)
    return len(seen) > 1


async def wait_text(page, el_id, expected):
    await page.wait_for_function(
        "([id, e]) => document.getElementById(id).textContent.includes(e)", arg=[el_id, expected]
    )


class Browser:
    def __init__(self, p, chrome, ext, tmp, tz, lang):
        self.p, self.chrome, self.ext, self.tmp, self.tz, self.lang = p, chrome, ext, tmp, tz, lang

    async def __aenter__(self):
        self.ctx = await self.p.chromium.launch_persistent_context(
            str(Path(self.tmp) / f"profile-{self.tz.replace('/', '-')}-{self.lang}"),
            executable_path=self.chrome,
            headless=True,
            timezone_id=self.tz,
            env={**os.environ, "TZ": self.tz},  # the service worker uses the real time zone
            locale=self.lang,
            args=[f"--disable-extensions-except={self.ext}", f"--load-extension={self.ext}", f"--lang={self.lang}"],
        )
        for _ in range(40):
            if self.ctx.service_workers:
                break
            await asyncio.sleep(0.25)
        assert self.ctx.service_workers, "service worker did not start"
        self.sw = self.ctx.service_workers[0]
        self.id = self.sw.url.split("/")[2]
        for _ in range(40):
            st = await self.sw.evaluate("chrome.storage.local.get('status')")
            if st.get("status") and st["status"] != "checking":
                break
            await asyncio.sleep(0.25)
        self.status = st.get("status")
        return self

    async def popup(self):
        page = await self.ctx.new_page()
        await page.set_viewport_size({"width": 340, "height": 560})
        self.errors = []
        page.on("pageerror", lambda e: self.errors.append(str(e)))
        await page.goto(f"chrome-extension://{self.id}/popup.html")
        await page.wait_for_function("() => document.getElementById('title').textContent.length > 0")
        return page

    async def __aexit__(self, *exc):
        await self.ctx.close()


async def run(chrome: str | None, screenshot: str | None) -> None:
    check_language_files()
    mock_vies.start(PORT)
    with tempfile.TemporaryDirectory() as tmp:
        ext = prepare_extension(Path(tmp))
        async with async_playwright() as p:
            # Belgium, Dutch: country and language come from the time zone and Chrome.
            mock_vies.STATE["BE"] = "Unavailable"
            async with Browser(p, chrome, ext, tmp, "Europe/Brussels", "nl-BE") as b:
                assert b.status == "offline", b.status
                tips = set()
                for _ in range(6):
                    tips.add(await b.sw.evaluate(
                        "chrome.action.getBadgeText({}).then(() => typeof pulseTimer === 'number' || !!pulseTimer)"))
                    await asyncio.sleep(0.1)
                assert tips == {True}, "toolbar icon should pulse while offline"
                page = await b.popup()
                assert await text(page, "land") == "VIES · België"
                assert await text(page, "title") == "Niet beschikbaar"
                assert await pulses(page), "offline icon should pulse"
                assert "/" in await text(page, "sub"), "Belgian date format expected"

                mock_vies.STATE["BE"] = "Available"
                await page.click("#now")
                await wait_text(page, "title", "Beschikbaar")
                assert not await pulses(page), "online icon should stay steady"
                tip = await b.sw.evaluate("chrome.action.getTitle({})")
                assert tip == "VIES (België): beschikbaar", tip

                cases = [
                    ("NL 123", "Ongeldig btw-nummer"),
                    ("BE 0987.654.321", "Controle niet mogelijk"),
                    ("DE123456789", "Geldig btw-nummer"),
                    ("XX123", "Onbekende landcode"),
                    ("0123.456.749", "EXAMPLE NV"),
                ]
                for value, expected in cases:
                    await page.fill("#vat", value)
                    await page.click("#go")
                    await wait_text(page, "res", expected)
                    print(f"ok  {value!r:20} -> {expected}")
                if screenshot:
                    await page.screenshot(path=screenshot)
                assert not b.errors, b.errors
            print("ok  Brussels / nl-BE: BE, Dutch, slow pulse only when offline")

            # The Netherlands time zone with a German browser.
            async with Browser(p, chrome, ext, tmp, "Europe/Amsterdam", "de-DE") as b:
                assert b.status == "online", b.status
                page = await b.popup()
                assert await text(page, "land") == "VIES · Niederlande"
                assert await text(page, "title") == "Verfügbar"
                await page.fill("#vat", "123")
                await page.click("#go")
                await wait_text(page, "res", "NL 123")
                assert not b.errors, b.errors

                # Overrides in the settings win over detection.
                await b.sw.evaluate("chrome.storage.sync.set({country: 'EL', language: 'fr'})")
                await wait_text(page, "land", "Grèce")
                await wait_text(page, "title", "Disponible")
                assert await text(page, "go") == "Vérifier"
                tip = await b.sw.evaluate("chrome.action.getTitle({})")
                assert tip == "VIES (Grèce) : disponible" or tip == "VIES (Grèce): disponible", tip

                # Every language renders without missing keys.
                en = json.loads((ROOT / "extension/lang/en.json").read_text(encoding="utf-8"))
                for code in sorted(p.stem for p in (ROOT / "extension/lang").glob("*.json")):
                    await b.sw.evaluate(f"chrome.storage.sync.set({{language: '{code}'}})")
                    want = json.loads((ROOT / f"extension/lang/{code}.json").read_text(encoding="utf-8"))
                    await wait_text(page, "go", want["vat_submit"])
                    for el in ("title", "now", "vatHeading", "hint"):
                        value = await text(page, el)
                        assert value and value not in en.keys(), f"{code}: {el} shows {value!r}"
                print("ok  Amsterdam / de-DE: NL detected, overrides and all languages render")

                opt = await b.ctx.new_page()
                await opt.goto(f"chrome-extension://{b.id}/options.html")
                await opt.wait_for_function("() => document.getElementById('country').options.length > 20")
                await opt.select_option("#country", "LU")
                await opt.select_option("#language", "nl")
                await opt.eval_on_selector("#pulsePeriod",
                    "el => { el.value = 730; el.dispatchEvent(new Event('input')); el.dispatchEvent(new Event('change')); }")
                await opt.wait_for_function("() => document.getElementById('periodValue').textContent.includes('0,73')")
                await opt.click("#pulse")
                st = await b.sw.evaluate("chrome.storage.sync.get(null)")
                assert st == {"country": "LU", "language": "nl", "pulse": False, "pulsePeriod": 730}, st
                assert await opt.evaluate("document.getElementById('pulsePeriod').disabled")
                lo, hi, step = await opt.evaluate(
                    "() => { const e = document.getElementById('pulsePeriod'); return [e.min, e.max, e.step]; }")
                assert (lo, hi, step) == ("10", "2000", "10"), (lo, hi, step)
                await wait_text(page, "land", "Luxemburg")

                # Pulse switched off: an unavailable country stays steady red.
                mock_vies.STATE["LU"] = "Unavailable"
                await page.click("#now")
                await wait_text(page, "title", "Niet beschikbaar")
                assert not await pulses(page), "pulse is switched off"
                await opt.click("#pulse")
                await page.wait_for_function("() => document.getElementById('icon').dataset.pulse === 'on'")
                assert await pulses(page), "pulse is switched on again"
                await opt.click("#reset")
                await page.wait_for_function("() => document.getElementById('land').textContent.includes('Niederlande')")
                st = await b.sw.evaluate("chrome.storage.sync.get(null)")
                assert st == {"country": "auto", "language": "auto", "pulse": True, "pulsePeriod": 1600}, st
                await opt.wait_for_function("() => document.getElementById('pulsePeriod').value === '1600'")
                print("ok  options page saves country, language and pulse settings, and resets them")

            # Outside the EU: no country until one is chosen.
            async with Browser(p, chrome, ext, tmp, "America/New_York", "en-US") as b:
                assert b.status == "nocountry", b.status
                page = await b.popup()
                assert await text(page, "title") == "No country selected"
                assert not b.errors, b.errors
            print("ok  New York / en-US: asks to choose a country")
    print("all tests passed")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--chrome", help="path to a Chromium or Chrome for Testing binary")
    ap.add_argument("--screenshot", help="write a screenshot of the popup to this path")
    args = ap.parse_args()
    asyncio.run(run(args.chrome, args.screenshot))


if __name__ == "__main__":
    main()
