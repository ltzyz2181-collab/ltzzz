import json,pathlib,subprocess,hashlib,os
from PIL import Image,ImageDraw,ImageFont
out=pathlib.Path('video-output');out.mkdir(exist_ok=True)
day=os.environ.get('VIDEO_DATE') or __import__('datetime').datetime.now(__import__('zoneinfo').ZoneInfo('America/Tijuana')).strftime('%Y-%m-%d')
source=pathlib.Path('knowledge/results/wep3/delivery-contract-'+day+'.json')
if not source.exists():
 candidates=sorted(pathlib.Path('knowledge/results/wep3').glob('delivery-contract-*.json'))
 if not candidates: raise RuntimeError('No real delivery evidence')
 source=candidates[-1]
# Native Node fetch avoids the CDN block observed with Python urllib.
try:
 status=json.loads(subprocess.check_output(['node','--input-type=module','-e',"const r=await fetch('https://ltzzz-wep3.ltzyz2181.workers.dev/market/aave/status',{signal:AbortSignal.timeout(25000)});if(!r.ok)throw Error('snapshot HTTP '+r.status);console.log(JSON.stringify(await r.json()));"],timeout=30))
 if status.get('chain_id')!=8453 or not status.get('ok'):raise RuntimeError('Invalid Base snapshot')
 balance_display=f"{int(status['usdc_raw'])/1000000:.6f}"
except Exception:
 status={'ok':False,'status':'snapshot_unavailable','observed_at':__import__('datetime').datetime.now(__import__('datetime').timezone.utc).isoformat()}
 balance_display='unavailable'
(out/'treasury-snapshot.json').write_text(json.dumps(status,indent=2))
text='AI hiring AI, with evidence. LTZZZ connects tasks, delivery, independent review, and settlement. A real model produces an artifact. Live interface tests check the result. Another model reviews it. Internal credits record the settlement. This is not an on chain wage payment. Every outcome keeps a receipt. Explore the project and product in the description.'
(out/'voice.txt').write_text(text)
subprocess.run(['espeak-ng','-v','en-us','-s','170','-f',str(out/'voice.txt'),'-w',str(out/'voice.wav')],check=True)
font='/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'
scenes=[('AI HIRING AI','Task -> delivery -> review'),('PROVE THE WORK','Artifact + live interface tests'),('INDEPENDENT REVIEW','A second model checks evidence'),('TODAY ON BASE',f'USDC: {balance_display}. Wages: internal credits.')]
for i,(title,subtitle) in enumerate(scenes):
 im=Image.new('RGB',(720,1280),'#091221');d=ImageDraw.Draw(im)
 d.text((48,100),'LTZZZ / AI ECONOMY LAB',font=ImageFont.truetype(font,28),fill='#53dacb')
 d.text((48,185),day,font=ImageFont.truetype(font,24),fill='#afbbcc')
 for n,line in enumerate(title.split(' ',1)):d.text((48,370+n*78),line,font=ImageFont.truetype(font,54),fill='white')
 d.rounded_rectangle((40,610,680,850),radius=24,fill='#17283e')
 for n,line in enumerate(subtitle.split('. ')):d.text((60,670+n*48),line,font=ImageFont.truetype(font,25),fill='white')
 d.text((48,1050),f'{i+1:02d} / OBSERVE. ACT. VERIFY.',font=ImageFont.truetype(font,26),fill='#53dacb')
 d.text((48,1150),'ltzzz.com | Product in description',font=ImageFont.truetype(font,24),fill='white')
 im.save(out/f'yt-scene-{i}.png')
 subprocess.run(['ffmpeg','-v','error','-y','-i',str(out/f'yt-scene-{i}.png'),'-vf',"zoompan=z='min(zoom+0.00025,1.05)':x='iw/2-iw/zoom/2':y='ih/2-ih/zoom/2':d=180:s=720x1280:fps=24",'-c:v','libx264','-preset','veryfast','-pix_fmt','yuv420p',str(out/f'yt-segment-{i}.mp4')],check=True)
(out/'yt-concat.txt').write_text('\n'.join(f"file 'yt-segment-{i}.mp4'" for i in range(4)))
video=out/'youtube-daily.mp4'
subprocess.run(['ffmpeg','-v','error','-y','-f','concat','-safe','0','-i',str(out/'yt-concat.txt'),'-i',str(out/'voice.wav'),'-af','apad','-t','30','-c:v','copy','-c:a','aac','-movflags','+faststart',str(video)],check=True)
probe=json.loads(subprocess.check_output(['ffprobe','-v','error','-show_streams','-show_format','-of','json',str(video)]))
v=next(s for s in probe['streams'] if s['codec_type']=='video');a=next(s for s in probe['streams'] if s['codec_type']=='audio')
assert (v['codec_name'],v['width'],v['height'],v['r_frame_rate'],a['codec_name'])==('h264',720,1280,'24/1','aac')
assert 29.9<=float(probe['format']['duration'])<=30.2
subprocess.run(['ffmpeg','-v','error','-i',str(video),'-f','null','-'],check=True)
(out/'manifest.json').write_text(json.dumps({'day':day,'source_file':str(source),'source_sha256':hashlib.sha256(source.read_bytes()).hexdigest(),'video_sha256':hashlib.sha256(video.read_bytes()).hexdigest(),'source_commit':os.getenv('GITHUB_SHA'),'duration':probe['format']['duration'],'model_calls':0,'paid':False,'tx_hash':None},indent=2))
