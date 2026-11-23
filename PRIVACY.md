<!--
SPDX-FileCopyrightText: 2026 Optimey CommV
SPDX-License-Identifier: GPL-3.0-or-later
-->

# Privacy policy: VIES Status

Last updated: 23/11/2026

This policy covers the Chrome extension "VIES Status" and the Windows tray tool in this repository, published by Optimey CommV, Molenpark 21, 9800 Deinze, Belgium (VAT BE 1040.311.241), contact joost@optimey.be.

## What the extension does with data

- **Status check.** Once per minute the extension requests the availability of the VIES service from the European Commission (`https://ec.europa.eu/taxation_customs/vies/rest-api/check-status`). This request contains no data about you.
- **VAT number check.** When you type a VAT number and check it, that number is sent to the VIES API of the European Commission. Nothing else is sent. The European Commission's own privacy statement for VIES applies to that request.
- **Local storage.** The last status and your last five checks (country code, VAT number, result and time of the check; not the name or address) are stored in your browser with `chrome.storage.local`. They never leave your device and are removed when you uninstall the extension.
- **Settings.** Your choice of country, language and pulse settings is stored with `chrome.storage.sync`. When you are signed in to Chrome with sync switched on, Google synchronises these settings between your own browsers. They contain no personal data.

## What the extension does not do

- It does not send any data to Optimey CommV or to any third party other than the European Commission as described above.
- It contains no analytics, tracking, advertising or remote code.
- It does not read the pages you visit.
- It does not sell or share data.

## Contact

Questions about this policy: joost@optimey.be or an issue at https://github.com/Optimey-CommV/vies-status/issues.
