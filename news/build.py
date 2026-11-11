# ประกอบคลิปจาก shots/ (render.js) + เสียง edge-tts ต่อช็อต + sfx จริง -> <job>/out.mp4
# usage: python build.py <job-dir> [vo-subdir]   (job-dir มี spec.json และ shots/; vo-subdir = โฟลเดอร์ vo{k}.wav จาก F5 แทน edge-tts)
import json, os, subprocess, sys, wave, contextlib

job = sys.argv[1]
spec = json.load(open(os.path.join(job, 'spec.json'), encoding='utf-8'))
SFX = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'sfx')  # ก๊อปมาจาก knf-tiktok-tools\sfx-real (Mixkit) ให้เครื่องเพื่อนมีด้วย
tmp = os.path.join(job, 'tmp'); os.makedirs(tmp, exist_ok=True)
vodir = sys.argv[2] if len(sys.argv) > 2 else None
vo = lambda k: os.path.join(job, vodir, f'vo{k}.wav') if vodir else os.path.join(tmp, f'vo{k}.mp3')
run = lambda a: subprocess.run(a, check=True)

if vodir and not os.path.exists(os.path.join(job, vodir, '.trimmed')):  # F5 ชอบมีเงียบหัว/ท้ายประโยค ตัดทิ้งครั้งเดียว
    for k in range(len(spec['shots'])):
        t_ = vo(k) + '.t.wav'
        run(['ffmpeg', '-v', 'error', '-y', '-i', vo(k), '-af', 'silenceremove=start_periods=1:start_threshold=-40dB,areverse,silenceremove=start_periods=1:start_threshold=-40dB,areverse', t_])
        os.replace(t_, vo(k))
    open(os.path.join(job, vodir, '.trimmed'), 'w').close()

def dur(f):
    return float(subprocess.check_output(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f]))

X = 0.5  # ช็อตซ้อนกันตอนเปลี่ยนภาพ (ละลายเข้าหากัน แทนเฟดดำแล้วตัด — kidza 11 พ.ย. อยากให้ต่อกันเป็นธรรมชาติ)
N = len(spec['shots'])
segs, starts, t = [], [], 0.0
for k, s in enumerate(spec['shots']):
    mp3 = vo(k)
    if not vodir and not os.path.exists(mp3):
        run([sys.executable, '-m', 'edge_tts', '--voice', spec['voice'], f"--rate={spec.get('rate', '+0%')}", '--text', s['vo'], '--write-media', mp3])
    d = dur(mp3) + 0.45  # หายใจท้ายช็อต
    dd = d + (X if k < N - 1 else 0)  # ยืดท้ายไว้ซ้อนกับช็อตถัดไป เวลาเริ่มช็อตยังตรงเสียงเดิม
    n = int(dd * 30)
    seg = os.path.join(tmp, f'seg{k}.mp4')
    if spec.get('style') == 'photo':
        # แบบรูปจริง: ซูมเข้า/ออกสลับช็อต ไม่มีตัวหนังสือ · เฟดดำแค่ต้น/ท้ายคลิป ระหว่างช็อตละลายต่อกัน (ข้างล่าง)
        z = f"1+0.08*on/{n}" if k % 2 == 0 else f"1.08-0.08*on/{n}"
        fades = (',fade=in:st=0:d=0.3' if k == 0 else '') + (f',fade=out:st={dd - 0.4:.3f}:d=0.4' if k == N - 1 else '')
        fc = f"[0]scale=1188:2112,zoompan=z='{z}':x='iw/2-iw/zoom/2':y='ih/2-ih/zoom/2':d={n}:s=1080x1920:fps=30{fades}"
        ins_ = ['-loop', '1', '-i', os.path.join(job, 'shots', f'bg_{k}.png')]
    else:
        # ฉากซูมเข้าช้าๆ, ตัวหนังสือเฟดเข้า+เลื่อนขึ้นนิดๆ
        fc = (f"[0]scale=1188:2112,zoompan=z='1+0.06*on/{n}':x='iw/2-iw/zoom/2':y='ih/2-ih/zoom/2':d={n}:s=1080x1920:fps=30[bg];"
              f"[1]format=rgba,fade=in:st=0.1:d=0.35:alpha=1[fg];[bg][fg]overlay=x=0:y='max(0,30-90*t)'")
        ins_ = ['-loop', '1', '-i', os.path.join(job, 'shots', f'bg_{k}.png'), '-loop', '1', '-i', os.path.join(job, 'shots', f'fg_{k}.png')]
    run(['ffmpeg', '-v', 'error', '-y', *ins_, '-filter_complex', fc, '-t', f'{dd:.3f}', '-r', '30', '-pix_fmt', 'yuv420p', '-c:v', 'libx264', '-crf', '20', seg])
    segs.append(seg); starts.append(t); t += d

