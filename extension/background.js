// SPDX-FileCopyrightText: 2026 Optimey CommV
// SPDX-License-Identifier: GPL-3.0-or-later

// VIES België status: controleert elke minuut de officiële VIES-statuspagina.
importScripts("config.js");
const STATUS_URL = VIES_BASE + "/check-status";
const ALARM = "vies-check";

const KLEUREN = {
  online: "#1ebe3c",
  offline: "#e12323",
  fout: "#f0a014",
  onbekend: "#9a9a9a"
};

const TITELS = {
  online: "VIES België: online",
  offline: "VIES België: niet beschikbaar",
  fout: "VIES België: kan niet controleren",
  onbekend: "VIES België: nog niet gecontroleerd"
};

function tekenIcoon(kleur, size) {
  const c = new OffscreenCanvas(size, size);
  const g = c.getContext("2d");
  const r = size / 2 - Math.max(1, size / 16);
  g.beginPath();
  g.arc(size / 2, size / 2, r, 0, Math.PI * 2);
  g.fillStyle = kleur;
  g.fill();
  g.lineWidth = Math.max(1, size / 16);
  g.strokeStyle = "rgba(0,0,0,0.45)";
  g.stroke();
  return g.getImageData(0, 0, size, size);
}

async function zetIcoon(status) {
  const kleur = KLEUREN[status] || KLEUREN.onbekend;
  await chrome.action.setIcon({
    imageData: { 16: tekenIcoon(kleur, 16), 32: tekenIcoon(kleur, 32) }
  });
  await chrome.action.setTitle({ title: TITELS[status] || TITELS.onbekend });
}

async function controleer() {
  let status;
  let fout = null;
  try {
    const r = await fetch(STATUS_URL, { cache: "no-store" });
    if (!r.ok) throw new Error("HTTP " + r.status);
    const data = await r.json();
    const be = (data.countries || []).find(c => c.countryCode === "BE");
    if (!be) throw new Error("Status voor België niet gevonden");
    status = be.availability === "Available" ? "online" : "offline";
  } catch (e) {
    status = "fout";
    fout = String(e && e.message ? e.message : e);
  }

  const { status: vorige } = await chrome.storage.local.get("status");
  await chrome.storage.local.set({ status, fout, gecontroleerd: Date.now() });
  await zetIcoon(status);

  if (status === "online" && vorige && vorige !== "online") {
    chrome.notifications.create("vies-online", {
      type: "basic",
      iconUrl: "icons/icon128.png",
      title: "VIES België is terug online",
      message: "Btw-nummers valideren werkt weer.",
      priority: 2
    });
  }
  return status;
}

function startAlarm() {
  chrome.alarms.create(ALARM, { periodInMinutes: 1 });
}

chrome.runtime.onInstalled.addListener(() => { startAlarm(); controleer(); });
chrome.runtime.onStartup.addListener(() => { startAlarm(); controleer(); });

chrome.alarms.onAlarm.addListener(a => {
  if (a.name === ALARM) controleer();
});

chrome.runtime.onMessage.addListener((msg, _sender, antwoord) => {
  if (msg && msg.type === "controleer") {
    controleer().then(s => antwoord({ status: s }));
    return true;
  }
});

// Bij het opnieuw opstarten van de service worker het icoon herstellen.
chrome.storage.local.get("status").then(({ status }) => zetIcoon(status || "onbekend"));
