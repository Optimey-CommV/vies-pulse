// SPDX-FileCopyrightText: 2026 Optimey CommV
// SPDX-License-Identifier: GPL-3.0-or-later

const TEKST = {
  online:   ["Online", "Btw-nummers valideren werkt."],
  offline:  ["Niet beschikbaar", "Belgisch luik van VIES ligt plat."],
  fout:     ["Kan niet controleren", "Statuspagina niet bereikbaar."],
  onbekend: ["Controleren...", "Nog geen controle uitgevoerd"]
};

// Landcodes die VIES kent (EL = Griekenland, XI = Noord-Ierland).
const LANDEN = {
  AT: "Oostenrijk", BE: "België", BG: "Bulgarije", CY: "Cyprus", CZ: "Tsjechië", DE: "Duitsland",
  DK: "Denemarken", EE: "Estland", EL: "Griekenland", ES: "Spanje", FI: "Finland", FR: "Frankrijk",
  HR: "Kroatië", HU: "Hongarije", IE: "Ierland", IT: "Italië", LT: "Litouwen", LU: "Luxemburg",
  LV: "Letland", MT: "Malta", NL: "Nederland", PL: "Polen", PT: "Portugal", RO: "Roemenië",
  SE: "Zweden", SI: "Slovenië", SK: "Slowakije", XI: "Noord-Ierland"
};

const FOUTEN = {
  MS_UNAVAILABLE: "De databank van dit land is momenteel niet beschikbaar. Probeer later opnieuw.",
  MS_MAX_CONCURRENT_REQ: "Te veel gelijktijdige aanvragen bij dit land. Probeer zo dadelijk opnieuw.",
  GLOBAL_MAX_CONCURRENT_REQ: "VIES is overbelast. Probeer zo dadelijk opnieuw.",
  SERVICE_UNAVAILABLE: "VIES is momenteel niet beschikbaar.",
  TIMEOUT: "De databank van dit land antwoordde niet op tijd.",
  INVALID_INPUT: "Dit is geen geldig formaat voor een btw-nummer.",
  VAT_BLOCKED: "Dit btw-nummer kan niet gecontroleerd worden.",
  IP_BLOCKED: "Je IP-adres is tijdelijk geblokkeerd door VIES."
};

const p2 = n => String(n).padStart(2, "0");
function tijd(ms) {
  const d = new Date(ms);
  return `${p2(d.getDate())}/${p2(d.getMonth() + 1)}/${d.getFullYear()} ${p2(d.getHours())}:${p2(d.getMinutes())}:${p2(d.getSeconds())}`;
}

function zetTekst(el, tekst) {
  el.textContent = "";
  String(tekst).split("\n").forEach((regel, i) => {
    if (i) el.appendChild(document.createElement("br"));
    el.appendChild(document.createTextNode(regel));
  });
}

/* ---------- status VIES België ---------- */

function toonStatus({ status, gecontroleerd }) {
  const s = TEKST[status] ? status : "onbekend";
  document.getElementById("dot").className = "dot " + s;
  const titel = document.getElementById("titel");
  titel.className = s;
  titel.textContent = TEKST[s][0];
  let sub = TEKST[s][1];
  if (gecontroleerd) sub += "\nLaatste controle: " + tijd(gecontroleerd);
  zetTekst(document.getElementById("sub"), sub);
}

chrome.storage.local.get(["status", "gecontroleerd"]).then(toonStatus);
chrome.storage.onChanged.addListener((changes) => {
  if (changes.status || changes.gecontroleerd) chrome.storage.local.get(["status", "gecontroleerd"]).then(toonStatus);
});

document.getElementById("nu").addEventListener("click", async () => {
  const b = document.getElementById("nu");
  b.disabled = true;
  b.textContent = "Bezig...";
  try { await chrome.runtime.sendMessage({ type: "controleer" }); }
  finally { b.disabled = false; b.textContent = "Nu controleren"; }
});

/* ---------- btw-nummer controleren ---------- */

function ontleed(invoer) {
  let s = String(invoer || "").toUpperCase().replace(/[\s.\-_/]/g, "");
  if (!s) return null;
  let land = "BE";
  if (/^[A-Z]{2}/.test(s)) {
    land = s.slice(0, 2);
    s = s.slice(2);
  }
  if (land === "GR") land = "EL";
  if (!LANDEN[land]) return { fout: `Onbekende landcode "${land}".` };
  if (!/^[0-9A-Z+*]{2,14}$/.test(s)) return { fout: "Dit lijkt geen geldig btw-nummer." };
  return { land, nummer: s };
}

function leeg(v) { return !v || v.trim() === "" || v.trim() === "---"; }

