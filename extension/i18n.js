// SPDX-FileCopyrightText: 2026 Optimey CommV
// SPDX-License-Identifier: GPL-3.0-or-later

// Shared by the service worker, the popup and the options page:
// supported languages and countries, settings, detection and text lookup.

const LANGUAGES = {
  bg: "Български", cs: "Čeština", da: "Dansk", de: "Deutsch", el: "Ελληνικά", en: "English",
  es: "Español", et: "Eesti", fi: "Suomi", fr: "Français", hr: "Hrvatski", hu: "Magyar",
  it: "Italiano", lt: "Lietuvių", lv: "Latviešu", nl: "Nederlands", pl: "Polski", pt: "Português",
  ro: "Română", sk: "Slovenčina", sl: "Slovenščina", sv: "Svenska"
};

// VIES country codes (EL = Greece, XI = Northern Ireland) with an example of the number format.
const COUNTRIES = {
  AT: "U12345678", BE: "0123.456.789", BG: "123456789", CY: "12345678X", CZ: "12345678",
  DE: "123456789", DK: "12345678", EE: "123456789", EL: "123456789", ES: "X1234567X",
  FI: "12345678", FR: "12345678901", HR: "12345678901", HU: "12345678", IE: "1234567X",
  IT: "12345678901", LT: "123456789", LU: "12345678", LV: "12345678901", MT: "12345678",
  NL: "123456789B01", PL: "1234567890", PT: "123456789", RO: "12345678", SE: "123456789001",
  SI: "12345678", SK: "1234567890", XI: "123456789"
};

// IANA time zones that belong to exactly one EU member state.
const TIME_ZONES = {
  "Europe/Vienna": "AT", "Europe/Brussels": "BE", "Europe/Sofia": "BG", "Asia/Nicosia": "CY",
  "Asia/Famagusta": "CY", "Europe/Nicosia": "CY", "Europe/Prague": "CZ", "Europe/Berlin": "DE",
  "Europe/Busingen": "DE", "Europe/Copenhagen": "DK", "Europe/Tallinn": "EE", "Europe/Athens": "EL",
  "Europe/Madrid": "ES", "Africa/Ceuta": "ES", "Atlantic/Canary": "ES", "Europe/Helsinki": "FI",
  "Europe/Mariehamn": "FI", "Europe/Paris": "FR", "Europe/Zagreb": "HR", "Europe/Budapest": "HU",
  "Europe/Dublin": "IE", "Europe/Rome": "IT", "Europe/Vilnius": "LT", "Europe/Luxembourg": "LU",
  "Europe/Riga": "LV", "Europe/Malta": "MT", "Europe/Amsterdam": "NL", "Europe/Warsaw": "PL",
  "Europe/Lisbon": "PT", "Atlantic/Madeira": "PT", "Atlantic/Azores": "PT", "Europe/Bucharest": "RO",
  "Europe/Stockholm": "SE", "Europe/Ljubljana": "SI", "Europe/Bratislava": "SK", "Europe/Belfast": "XI"
};

// pulsePeriod: duration of one pulse in milliseconds, 10 to 2000 in steps of 10.
const DEFAULT_SETTINGS = { country: "auto", language: "auto", pulse: true, pulsePeriod: 1600 };
const PULSE_MIN = 10;
const PULSE_MAX = 2000;

function clampPeriod(ms) {
  const n = Math.round(Number(ms) / 10) * 10;
  return Number.isFinite(n) ? Math.min(PULSE_MAX, Math.max(PULSE_MIN, n)) : DEFAULT_SETTINGS.pulsePeriod;
}

function formatSeconds(ms, language) {
  try {
    return new Intl.NumberFormat(language, { style: "unit", unit: "second", unitDisplay: "short",
      minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(ms / 1000);
  } catch (e) {
    return (ms / 1000).toFixed(2) + " s";
  }
}

function detectLanguage() {
  const candidates = [];
  try { candidates.push(chrome.i18n.getUILanguage()); } catch (e) { /* not available */ }
  if (typeof navigator !== "undefined") candidates.push(...(navigator.languages || []));
  for (const tag of candidates) {
    const base = String(tag || "").toLowerCase().split(/[-_]/)[0];
    if (LANGUAGES[base]) return base;
  }
  return "en";
}

function detectCountry() {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (TIME_ZONES[tz]) return TIME_ZONES[tz];
  } catch (e) { /* ignore */ }
  const tags = typeof navigator !== "undefined" ? (navigator.languages || []) : [];
  for (const tag of tags) {
    let region = (String(tag).split(/[-_]/)[1] || "").toUpperCase();
    if (region === "GR") region = "EL";
    if (region && region !== "XI" && COUNTRIES[region]) return region;
  }
  return null;
}

async function loadSettings() {
  const stored = await chrome.storage.sync.get(DEFAULT_SETTINGS);
  const country = stored.country !== "auto" && COUNTRIES[stored.country] ? stored.country : detectCountry();
  const language = stored.language !== "auto" && LANGUAGES[stored.language] ? stored.language : detectLanguage();
  const pulse = stored.pulse !== false;
  const period = clampPeriod(stored.pulsePeriod);
  return { stored, country, language, pulse, period };
}

const _cache = {};
async function loadMessages(language) {
  const get = async lang => {
    if (!_cache[lang]) {
      const r = await fetch(chrome.runtime.getURL(`lang/${lang}.json`));
      _cache[lang] = await r.json();
    }
    return _cache[lang];
  };
  const en = await get("en");
  return language === "en" ? en : Object.assign({}, en, await get(language));
}

function fill(text, vars) {
  return String(text).replace(/\{(\w+)\}/g, (m, k) => (vars && k in vars ? vars[k] : m));
}

function makeT(messages) {
  return (key, vars) => fill(messages[key] !== undefined ? messages[key] : key, vars);
}

function countryName(code, language, messages) {
  if (!code) return "";
  if (code === "XI") return messages.country_XI || "Northern Ireland";
  try {
    return new Intl.DisplayNames([language], { type: "region" }).of(code === "EL" ? "GR" : code);
  } catch (e) {
    return code;
  }
}

// Date and time in the convention of the chosen language and country (nl + BE gives 23/11/2026 09:35:38).
function formatTime(ms, language, country) {
  const region = country === "EL" ? "GR" : country === "XI" ? "GB" : country;
  const d = new Date(ms);
  try {
    const tag = region ? `${language}-${region}` : language;
    const date = new Intl.DateTimeFormat(tag, { day: "2-digit", month: "2-digit", year: "numeric" }).format(d);
    const time = new Intl.DateTimeFormat(tag, { hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }).format(d);
    return `${date} ${time}`;
  } catch (e) {
    return d.toLocaleString();
  }
}

function sortedCountries(language, messages) {
  return Object.keys(COUNTRIES)
    .map(code => ({ code, name: countryName(code, language, messages) }))
    .sort((a, b) => a.name.localeCompare(b.name, language));
}
