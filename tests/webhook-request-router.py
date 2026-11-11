"""Run explicitly: python3 tests/webhook-request-router.py router.home.
Uses isolated remote UCI directories and an SSH reverse tunnel to local HTTP only.
"""
import subprocess,threading,json,time,sys
from pathlib import Path
from http.server import ThreadingHTTPServer,BaseHTTPRequestHandler
assert len(sys.argv)==2, 'provide the authorized SSH test host'
host=sys.argv[1]
modules='/tmp/luci-caddy-webhook-'+str(time.time_ns())
runroot=modules+'/requests'
repo=Path(__file__).resolve().parents[1];records=[]
class Receiver(BaseHTTPRequestHandler):
 def receive(self):
  records.append(dict(method=self.command,body=self.rfile.read(int(self.headers.get('Content-Length','0'))).decode(),content_type=self.headers.get('Content-Type')))
  self.send_response(204);self.end_headers()
 do_POST=do_PUT=do_PATCH=do_DELETE=do_GET=do_HEAD=do_OPTIONS=receive
 def log_message(self,*args):pass
server=ThreadingHTTPServer(('127.0.0.1',29182),Receiver);threading.Thread(target=server.serve_forever,daemon=True).start()
def ssh(cmd):return subprocess.run(['ssh','-o','BatchMode=yes',host,cmd],check=True)
ssh(f'mkdir -m 700 {modules}')
for source in [repo/'tests/webhook-request.uc',*[repo/'packages/luci-app-caddy/root/usr/share/caddy-manager'/name for name in ['notifications.uc','uci-store.uc','config.uc','webhook-command']]]:
 subprocess.run(['scp','-O',str(source),host+':'+modules+'/'],check=True)
tunnel=subprocess.Popen(['ssh','-o','BatchMode=yes','-o','ExitOnForwardFailure=yes','-N','-R','127.0.0.1:29182:127.0.0.1:29182',host])
try:
 ssh(f'mkdir -p {runroot} && chmod 700 {runroot} && chmod 700 {modules}/webhook-command && ucode {modules}/webhook-request.uc {modules} {runroot} 29182')
 assert [r['method'] for r in records]==['POST','PUT','PATCH','DELETE','GET','HEAD','OPTIONS'],records
 assert json.loads(records[0]['body'])['type']=='expired'
 data=json.loads(records[1]['body']);assert data['domains']==['quote".example.test'] and data['expiry']==2 and data['date']=='1970-01-01T00:00:02Z',data
 assert records[1]['content_type']=='application/json'
 assert records[2]['body']=='PRIVATE_BODY_CANARY\nexpired: quote".example.test' and records[2]['content_type']=='text/plain; charset=utf-8'
 assert all(not r['body'] for r in records[3:]),records
 print('PASS actual receiver: seven HTTP methods, JSON escaping/typed variables, text body, GET/HEAD/no-body')

finally:tunnel.terminate();tunnel.wait();server.shutdown()
