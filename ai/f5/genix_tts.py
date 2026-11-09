# พากย์หลายประโยค หลายเสียง ในรอบเดียว (โหลดโมเดลครั้งเดียว) สำหรับแอป Genix Film
# usage: venv\Scripts\python genix_tts.py <jobs.json>
#   jobs: {"model": "v1", "items": [{"ref": "a.wav", "ref_text": "...", "text": "...", "out": "x.wav", "speed": 1.0}]}
# ไฟล์ที่มีอยู่แล้วข้าม · พังทีละบรรทัดพิมพ์ FAIL แล้วทำบรรทัดต่อไป (แอปจะใช้ edge-tts แทนบรรทัดนั้น)
import json, os, sys
os.environ.setdefault('HF_HOME', os.path.join(os.path.dirname(os.path.abspath(__file__)), 'hf'))  # โฟลเดอร์ vo-clone ไม่ว่าอยู่ D: หรือ C:
import soundfile as sf
import torch, torchaudio

def _load(path, *a, **k):  # torchaudio 2.9+ needs torchcodec for load(); soundfile is enough here
    data, sr = sf.read(path, dtype='float32', always_2d=True)
    return torch.from_numpy(data.T.copy()), sr
torchaudio.load = _load
if not torch.cuda.is_available():  # รันบน CPU ได้ (ตอน ComfyUI ใช้การ์ดจออยู่) — โมเดลเซฟมาจาก CUDA
    _tl = torch.load
    torch.load = lambda *a, **k: _tl(*a, **{**k, 'map_location': 'cpu'})
from f5_tts_th.tts import TTS
from f5_tts_th.utils_infer import preprocess_ref_audio_text, infer_process
import re

# ความยาวเสียงตามจังหวะพูดของคลิปต้นแบบ (ตัวไลบรารีนับจากตัวอักษรอย่างเดียว เสียงนักแสดงที่พูดช้า/เว้นจังหวะเลยโดนบีบจนขาดๆ หายๆ)
def chars(t): return len(re.sub(r"[\s.!?,…\"'()-]", "", t)) or 1
def infer(tts, it):
    ref, rt = preprocess_ref_audio_text(it["ref"], it["ref_text"], show_info=lambda *a: None)
    rd = sf.info(ref).duration
    t = it["text"]
    gen = rd * chars(t) / chars(rt) / it.get("speed", 1.0) + 0.3 * len(re.findall(r"\.{2,}|…", t))
    wav, _, _ = infer_process(ref, rt, t, tts.f5_model, tts.vocoder, mel_spec_type=tts.vocoder_name, nfe_step=it.get("step", 32),
                              cfg_strength=it.get("cfg", 2.0), set_max_chars=100, fix_duration=rd + max(gen, 0.8), use_ipa=False)
    return wav

job = json.load(open(sys.argv[1], encoding='utf-8'))
items = [it for it in job['items'] if not os.path.exists(it['out'])]
if items:
    tts = TTS(model=job.get('model', 'v1'))
for it in items:
    try:
        wav = infer(tts, it)
        sf.write(it['out'], wav, 24000)
        print('ok', it['out'], round(len(wav) / 24000, 2), flush=True)
    except Exception as e:  # noqa: BLE001 — บรรทัดเดียวพังไม่ให้ทั้งชุดพัง
        print('FAIL', it['out'], repr(e)[:200], flush=True)
