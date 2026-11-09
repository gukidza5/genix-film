// ตัวเรียก MuseTalk (D:\AI\MuseTalk\knf_server.py) — เปิดเซิร์ฟเวอร์เองถ้ายังไม่เปิด, โหลดโมเดลค้างไว้ทั้งไลฟ์
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const DIR = path.join(require('./paths').AI, 'MuseTalk');
const PY = path.join(DIR, 'venv', 'Scripts', 'python.exe');
const PORT = 8811;
const URL = `http://127.0.0.1:${PORT}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function call(route, body, timeoutMs = 600000) {
  const r = await fetch(URL + route, body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(timeoutMs) } : { signal: AbortSignal.timeout(3000) });
  const j = await r.json();
  if (j.error) throw new Error(j.error);
  return j;
}

class LipSync {
  constructor(log) { this.log = log; this.proc = null; }
  static installed() { return fs.existsSync(PY) && fs.existsSync(path.join(DIR, 'knf_server.py')); }

  async start(video) {
    if (!LipSync.installed()) throw new Error('ยังไม่ได้ลง MuseTalk ที่ ' + DIR);
    if (!(await call('/health').catch(() => null))) {
      this.log('🧠 เปิด MuseTalk (โหลดโมเดล ~30 วิ)');
      this.proc = spawn(PY, ['knf_server.py', String(PORT)], { cwd: DIR, windowsHide: true, env: { ...process.env, PYTHONIOENCODING: 'utf-8' } });
      let err = '';
      this.proc.stderr.on('data', (d) => (err = (err + d).slice(-600)));
      this.proc.on('exit', (c) => { if (c) this.log('❌ MuseTalk ปิดตัว: ' + err.split('\n').filter(Boolean).slice(-2).join(' | ')); this.proc = null; });
      for (let i = 0; i < 180 && !(await call('/health').catch(() => null)); i++) {
        if (!this.proc) throw new Error('MuseTalk เปิดไม่ขึ้น: ' + err.slice(-300));
        await sleep(1000);
      }
    }
    this.log('🧍 เตรียมหน้าคนขาย (ครั้งแรกของคลิปนี้ ~1–3 นาที ครั้งต่อไปเร็ว)');
    const r = await call('/avatar', { video, max_sec: 10 });
    this.log(`✅ คนขายพร้อม ${r.frames} เฟรม (${r.sec} วิ)`);
  }
  speak(audio, out, timeoutMs = 180000) { return call('/speak', { audio, out }, timeoutMs); }
  stop() { if (this.proc) { this.proc.kill(); this.proc = null; } }
}

module.exports = { LipSync };
