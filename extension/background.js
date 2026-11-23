// SPDX-FileCopyrightText: 2026 Optimey CommV
// SPDX-License-Identifier: GPL-3.0-or-later

// Checks the VIES status page once per minute for the chosen member state
// and shows the result in the toolbar icon.
importScripts("config.js", "i18n.js", "icon.js");
const STATUS_URL = VIES_BASE + "/check-status";
const ALARM = "vies-check";

const COLOURS = {
  online: "#1fa83a",
  offline: "#d92b2b",
  error: "#ef9a10",
  checking: "#8a8f98",
  nocountry: "#8a8f98"
};

const TIPS = {
  online: "tip_online", offline: "tip_offline", error: "tip_error",
  checking: "tip_checking", nocountry: "tip_nocountry"
};

// While the chosen country is unavailable, the toolbar icon pulses slowly.
// Each setIcon call also keeps the service worker awake for as long as the pulse runs.
let pulseTimer = null;
let pulsePeriod = 0;

function startPulse(period) {
  if (pulseTimer && pulsePeriod === period) return;
  stopPulse();
  pulsePeriod = period;
  // Chrome cannot swap the toolbar icon much faster than every 40 ms;
  // shorter pulses fall back to that frame rate (the popup follows exactly).
  const steps = Math.max(2, Math.min(24, Math.round(period / 40)));
  const frames = [];
  for (let i = 0; i < steps; i++) {
    const glow = pulseGlow((i * period) / steps, period);
    const imageData = {};
    for (const size of [16, 24, 32]) imageData[size] = renderIcon(COLOURS.offline, size, glow);
    frames.push(imageData);
  }
  let i = 0;
  pulseTimer = setInterval(() => {
    chrome.action.setIcon({ imageData: frames[i++ % steps] }).catch(() => {});
  }, Math.max(40, period / steps));
}

function stopPulse() {
  clearInterval(pulseTimer);
  pulseTimer = null;
}

async function setIcon(status) {
  const { country, language, pulse, period } = await loadSettings();
  const messages = await loadMessages(language);
  const t = makeT(messages);
  if (status === "offline" && pulse) {
    startPulse(period);
  } else {
    stopPulse();
    const colour = COLOURS[status] || COLOURS.checking;
    const imageData = {};
    for (const size of [16, 24, 32]) imageData[size] = renderIcon(colour, size);
    await chrome.action.setIcon({ imageData });
  }
  const tip = t(TIPS[status] || TIPS.checking);
  const name = country ? countryName(country, language, messages) : "";
  await chrome.action.setTitle({ title: name ? `VIES (${name}): ${tip}` : `VIES: ${tip}` });
}

async function check() {
  const { country, language } = await loadSettings();
  let status;
  let error = null;
  if (!country) {
    status = "nocountry";
  } else {
    try {
      const r = await fetch(STATUS_URL, { cache: "no-store" });
      if (!r.ok) throw new Error("HTTP " + r.status);
      const data = await r.json();
      const entry = (data.countries || []).find(c => c.countryCode === country);
      if (!entry) throw new Error("No status for " + country);
      status = entry.availability === "Available" ? "online" : "offline";
    } catch (e) {
      status = "error";
      error = String(e && e.message ? e.message : e);
    }
  }

  const previous = await chrome.storage.local.get(["status", "country"]);
  await chrome.storage.local.set({ status, country, error, checkedAt: Date.now() });
  await setIcon(status);

  if (status === "online" && previous.country === country && previous.status && previous.status !== "online") {
    const messages = await loadMessages(language);
    const t = makeT(messages);
    chrome.notifications.create("vies-online", {
      type: "basic",
      iconUrl: "icons/icon128.png",
      title: t("notif_title"),
      message: t("notif_text", { country: countryName(country, language, messages) }),
      priority: 2
    });
  }
  return status;
}

function startAlarm() {
  chrome.alarms.create(ALARM, { periodInMinutes: 1 });
}

chrome.runtime.onInstalled.addListener(() => { startAlarm(); check(); });
chrome.runtime.onStartup.addListener(() => { startAlarm(); check(); });

chrome.alarms.onAlarm.addListener(a => {
  if (a.name === ALARM) check();
});

// A different country: show "checking" right away and check again.
// Another language or pulse setting: redraw the icon and its tooltip.
chrome.storage.onChanged.addListener(async (changes, area) => {
  if (area !== "sync") return;
  if (changes.country) {
    await chrome.storage.local.set({ status: "checking", checkedAt: null });
    await setIcon("checking");
    check();
  } else if (changes.language || changes.pulse || changes.pulsePeriod) {
    const { status } = await chrome.storage.local.get("status");
    setIcon(status || "checking");
  }
});

chrome.runtime.onMessage.addListener((msg, _sender, reply) => {
  if (msg && msg.type === "check") {
    check().then(s => reply({ status: s }));
    return true;
  }
});

// When the service worker wakes up again, restore the icon.
chrome.storage.local.get("status").then(({ status }) => setIcon(status || "checking"));
