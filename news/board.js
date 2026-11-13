// ข่าวแบบบอร์ดสืบสวน (kidza 13 พ.ย. ตามคลิปตัวอย่าง): กระดาษยับ รูปโพลารอยด์ปักหมุดแดง เชือกแดงโยง การ์ดกระดาษพิมพ์ดีด พาดหัวแดง/ดำ ซับล่าง ไม่มีผู้ประกาศ
// ทั้งบอร์ดเป็นภาพเดียวต่อช็อต → shots/bg_k.png (build.py ซูมช้าๆ ทั้งบอร์ด = กล้องเลื่อนเข้า) · รูปจริงของช็อตอยู่ใน spec.shots[k].photo
// usage: node board.js <spec.json> <shots-dir>
const fs = require('fs'), path = require('path');
const { chromium } = require('playwright-core');
const [spec, out] = [JSON.parse(fs.readFileSync(process.argv[2], 'utf8')), process.argv[3]];

const esc = (s) => String(s || '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
const strip = (s) => String(s || '').replace(/\[[a-z ]+\]/gi, '').replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]+>/g, '').trim();
const capOf = (s) => strip(s.cap || s.sub || s.vo);
// data URI: หน้า setContent (about:blank) โหลด file:// ไม่ได้
const url = (f) => (f && fs.existsSync(f) ? `data:image/${/\.png$/i.test(f) ? 'png' : 'jpeg'};base64,` + fs.readFileSync(f).toString('base64') : '');
// พาดหัว: ช็อตแรก = hook · ช็อตอื่น = head (คำใน <b> เป็นสีแดง)
const headOf = (k) => {
  const s = spec.shots[k];
  const h = k === 0 ? spec.hook || s.head : s.head;
  if (!h) return '';
  const parts = String(h).split(/<br\s*\/?>/i).map((x) => esc(strip(x.replace(/<b>(.*?)<\/b>/gi, '\u0001$1\u0002'))).replace(/\u0001(.*?)\u0002/g, '<em>$1</em>'));
  return parts.slice(0, 2).map((x, i) => `<div class="h${i}">${x}</div>`).join('');
};
// การ์ดกระดาษข้างรูป: ตัวเลข (card) > เช็กลิสต์ (chips) > โน้ตวันที่/ป้าย
const noteOf = (s) => {
  if (Array.isArray(s.card) && s.card[1]) return `<div class="note num"><i></i><small>${esc(s.card[0])}</small><b>${esc(s.card[1])}</b><span>${esc(s.card[2] || '')}</span></div>`;
  if (s.chips?.length) return `<div class="note list"><i></i><h4>แฟ้มข้อมูล</h4>${s.chips.slice(0, 4).map((c, j) => `<p><u>${j < 2 ? '✓' : ''}</u>${esc(strip(c))}</p>`).join('')}</div>`;
  const t = strip(s.tag || s.sub || '');
  return t ? `<div class="note tag"><i></i><h4>บันทึก</h4><p>${esc(t)}</p></div>` : '';
};

