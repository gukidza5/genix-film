// เทส ComfyUI ในเครื่อง: ฉากพูด (S2V) จากรูป+เสียงที่ให้: node test-comfy.js <รูป> <mp3>
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { execFileSync } = require('child_process');
const comfy = require('./comfy');

(async () => {
  const [img, mp3] = process.argv.slice(2);
  const dir = path.join(__dirname, 'test-out-comfy');
  fs.mkdirSync(dir, { recursive: true });
  const wav = path.join(dir, 'talk.wav'), out = path.join(dir, 'talk.mp4');
  execFileSync('ffmpeg', ['-y', '-v', 'error', '-i', mp3, '-af', 'adelay=200:all=1,apad=pad_dur=0.4', '-ar', '16000', '-ac', '1', wav]);
  const sec = parseFloat(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', wav]));
  const t0 = Date.now();
  await comfy.generate({ kind: 'video', motion: 'woman talking happily, rubbing belly. The person is speaking, lips moving naturally', image: img, wav, seconds: sec, out, log: console.log });
  const vd = parseFloat(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', out]));
  assert(vd >= sec - 0.2, `วิดีโอสั้นกว่าเสียง ${vd} < ${sec}`);
  console.log('OK', out, `video ${vd}s audio ${sec}s`, Math.round((Date.now() - t0) / 1000) + 's');
})().catch((e) => { console.error('FAIL', e.message); process.exit(1); });
