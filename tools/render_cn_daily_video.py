"""Render a real narrated vertical MP4; publication remains a separate receipt."""
import asyncio, json, os, re, subprocess, pathlib
from PIL import Image, ImageDraw, ImageFont
import edge_tts
date=os.environ.get("ARTICLE_DATE","2026-10-10")
if not re.fullmatch(r"\d{4}-\d{2}-\d{2}",date): raise ValueError("Invalid date")
out=pathlib.Path("video-output"); out.mkdir(exist_ok=True)
source=pathlib.Path(f"content/daily-articles/{date}-douyin.md")
text=source.read_text()
narration=text.split("口播：",1)[1].split("\n\n",1)[0].strip()
if "……" in narration: raise ValueError("Truncated narration requires editorial correction")
asyncio.run(edge_tts.Communicate(narration,"zh-CN-XiaoxiaoNeural").save(str(out/"voice.mp3")))
duration=float(subprocess.check_output(["ffprobe","-v","error","-show_entries","format=duration","-of","default=noprint_wrappers=1:nokey=1",str(out/"voice.mp3")]))
if not 20 <= duration <= 65: raise ValueError(f"Narration duration out of range: {duration}")
fontpath="/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc"
font=ImageFont.truetype(fontpath,38); small=ImageFont.truetype(fontpath,26); titlefont=ImageFont.truetype(fontpath,54)
scenes=[("AI 雇佣 AI",["任务 → 交付 → 审核 → 结算","LTZZZ 流程示意"],"01 / 任务"),
("先验交付",["检查文件、来源与执行记录","不能用身份标签替代模型调用"],"02 / 交付"),
("失败就记录失败",["模型或审计失败，不应结算","当前仍需整改与独立验收"],"03 / 审核"),
("账本与真钱分开",["内部积分 ≠ 链上工资","没有交易回执，不写已付款"],"04 / 结算"),
("把数据带回来",["留存成果，也留存失败","发现问题 → 修正 → 再验收"],"05 / 复盘")]
for i,(title,lines,label) in enumerate(scenes):
 im=Image.new("RGB",(720,1280),(9,18,33)); d=ImageDraw.Draw(im)
 for y in range(1280):
  d.line((0,y,720,y),fill=(9+int(y/128),18+int(y/64),33+int(y/40)))
 d.text((55,70),"LTZZZ / AI ECONOMY LAB",font=small,fill=(83,218,203))
 d.text((55,150),date,font=small,fill=(175,187,204))
 d.text((55,310),title,font=titlefont,fill="white")
 d.rounded_rectangle((40,445,680,800),radius=30,fill=(23,40,62),outline=(62,109,130),width=2)
 for j,line in enumerate(lines): d.text((65,510+j*90),line,font=font,fill=(224,233,245))
 d.text((55,950),label,font=font,fill=(83,218,203))
 d.text((55,1080),"流程示意 / 非付款证明",font=small,fill=(175,187,204))
 d.text((55,1150),"ltzzz.com",font=small,fill="white")
 im.save(out/f"scene-{i}.png")
 segment=duration/len(scenes)
 frames=round(segment*20)
 subprocess.run(["ffmpeg","-v","error","-y","-i",str(out/f"scene-{i}.png"),"-vf",f"zoompan=z='min(zoom+0.00015,1.03)':x='iw/2-iw/zoom/2':y='ih/2-ih/zoom/2':d={frames}:s=720x1280:fps=20","-c:v","libx264","-preset","veryfast","-pix_fmt","yuv420p",str(out/f"segment-{i}.mp4")],check=True)
(out/"concat.txt").write_text("\n".join(f"file 'segment-{i}.mp4'" for i in range(len(scenes))))
# Each caption is timed across the narration; it is not an external platform post.
sentences=[s for s in re.split("[。！？]",narration) if s.strip()]
def stamp(t):
 ms=round(t*1000); return f"{ms//3600000:02d}:{ms//60000%60:02d}:{ms//1000%60:02d},{ms%1000:03d}"
weights=sum(len(s) for s in sentences); cursor=0; captions=[]
for i,s in enumerate(sentences):
 end=cursor+duration*len(s)/weights
 wrapped="\n".join(s[j:j+18] for j in range(0,len(s),18))
 captions.append(f"{i+1}\n{stamp(cursor)} --> {stamp(end)}\n{wrapped}\n")
 cursor=end
(out/"captions.srt").write_text("\n".join(captions))
video=out/f"{date}-cn-daily.mp4"
subprocess.run(["ffmpeg","-v","error","-y","-f","concat","-safe","0","-i",str(out/"concat.txt"),"-i",str(out/"voice.mp3"),"-vf","subtitles=video-output/captions.srt:force_style='FontName=Noto Sans CJK SC,FontSize=18,MarginV=65,Outline=2'","-c:v","libx264","-preset","veryfast","-c:a","aac","-pix_fmt","yuv420p","-shortest","-movflags","+faststart",str(video)],check=True)
probe=json.loads(subprocess.check_output(["ffprobe","-v","error","-show_streams","-show_format","-of","json",str(video)]))
assert any(s["codec_type"]=="audio" for s in probe["streams"])
v=next(s for s in probe["streams"] if s["codec_type"]=="video")
assert v["width"]==720 and v["height"]==1280
receipt={"date":date,"status":"VIDEO_RENDERED_NOT_PUBLISHED","published":False,"source_file":str(source),"source_commit":os.getenv("GITHUB_SHA"),"run_id":os.getenv("GITHUB_RUN_ID"),"video":video.name,"duration":float(probe["format"]["duration"]),"width":720,"height":1280,"audio":True,"captions":"estimated timing, not forced alignment","model_calls":0,"douyin":{"published":False,"blocker":"Application authorization and actual platform publish not verified"},"shipinhao":{"published":False,"blocker":"No authenticated publishing session"}}
pathlib.Path("results/publishing").mkdir(parents=True,exist_ok=True)
pathlib.Path(f"results/publishing/video-cn-{date}.json").write_text(json.dumps(receipt,ensure_ascii=False,indent=2))
print(json.dumps(receipt,ensure_ascii=False))
