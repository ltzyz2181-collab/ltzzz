#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
LTZZZ 视频合成脚本（本地/开发工具）
把 Seedance 多镜头视频片段合成为：
  1080×1920 · 9:16 竖屏 · MP4 · 30fps
用法：
  python tools/compose_video.py shot1.mp4 shot2.mp4 ... -o final.mp4
  python tools/compose_video.py --from-list shots.txt -o final.mp4
  python tools/compose_video.py --local   # 从 localStorage 导出的 shots.json

依赖：ffmpeg 9.x（winget install Gyan.FFmpeg）

不删除任何现有文件；输出到 -o 指定的新文件。
"""
import argparse
import json
import os
import subprocess
import sys
import tempfile

OUT_DEFAULT = "ltzzz-final.mp4"
W = 1080
H = 1920
FPS = 30


def run(cmd, desc):
    print("[ffmpeg]", " ".join(cmd))
    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode != 0:
        print("STDERR:", r.stderr[-2000:])
        raise RuntimeError(f"{desc} failed: {r.stderr[-500:]}")
    return r


def probe_duration(path):
    r = subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration",
         "-of", "default=noprint_wrappers=1:nokey=1", path],
        capture_output=True, text=True,
    )
    try:
        return float(r.stdout.strip())
    except Exception:
        return None


def prepare_shot(path, workdir, idx):
    """把任意来源的镜头归一化为 1080x1920 9:16 30fps 的中间文件（竖屏裁剪+缩放）。"""
    out = os.path.join(workdir, f"shot_{idx:02d}.mp4")
    # 9:16 竖屏：输入可能横屏/竖屏，统一用 scale 到 1080 宽，再 crop 到 1080x1920
    vf = (
        f"scale={W}:{H}:force_original_aspect_ratio=increase,"
        f"crop={W}:{H},setsar=1,fps={FPS},format=yuv420p"
    )
    run([
        "ffmpeg", "-y", "-i", path,
        "-vf", vf,
        "-c:v", "libx264", "-preset", "medium", "-crf", "20",
        "-c:a", "aac", "-b:a", "128k",
        "-movflags", "+faststart",
        out,
    ], f"normalize shot {idx}")
    return out


def compose(shots, out_path):
    if not shots:
        raise SystemExit("No shots provided.")
    for p in shots:
        if not os.path.isfile(p):
            raise SystemExit(f"Not a file: {p}")

    with tempfile.TemporaryDirectory(prefix="ltzzz_compose_") as workdir:
        prepped = [prepare_shot(s, workdir, i) for i, s in enumerate(shots)]

        # concat 列表
        listfile = os.path.join(workdir, "concat.txt")
        with open(listfile, "w", encoding="utf-8") as f:
            for p in prepped:
                f.write(f"file '{p}'\n")

        run([
            "ffmpeg", "-y", "-f", "concat", "-safe", "0", "-i", listfile,
            "-c:v", "libx264", "-preset", "medium", "-crf", "20",
            "-r", str(FPS), "-pix_fmt", "yuv420p",
            "-c:a", "aac", "-b:a", "192k",
            "-movflags", "+faststart",
            out_path,
        ], "concat final")

    total = 0
    for p in shots:
        d = probe_duration(p)
        if d:
            total += d
    print(f"\n✅ Done: {out_path}")
    print(f"   Input shots: {len(shots)} · 预估总时长 ≈ {total:.1f}s")
    print(f"   规格: {W}x{H} · 9:16 · MP4 · {FPS}fps")


def main():
    ap = argparse.ArgumentParser(description="LTZZZ video compose")
    ap.add_argument("shots", nargs="*", help="video files")
    ap.add_argument("-o", "--out", default=OUT_DEFAULT)
    ap.add_argument("--from-list", help="text file with one video URL/path per line")
    ap.add_argument("--local", action="store_true",
                    help="read shots from localStorage export (shots.json)")
    args = ap.parse_args()

    shots = list(args.shots)
    if args.from_list:
        with open(args.from_list, encoding="utf-8") as f:
            shots = [l.strip() for l in f if l.strip()]
    elif args.local:
        if os.path.isfile("shots.json"):
            with open("shots.json", encoding="utf-8") as f:
                shots = json.load(f)
        else:
            # 兼容：浏览器 localStorage 导出的文件
            print("shots.json not found; pass files directly.")
            sys.exit(1)

    # 支持 http(s) URL：先下载到临时文件
    local_shots = []
    with tempfile.TemporaryDirectory(prefix="ltzzz_dl_") as dl:
        for i, s in enumerate(shots):
            if s.startswith(("http://", "https://")):
                import urllib.request
                tmp = os.path.join(dl, f"dl_{i:02d}.mp4")
                print(f"[download] {s[:80]}…")
                urllib.request.urlretrieve(s, tmp)
                local_shots.append(tmp)
            else:
                local_shots.append(s)
        compose(local_shots, args.out)


if __name__ == "__main__":
    main()
