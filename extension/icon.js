// SPDX-FileCopyrightText: 2026 Optimey CommV
// SPDX-License-Identifier: GPL-3.0-or-later

// Draws the extension icon: a magnifying glass whose blue lens carries the twelve
// EU stars around a status-coloured centre with a euro sign.
// Coordinates are on a 128 x 128 grid and scaled to the requested size.
// `glow` (0..1) sets how strongly the status colour shows; used for the slow pulse.

const ICON_BLUE = "#1f3f9e";
const ICON_GOLD = "#ffcc00";

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

function drawIcon(g, size, colour, glow = 1) {
  const k = size / 128;
  g.save();
  g.clearRect(0, 0, size, size);
  g.scale(k, k);

  // handle
  g.strokeStyle = ICON_BLUE;
  g.lineCap = "round";
  g.lineWidth = 18;
  g.beginPath();
  g.moveTo(88, 88);
  g.lineTo(118, 118);
  g.stroke();

  // lens
  g.fillStyle = ICON_BLUE;
  g.beginPath();
  g.arc(54, 54, 50, 0, Math.PI * 2);
  g.fill();

  // status centre, dimmed towards a dark tone while pulsing
  g.fillStyle = "#3a1010";
  g.beginPath();
  g.arc(54, 54, 34, 0, Math.PI * 2);
  g.fill();
  g.globalAlpha = Math.max(0, Math.min(1, glow));
  g.fillStyle = colour;
  g.fill();
  g.globalAlpha = 1;

  // twelve stars (too small to read below 24 px)
  if (size >= 24) {
    g.fillStyle = ICON_GOLD;
    for (let i = 0; i < 12; i++) {
      const a = i * Math.PI / 6 - Math.PI / 2;
      iconStar(g, 54 + 42 * Math.cos(a), 54 + 42 * Math.sin(a), 6);
    }
  }

  g.fillStyle = "#fff";
  g.font = "bold 46px Arial, Helvetica, sans-serif";
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillText("€", 54, 56);
  g.restore();
}

function renderIcon(colour, size, glow = 1) {
  const c = new OffscreenCanvas(size, size);
  const g = c.getContext("2d");
  drawIcon(g, size, colour, glow);
  return g.getImageData(0, 0, size, size);
}

// Brightness of the status colour at time t (ms) for a slow pulse of `period` ms.
function pulseGlow(t, period = 1600) {
  return 0.3 + 0.7 * (0.5 + 0.5 * Math.cos((2 * Math.PI * t) / period));
}
