// ตัวหนังสือบนคลิปข่าวแบบรูปเต็มจอ (kidza 12 พ.ย.: ยอดวิวน้อย คนไถแบบปิดเสียงไม่รู้ว่าข่าวอะไร)
// ช็อตแรก = พาดหัวตัวใหญ่ (spec.hook) + ซับ · ช็อตอื่น = ซับอย่างเดียว · PNG โปร่งใส 1080x1920 → shots/txt_k.png (build.py ซ้อนทับ)
// วาดด้วย Chrome: สระ/วรรณยุกต์ไทยไม่เพี้ยนแบบ ffmpeg drawtext · ซับอยู่เหนือกรอบผู้ประกาศมุมล่าง (addAnchor y≈1390–1830)
// usage: node textpng.js <spec.json> <shots-dir>
const fs = require('fs'), path = require('path');
const { chromium } = require('playwright-core');
const [spec, out] = [JSON.parse(fs.readFileSync(process.argv[2], 'utf8')), process.argv[3]];

const esc = (s) => String(s || '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
// บทเก่าไม่มี cap → ใช้ vo ตัดแท็ก/ขีดตัวย่อออก
const capOf = (s) => (s.cap || s.sub || s.vo || '').replace(/\[[a-z ]+\]/gi, '').replace(/<[^>]+>/g, '').trim();
const hookOf = () => (spec.hook || spec.title || capOf(spec.shots[0] || {})).replace(/<[^>]+>/g, '').trim();

const page = (k) => `<html><head><style>
  html,body{margin:0;width:1080px;height:1920px;background:transparent;font-family:'Kanit','Prompt','Leelawadee UI','Tahoma',sans-serif}
  .hook{position:absolute;left:50px;right:50px;top:170px;text-align:center}
  .hook span{display:inline;background:#e8202a;color:#fff;font-size:86px;font-weight:800;line-height:1.38;padding:6px 22px;
    box-decoration-break:clone;-webkit-box-decoration-break:clone;border-radius:14px;box-shadow:0 8px 24px rgba(0,0,0,.45)}
  .cap{position:absolute;left:60px;right:60px;bottom:600px;text-align:center}
  .cap span{display:inline;background:rgba(0,0,0,.72);color:#fff;font-size:58px;font-weight:700;line-height:1.5;padding:6px 18px;
    box-decoration-break:clone;-webkit-box-decoration-break:clone;border-radius:12px}
</style></head><body>
  ${k === 0 && hookOf() ? `<div class="hook"><span>${esc(hookOf())}</span></div>` : ''}
  ${capOf(spec.shots[k]) ? `<div class="cap"><span>${esc(capOf(spec.shots[k]))}</span></div>` : ''}
</body></html>`;

(async () => {
  const b = await chromium.launch({ channel: 'chrome' });
  const p = await b.newPage({ viewport: { width: 1080, height: 1920 } });
  for (const k of spec.shots.keys()) {
    await p.setContent(page(k));
    await p.screenshot({ path: path.join(out, `txt_${k}.png`), omitBackground: true });
  }
  await b.close();
  console.log('text png', spec.shots.length);
})().catch((e) => { console.error(e.message); process.exit(1); });
