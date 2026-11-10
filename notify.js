// แจ้งเตือน (kidza 9 พ.ย.): ข่าวอัตโนมัติโพสต์/พัง + สรุปยอดวิวรายวัน
// ช่อง 🔔 มุมซ้ายล่างรับได้ 2 แบบ เก็บที่ userData/line.json · ว่าง = เงียบ
//   - ลิงก์ webhook ของห้องดิส (https://discord.com/api/webhooks/…) ← kidza เลือกดิส 10 พ.ย. ไม่มีโควตา
//   - token LINE OA (ไอดีผู้รับ LINE เปลี่ยนตาม provider — OWNER ใช้ได้กับ OA "แจ้งเวลาทำงาน" เท่านั้น)
const fs = require('fs');
const path = require('path');

const OWNER = 'U49c3620aecb6991260f2a18d530e411c'; // ไอดี LINE ของ kidza ฝั่ง provider แจ้งเวลาทำงาน
const DISCORD = /^https:\/\/(?:\w+\.)?discord(?:app)?\.com\/api\/webhooks\/\d+\/[\w-]+$/;
const file = () => path.join(require('electron').app.getPath('userData'), 'line.json');
const cfg = () => { try { return JSON.parse(fs.readFileSync(file(), 'utf8')); } catch { return {}; } };
const setToken = (t, to) => {
  t = String(t || '').trim();
  if (!t) fs.rmSync(file(), { force: true });
  else fs.writeFileSync(file(), JSON.stringify(DISCORD.test(t) ? { discord: t } : { token: t, to: String(to || '').trim() || OWNER }));
  return !!(cfg().token || cfg().discord);
};

async function line(text) {
  const { token, to, discord } = cfg();
  text = String(text);
  if (discord) {
    const r = await fetch(discord, { method: 'POST', signal: AbortSignal.timeout(20000), headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ content: text.slice(0, 1990) }) });
    if (!r.ok) throw new Error(`Discord ${r.status}: ${(await r.text()).slice(0, 200)}`);
    return true;
  }
  if (!token) return false;
  const r = await fetch('https://api.line.me/v2/bot/message/push', {
    method: 'POST', signal: AbortSignal.timeout(20000),
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ to: to || OWNER, messages: [{ type: 'text', text: text.slice(0, 4900) }] }),
  });
  if (!r.ok) throw new Error(`LINE ${r.status}: ${(await r.text()).slice(0, 200)}`);
  return true;
}

module.exports = { line, setToken, hasToken: () => !!(cfg().token || cfg().discord) };

if (require.main === module) { // self-check: node notify.js
  const a = require('assert');
  a.ok(DISCORD.test('https://discord.com/api/webhooks/123456789012345678/abcDEF-ghi_jkl'));
  a.ok(!DISCORD.test('3Yz5tne+xpFmtIQpb14c9VoBsVR6VRKE='));
  console.log('notify ok');
}
