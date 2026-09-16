#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
LTZZZ FFmpeg 本地合成引擎（视频引擎 fallback 链的第三优先 / 最后兜底）
============================================================
输入 job（JSON）：标题 / 口播脚本 / 字幕 / 分镜（或 shots 数组）
输出：1080×1920 · 9:16 · MP4 · 30fps · H.264（libx264 / yuv420p / AAC / faststart）
适合 YouTube Shorts / TikTok / 抖音 / 视频号。

素材链：
  - SVG：每个镜头生成一张 1080×1920 竖版设计稿（可浏览器打开/二次编辑）
  - 图片：若 shots[i].image 提供本地图片路径，则用该图做镜头画面（scale/crop + 缓推 zoompan）
  - 字幕：每镜头底部烧录字幕行（drawtext + textfile，UTF-8，不依赖 libass 字体匹配）
  - 配音：若安装 edge-tts（pip install edge-tts），自动生成中文配音并混入；
          未安装则输出「无声+字幕」版并如实上报，绝不伪造成功。

依赖：ffmpeg 9.x（winget install Gyan.FFmpeg），Python 标准库即可（无第三方必需依赖）。

用法（命令行）：
  python tools/ffmpeg_engine.py job.json -o out.mp4
  python tools/ffmpeg_engine.py --self-test        # 生成一个 3 镜头测试片