async function vraagVies(land, nummer) {
  const url = `${VIES_BASE}/ms/${land}/vat/${encodeURIComponent(nummer)}`;
  const r = await fetch(url, { cache: "no-store", headers: { Accept: "application/json" } });
  if (!r.ok) throw new Error("HTTP " + r.status);
  return r.json();
}

function toonResultaat(land, nummer, data, fout) {
  const res = document.getElementById("res");
  res.textContent = "";
  res.className = "res toon";
  const kop = document.createElement("b");
  const nr = document.createElement("div");
  nr.className = "nr";
  nr.textContent = `${land} ${nummer} (${LANDEN[land]})`;

  let soort;
  if (fout) {
    soort = "storing";
    kop.textContent = "Controle mislukt";
    res.append(kop, nr);
    const p = document.createElement("div");
    p.textContent = fout;
    res.appendChild(p);
  } else if (data.userError && data.userError !== "VALID" && data.userError !== "INVALID") {
    soort = "storing";
    kop.textContent = "Niet te controleren";
    res.append(kop, nr);
    const p = document.createElement("div");
    p.textContent = FOUTEN[data.userError] || `VIES antwoordde: ${data.userError}`;
    res.appendChild(p);
  } else if (data.isValid) {
    soort = "geldig";
    kop.textContent = "Geldig btw-nummer";
    res.append(kop, nr);
    if (!leeg(data.name)) {
      const n = document.createElement("div");
      n.textContent = data.name.trim();
      res.appendChild(n);
    }
    if (!leeg(data.address)) {
      const a = document.createElement("div");
      zetTekst(a, data.address.trim());
      res.appendChild(a);
    }
    if (leeg(data.name) && leeg(data.address)) {
      const k = document.createElement("div");
      k.className = "klein";
      k.textContent = "Dit land geeft geen naam of adres vrij via VIES.";
      res.appendChild(k);
    }
  } else {
    soort = "ongeldig";
    kop.textContent = "Ongeldig of niet geregistreerd voor intracommunautaire handel";
    res.append(kop, nr);
  }
  res.classList.add(soort);

  const k = document.createElement("div");
  k.className = "klein";
  const moment = data && data.requestDate ? Date.parse(data.requestDate) : Date.now();
  k.textContent = "Gecontroleerd op " + tijd(moment);
  res.appendChild(k);
  return soort;
}

async function bewaarHistoriek(land, nummer, soort) {
  const { historiek = [] } = await chrome.storage.local.get("historiek");
  const sleutel = land + nummer;
  const nieuw = [{ land, nummer, soort, ms: Date.now() }, ...historiek.filter(h => h.land + h.nummer !== sleutel)].slice(0, 5);
  await chrome.storage.local.set({ historiek: nieuw });
  toonHistoriek(nieuw);
}

function toonHistoriek(lijst) {
  const el = document.getElementById("hist");
  el.textContent = "";
  const labels = { geldig: ["geldig", "v"], ongeldig: ["ongeldig", "o"], storing: ["niet gecontroleerd", "s"] };
  (lijst || []).forEach(h => {
    const rij = document.createElement("div");
    const links = document.createElement("span");
    links.textContent = `${h.land} ${h.nummer}`;
    const rechts = document.createElement("span");
    const [txt, cls] = labels[h.soort] || ["?", "s"];
    rechts.className = cls;
    rechts.textContent = txt;
    rij.append(links, rechts);
    rij.title = "Opnieuw controleren";
    rij.addEventListener("click", () => {
      document.getElementById("btw").value = h.land + h.nummer;
      controleerBtw();
    });
    el.appendChild(rij);
  });
}

async function controleerBtw() {
  const veld = document.getElementById("btw");
  const knop = document.getElementById("go");
  const o = ontleed(veld.value);
  const res = document.getElementById("res");
  if (!o) return;
  if (o.fout) {
    res.className = "res toon ongeldig";
    res.textContent = o.fout;
    return;
  }
  knop.disabled = true;
  knop.textContent = "Bezig...";
  let soort;
  try {
    const data = await vraagVies(o.land, o.nummer);
    soort = toonResultaat(o.land, o.nummer, data, null);
  } catch (e) {
    soort = toonResultaat(o.land, o.nummer, null, "VIES niet bereikbaar (" + (e.message || e) + ").");
  } finally {
    knop.disabled = false;
    knop.textContent = "Controleer";
  }
  await bewaarHistoriek(o.land, o.nummer, soort);
}

document.getElementById("form").addEventListener("submit", e => { e.preventDefault(); controleerBtw(); });
chrome.storage.local.get("historiek").then(({ historiek }) => toonHistoriek(historiek));
document.getElementById("btw").focus();
