// SPDX-FileCopyrightText: 2026 Optimey CommV
// SPDX-License-Identifier: GPL-3.0-or-later

const $ = id => document.getElementById(id);
let savedTimer = null;
let currentLanguage = "en";

function option(value, text, selected) {
  const o = document.createElement("option");
  o.value = value;
  o.textContent = text;
  o.selected = selected;
  return o;
}

async function render() {
  const { stored, language } = await loadSettings();
  const messages = await loadMessages(language);
  const t = makeT(messages);
  document.documentElement.lang = language;
  document.title = `VIES: ${t("opt_title")}`;
  $("title").textContent = t("opt_title");
  $("countryLabel").textContent = t("opt_country");
  $("countryHelp").textContent = t("opt_country_help");
  $("languageLabel").textContent = t("opt_language");
  $("languageHelp").textContent = t("opt_language_help");

  const detected = detectCountry();
  const country = $("country");
  country.textContent = "";
  country.appendChild(option("auto",
    t("opt_auto", { value: detected ? countryName(detected, language, messages) : t("opt_not_detected") }),
    stored.country === "auto"));
  for (const c of sortedCountries(language, messages)) {
    country.appendChild(option(c.code, `${c.name} (${c.code})`, stored.country === c.code));
  }

  const lang = $("language");
  lang.textContent = "";
  lang.appendChild(option("auto", t("opt_auto", { value: LANGUAGES[detectLanguage()] }), stored.language === "auto"));
  Object.keys(LANGUAGES)
    .sort((a, b) => LANGUAGES[a].localeCompare(LANGUAGES[b], "en"))
    .forEach(code => lang.appendChild(option(code, LANGUAGES[code], stored.language === code)));

  $("reset").textContent = t("opt_reset");
  showAbout(t);
  $("pulseLabel").textContent = t("opt_pulse");
  $("pulseEnable").textContent = t("opt_pulse_enable");
  $("pulseHelp").textContent = t("opt_pulse_help");
  $("speedLabel").textContent = t("opt_pulse_speed");
  $("pulse").checked = stored.pulse !== false;
  const slider = $("pulsePeriod");
  slider.value = clampPeriod(stored.pulsePeriod);
  slider.disabled = !$("pulse").checked;
  $("periodValue").textContent = formatSeconds(Number(slider.value), language);
  currentLanguage = language;
  return t;
}

// "Developed by Optimey" with a link, the source code and the version.
function showAbout(t) {
  const made = $("madeBy");
  made.textContent = "";
  const [before, after] = t("opt_made_by").split("{name}");
  const link = document.createElement("a");
  link.href = "https://linkedin.optimey.be";
  link.target = "_blank";
  link.rel = "noopener";
  link.textContent = "Optimey";
  made.append(before || "", link, after || "");
  $("source").textContent = t("opt_source");
  $("version").textContent = "v" + chrome.runtime.getManifest().version;
}

async function save(key, value) {
  await chrome.storage.sync.set({ [key]: value });
  await confirmSaved();
}

async function confirmSaved() {
  const t = await render();
  $("saved").textContent = t("opt_saved");
  clearTimeout(savedTimer);
  savedTimer = setTimeout(() => { $("saved").textContent = ""; }, 2000);
}

$("reset").addEventListener("click", async () => {
  await chrome.storage.sync.set(DEFAULT_SETTINGS);
  await confirmSaved();
});
$("country").addEventListener("change", e => save("country", e.target.value));
$("language").addEventListener("change", e => save("language", e.target.value));
$("pulse").addEventListener("change", e => save("pulse", e.target.checked));
$("pulsePeriod").addEventListener("input", e => {
  $("periodValue").textContent = formatSeconds(Number(e.target.value), currentLanguage);
});
$("pulsePeriod").addEventListener("change", e => save("pulsePeriod", clampPeriod(e.target.value)));
render();