"""
import argparse
import json
import os
import re
import subprocess
import sys
import tempfile

W, H, FPS = 1080, 1920, 30
OUT_DEFAULT = "ltzzz-local.mp4"
CARD_BG = "0x10131f"      # 深色卡片底
TITLE_COLOR = "0xffffff"
DESC_COLOR = "0xdddddd"
SUB_COLOR = "0xffe08a"
BRAND = "LTZZZ"

# ---------- 基础工具 ----------

def run(cmd, desc, allow_fail=False):
    print("[ffmpeg]", " ".join(cmd)[:400])
    r = subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8", errors="replace")
    if r.returncode != 0 and not allow_fail:
        raise RuntimeError(f"{desc} failed: {(r.stderr or '')[-1200:]}")
    return r


def find_font():
    """挑选中文字体（Windows 优先微软雅黑/等线/正黑，再回退 arial）。"""
    cands = [
        r"C:\Windows\Fonts\msyh.ttc", r"C:\Windows\Fonts\msyhbd.ttc",
        r"C:\Windows\Fonts\Deng.ttf", r"C:\Windows\Fonts\msjh.ttc",
        r"C:\Windows\Fonts\simhei.ttf", r"C:\Windows\Fonts\simsun.ttc",
        r"C:\Windows\Fonts\NotoSansCJK-Regular.ttc",
        r"C:\Windows\Fonts\arial.ttf",
    ]
    for c in cands:
        if os.path.isfile(c):
            return c
    # 兜底：让 fontconfig 找
    return "sans-serif"


def ffpath(p):
    """ffmpeg filter 图里的路径转义：反斜杠→斜杠，冒号→\\:"""
    return p.replace("\\", "/").replace(":", "\\:")


def wrap_cjk(text, n):
    """按 n 字宽度预折行（中文/英文混排的粗略换行）。"""
    text = re.sub(r"\s+", " ", str(text)).strip()
    if not text:
        return ""
    lines, cur = [], ""
    for ch in text:
        w = 2 if ord(ch) > 0x2E80 else 1
        if len(cur) + w > n * 2 and cur:
            lines.append(cur)
            cur = ch
        else:
            cur += ch
    if cur:
        lines.append(cur)
    return "\n".join(lines)


def write_text(path, content):
    with open(path, "w", encoding="utf-8") as f:
        f.write(content)


def probe(path):
    """ffprobe → dict（含 width/height/fps/codec/duration/audio）。"""
    r = subprocess.run(
        ["ffprobe", "-v", "error", "-print_format", "json", "-show_format", "-show_streams", path],
        capture_output=True, text=True, encoding="utf-8", errors="replace")
    try:
        data = json.loads(r.stdout or "{}")
    except Exception:
        return {}
    out = {"duration": None, "width": None, "height": None, "fps": None, "vcodec": None, "acodec": None}
    try:
        out["duration"] = round(float(data.get("format", {}).get("duration", 0)), 2)
    except Exception:
        pass
    for s in data.get("streams", []):
        if s.get("codec_type") == "video":
            out["width"] = s.get("width")
            out["height"] = s.get("height")
            out["vcodec"] = s.get("codec_name")
            fr = s.get("avg_frame_rate") or s.get("r_frame_rate") or ""
            try:
                a, b = fr.split("/")
                out["fps"] = round(int(a) / int(b), 3) if int(b) else None
            except Exception:
                out["fps"] = None
        elif s.get("codec_type") == "audio":
            out["acodec"] = s.get("codec_name")
    return out


# ---------- SVG 设计稿（素材） ----------

def build_svg(shot, idx, title, font_family="DengXian, Microsoft YaHei, sans-serif"):
    desc_lines = wrap_cjk(shot.get("desc", ""), 14).split("\n")
    desc_tspan = "\n".join(
        f'<tspan x="540" dy="{56 if i else 0}">{_xml(l[:26])}</tspan>'
        for i, l in enumerate(desc_lines[:8]))
    ttl = wrap_cjk(str(title), 12)
    return f'''<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1920" viewBox="0 0 1080 1920">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#10131f"/><stop offset="1" stop-color="#232b4d"/>
    </linearGradient>
  </defs>
  <rect width="1080" height="1920" fill="url(#bg)"/>
  <rect x="40" y="40" width="1000" height="1840" rx="36" fill="none" stroke="#3a4568" stroke-width="4"/>
  <text x="540" y="330" text-anchor="middle" font-family="{font_family}" font-size="72" font-weight="700" fill="#ffffff">{_xml(ttl)}</text>
  <line x1="340" y1="390" x2="740" y2="390" stroke="#ffd166" stroke-width="6"/>
  <text x="540" y="860" text-anchor="middle" font-family="{font_family}" font-size="46" fill="#dddddd">{desc_tspan}</text>
  <text x="540" y="1720" text-anchor="middle" font-family="{font_family}" font-size="40" font-weight="700" fill="#ffd166">镜头 {idx:02d} · {BRAND}</text>
  <text x="540" y="1800" text-anchor="middle" font-family="{font_family}" font-size="30" fill="#8a93b5">{_xml(shot.get("duration", 6))} 秒</text>
</svg>'''


def _xml(s):
    return (str(s).replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
            .replace('"', "&quot;").replace("'", "&apos;"))


# ---------- 单镜头片段 ----------

def make_shot_clip(shot, idx, workdir, font, title, subtitle_line=None):
    """一个镜头 → shot_XX.mp4（1080x1920 / 30fps / H.264 / AAC 静音轨）。"""
    dur = max(3, min(int(shot.get("duration", 6)), 12))
    out = os.path.join(workdir, f"shot_{idx:02d}.mp4")
    img = shot.get("image") or shot.get("image_path")
    font_f = ffpath(font)

    if img and os.path.isfile(img):
        img_f = ffpath(os.path.abspath(img))
        # 图片：缩放裁剪到 9:16 + 缓推 zoompan
        vf = (
            f"scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,"
            f"zoompan=z='min(zoom+0.0006,1.10)':d={int(dur*FPS)}:"
            f"x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=1080x1920:fps={FPS},"
            f"format=yuv420p"
        )
        r = run([
            "ffmpeg", "-y", "-loop", "1", "-i", img,
            "-f", "lavfi", "-i", "anullsrc=channel_layout=stereo:sample_rate=44100",
            "-vf", vf, "-t", str(dur),
            "-c:v", "libx264", "-preset", "medium", "-crf", "20", "-pix_fmt", "yuv420p", "-r", str(FPS),
            "-c:a", "aac", "-b:a", "128k", "-shortest",
            out,
        ], f"image shot {idx}", allow_fail=True)
        if r.returncode == 0:
            return out
        print(f"[warn] image shot {idx} failed, fallback to drawtext card")

    # 卡片：color + drawtext（标题 / 画面描述 / 字幕行）
    t1 = os.path.join(workdir, f"t_title_{idx:02d}.txt")
    t2 = os.path.join(workdir, f"t_desc_{idx:02d}.txt")
    write_text(t1, wrap_cjk(title, 12) or "LTZZZ")
    write_text(t2, wrap_cjk(shot.get("desc", ""), 14) or "画面")

    vf = (
        f"drawtext=fontfile='{font_f}':textfile='{ffpath(t1)}':fontcolor={TITLE_COLOR}:fontsize=64:"
        f"line_spacing=10:x=(w-text_w)/2:y=h*0.20,"
        f"drawtext=fontfile='{font_f}':textfile='{ffpath(t2)}':fontcolor={DESC_COLOR}:fontsize=42:"
        f"line_spacing=12:x=(w-text_w)/2:y=h*0.38,"
        f"drawtext=fontfile='{font_f}':text='{BRAND} · 镜头 {idx:02d}':fontcolor=0x8a93b5:fontsize=30:"
        f"x=(w-text_w)/2:y=h*0.90"
    )
    if subtitle_line:
        t3 = os.path.join(workdir, f"t_sub_{idx:02d}.txt")
        write_text(t3, wrap_cjk(subtitle_line, 16) or "")
        vf += (
            f",drawtext=fontfile='{font_f}':textfile='{ffpath(t3)}':fontcolor={SUB_COLOR}:fontsize=56:"
            f"line_spacing=14:borderw=6:bordercolor=black@0.75:x=(w-text_w)/2:y=h*0.80"
        )

    run([
        "ffmpeg", "-y", "-f", "lavfi", "-i", f"color=c={CARD_BG}:s={W}x{H}:r={FPS}:d={dur}",
        "-f", "lavfi", "-i", "anullsrc=channel_layout=stereo:sample_rate=44100",
        "-vf", vf, "-t", str(dur),
        "-c:v", "libx264", "-preset", "medium", "-crf", "20", "-pix_fmt", "yuv420p", "-r", str(FPS),
        "-c:a", "aac", "-b:a", "128k", "-shortest",
        out,
    ], f"card shot {idx}")
    return out


# ---------- 配音（可选 edge-tts） ----------

def tts_available():
    try:
        import importlib.util
        return importlib.util.find_spec("edge_tts") is not None
    except Exception:
        return False


def try_tts(text, out_mp3, voice=None):
    """生成中文配音；edge-tts 未安装则返回 (False, reason)。"""
    if not text or not text.strip():
        return False, "empty text"
    if not tts_available():
        return False, "edge-tts 未安装（可选：python -m pip install edge-tts）"
    import asyncio
    import edge_tts
    voice = voice or os.environ.get("LTZZZ_TTS_VOICE", "zh-CN-XiaoxiaoNeural")
    try:
        async def _gen():
            comm = edge_tts.Communicate(text.strip()[:2000], voice=voice)
            await comm.save(out_mp3)
        asyncio.run(_gen())
        if os.path.isfile(out_mp3) and os.path.getsize(out_mp3) > 0:
            return True, voice
        return False, "edge-tts 输出为空"
    except Exception as e:
        return False, f"edge-tts 失败: {e}"


# ---------- 主合成 ----------

def parse_subtitles(job, shots):
    """字幕：job.subtitle（字符串/数组）→ 每镜头一行；缺省用口播脚本行。"""
    sub = job.get("subtitle") or job.get("subtitles") or ""
    if isinstance(sub, str):
        lines = [l.strip() for l in re.split(r"[，,。；;\n]", sub) if l.strip()]
    elif isinstance(sub, list):
        lines = [str(x).strip() for x in sub if str(x).strip()]
    else:
        lines = []
    if not lines:
        script = job.get("script") or ""
        lines = [l.strip() for l in str(script).splitlines() if l.strip()]
    if not lines:
        lines = ["LTZZZ"]
    out = []
    for i, sh in enumerate(shots):
        out.append(lines[i % len(lines)])
    return out


def shots_from_job(job):
    """shots：优先 job.shots；缺省从 storyboard 行解析（镜头序号|画面描述|景别|时长）。"""
    if isinstance(job.get("shots"), list) and job["shots"]:
        return job["shots"]
    shots = []
    sb = job.get("storyboard") or ""
    for line in str(sb).splitlines():
        line = line.strip()
        if not line:
            continue
        parts = [p.strip() for p in line.split("|")]
        if len(parts) >= 2:
            dur = 6
            for p in parts[1:]:
                m = re.search(r"(\d+)\s*秒", p)
                if m:
                    dur = max(5, min(int(m.group(1)), 8))
                    break
            shots.append({"desc": " · ".join(parts[1:]), "duration": dur})
        else:
            shots.append({"desc": line, "duration": 6})
    if len(shots) < 2:
        prompt = job.get("seedance") or job.get("prompt") or job.get("title") or "LTZZZ"
        shots = [{"desc": f"{prompt}（开场）", "duration": 6},
                 {"desc": f"{prompt}（发展）", "duration": 6},
                 {"desc": f"{prompt}（收尾）", "duration": 6}]
    return shots


def compose_job(job, out_path):
    title = str(job.get("title") or "LTZZZ")
    shots = shots_from_job(job)
    subs = parse_subtitles(job, shots)
    font = find_font()
    out_path = os.path.abspath(out_path)
    os.makedirs(os.path.dirname(out_path) or ".", exist_ok=True)

    materials = {"svg": []}
    voiceover = {"used": False, "reason": None, "path": None, "duration": None}

    with tempfile.TemporaryDirectory(prefix="ltzzz_local_") as workdir:
        # 1) SVG 设计稿素材
        svg_dir = os.path.join(os.path.dirname(out_path), "materials")
        os.makedirs(svg_dir, exist_ok=True)
        for i, sh in enumerate(shots):
            svg_path = os.path.join(svg_dir, f"frame_{i+1:02d}.svg")
            with open(svg_path, "w", encoding="utf-8") as f:
                f.write(build_svg(sh, i + 1, title))
            materials["svg"].append(os.path.basename(svg_path))

        # 2) 配音（可选）
        if job.get("tts"):
            tts_path = os.path.join(workdir, "voiceover.mp3")
            ok, info = try_tts(job.get("script") or title, tts_path)
            if ok:
                voiceover = {"used": True, "reason": None, "path": tts_path, "duration": probe(tts_path).get("duration")}
                print(f"[tts] voiceover ok: {info} ({voiceover['duration']}s)")
            else:
                voiceover = {"used": False, "reason": info, "path": None, "duration": None}
                print(f"[tts] skipped: {info}")

        # 3) 逐镜头片段
        clips = []
        for i, sh in enumerate(shots):
            clips.append(make_shot_clip(sh, i + 1, workdir, font, title, subs[i]))

        # 4) 配音长于视频 → 追加结尾卡补齐
        total = sum(max(3, min(int(sh.get("duration", 6)), 12)) for sh in shots)
        if voiceover["used"] and voiceover["duration"] and voiceover["duration"] > total:
            pad = int(voiceover["duration"] - total) + 1
            end = {"desc": "感谢观看 · 点赞关注", "duration": pad, "image": None}
            clips.append(make_shot_clip(end, len(clips) + 1, workdir, font, title, "感谢观看"))
            total += pad

        # 5) 拼接
        listfile = os.path.join(workdir, "concat.txt")
        with open(listfile, "w", encoding="utf-8") as f:
            for c in clips:
                f.write(f"file '{c.replace(chr(92), '/')}'\n")

        cmd = ["ffmpeg", "-y", "-f", "concat", "-safe", "0", "-i", listfile]
        if voiceover["used"]:
            cmd += ["-i", voiceover["path"]]
        cmd += [
            "-map", "0:v", "-map", "1:a" if voiceover["used"] else "0:a",
            "-c:v", "libx264", "-preset", "medium", "-crf", "20",
            "-r", str(FPS), "-pix_fmt", "yuv420p",
            "-c:a", "aac", "-b:a", "192k",
            "-movflags", "+faststart",
            out_path,
        ]
        run(cmd, "concat final")

    meta = probe(out_path)
    return {
        "ok": True,
        "file": os.path.basename(out_path),
        "path": out_path,
        "width": meta.get("width"), "height": meta.get("height"),
        "fps": meta.get("fps"), "vcodec": meta.get("vcodec"),
        "acodec": meta.get("acodec"), "duration": meta.get("duration"),
        "shots": len(shots), "subtitle_lines": len(subs),
        "voiceover": voiceover["used"], "voiceover_reason": voiceover["reason"],
        "materials": materials,
        "spec": f"{meta.get('width')}x{meta.get('height')} · 9:16 · MP4 · {meta.get('fps')}fps · {meta.get('vcodec')}",
    }


def self_test(out_path):
    job = {
        "title": "为什么越想睡越睡不着",
        "script": "你有没有过这种经历，越是想睡，越睡不着。这不是你的问题，是你的大脑在错误地用力。\n今晚试试：放下手机，深呼吸，告诉自己，睡不着也没关系。",
        "subtitle": "越是想睡，越睡不着；不是你的问题，是大脑在错误地用力；放下手机，深呼吸，睡不着也没关系",
        "storyboard": "1|深夜房间 台灯 安静氛围|全景|6秒\n2|人物躺下 闭眼 深呼吸|近景|6秒\n3|手机屏幕熄灭 光线变暗|特写|6秒\n4|窗外晨光 平静收尾|中景|6秒",
        "tts": False,
    }
    return compose_job(job, out_path)


def main():
    ap = argparse.ArgumentParser(description="LTZZZ FFmpeg 本地合成引擎")
    ap.add_argument("job", nargs="?", help="job.json（title/script/subtitle/storyboard/shots/tts）")
    ap.add_argument("-o", "--out", default=OUT_DEFAULT)
    ap.add_argument("--self-test", action="store_true", help="生成一个 4 镜头测试片")
    args = ap.parse_args()

    if args.self_test:
        meta = self_test(args.out)
    else:
        if not args.job:
            ap.error("需要 job.json 或 --self-test")
        with open(args.job, encoding="utf-8-sig") as f:
            job = json.load(f)
        meta = compose_job(job, args.out)

    print("\n✅ 合成完成:", meta["path"])
    for k, v in meta.items():
        if k not in ("path",):
            print(f"   {k}: {v}")
    if meta.get("voiceover_reason"):
        print("   ⚠ 配音未启用:", meta["voiceover_reason"])


if __name__ == "__main__":
    main()
