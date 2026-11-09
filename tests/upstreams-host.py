"""Controlled loopback HTTP/HTTPS/WebSocket backend; no external requests."""
import base64
import hashlib
import http.server
import ssl
import struct
import sys
import threading


class Backend(http.server.BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def do_GET(self):
        if self.headers.get("Upgrade", "").lower() == "websocket":
            key = self.headers["Sec-WebSocket-Key"]
            accept = base64.b64encode(hashlib.sha1((key + "258EAFA5-E914-47DA-95CA-C5AB0DC85B11").encode()).digest()).decode()
            self.send_response(101)
            self.send_header("Upgrade", "websocket")
            self.send_header("Connection", "Upgrade")
            self.send_header("Sec-WebSocket-Accept", accept)
            self.end_headers()
            try:
                while True:
                    header = self.rfile.read(2)
                    if len(header) != 2:
                        return
                    opcode, length = header[0] & 15, header[1] & 127
                    if length > 125:
                        return
                    mask = self.rfile.read(4) if header[1] & 128 else None
                    payload = self.rfile.read(length)
                    if mask:
                        payload = bytes(x ^ mask[i % 4] for i, x in enumerate(payload))
                    self.wfile.write(bytes([128 | opcode, len(payload)]) + payload)
                    self.wfile.flush()
                    if opcode == 8:
                        return
            except (ConnectionError, OSError):
                return
        else:
            body = (self.path + "|" + self.headers.get("Host", "")).encode()
            self.send_response(200)
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)


def server(port, cert=None, key=None):
    instance = http.server.ThreadingHTTPServer(("127.0.0.1", port), Backend)
    if cert:
        context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
        context.load_cert_chain(cert, key)
        instance.socket = context.wrap_socket(instance.socket, server_side=True)
    threading.Thread(target=instance.serve_forever, daemon=True).start()


if sys.argv[1] == "serve":
    server(23183)
    server(23184, sys.argv[2], sys.argv[3])
    print("READY loopback backends23183/23184", flush=True)
    threading.Event().wait()
else:
    # The authorized SSH tunnel connects local23444 to router loopback23443.
    import socket
    import subprocess

    context = ssl._create_unverified_context()
    connection = context.wrap_socket(socket.create_connection(("127.0.0.1", 23444)), server_hostname="socket.example.test")
    connection.settimeout(10)
    connection.sendall(b"GET /media/ws HTTP/1.1\r\nHost: socket.example.test:23443\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Version: 13\r\nSec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\n\r\n")
    response = b""
    while not response.endswith(b"\r\n\r\n"):
        response += connection.recv(1)
    assert response.startswith(b"HTTP/1.1 101"), response
    connection.sendall(b"\x81\x84abcd" + bytes(x ^ b"abcd"[i % 4] for i, x in enumerate(b"ping")))
    assert connection.recv(6) == b"\x81\x04ping", "WebSocket must echo through proxy"
    print("PASS real WebSocket upgrade and bidirectional frame", flush=True)
    subprocess.run(["ssh", "router.home", "ucode /tmp/luci-caddy-ticket03/upstreams-reload.uc /tmp/luci-caddy-ticket03/manager.uc " + sys.argv[2] + " /tmp/luci-caddy-ticket03/caddy-command"], check=True)
    closed = connection.recv(256)
    assert not closed or closed[0] & 15 == 8, closed
    print("PASS actual changed-config reload closes existing WebSocket (Caddy default)", flush=True)
