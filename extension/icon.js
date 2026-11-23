// SPDX-FileCopyrightText: 2026 Optimey CommV
// SPDX-License-Identifier: GPL-3.0-or-later

// Draws the extension icon: a magnifying glass whose blue lens carries the twelve
// EU stars around a status-coloured centre with a euro sign.
// Coordinates are on a 128 x 128 grid and scaled to the requested size.
// `wave` (0..1, or null) is the phase of the pulse: a disc behind the magnifying glass
// that inflates to the full icon size and deflates again, in the same colour as the centre.

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

// Mix a hex colour with black (amount < 0) or white (amount > 0).
function shade(hex, amount) {
  const n = parseInt(hex.slice(1), 16);
  const target = amount < 0 ? 0 : 255;
  const a = Math.abs(amount);
  const c = [n >> 16, (n >> 8) & 255, n & 255].map(v => Math.round(v + (target - v) * a));
  return `rgb(${c[0]}, ${c[1]}, ${c[2]})`;
}

// Colour between deep (t = 0) and light (t = 1).
function blend(hex, t) {
  const deep = -0.3;
  const light = 0.32;
  return shade(hex, deep + (light - deep) * t);
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

  // The swelling: a disc centred on the whole icon that inflates to the full icon size
  // and deflates again. Small it is deep red and sits behind the glass; while it swells
  // it moves in front of everything step by step and turns a lighter red, and the
  // handle fades away. The centre of the lens always has exactly the same colour.
  let pulseColour = colour;
  let q = 0;
  const swelling = () => {
    g.fillStyle = pulseColour;
    g.beginPath();
    g.arc(64, 64, WAVE.from + (WAVE.to - WAVE.from) * q, 0, Math.PI * 2);
    g.fill();
  };
  if (wave !== null) {
    q = 0.5 - 0.5 * Math.cos(2 * Math.PI * Math.max(0, Math.min(1, wave)));
    pulseColour = blend(colour, q);
    swelling();
  }

  // handle
  g.globalAlpha = 1 - q;
  g.strokeStyle = ICON_BLUE;
  g.lineCap = "round";
  g.lineWidth = L.hw;
  g.beginPath();
  g.moveTo(L.handle[0], L.handle[1]);
  g.lineTo(L.handle[2], L.handle[3]);
  g.stroke();
  g.globalAlpha = 1;

  disc(g, L, L.r, ICON_BLUE);

  disc(g, L, L.core, pulseColour);

  // twelve stars (too small to read below 24 px)
  if (size >= 24) {
    g.fillStyle = ICON_GOLD;
    for (let i = 0; i < 12; i++) {
      const a = i * Math.PI / 6 - Math.PI / 2;
      iconStar(g, L.x + L.ring * Math.cos(a), L.y + L.ring * Math.sin(a), L.star);
    }
  }

  // in front of everything, more and more as it swells
  if (wave !== null && q > 0) {
    g.globalAlpha = q * q * (3 - 2 * q);
    swelling();
    g.globalAlpha = 1;
  }

  g.fillStyle = "#fff";
  g.font = `bold ${L.font}px Arial, Helvetica, sans-serif`;
  g.textAlign = "center";
  g.textBaseline = "middle";
  // the euro sign glides to the centre of the swelling
  g.fillText("€", L.x + (64 - L.x) * q, L.y + 2 + (64 - L.y) * q);
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
