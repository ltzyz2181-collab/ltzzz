#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
LTZZZ 本地视频合成服务（FFmpeg 本地引擎的 HTTP 入口）
============================================================
让 creator-lab.html 的「FFmpeg 本地合成」引擎真正可端到端使用：
  检测 → 合成 → 预览 → 下载，全部走本服务，状态真实、无伪造。

启动：
  python tools/ltzzz_video_server.py            # 127.0.0.1:8788
  LTZZZ_VIDEO_PORT=9000 python tools/ltzzz_video_server.py

接口（CORS 全开，仅绑定 127.0.0.1，不对外网开放）：
  GET  /health            → { ok, engine, ffmpeg, ffmpeg_version, tts, font }
  POST /generate          → body: job JSON（title/script/subtitle/storyboard/shots/tts）
                            返回 { ok, video_url, file, meta }
  GET  /download/<file>   → 下载 MP4（Content-Disposition: attachment）
  GET  /svg/<file>        → 查看该次合成的 SVG 设计稿素材

产物输出目录：tools/output/  （每次合成一个 <id>/ 子目录）
"""
import json
import os
import re
import subprocess
import sys
import time
import urllib.parse
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

HERE = os.path.dirname(os.path.abspath(__file__))
OUT_ROOT = os.path.join(HERE, "output")
PORT = int(os.environ.get("LTZZZ_VIDEO_PORT", "8788"))

# 让 `from ffmpeg_engine import ...` 可直接用
sys.path.insert(0, HERE)
import ffmpeg_engine  # noqa: E402


def ffmpeg_version():
    try:
        r = subprocess.run(["ffmpeg", "-version"], capture_output=True, text=True,
                           encoding="utf-8", errors="replace", timeout=15)
        first = (r.stdout or r.stderr or "").splitlines()
        return first[0] if first else None
    except Exception as e:
        return f"error: {e}"


def health():
    ver = ffmpeg_version()
    return {
        "ok": True,
        "engine": "ffmpeg-local",
        "ffmpeg": bool(ver and not str(ver).startswith("error")),
        "ffmpeg_version": ver,
        "tts": ffmpeg_engine.tts_available(),
        "font": ffmpeg_engine.find_font(),
        "out_root": OUT_ROOT,
    }


def run_generate(job):
    job_id = time.strftime("%Y%m%d-%H%M%S")
    out_dir = os.path.join(OUT_ROOT, job_id)
    os.makedirs(out_dir, exist_ok=True)
    out_mp4 = os.path.join(out_dir, f"ltzzz-{job_id}.mp4")
    meta = ffmpeg_engine.compose_job(job, out_mp4)
    meta["id"] = job_id
    meta["video_url"] = f"/download/{job_id}/{urllib.parse.quote(os.path.basename(out_mp4))}"
    # 记录 job 便于复查
    with open(os.path.join(out_dir, "job.json"), "w", encoding="utf-8") as f:
        json.dump(job, f, ensure_ascii=False, indent=2)
    return meta


class Handler(BaseHTTPRequestHandler):
    server_version = "LTZZZVideoServer/1.0"

    def _cors(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")

    def _json(self, obj, status=200):
        body = json.dumps(obj, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self._cors()
        self.end_headers()
        self.wfile.write(body)

    def _not_found(self, msg="Not found"):
        self._json({"error": msg}, 404)

    def do_OPTIONS(self):
        self.send_response(204)
        self._cors()
        self.end_headers()

    def do_GET(self):
        url = urllib.parse.urlparse(self.path)
        if url.path.rstrip("/") == "/health":
            self._json(health())
            return
        if url.path.startswith("/download/"):
            rel = urllib.parse.unquote(url.path[len("/download/"):])
            return self._serve_file(rel, "video/mp4", attachment=True)
        if url.path.startswith("/svg/"):
            rel = urllib.parse.unquote(url.path[len("/svg/"):])
            return self._serve_file(rel, "image/svg+xml", attachment=False)
        self._not_found()

    def _serve_file(self, rel, ctype, attachment):
        """在 OUT_ROOT 下安全解析相对路径（支持子目录），杜绝目录穿越。"""
        if not rel or ".." in rel or rel.startswith("/") or rel.startswith("\\"):
            self._json({"error": "bad filename"}, 400)
            return
        full = os.path.realpath(os.path.join(OUT_ROOT, rel))
        if not full.startswith(os.path.realpath(OUT_ROOT) + os.sep) or not os.path.isfile(full):
            self._not_found("file not found")
            return
        if not re.search(r"\.(mp4|svg)$", rel, re.I):
            self._json({"error": "bad extension"}, 400)
            return
        size = os.path.getsize(full)
        name = os.path.basename(full)
        self.send_response(200)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(size))
        if attachment:
            self.send_header("Content-Disposition", f'attachment; filename="{name}"')
        self._cors()
        self.end_headers()
        with open(full, "rb") as f:
            while True:
                chunk = f.read(1 << 16)
                if not chunk:
                    break
                try:
                    self.wfile.write(chunk)
                except BrokenPipeError:
                    break

    def do_POST(self):
        url = urllib.parse.urlparse(self.path)
        if url.path.rstrip("/") != "/generate":
            self._not_found()
            return
        try:
            length = int(self.headers.get("Content-Length") or 0)
            if length <= 0 or length > 10 * 1024 * 1024:
                self._json({"error": "bad Content-Length"}, 400)
                return
            job = json.loads(self.rfile.read(length).decode("utf-8-sig"))
            if not isinstance(job, dict):
                self._json({"error": "job must be a JSON object"}, 400)
                return
        except Exception as e:
            self._json({"error": f"bad body: {e}"}, 400)
            return
        try:
            meta = run_generate(job)
            meta["ok"] = True
            self._json(meta)
        except Exception as e:
            self._json({"ok": False, "error": str(e)}, 500)

    def log_message(self, fmt, *args):
        sys.stderr.write("[ltzzz-video-server] " + (fmt % args) + "\n")


def main():
    os.makedirs(OUT_ROOT, exist_ok=True)
    srv = ThreadingHTTPServer(("127.0.0.1", PORT), Handler)
    print("LTZZZ 本地视频服务已启动")
    print(f"  /health    → http://127.0.0.1:{PORT}/health")
    print(f"  /generate  → POST http://127.0.0.1:{PORT}/generate")
    print(f"  /download  → 见 /generate 返回的 video_url")
    print(f"  输出目录   → {OUT_ROOT}")
    h = health()
    print(f"  ffmpeg: {h['ffmpeg_version']}")
    print(f"  tts(edge-tts): {'可用' if h['tts'] else '未安装（可选：python -m pip install edge-tts）'}")
    print("  Ctrl+C 停止")
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        print("\n已停止")


if __name__ == "__main__":
    main()
