"""Controlled loopback receiver only. No real destination is contacted."""
import json,time,threading,sys
from http.server import ThreadingHTTPServer,BaseHTTPRequestHandler
from pathlib import Path
path=Path(sys.argv[1]); lock=threading.Lock()
class Handler(BaseHTTPRequestHandler):
 def do_POST(self):
  data=json.loads(self.rfile.read(int(self.headers['Content-Length'])))
  record={'path':self.path.split('?')[0],'event':data,'authorization_ok':self.headers.get('Authorization')=='Bearer HEADER_CANARY'}
  with lock:
   with path.open('a') as f:f.write(json.dumps(record)+'\n')
  if self.path.startswith('/slow'):time.sleep(9)
  self.send_response(302 if self.path.startswith('/redirect') else 503 if self.path.startswith('/error') else 204)
  if self.path.startswith('/redirect'):self.send_header('Location','http://127.0.0.1:29082/canary')
  self.end_headers()
 def log_message(self,*args):pass
ThreadingHTTPServer(('127.0.0.1',29082),Handler).serve_forever()
