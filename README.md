<!--
SPDX-FileCopyrightText: 2026 Optimey CommV
SPDX-License-Identifier: GPL-3.0-or-later
-->

# vies-status

Shows at a glance whether the Belgian part of VIES, the EU system that webshops use to validate VAT numbers, is online, and lets you check any EU VAT number. Comes as a Chrome extension and as a small Windows tray tool.

![The extension popup](docs/popup.png)

## Why

When the Belgian member state service behind VIES is down, every webshop that validates VAT numbers in real time fails at checkout, often with a vague "validation took too long" message. The order then either goes through with VAT you cannot deduct, or it does not go through at all. The official status page is a raw JSON document, so this tool watches it for you and tells you the moment Belgium is back.

## What is in this repository

| Folder | What |
|---|---|
| `extension/` | Chrome extension (Manifest V3). Toolbar icon in green, red or orange, a popup with the status and a VAT number check, and a notification when Belgium comes back online. |
| `windows/` | Windows tray tool (C#, .NET Framework 4.x). A small always-on-top window with the same status dot and a tray icon. |
| `tests/` | End-to-end test of the extension against a local stand-in for VIES. |

The user interface is in Dutch.

## Status colours

| Colour | Meaning |
|---|---|
| Green, steady | Belgium is available in VIES: VAT numbers can be validated. |
| Red, blinking | The Belgian part of VIES is unavailable. |
| Orange, steady | The status page itself could not be reached (no internet, proxy, ...). |
| Grey | Not checked yet. |

The status is checked once a minute. In the extension only the dot in the popup blinks: Chrome suspends extension service workers, so the toolbar icon cannot blink reliably, but it does change colour.

## Requirements

- Extension: Google Chrome or another Chromium based browser (Edge, Brave, Vivaldi).
- Windows tool: Windows 10 or 11 (the .NET Framework 4.x it needs is part of Windows).

## Download

Ready-made builds are in [`release/`](release/):

| File | What |
|---|---|
| `VIES-Belgie.exe` | The Windows tray tool. |
| `VIES-Belgie-Chrome.zip` | The Chrome extension, to unpack and load as described below. |

Both are stored with Git LFS on the Optimey LFS server, not on GitHub. Clone with [git-lfs](https://git-lfs.com) installed to get the real files; without it, or through the GitHub web interface, you only get small pointer files. You can always build both yourself from the sources, as described below.

## Installation

### Chrome extension

```sh
git clone https://github.com/Optimey-CommV/vies-status.git
```

1. Open `chrome://extensions` and switch on **Developer mode**.
2. Click **Load unpacked** and select the `extension` folder.
3. Pin **VIES België status** from the puzzle icon in the toolbar.

Chrome loads the extension from that folder, so keep it where it is. To update: `git pull`, then click the reload arrow on the extension card.

### Windows tool

Use `release/VIES-Belgie.exe`, or build the tool yourself with the C# compiler that comes with Windows:

```powershell
powershell -ExecutionPolicy Bypass -File windows\build.ps1
```

This produces `windows\VIES-Belgie.exe`. The first time you start an unsigned executable, SmartScreen may ask for confirmation ("More info", then "Run anyway").

On Linux you can build the same executable with Mono:

```sh
mcs -target:winexe -sdk:4.5 -codepage:utf8 -r:System.Windows.Forms.dll -r:System.Drawing.dll \
    -win32icon:windows/app.ico -out:windows/VIES-Belgie.exe windows/ViesBelgie.cs
```

## Usage

### Status

The extension and the Windows tool start checking on their own. Right-click the Windows window or tray icon for **Nu controleren** (check now), **Altijd bovenaan** (always on top) and **Afsluiten** (exit). Minimising hides the window; double-click the tray icon to bring it back.

### Checking a VAT number (extension)

Type a VAT number in the popup and press **Controleer**. Spaces, dots and dashes are ignored; without a country prefix BE is assumed, and GR is translated to EL, the code VIES uses for Greece.

| Result | Meaning |
|---|---|
| Green: *Geldig btw-nummer* | Valid. Name and address are shown when the member state discloses them (Belgium does, Germany and the Netherlands do not). |
| Red: *Ongeldig* | Invalid, or not registered for intra-community trade. |
| Orange: *Niet te controleren* | VIES could not answer, for example because that member state is down. |

The last five checks are listed under the result; click one to check it again.

## How it works

Both tools only talk to the public VIES REST API of the European Commission:

- `GET https://ec.europa.eu/taxation_customs/vies/rest-api/check-status` for the availability per member state;
- `GET https://ec.europa.eu/taxation_customs/vies/rest-api/ms/{country}/vat/{number}` for a single VAT number (extension only).

No other servers are contacted and nothing is sent anywhere else. The extension keeps the last status and the last five checked numbers in `chrome.storage.local`, on your own machine.

## Tests

The extension test loads the extension in Chromium, points it at `tests/mock_vies.py` instead of VIES and checks the status dot, the blinking, the toolbar title and the VAT check results.

```sh
pip install playwright
python tests/test_extension.py --chrome /path/to/chromium
```

Branded Google Chrome refuses `--load-extension`; use Chromium or Chrome for Testing.

## Contributing

Issues and pull requests are welcome. Contributions are accepted under the same license as the project. Before your first commit, run `pre-commit install`: the hooks check for secrets, private IP addresses and missing license headers.

## Security

Report vulnerabilities privately, as described in the [security policy](https://github.com/Optimey-CommV/.github/blob/main/SECURITY.md).

## License

Copyright (C) 2026 Optimey CommV

This program is free software: you can redistribute it and/or modify it under the terms of the GNU General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.

This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the GNU General Public License for more details.

You should have received a copy of the GNU General Public License along with this program.  If not, see <https://www.gnu.org/licenses/>.

Made by [Optimey](https://optimey.be).
