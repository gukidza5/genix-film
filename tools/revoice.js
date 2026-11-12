// เปลี่ยนเสียง F5 ของตัวละครในหนังที่ทำไปแล้ว: ลบเสียง/คลิปปากขยับ/ไฟล์ตัดต่อเฉพาะฉากที่ตัวนั้นพูด (ภาพฉากเก็บไว้)
// แอปทำต่อแล้วจะพากย์+ทำปากขยับใหม่เฉพาะฉากพวกนั้น แล้วตัดต่อ EP ใหม่
// ใช้: node tools/revoice.js <โฟลเดอร์หนัง> <ชื่อตัวละคร> <id เสียงใหม่ใน voices.json> [say.json]
//   say.json = {"คำในบท":"คำอ่าน"} ใส่ไว้ใน s.say ให้ F5 อ่านถูก (ซับยังโชว์คำเดิม) — ฉากที่โดนแก้คำอ่านก็พากย์ใหม่ด้วย
// ปิดแอปก่อนรัน ไม่งั้นแอปเซฟ project.json ทับ
const fs = require('fs'), path = require('path');
const [dir, who, voice, sayFile] = process.argv.slice(2);
if (!dir || !who) { console.error('ใช้: node tools/revoice.js <dir> <ตัวละคร> <voiceId> [say.json]'); process.exit(1); }
const pj = path.join(dir, 'project.json');
const p = JSON.parse(fs.readFileSync(pj, 'utf8'));
const c = p.cast.characters.find((x) => x.name === who);
if (!c) throw new Error(`ไม่มีตัวละคร ${who} (มี: ${p.cast.characters.map((x) => x.name).join(', ')})`);
if (voice) c.f5 = voice;
const say = sayFile ? JSON.parse(fs.readFileSync(sayFile, 'utf8')) : {};
const rm = (...a) => fs.rmSync(path.join(dir, ...a), { force: true });
const done = {};
for (const E of p.episodes) {
  for (const [i, s] of (E.scenes || []).entries()) {
    if (!s.line) continue;
    let said = s.line;
    for (const [k, v] of Object.entries(say)) said = said.split(k).join(v);
    const fix = said !== s.line;
    if (fix) s.say = said;
    if (!(voice && s.speaker === who) && !fix) continue;
    const n = i + 1;
    for (const ext of ['mp3', 'wav', 'f5.wav', 'mp4', 'png']) rm(`ep${E.ep}`, 'cut', `s${n}.${ext}`);
    rm(`ep${E.ep}`, `s${n}.mp4`);
    delete s.video; delete s.talk;
    if (E.final) { rm('output', `EP${E.ep}.mp4`); delete E.final; }
    (done[E.ep] ||= []).push(n);
  }
}
fs.writeFileSync(pj, JSON.stringify(p, null, 2));
console.log(`${who} → ${c.f5} | ทำใหม่:`, Object.entries(done).map(([e, a]) => `EP${e}(${a.length})`).join(' ') || 'ไม่มี');
