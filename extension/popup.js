// SPDX-FileCopyrightText: 2026 Optimey CommV
// SPDX-License-Identifier: GPL-3.0-or-later

const $ = id => document.getElementById(id);
const STATES = ["online", "offline", "error", "checking", "nocountry"];
const COLOURS = { online: "#1fa83a", offline: "#d92b2b", error: "#ef9a10", checking: "#8a8f98", nocountry: "#8a8f98" };
const VIES_ERRORS = ["MS_UNAVAILABLE", "MS_MAX_CONCURRENT_REQ", "GLOBAL_MAX_CONCURRENT_REQ",
  "SERVICE_UNAVAILABLE", "TIMEOUT", "VAT_BLOCKED", "IP_BLOCKED"];

let ctx = null; // { country, language, messages, t }

function setLines(el, text) {
  el.textContent = "";
  String(text).split("\n").forEach((line, i) => {
    if (i) el.appendChild(document.createElement("br"));
    el.appendChild(document.createTextNode(line));
  });
}

const when = ms => formatTime(ms, ctx.language, ctx.country);
const nameOf = code => countryName(code, ctx.language, ctx.messages);

/* ---------- labels ---------- */

function applyLabels() {
  const { t, country } = ctx;
  document.documentElement.lang = ctx.language;
  $("land").textContent = country ? `VIES · ${nameOf(country)}` : "VIES";
  $("gear").title = t("settings");
  $("gear").setAttribute("aria-label", t("settings"));
  $("now").textContent = t("check_now");
  $("vatHeading").textContent = t("vat_heading");
  $("go").textContent = t("vat_submit");
  const cc = country || "BE";
  $("vat").placeholder = t("vat_example", { example: `${cc} ${COUNTRIES[cc]}` });
  $("hint").textContent = t("vat_hint", { cc });
}

/* ---------- status ---------- */

let pulseFrame = null;

// Draws the status icon; while unavailable the centre pulses slowly.
function paintIcon(s) {
  const canvas = $("icon");
  const g = canvas.getContext("2d");
  cancelAnimationFrame(pulseFrame);
  const pulsing = s === "offline" && ctx.pulse;
  canvas.dataset.pulse = pulsing ? "on" : "off";
  if (!pulsing) {
    drawIcon(g, canvas.width, COLOURS[s]);
    return;
  }
  const frame = now => {
    drawIcon(g, canvas.width, COLOURS.offline, pulseGlow(now, ctx.period));
    pulseFrame = requestAnimationFrame(frame);
  };
  pulseFrame = requestAnimationFrame(frame);
}

function showStatus({ status, checkedAt }) {
  const { t } = ctx;
  const s = STATES.includes(status) ? status : "checking";
  paintIcon(s);
  $("title").className = s;
  $("title").textContent = t(`status_${s}_title`);
  let sub = t(`status_${s}_text`);
  if (checkedAt && s !== "checking" && s !== "nocountry") sub += "\n" + t("last_check", { time: when(checkedAt) });
  setLines($("sub"), sub);
}

const refreshStatus = () => chrome.storage.local.get(["status", "checkedAt"]).then(showStatus);

/* ---------- VAT number ---------- */

function parse(input) {
  let s = String(input || "").toUpperCase().replace(/[\s.\-_/]/g, "");
  if (!s) return null;
  let cc = ctx.country || "BE";
  if (/^[A-Z]{2}/.test(s)) {
    cc = s.slice(0, 2);
    s = s.slice(2);
  }
  if (cc === "GR") cc = "EL";
  if (!COUNTRIES[cc]) return { error: ctx.t("err_unknown_cc", { cc }) };
  if (!/^[0-9A-Z+*]{2,14}$/.test(s)) return { error: ctx.t("err_format") };
  return { cc, number: s };
}

const empty = v => !v || v.trim() === "" || v.trim() === "---";

async function askVies(cc, number) {
  const url = `${VIES_BASE}/ms/${cc}/vat/${encodeURIComponent(number)}`;
  const r = await fetch(url, { cache: "no-store", headers: { Accept: "application/json" } });
  if (!r.ok) throw new Error("HTTP " + r.status);
  return r.json();
}

function line(parent, text, cls) {
  const d = document.createElement("div");
  if (cls) d.className = cls;
  setLines(d, text);
  parent.appendChild(d);
}

