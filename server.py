import http.server
import socketserver
import urllib.request
import urllib.error
import ssl

PORT = 8080

class ProxyHTTPRequestHandler(http.server.SimpleHTTPRequestHandler):
    def do_GET(self):
        if self.path.startswith('/proxy/sheet'):
            self.proxy_sheet()
        else:
            # serve static files (HTML, CSS, JS)
            super().do_GET()

    def do_POST(self):
        if self.path.startswith('/proxy/api/'):
            self.proxy_api()
        else:
            self.send_response(404)
            self.end_headers()
            
    def proxy_sheet(self):
        url = "https://docs.google.com/spreadsheets/d/1YLuRwlFbJeSItsdDL9hv1NcxxpqGkEvCrpshl465PEU/gviz/tq?tqx=out:csv"
        try:
            req = urllib.request.Request(url)
            # Use unverified context to avoid SSL errors on some local setups
            with urllib.request.urlopen(req, context=ssl._create_unverified_context()) as response:
                content = response.read()
                self.send_response(200)
                self.send_header('Content-Type', 'text/csv; charset=utf-8')
                # Add CORS headers just in case
                self.send_header('Access-Control-Allow-Origin', '*')
                self.end_headers()
                self.wfile.write(content)
        except Exception as e:
            self.send_response(500)
            self.end_headers()
            self.wfile.write(str(e).encode('utf-8'))

    def proxy_api(self):
        # path is like /proxy/api/authorization/connect/token
        target_path = self.path[len('/proxy/api/'):]
        url = "https://api.gofive.co.th/" + target_path
        
        content_length = int(self.headers.get('Content-Length', 0))
        post_data = self.rfile.read(content_length)
        
        headers = {}
        # Forward relevant headers to the real API
        for key, value in self.headers.items():
            if key.lower() not in ['host', 'origin', 'referer', 'content-length', 'connection', 'accept-encoding']:
                headers[key] = value
                
        try:
            req = urllib.request.Request(url, data=post_data, headers=headers, method='POST')
            with urllib.request.urlopen(req, context=ssl._create_unverified_context()) as response:
                content = response.read()
                self.send_response(response.status)
                self.send_header('Content-Type', response.headers.get('Content-Type', 'application/json'))
                self.send_header('Access-Control-Allow-Origin', '*')
                self.end_headers()
                self.wfile.write(content)
        except urllib.error.HTTPError as e:
            content = e.read()
            self.send_response(e.code)
            self.send_header('Content-Type', e.headers.get('Content-Type', 'application/json'))
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            self.wfile.write(content)
        except Exception as e:
            self.send_response(500)
            self.end_headers()
            self.wfile.write(str(e).encode('utf-8'))

socketserver.TCPServer.allow_reuse_address = True
with socketserver.TCPServer(("", PORT), ProxyHTTPRequestHandler) as httpd:
    print(f"Server starting at http://localhost:{PORT}")
    print("This server acts as a proxy to bypass CORS for Google Sheets and GoFive API.")
    httpd.serve_forever()
