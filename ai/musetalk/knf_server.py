# KNF LIVE: เซิร์ฟเวอร์ขยับปาก MuseTalk 1.5 (โหลดโมเดลครั้งเดียว ค้างไว้ตลอดไลฟ์)
#   POST /avatar {"video": path, "max_sec": 10}  -> เตรียมคนขาย (ครั้งแรกช้า, ครั้งต่อไปใช้ cache ใน results/knf/<hash>)
#   POST /speak  {"audio": path, "out": path}     -> ได้ mp4 คนขายพูดตามเสียง (มีเสียงในไฟล์)
#   GET  /health
# รัน: venv\Scripts\python.exe knf_server.py [port=8811]
import os, sys, json, glob, pickle, hashlib, subprocess, threading, time, shutil
os.chdir(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.getcwd())
import numpy as np, cv2, torch
from http.server import ThreadingHTTPServer, BaseHTTPRequestHandler
from transformers import WhisperModel
from musetalk.utils.face_parsing import FaceParsing
from musetalk.utils.utils import datagen, load_all_model
from musetalk.utils.preprocessing import get_landmark_and_bbox
from musetalk.utils.blending import get_image_prepare_material, get_image_blending
from musetalk.utils.audio_processor import AudioProcessor

FPS, BATCH, EXTRA_MARGIN = 25, 16, 10
dev = torch.device('cuda' if torch.cuda.is_available() else 'cpu')
torch.backends.cudnn.benchmark = True  # ขนาด batch/ภาพคงที่ → ให้ cudnn เลือก kernel เร็วสุดครั้งเดียว
vae, unet, pe = load_all_model(device=dev)
pe = pe.half().to(dev); vae.vae = vae.vae.half().to(dev); unet.model = unet.model.half().to(dev)
dtype = unet.model.dtype
timesteps = torch.tensor([0], device=dev)
audio_proc = AudioProcessor(feature_extractor_path='./models/whisper')
whisper = WhisperModel.from_pretrained('./models/whisper').to(device=dev, dtype=dtype).eval()
whisper.requires_grad_(False)
fp = FaceParsing(left_cheek_width=90, right_cheek_width=90)
LOCK = threading.Lock()
AV = None  # คนขายที่เตรียมแล้ว


def encoder():
    try:
        out = subprocess.run(['ffmpeg', '-hide_banner', '-encoders'], capture_output=True, text=True).stdout
        if 'h264_nvenc' in out:
            # ลองจริง เพราะการ์ด/ไดรเวอร์บางรุ่นมีชื่อแต่ใช้ไม่ได้
            r = subprocess.run(['ffmpeg', '-v', 'error', '-f', 'lavfi', '-i', 'color=s=256x256:d=0.2', '-c:v', 'h264_nvenc', '-f', 'null', '-'], capture_output=True)
            if r.returncode == 0:
                return ['-c:v', 'h264_nvenc', '-preset', 'p4', '-cq', '21']
    except Exception:
        pass
    return ['-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20']
ENC = encoder()


