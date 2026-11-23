# SPDX-FileCopyrightText: 2026 Optimey CommV
# SPDX-License-Identifier: GPL-3.0-or-later
"""Small stand-in for the VIES REST API, used by the extension tests.

It serves the two endpoints the extension calls:
  GET /check-status          availability per member state
  GET /ms/<cc>/vat/<number>  check of a single VAT number

The availability of a country can be switched at runtime with GET /set/<CC>/<Available|Unavailable>.
All names and addresses are fictitious.
"""

import json
import re
import sys
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

CODES = ["AT", "BE", "BG", "CY", "CZ", "DE", "DK", "EE", "EL", "ES", "FI", "FR", "HR", "HU",
         "IE", "IT", "LT", "LU", "LV", "MT", "NL", "PL", "PT", "RO", "SE", "SI", "SK", "XI"]
STATE = {code: "Available" for code in CODES}
STATE["BE"] = "Unavailable"

VAT = {
    ("BE", "0123456749"): ("VALID", True, "EXAMPLE NV", "Voorbeeldstraat 1\n1000 Brussel"),
    ("DE", "123456789"): ("VALID", True, "---", "---"),
    ("NL", "123"): ("INVALID", False, "---", "---"),
    ("BE", "0987654321"): ("MS_UNAVAILABLE", False, "---", "---"),
}


class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        m = re.match(r"^/set/(\w+)/(\w+)$", self.path)
        if m:
            STATE[m.group(1)] = m.group(2)
            body = {"ok": True}
        elif self.path.startswith("/check-status"):
            body = {
                "vow": {"available": True},
                "countries": [{"countryCode": c, "availability": STATE[c]} for c in CODES],
            }
        else:
            m = re.match(r"^/ms/(\w+)/vat/(\w+)$", self.path)
            if not m:
                self.send_error(404)
                return
            cc, nr = m.groups()
            err, valid, name, addr = VAT.get((cc, nr), ("INVALID", False, "---", "---"))
            body = {
                "isValid": valid,
                "requestDate": "2026-01-01T12:00:00.000Z",
                "userError": err,
                "name": name,
                "address": addr,
                "vatNumber": nr,
            }
        data = json.dumps(body).encode()
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(data)

    def log_message(self, *args):
        pass


def start(port=8765):
    server = ThreadingHTTPServer(("127.0.0.1", port), Handler)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    return server


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8765
    ThreadingHTTPServer(("127.0.0.1", port), Handler).serve_forever()
