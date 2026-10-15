"""Render the LTZZZ 60s 9:16 brand video from the DeepSeek deliverable for TASK-20261009-DOUBAO-VIDEO.
Publication remains a separate receipt; this script only renders the MP4 + SRT + cover locally."""
import asyncio, json, os, re, subprocess, pathlib, hashlib
from PIL import Image, ImageDraw, ImageFont
import edge_tts

out = pathlib.Path("video-output"); out.mkdir(exist_ok=True)
day = "2026-10-14"

# 12 time-slot script (from deepseek deliverable)
scenes = [
    ("LTZZZ AGI实验室", ["一条聊天记录，怎样变成一支短片？"], "01 / 片头"),
    ("自动化流水线", ["切段 → 清洗 → 判断 → 成片"], "02 / 流水线"),
    ("DeepSeek 清洗", ["先脱敏查证，去掉噪音"], "03 / 清洗"),
    ("Doubao 文案", ["生成 60 秒 9:16 中文脚本和字幕"], "04 / 文案"),
    ("视频引擎", ["出片：封面、片头片尾、字幕烧录"], "05 / 渲染"),
    ("唯一内容ID", ["CONTENT-YYYYMMDD-NNN，全程可追溯"], "06 / 追溯"),
    ("R2 队列", ["MP4 进入 R2 队列，发布前技术校验"], "07 / 队列"),
    ("发布校验", ["时长、分辨率、音轨、字幕，一项不过都不发"], "08 / 校验"),
    ("私密发布", ["平台先私密上传，确认后再转公开"], "09 / 发布"),
    ("数据回写", ["观看、点赞、评论，汇入台账"], "10 / 回写"),
    ("有界调用", ["记录模型、时间和用量，按预算幂等重试"], "11 / 预算"),
    ("知其固然", ["LTZZZ AGI实验室 · 知其固然如此……"], "12 / 片尾"),
]

narration = "".join(s[1][0] for s in scenes)
print("Narration:", narration)

asyncio.run(edge_tts.Communicate(narration, "zh-CN-XiaoxiaoNeural", rate="-5%").save(str(out / "voice.mp3")))
duration = float(subprocess.check_output(
    ["ffprobe", "-v", "error", "-show_entries", "format=duration",
     "-of", "default=noprint_wrappers=1:nokey=1", str(out / "voice.mp3")]))
print(f"Narration duration: {duration:.2f}s")
if not 20 <= duration <= 65:
    raise ValueError(f"Narration duration out of range: {duration}")

fontpath = r"C:\Windows\Fonts\msyh.ttc"
font = ImageFont.truetype(fontpath, 34); small = ImageFont.truetype(fontpath, 24)
titlefont = ImageFont.truetype(fontpath, 52)

TARGET = 60.0
seg_duration = TARGET / len(scenes)
for i, (title, lines, label) in enumerate(scenes):
    im = Image.new("RGB", (720, 1280), (9, 18, 33)); d = ImageDraw.Draw(im)
    for y in range(1280):
        d.line((0, y, 720, y), fill=(9 + int(y / 128), 18 + int(y / 64), 33 + int(y / 40)))
    d.text((55, 70), "LTZZZ / AI 视频流水线", font=small, fill=(83, 218, 203))
    d.text((55, 150), day, font=small, fill=(175, 187, 204))
    d.text((55, 300), title, font=titlefont, fill="white")
    d.rounded_rectangle((40, 450, 680, 800), radius=30, fill=(23, 40, 62), outline=(62, 109, 130), width=2)
    for j, line in enumerate(lines):
        d.text((65, 520 + j * 90), line, font=font, fill=(224, 233, 245))
    d.text((55, 960), label, font=font, fill=(83, 218, 203))
    d.text((55, 1080), "流程示意 / 非付款证明", font=small, fill=(175, 187, 204))
    d.text((55, 1150), "ltzzz.com", font=small, fill="white")
    im.save(out / f"brand-scene-{i}.png")
    frames = round(seg_duration * 20)
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", str(out / f"brand-scene-{i}.png"),
                    "-vf", f"zoompan=z='min(zoom+0.00015,1.03)':x='iw/2-iw/zoom/2':y='ih/2-ih/zoom/2':d={frames}:s=720x1280:fps=20",
                    "-c:v", "libx264", "-preset", "veryfast", "-pix_fmt", "yuv420p",
                    str(out / f"brand-segment-{i}.mp4")], check=True)

(out / "brand-concat.txt").write_text("\n".join(f"file 'brand-segment-{i}.mp4'" for i in range(len(scenes))))

# captions per fixed 5s scene
def stamp(t):
    ms = round(t * 1000); return f"{ms//3600000:02d}:{ms//60000%60:02d}:{ms//1000%60:02d},{ms%1000:03d}"
captions = []
for i, (title, lines, label) in enumerate(scenes):
    s = seg_duration
    cap = lines[0]
    wrapped = "\n".join(cap[j:j+16] for j in range(0, len(cap), 16))
    captions.append(f"{i+1}\n{stamp(i*s)} --> {stamp((i+1)*s)}\n{wrapped}\n")
(out / "brand-captions.srt").write_text("\n".join(captions))

video = out / "ltzzz-brand-60s.mp4"
subprocess.run(["ffmpeg", "-v", "error", "-y", "-f", "concat", "-safe", "0", "-i", str(out / "brand-concat.txt"),
                "-i", str(out / "voice.mp3"),
                "-vf", "subtitles=video-output/brand-captions.srt:force_style='FontName=Microsoft YaHei,FontSize=16,MarginV=65,Outline=2'",
                "-af", "apad", "-t", "60",
                "-c:v", "libx264", "-preset", "veryfast", "-c:a", "aac", "-pix_fmt", "yuv420p",
                "-movflags", "+faststart", str(video)], check=True)

probe = json.loads(subprocess.check_output(["ffprobe", "-v", "error", "-show_streams", "-show_format", "-of", "json", str(video)]))
assert any(s["codec_type"] == "audio" for s in probe["streams"])
v = next(s for s in probe["streams"] if s["codec_type"] == "video")
assert v["width"] == 720 and v["height"] == 1280
vdur = float(probe["format"]["duration"])
assert vdur <= 61, f"Video too long: {vdur}"

receipt = {
    "date": day, "status": "VIDEO_RENDERED_NOT_PUBLISHED", "published": False,
    "video": video.name, "duration": round(vdur, 2), "width": 720, "height": 1280,
    "audio": True, "captions": "per-scene estimated timing",
    "model_calls": 0, "source": "ops/deliverables/TASK-20261009-DOUBAO-VIDEO-deliverable.md",
    "video_sha256": hashlib.sha256(video.read_bytes()).hexdigest(),
    "youtube": {"published": False, "privacy": "private", "blocker": "upload requires workers.dev reachable node or Actions run"},
    "tiktok": {"published": False, "privacy": "private", "blocker": "TikTok OAuth not verified"},
}
pathlib.Path("results/publishing").mkdir(parents=True, exist_ok=True)
pathlib.Path(f"results/publishing/video-brand-{day}.json").write_text(json.dumps(receipt, ensure_ascii=False, indent=2))
print(json.dumps(receipt, ensure_ascii=False))
