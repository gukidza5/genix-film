// ลบโฟลเดอร์คลิปข่าว (*-news) ทุกเที่ยงคืน (kidza 13 พ.ย.) — Task Scheduler "GenixFilm-CleanNews"
// เว้นโฟลเดอร์ที่แก้ภายใน 1 ชม. (ข่าวรอบดึกที่อาจยังรอคิวโพสต์อยู่)
const fs = require('fs'), path = require('path'), os = require('os');
const root = process.argv[2] || path.join(os.homedir(), 'Documents', 'GenixFilm');
const log = path.join(root, 'clean-news.log');
const cut = Date.now() - 3600000;
for (const n of fs.readdirSync(root)) {
  const d = path.join(root, n);
  if (!/-news$/.test(n) || !fs.statSync(d).isDirectory() || fs.statSync(d).mtimeMs > cut) continue;
  try { fs.rmSync(d, { recursive: true, force: true }); fs.appendFileSync(log, `${new Date().toISOString()} ลบ ${n}\n`); }
  catch (e) { fs.appendFileSync(log, `${new Date().toISOString()} ลบไม่ได้ ${n}: ${e.message}\n`); }
}
