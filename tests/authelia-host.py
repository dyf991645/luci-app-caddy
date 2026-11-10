#!/usr/bin/env python3
"""Controlled HTTP boundary fixture; it does not simulate actual Authelia login."""
import json
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

class Fixture(BaseHTTPRequestHandler):
    def log_message(self, *_):
        pass

    def do_GET(self):
        self.respond()

    def do_POST(self):
        self.respond()

    def respond(self):
        auth = self.server.server_port == 19082
        if auth:
            status = int(self.headers.get('X-Test-Auth', '200'))
            expected_method = self.headers.get('X-Test-Method', self.command)
            expected_uri = self.headers.get('X-Test-URI')
            if self.command != 'GET' or self.headers.get('X-Forwarded-Method') != expected_method or (expected_uri and self.headers.get('X-Forwarded-Uri') != expected_uri):
                status = 400
            self.send_response(status)
            if status == 302:
                self.send_header('Location', 'https://auth.example.test:28443/?rd=%2Fmedia%2F')
            if status == 200 and self.headers.get('X-Test-Identity') != 'absent':
                for key, value in {'Remote-User':'fixture-user', 'Remote-Groups':'fixture-group', 'Remote-Email':'fixture@example.test', 'Remote-Name':'Fixture User'}.items():
                    self.send_header(key, 'global-updated' if key == 'Remote-User' and self.path.startswith('/changed?') else value)
            self.end_headers()
            self.wfile.write(b'controlled auth response')
        else:
            body = self.rfile.read(int(self.headers.get('Content-Length', '0'))).decode()
            payload = {'method':self.command, 'uri':self.path, 'body':body,
                       'identity':{key:self.headers.get(key) for key in ['Remote-User','Remote-Groups','Remote-Email','Remote-Name']}}
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps(payload).encode())

if __name__ == '__main__':
    servers = [ThreadingHTTPServer(('127.0.0.1', port), Fixture) for port in [19081,19082]]
    for server in servers:
        threading.Thread(target=server.serve_forever, daemon=True).start()
    print('Controlled fixture ready: loopback19081 backend /19082 authorization', flush=True)
    threading.Event().wait()
