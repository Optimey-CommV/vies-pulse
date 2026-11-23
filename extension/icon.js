// SPDX-FileCopyrightText: 2026 Optimey CommV
// SPDX-License-Identifier: GPL-3.0-or-later

// Draws the extension icon: a magnifying glass whose blue lens carries the twelve
// EU stars around a status-coloured centre with a euro sign.
// Coordinates are on a 128 x 128 grid and scaled to the requested size.
// `wave` (0..1, or null) is the phase of the pulse: a disc in the status colour behind
// the magnifying glass that swells to the full icon size while it fades away.

const ICON_BLUE = "#1f3f9e";
const ICON_GOLD = "#ffcc00";
const WAVE = { from: 36, to: 64 };

// Full logo (popup, store, extension page) and the toolbar variant: in the toolbar the
// lens is larger and the handle shorter, so the icon reads better at 16 to 32 px.
const SHAPES = {
  logo:    { x: 54, y: 54, r: 50, core: 34, ring: 42, star: 6,   font: 46, handle: [88, 88, 118, 118], hw: 18 },
  toolbar: { x: 60, y: 60, r: 58, core: 40, ring: 49, star: 7, font: 55, handle: [104, 104, 120, 120], hw: 13 }
};

function iconStar(g, x, y, R) {
  g.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = i * Math.PI / 5 - Math.PI / 2;
    const r = i % 2 ? R * 0.42 : R;
    const px = x + r * Math.cos(a);
    const py = y + r * Math.sin(a);
    if (i) g.lineTo(px, py); else g.moveTo(px, py);
  }
  g.closePath();
  g.fill();
}

function disc(g, L, r, fill) {
  g.fillStyle = fill;
  g.beginPath();
  g.arc(L.x, L.y, r, 0, Math.PI * 2);
  g.fill();
}

function drawIcon(g, size, colour, wave = null, shape = "logo") {
  const L = SHAPES[shape] || SHAPES.logo;
  const k = size / 128;
  g.save();
  g.clearRect(0, 0, size, size);
  g.scale(k, k);

  // the swelling wave: centred on the whole icon, behind the magnifying glass,
  // growing to the full icon size while it fades away
  if (wave !== null) {
    const p = Math.max(0, Math.min(1, wave));
    const grow = 1 - Math.pow(1 - p, 3);
    g.globalAlpha = 0.9 * Math.pow(1 - p, 0.6);
    g.fillStyle = colour;
    g.beginPath();
    g.arc(64, 64, WAVE.from + (WAVE.to - WAVE.from) * grow, 0, Math.PI * 2);
    g.fill();
    g.globalAlpha = 1;
  }

  // handle
  g.strokeStyle = ICON_BLUE;
  g.lineCap = "round";
  g.lineWidth = L.hw;
  g.beginPath();
  g.moveTo(L.handle[0], L.handle[1]);
  g.lineTo(L.handle[2], L.handle[3]);
  g.stroke();

  disc(g, L, L.r, ICON_BLUE);

  disc(g, L, L.core, colour);

  // twelve stars (too small to read below 24 px)
  if (size >= 24) {
    g.fillStyle = ICON_GOLD;
    for (let i = 0; i < 12; i++) {
      const a = i * Math.PI / 6 - Math.PI / 2;
      iconStar(g, L.x + L.ring * Math.cos(a), L.y + L.ring * Math.sin(a), L.star);
    }
  }

  g.fillStyle = "#fff";
  g.font = `bold ${L.font}px Arial, Helvetica, sans-serif`;
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillText("€", L.x, L.y + 2);
  g.restore();
}

function renderIcon(colour, size, wave = null, shape = "toolbar") {
  const c = new OffscreenCanvas(size, size);
  const g = c.getContext("2d");
  drawIcon(g, size, colour, wave, shape);
  return g.getImageData(0, 0, size, size);
}

// Phase (0..1) of the pulse at time t (ms) for a pulse of `period` ms.
function pulsePhase(t, period = 1600) {
  return (t % period) / period;
}
