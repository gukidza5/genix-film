// ทดสอบตัวคุม Flow กับเว็บจริง ด้วยการเจน "รูป" (Nano Banana = 0 เครดิต): node test-flow.js [login]
// login = แค่เปิด Chrome ของแอปให้ล็อกอิน
const path = require('path');
const fs = require('fs');
const assert = require('assert');
const { execFileSync } = require('child_process');
const { Flow } = require('./flow');

(async () => {
  const flow = new Flow(path.join(process.env.APPDATA, 'genix-film', 'flow-chrome'));
  flow.onNotice = console.log;
  if (process.argv[2] === 'login') { await flow.show(); console.log('opened'); process.exit(0); }
  const dir = path.join(__dirname, 'test-out-flow');
  fs.mkdirSync(dir, { recursive: true });
  const ref = path.join(dir, 'ref.jpg');
  execFileSync('ffmpeg', ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'color=c=red:s=512x512', '-frames:v', '1', ref]);
  const out = path.join(dir, 'gen.jpg');
  const t0 = Date.now();
  await flow.generate({ kind: 'image', prompt: 'a cute orange cat sitting on a red cushion like the attached color, photorealistic', files: [ref], aspect: '9:16', out, project: process.argv[2], timeoutMs: 240000 });
  assert(fs.statSync(out).size > 20000, 'ไฟล์เล็กผิดปกติ');
  console.log('OK', out, fs.statSync(out).size, 'bytes', Math.round((Date.now() - t0) / 1000) + 's', 'project=' + flow.project);
  process.exit(0);
})().catch((e) => { console.error('FAIL', e.message); process.exit(1); });
