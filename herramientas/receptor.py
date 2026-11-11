# Recibe una vez los datos de prueba desde la vista local y los guarda en un archivo ignorado por git.
import sys
from http.server import BaseHTTPRequestHandler, HTTPServer

DESTINO = sys.argv[1]

class R(BaseHTTPRequestHandler):
    def _cors(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Headers', '*')
    def do_OPTIONS(self):
        self.send_response(204); self._cors(); self.end_headers()
    def do_POST(self):
        n = int(self.headers.get('Content-Length', '0'))
        cuerpo = self.rfile.read(n)
        open(DESTINO, 'wb').write(cuerpo)
        self.send_response(200); self._cors(); self.end_headers()
        self.wfile.write(b'ok')
        print('guardado', len(cuerpo), flush=True)
        raise SystemExit
    def log_message(self, *a): pass

try:
    HTTPServer(('127.0.0.1', 8766), R).serve_forever()
except SystemExit:
    pass
