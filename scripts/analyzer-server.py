#!/usr/bin/env python3
import json
import os
import subprocess
import sys
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from threading import Semaphore


ANALYZER_CONCURRENCY = max(1, int(os.environ.get("ANALYZER_SERVICE_CONCURRENCY", "1")))
ANALYZER_SEMAPHORE = Semaphore(ANALYZER_CONCURRENCY)


class AnalyzerHandler(BaseHTTPRequestHandler):
    def _write_json(self, status, payload):
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        if self.path == "/health":
            self._write_json(200, {"status": "ok"})
            return
        self._write_json(404, {"error": "not found"})

    def do_POST(self):
        if self.path != "/analyze":
            self._write_json(404, {"error": "not found"})
            return

        length = int(self.headers.get("Content-Length", "0") or "0")
        try:
            payload = json.loads(self.rfile.read(length).decode("utf-8"))
            file_path = payload["filePath"]
            debug = bool(payload.get("debug"))
        except Exception as error:
            self._write_json(400, {"error": f"invalid request: {error}"})
            return

        command = [
            sys.executable,
            "scripts/analyze-audio-key-bpm.py",
            file_path,
        ]
        if debug:
            command.append("--debug")

        try:
            with ANALYZER_SEMAPHORE:
                completed = subprocess.run(
                    command,
                    check=False,
                    capture_output=True,
                    text=True,
                    timeout=180,
                )
            lines = [line.strip() for line in completed.stdout.splitlines() if line.strip()]
            json_line = next((line for line in reversed(lines) if line.startswith("{")), None)
            if not json_line:
                self._write_json(
                    500,
                    {
                        "error": "analyzer returned no JSON",
                        "stderr": completed.stderr[-4000:],
                        "exitCode": completed.returncode,
                    },
                )
                return

            result = json.loads(json_line)
            if completed.returncode != 0:
                result.setdefault("warnings", []).append(
                    f"analyzer exited with {completed.returncode}"
                )
                result.setdefault("stderr", completed.stderr[-4000:])
            self._write_json(200, result)
        except Exception as error:
            self._write_json(500, {"error": str(error)})

    def log_message(self, format, *args):
        return


def main():
    server = ThreadingHTTPServer(("0.0.0.0", 8765), AnalyzerHandler)
    print(
        f"Analyzer service listening on :8765 concurrency={ANALYZER_CONCURRENCY}",
        flush=True,
    )
    server.serve_forever()


if __name__ == "__main__":
    main()
