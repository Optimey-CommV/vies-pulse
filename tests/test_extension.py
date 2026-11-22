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


async def run(chrome: str | None, screenshot: str | None) -> None:
    mock_vies.start(PORT)
    mock_vies.STATE["BE"] = "Unavailable"
    with tempfile.TemporaryDirectory() as tmp:
        ext = prepare_extension(Path(tmp))
        async with async_playwright() as p:
            ctx = await p.chromium.launch_persistent_context(
                str(Path(tmp) / "profile"),
                executable_path=chrome,
                headless=True,
                args=[f"--disable-extensions-except={ext}", f"--load-extension={ext}"],
            )
            for _ in range(40):
                if ctx.service_workers:
                    break
                await asyncio.sleep(0.25)
            assert ctx.service_workers, "service worker did not start"
            sw = ctx.service_workers[0]
            ext_id = sw.url.split("/")[2]

            for _ in range(40):
                st = await sw.evaluate("chrome.storage.local.get('status')")
                if st.get("status"):
                    break
                await asyncio.sleep(0.25)
            assert st.get("status") == "offline", st

            page = await ctx.new_page()
            await page.set_viewport_size({"width": 340, "height": 470})
            errors = []
            page.on("pageerror", lambda e: errors.append(str(e)))
            await page.goto(f"chrome-extension://{ext_id}/popup.html")

            anim = await page.evaluate("getComputedStyle(document.getElementById('dot')).animationName")
            assert anim == "blink", f"offline dot should blink, got {anim}"

            mock_vies.STATE["BE"] = "Available"
            await page.click("#nu")
            await page.wait_for_function("document.getElementById('titel').textContent === 'Online'")
            anim = await page.evaluate("getComputedStyle(document.getElementById('dot')).animationName")
            assert anim == "none", f"online dot should not blink, got {anim}"
            title = await sw.evaluate("chrome.action.getTitle({})")
            assert title == "VIES België: online", title

            cases = [
                ("NL 123", "Ongeldig"),
                ("BE 0987.654.321", "Niet te controleren"),
                ("DE123456789", "Geldig btw-nummer"),
                ("XX123", "Onbekende landcode"),
                ("0123.456.749", "EXAMPLE NV"),
            ]
            for value, expected in cases:
                await page.fill("#btw", value)
                await page.click("#go")
                await page.wait_for_function(
                    "e => document.getElementById('res').innerText.includes(e)", arg=expected
                )
                print(f"ok  {value!r:20} -> {expected}")

            if screenshot:
                await page.screenshot(path=screenshot)
            assert not errors, errors
            await ctx.close()
    print("all tests passed")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--chrome", help="path to a Chromium or Chrome for Testing binary")
    ap.add_argument("--screenshot", help="write a screenshot of the popup to this path")
    args = ap.parse_args()
    asyncio.run(run(args.chrome, args.screenshot))


if __name__ == "__main__":
    main()