const page = (k) => {
  const s = spec.shots[k], prev = k > 0 ? spec.shots[k - 1] : null;
  const tilt = [-3, 2.5, -1.5, 3, -2.5, 1.5][k % 6];
  return `<html><head><style>
  html,body{margin:0;width:1080px;height:1920px;overflow:hidden;font-family:'Kanit','Prompt','Leelawadee UI',sans-serif}
  #paper{position:absolute;inset:0}
  .head{position:absolute;left:60px;right:60px;top:150px;text-align:center;color:#141414;font-weight:800;letter-spacing:.5px}
  .head .h0{font-size:96px;line-height:1.15;text-shadow:0 3px 0 rgba(255,255,255,.6)}
  .head .h1{font-size:62px;line-height:1.25;margin-top:8px}
  .head em{font-style:normal;color:#d7191f}
  .pol{position:absolute;background:#fbfbf8;padding:22px 22px 70px;box-shadow:0 18px 40px rgba(0,0,0,.35),0 2px 6px rgba(0,0,0,.25)}
  .pol img{display:block;object-fit:cover;filter:saturate(.95) contrast(1.03)}
  .pol p{position:absolute;left:0;right:0;bottom:16px;margin:0;text-align:center;font:600 30px 'Kanit',sans-serif;color:#333}
  .big{left:200px;top:520px;transform:rotate(${tilt}deg)} .big img{width:640px;height:640px}
  .small{left:60px;top:430px;transform:rotate(-6deg);opacity:.95} .small img{width:230px;height:230px} .small{padding:12px 12px 36px}
  .pin{position:absolute;width:34px;height:34px;border-radius:50%;background:radial-gradient(circle at 35% 35%,#ff6b6b,#c0141a 60%,#7a0b0f);box-shadow:2px 6px 8px rgba(0,0,0,.4);z-index:5}
  .note{position:absolute;right:50px;top:1230px;width:400px;background:#f4efe2;padding:28px 30px 30px;transform:rotate(${-tilt / 1.5}deg);box-shadow:0 12px 28px rgba(0,0,0,.3);font-family:'Courier New','Kanit',monospace;color:#222;z-index:4}
  .note i{position:absolute;left:0;right:0;top:64px;border-top:3px solid #d7191f}
  .note h4{margin:0 0 22px;font:700 36px 'Kanit',sans-serif;color:#d7191f}
  .note p{margin:6px 0;font:600 32px 'Kanit',sans-serif;line-height:1.35}
  .note u{display:inline-block;width:30px;height:30px;border:3px solid #333;margin-right:12px;text-decoration:none;color:#d7191f;font-weight:900;line-height:28px;text-align:center;vertical-align:-4px}
  .num{text-align:center} .num small{display:block;font:700 34px 'Kanit',sans-serif;color:#d7191f;margin-bottom:26px}
  .num b{display:block;font:800 92px 'Kanit',sans-serif;color:#141414;line-height:1.05} .num span{font:600 34px 'Kanit',sans-serif}
  .sticky{position:absolute;width:120px;height:120px;background:#f6dc5b;box-shadow:0 8px 16px rgba(0,0,0,.25);transform:rotate(8deg);font:800 70px 'Kanit',sans-serif;text-align:center;line-height:120px;color:#333}
  .cap{position:absolute;left:70px;right:70px;top:1580px;text-align:center}
  .cap span{display:inline;background:rgba(255,255,255,.88);color:#111;font-size:54px;font-weight:700;line-height:1.5;padding:4px 16px;box-decoration-break:clone;-webkit-box-decoration-break:clone}
  svg.str{position:absolute;inset:0;z-index:3;pointer-events:none}
</style></head><body>
  <svg id="paper" width="1080" height="1920"><filter id="crumple"><feTurbulence type="fractalNoise" baseFrequency=".009" numOctaves="6" seed="${k + 3}"/><feDiffuseLighting lighting-color="#f2f2f0" surfaceScale="7"><feDistantLight azimuth="45" elevation="58"/></feDiffuseLighting></filter>
    <rect width="1080" height="1920" filter="url(#crumple)"/><rect width="1080" height="1920" fill="#d9d9d6" opacity=".25"/></svg>
  <div class="head">${headOf(k)}</div>
  ${prev && url(prev.photo) ? `<div class="pol small"><img src="${url(prev.photo)}"></div><div class="pin" style="left:${60 + 115}px;top:418px"></div>` : `<div class="sticky" style="left:70px;top:470px">?</div>`}
  ${url(s.photo) ? `<div class="pol big"><img src="${url(s.photo)}"><p>${esc(strip(s.tag || ''))}</p></div><div class="pin" style="left:${200 + 343}px;top:505px"></div>` : ''}
  ${noteOf(s)}
  ${noteOf(s) ? '<div class="pin" style="right:230px;top:1215px"></div>' : ''}
  <svg class="str" width="1080" height="1920">
    ${prev && url(prev.photo) ? '<path d="M192 435 Q 360 560 560 522" stroke="#c21a1f" stroke-width="5" fill="none"/>' : ''}
    ${noteOf(s) ? '<path d="M560 522 Q 980 820 848 1232" stroke="#c21a1f" stroke-width="5" fill="none"/>' : ''}
  </svg>
  ${capOf(s) ? `<div class="cap"><span>${esc(capOf(s))}</span></div>` : ''}
</body></html>`;
};

(async () => {
  const b = await chromium.launch({ channel: 'chrome' });
  const p = await b.newPage({ viewport: { width: 1080, height: 1920 } });
  for (const k of spec.shots.keys()) {
    await p.setContent(page(k), { waitUntil: 'load' });
    await p.screenshot({ path: path.join(out, `bg_${k}.png`) });
  }
  await b.close();
  console.log('board png', spec.shots.length);
})().catch((e) => { console.error(e.message); process.exit(1); });
