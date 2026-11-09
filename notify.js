// แจ้งเข้า LINE (kidza 9 พ.ย.): ข่าวอัตโนมัติโพสต์/พัง + สรุปยอดวิวรายวัน
// ใช้ OA ไหนก็ได้ที่ kidza เป็นเพื่อน · token อยู่ userData/line.json ใส่ที่ปุ่ม 🔔 มุมซ้ายล่าง · ไม่มี token = เงียบ
// shortcut: แผนฟรี LINE OA ส่ง push ได้ราว 300 ข้อความ/เดือน → แจ้งรอบละ 1 ข้อความ + สรุปวันละ 1 (~270/เดือน)
const fs = require('fs');
const path = require('path');

const OWNER = 'U49c3620aecb6991260f2a18d530e411c'; // ไอดี LINE ของ kidza (จากบอทแจ้งเวลาทำงาน)
const file = () => path.join(require('electron').app.getPath('userData'), 'line.json');
const cfg = () => { try { return JSON.parse(fs.readFileSync(file(), 'utf8')); } catch { return {}; } };
const setToken = (t, to) => { t = String(t || '').trim(); if (t) fs.writeFileSync(file(), JSON.stringify({ token: t, to: String(to || '').trim() || OWNER })); else fs.rmSync(file(), { force: true }); return !!cfg().token; };

async function line(text) {
  const { token, to } = cfg();
  if (!token) return false;
  const r = await fetch('https://api.line.me/v2/bot/message/push', {
    method: 'POST', signal: AbortSignal.timeout(20000),
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ to: to || OWNER, messages: [{ type: 'text', text: String(text).slice(0, 4900) }] }),
  });
  if (!r.ok) throw new Error(`LINE ${r.status}: ${(await r.text()).slice(0, 200)}`);
  return true;
}

module.exports = { line, setToken, hasToken: () => !!cfg().token };