function showResult(cc, number, data, failure) {
  const { t } = ctx;
  const res = $("res");
  res.textContent = "";
  res.className = "res show";
  const head = document.createElement("b");
  res.appendChild(head);
  line(res, `${cc} ${number} (${nameOf(cc)})`, "nr");

  let kind;
  if (failure) {
    kind = "failed";
    head.textContent = t("res_failed");
    line(res, failure);
  } else if (data.userError === "INVALID_INPUT") {
    kind = "invalid";
    head.textContent = t("err_format");
  } else if (data.userError && data.userError !== "VALID" && data.userError !== "INVALID") {
    kind = "failed";
    head.textContent = t("res_unavailable");
    line(res, VIES_ERRORS.includes(data.userError) ? t("e_" + data.userError) : t("vies_answer", { code: data.userError }));
  } else if (data.isValid) {
    kind = "valid";
    head.textContent = t("res_valid");
    if (!empty(data.name)) line(res, data.name.trim());
    if (!empty(data.address)) line(res, data.address.trim());
    if (empty(data.name) && empty(data.address)) line(res, t("res_no_details"), "small");
  } else {
    kind = "invalid";
    head.textContent = t("res_invalid");
  }
  res.classList.add(kind);
  const moment = data && data.requestDate ? Date.parse(data.requestDate) : Date.now();
  line(res, t("res_checked_at", { time: when(moment) }), "small");
  return kind;
}

async function saveHistory(cc, number, kind) {
  const { history = [] } = await chrome.storage.local.get("history");
  const key = cc + number;
  const list = [{ cc, number, kind, ms: Date.now() }, ...history.filter(h => h.cc + h.number !== key)].slice(0, 5);
  await chrome.storage.local.set({ history: list });
  showHistory(list);
}

function showHistory(list) {
  const { t } = ctx;
  const el = $("hist");
  el.textContent = "";
  const labels = { valid: ["hist_valid", "v"], invalid: ["hist_invalid", "o"], failed: ["hist_unchecked", "s"] };
  (list || []).forEach(h => {
    const row = document.createElement("div");
    const left = document.createElement("span");
    left.textContent = `${h.cc} ${h.number}`;
    const right = document.createElement("span");
    const [key, cls] = labels[h.kind] || labels.failed;
    right.className = cls;
    right.textContent = t(key);
    row.append(left, right);
    row.title = t("hist_recheck");
    row.addEventListener("click", () => {
      $("vat").value = h.cc + h.number;
      checkVat();
    });
    el.appendChild(row);
  });
}

async function checkVat() {
  const { t } = ctx;
  const p = parse($("vat").value);
  const res = $("res");
  if (!p) return;
  if (p.error) {
    res.className = "res show invalid";
    res.textContent = p.error;
    return;
  }
  const button = $("go");
  button.disabled = true;
  button.textContent = t("busy");
  let kind;
  try {
    kind = showResult(p.cc, p.number, await askVies(p.cc, p.number), null);
  } catch (e) {
    kind = showResult(p.cc, p.number, null, t("err_unreachable", { detail: e.message || e }));
  } finally {
    button.disabled = false;
    button.textContent = t("vat_submit");
  }
  await saveHistory(p.cc, p.number, kind);
}

/* ---------- start ---------- */

async function init() {
  const { country, language, pulse, period } = await loadSettings();
  const messages = await loadMessages(language);
  ctx = { country, language, pulse, period, messages, t: makeT(messages) };
  applyLabels();
  await refreshStatus();
  const { history } = await chrome.storage.local.get("history");
  showHistory(history);
}

$("now").addEventListener("click", async () => {
  const b = $("now");
  b.disabled = true;
  b.textContent = ctx.t("busy");
  try { await chrome.runtime.sendMessage({ type: "check" }); }
  finally { b.disabled = false; b.textContent = ctx.t("check_now"); }
});
$("gear").addEventListener("click", () => chrome.runtime.openOptionsPage());
$("form").addEventListener("submit", e => { e.preventDefault(); checkVat(); });

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "sync") init();
  else if (ctx && (changes.status || changes.checkedAt)) refreshStatus();
});

init().then(() => $("vat").focus());