# เสียงพากย์ล้วนตามเวลาจริง (16k mono) ให้ผู้ประกาศปากขยับตาม (news.js เอาไปเข้า MuseTalk)
vi, vf = [], []
for k in range(len(spec['shots'])):
    ms = int((starts[k] + 0.15) * 1000)
    vi += ['-i', vo(k)]
    vf.append(f"[{k}:a]aresample=16000,aformat=channel_layouts=mono,adelay={ms}:all=1[a{k}]")
def track(ks, name):
    run(['ffmpeg', '-v', 'error', '-y', *[a for k in ks for a in ('-i', vo(k))],
         '-filter_complex', ';'.join(vf[k].replace(f'[{k}:a]', f'[{i}:a]', 1) for i, k in enumerate(ks)) + ';' + ''.join(f'[a{k}]' for k in ks)
         + f"amix=inputs={len(ks)}:normalize=0,apad,atrim=0:{t:.2f}[o]", '-map', '[o]', '-ar', '16000', '-ac', '1', os.path.join(tmp, name)])
track(list(range(N)), 'vo_track.wav')
if spec.get('duo'):  # ข่าวคู่: เสียงแยกคน ให้ปากขยับเฉพาะตอนตัวเองพูด (news.js addAnchor)
    for w in ('m', 'f'):
        ks = [k for k, s in enumerate(spec['shots']) if s.get('who', 'f') == w]
        if ks: track(ks, f'vo_track_{w}.wav')

# ต่อช็อตแบบละลาย: ช็อต k เริ่มโผล่ตรง starts[k] พอดี (ช็อตก่อนหน้ายืดท้ายไว้ X วิ) ความยาวรวม = t เท่าเดิม
video = os.path.join(tmp, 'video.mp4')
if N == 1:
    run(['ffmpeg', '-v', 'error', '-y', '-i', segs[0], '-c', 'copy', video])
else:
    xf, prev = [], '[0:v]'
    for k in range(1, N):
        o = '[v]' if k == N - 1 else f'[x{k}]'
        xf.append(f"{prev}[{k}:v]xfade=transition=fade:duration={X}:offset={starts[k]:.3f}{o}")
        prev = o
    run(['ffmpeg', '-v', 'error', '-y', *[a for p in segs for a in ('-i', p)], '-filter_complex', ';'.join(xf),
         '-map', '[v]', '-r', '30', '-pix_fmt', 'yuv420p', '-c:v', 'libx264', '-crf', '20', video])

# เสียง: พากย์ตามจุดเริ่มช็อต + sfx ต้นช็อต + เสียงบรรยากาศเบาๆ ทั้งคลิป
ins, mix = ['-i', video], []
for k, s in enumerate(spec['shots']):
    ms = int((starts[k] + 0.15) * 1000)
    ins += ['-i', vo(k)]
    mix.append(f"[{ins.count("-i") - 1}:a]aformat=sample_rates=44100:channel_layouts=stereo,adelay={ms}|{ms},volume=1.6[v{k}]")
    if s.get('sfx'):
        ins += ['-i', os.path.join(SFX, s['sfx'] + '.mp3')]
        ms2 = int(starts[k] * 1000)
        mix.append(f"[{ins.count("-i") - 1}:a]aformat=sample_rates=44100:channel_layouts=stereo,atrim=0:2.5,adelay={ms2}|{ms2},volume=0.35[x{k}]")
ins += ['-stream_loop', '-1', '-i', os.path.join(SFX, spec.get('bed', 'horror_amb') + '.mp3')]
mix.append(f"[{ins.count("-i") - 1}:a]aformat=sample_rates=44100:channel_layouts=stereo,atrim=0:{t:.2f},volume=0.07,afade=out:st={t-1.5:.2f}:d=1.5[bed]")
labels = ''.join(f'[{m.rsplit("[", 1)[1]}' for m in mix)
out = os.path.join(job, f'out_{vodir}.mp4' if vodir else 'out.mp4')
run(['ffmpeg', '-v', 'error', '-y', *ins, '-filter_complex', ';'.join(mix) + f";{labels}amix=inputs={len(mix)}:normalize=0,alimiter=limit=0.95[a]",
     '-map', '0:v', '-map', '[a]', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '160k', '-shortest', out])
print('done', out, round(t, 1), 's')