@torch.no_grad()
def prepare(video, max_sec=10):
    """ตัดเฟรม → หาหน้า → latent + mask ของแต่ละเฟรม (เก็บ cache ตามไฟล์+ขนาด+เวลาแก้ไข)"""
    st = os.stat(video)
    key = hashlib.md5(f'{os.path.abspath(video)}|{st.st_size}|{st.st_mtime}|{max_sec}'.encode()).hexdigest()[:12]
    d = os.path.join('results', 'knf', key)
    cache = os.path.join(d, 'avatar.pkl')
    if os.path.exists(cache):
        with open(cache, 'rb') as f:
            a = pickle.load(f)
        a['latents'] = torch.load(os.path.join(d, 'latents.pt'))
        return a
    os.makedirs(os.path.join(d, 'frames'), exist_ok=True)
    cap = cv2.VideoCapture(video)
    src_fps = cap.get(cv2.CAP_PROP_FPS) or FPS
    frames, i = [], 0
    while len(frames) < max_sec * FPS:
        ok, fr = cap.read()
        if not ok:
            break
        # ปรับเป็น 25fps (เก็บเฟรมตามเวลา)
        if int(i * FPS / src_fps) >= len(frames):
            frames.append(fr)
        i += 1
    cap.release()
    if not frames:
        raise RuntimeError('อ่านวิดีโอคนขายไม่ได้')
    paths = []
    for k, fr in enumerate(frames):
        p = os.path.join(d, 'frames', f'{k:08d}.png'); cv2.imwrite(p, fr); paths.append(p)
    coords, frames = get_landmark_and_bbox(paths, 0)
    ph = (0.0, 0.0, 0.0, 0.0)
    keep = [k for k, c in enumerate(coords) if c != ph]
    if len(keep) < max(5, len(frames) // 3):
        raise RuntimeError(f'หาหน้าคนขายเจอแค่ {len(keep)}/{len(frames)} เฟรม — ใช้คลิปที่เห็นหน้าตรงชัด ๆ')
    frames = [frames[k] for k in keep]; coords = [list(map(int, coords[k])) for k in keep]
    lat = []
    for (x1, y1, x2, y2), fr in zip(coords, frames):
        y2 = min(y2 + EXTRA_MARGIN, fr.shape[0])
        crop = cv2.resize(fr[y1:y2, x1:x2], (256, 256), interpolation=cv2.INTER_LANCZOS4)
        lat.append(vae.get_latents_for_unet(crop))
    coords = [[x1, y1, x2, min(y2 + EXTRA_MARGIN, frames[0].shape[0])] for x1, y1, x2, y2 in coords]
    # เล่นเดินหน้า-ถอยหลัง ให้วนต่อกันเนียน
    frames, coords, lat = frames + frames[::-1], coords + coords[::-1], lat + lat[::-1]
    masks, boxes = [], []
    for fr, c in zip(frames, coords):
        m, b = get_image_prepare_material(fr, c, fp=fp, mode='jaw')
        masks.append(m); boxes.append(b)
    a = {'frames': frames, 'coords': coords, 'masks': masks, 'boxes': boxes, 'size': frames[0].shape[1::-1], 'dir': d}
    with open(cache, 'wb') as f:
        pickle.dump(a, f)
    torch.save(lat, os.path.join(d, 'latents.pt'))
    a['latents'] = lat
    return a


@torch.no_grad()
def speak(audio, out):
    a = AV
    t_a = time.time()
    feats, length = audio_proc.get_audio_feature(audio, weight_dtype=dtype)
    chunks = audio_proc.get_whisper_chunk(feats, dev, dtype, whisper, length, fps=FPS, audio_padding_length_left=2, audio_padding_length_right=2)
    print(f'audio {time.time() - t_a:.2f}s', flush=True)
    w, h = a['size']
    tmp = out + '.part.mp4'
    ff = subprocess.Popen(['ffmpeg', '-y', '-v', 'error', '-f', 'rawvideo', '-pix_fmt', 'bgr24', '-s', f'{w}x{h}', '-r', str(FPS), '-i', '-',
                           '-i', audio, *ENC, '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '160k', '-shortest', '-movflags', '+faststart', tmp],
                          stdin=subprocess.PIPE)
    n, idx = len(a['frames']), 0
    tg = tb = tw = 0.0; t_all = time.time()
    for wb, lb in datagen(chunks, a['latents'], BATCH):
        t0 = time.time()
        feat = pe(wb.to(dev))
        pred = unet.model(lb.to(device=dev, dtype=dtype), timesteps, encoder_hidden_states=feat).sample
        faces = vae.decode_latents(pred.to(device=dev, dtype=vae.vae.dtype))
        tg += time.time() - t0
        for face in faces:
            t1 = time.time()
            k = idx % n
            x1, y1, x2, y2 = a['coords'][k]
            try:
                face = cv2.resize(face.astype(np.uint8), (x2 - x1, y2 - y1))
                fr = get_image_blending(a['frames'][k].copy(), face, [x1, y1, x2, y2], a['masks'][k], a['boxes'][k])
            except Exception:
                fr = a['frames'][k]
            t2 = time.time(); tb += t2 - t1
            ff.stdin.write(np.ascontiguousarray(fr).tobytes())
            tw += time.time() - t2
            idx += 1
    ff.stdin.close()
    print(f'speak {idx}f gpu={tg:.2f}s blend={tb:.2f}s write={tw:.2f}s loop={time.time() - t_all:.2f}s', flush=True)
    if ff.wait() != 0:
        raise RuntimeError('ffmpeg ต่อวิดีโอไม่ได้')
    os.replace(tmp, out)
    return idx


class H(BaseHTTPRequestHandler):
    def reply(self, code, obj):
        b = json.dumps(obj, ensure_ascii=False).encode()
        self.send_response(code); self.send_header('Content-Type', 'application/json'); self.send_header('Content-Length', str(len(b))); self.end_headers(); self.wfile.write(b)

    def do_GET(self):
        self.reply(200, {'ok': True, 'avatar': bool(AV), 'gpu': torch.cuda.get_device_name(0) if torch.cuda.is_available() else 'cpu'})

    def do_POST(self):
        global AV
        try:
            body = json.loads(self.rfile.read(int(self.headers.get('Content-Length', 0))) or b'{}')
            t = time.time()
            with LOCK:
                if self.path == '/avatar':
                    AV = prepare(body['video'], body.get('max_sec', 10))
                    return self.reply(200, {'ok': True, 'frames': len(AV['frames']), 'sec': round(time.time() - t, 1)})
                if self.path == '/speak':
                    if not AV:
                        return self.reply(400, {'error': 'ยังไม่ได้เตรียมคนขาย (/avatar)'})
                    n = speak(body['audio'], body['out'])
                    return self.reply(200, {'ok': True, 'frames': n, 'sec': round(time.time() - t, 2), 'realtime': round(n / FPS / max(time.time() - t, 1e-3), 2)})
            self.reply(404, {'error': 'no route'})
        except Exception as e:
            import traceback; traceback.print_exc()
            self.reply(500, {'error': f'{type(e).__name__}: {e}'})

    def log_message(self, *a):
        pass


if __name__ == '__main__':
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8811
    print(f'KNF MuseTalk ready on 127.0.0.1:{port} ({torch.cuda.get_device_name(0)}) enc={ENC[1]}', flush=True)
    ThreadingHTTPServer(('127.0.0.1', port), H).serve_forever()
