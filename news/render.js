// คลิปสรุปข่าวแนวการ์ตูนเวกเตอร์ 9:16 — วาดแต่ละช็อตเป็น SVG/HTML แล้วถ่ายเป็น PNG 2 ชั้น (ฉาก bg_k.png + ตัวหนังสือ fg_k.png)
// usage: node render.js <spec.json> <outdir>
const fs = require('fs'), path = require('path');
const { chromium } = require('playwright-core');
const [spec, out] = [JSON.parse(fs.readFileSync(process.argv[2], 'utf8')), process.argv[3]];
fs.mkdirSync(out, { recursive: true });

const C = { night: '#1c2140', wall: '#2a3160', panel: '#3a4380', gold: '#ffd84a', red: '#ff4d5a', skin: '#f2c9a0', skin2: '#c98d5e', suit: '#1f2a4d', hair: '#2b1d16' };

// ตัวละครทั่วไป (ไม่ทำหน้าเหมือนคนจริง) mood: n ปกติ, s เศร้า, w กังวล
function woman(x, y, mood = 'n', s = 1) {
  const brow = mood === 's' ? 'M-34 -248 l22 6 M34 -248 l-22 6' : mood === 'w' ? 'M-34 -244 l22 -6 M34 -244 l-22 -6' : 'M-34 -246 h22 M12 -246 h22';
  const mouth = mood === 'n' ? 'M-14 -196 q14 8 28 0' : 'M-14 -190 q14 -10 28 0';
  const eye = mood === 's' ? '<path d="M-30 -228 q8 6 16 0 M14 -228 q8 6 16 0" stroke="#222" stroke-width="4" fill="none"/>' : '<circle cx="-22" cy="-228" r="6" fill="#222"/><circle cx="22" cy="-228" r="6" fill="#222"/>';
  return `<g transform="translate(${x},${y}) scale(${s})">
  <rect x="-62" y="-150" width="124" height="190" rx="30" fill="${C.suit}"/>
  <path d="M-20 -150 L0 -95 L20 -150 Z" fill="#e9e4f0"/>
  <path d="M-62 -120 l-20 150 h22 l18 -120Z M62 -120 l20 150 h-22 l-18 -120Z" fill="${C.suit}"/>
  <circle cx="-74" cy="38" r="12" fill="${C.skin}"/><circle cx="74" cy="38" r="12" fill="${C.skin}"/>
  <rect x="-46" y="38" width="38" height="200" fill="#1a2240"/><rect x="8" y="38" width="38" height="200" fill="#1a2240"/>
  <rect x="-52" y="232" width="48" height="16" rx="8" fill="#111"/><rect x="4" y="232" width="48" height="16" rx="8" fill="#111"/>
  <rect x="-14" y="-170" width="28" height="26" fill="${C.skin}"/>
  <circle cx="0" cy="-322" r="30" fill="${C.hair}"/>
  <ellipse cx="0" cy="-222" rx="58" ry="66" fill="${C.skin}"/>
  <path d="M-60 -230 q0 -66 60 -66 q60 0 60 66 q-30 -40 -60 -40 q-30 0 -60 40Z" fill="${C.hair}"/>
  ${eye}<path d="${brow}" stroke="${C.hair}" stroke-width="5" stroke-linecap="round"/>
  <path d="${mouth}" stroke="#a5474a" stroke-width="5" fill="none" stroke-linecap="round"/>
  <circle cx="-34" cy="-206" r="9" fill="#f5a3a3" opacity=".5"/><circle cx="34" cy="-206" r="9" fill="#f5a3a3" opacity=".5"/>
  ${mood === 's' ? '<path d="M24 -216 q4 14 0 20" stroke="#8fd3ff" stroke-width="5" fill="none"/>' : ''}
  </g>`;
}
function man(x, y, mood = 'n', s = 1) {
  const mouth = mood === 'n' ? 'M-14 -196 h28' : 'M-14 -190 q14 -10 28 0';
  return `<g transform="translate(${x},${y}) scale(${s})">
  <rect x="-68" y="-150" width="136" height="190" rx="30" fill="#151515"/>
  <path d="M-68 -120 l-22 150 h24 l18 -120Z M68 -120 l22 150 h-24 l-18 -120Z" fill="#151515"/>
  <circle cx="-80" cy="38" r="13" fill="${C.skin2}"/><circle cx="80" cy="38" r="13" fill="${C.skin2}"/>
  <rect x="-48" y="38" width="42" height="200" fill="#2b3550"/><rect x="6" y="38" width="42" height="200" fill="#2b3550"/>
  <rect x="-54" y="232" width="52" height="16" rx="8" fill="#ddd"/><rect x="2" y="232" width="52" height="16" rx="8" fill="#ddd"/>
  <rect x="-16" y="-172" width="32" height="28" fill="${C.skin2}"/>
  <ellipse cx="0" cy="-222" rx="56" ry="64" fill="${C.skin2}"/>
  <path d="M-56 -236 q4 -54 56 -54 q52 0 56 54 q-56 -26 -112 0Z" fill="#111"/>
  <circle cx="-22" cy="-228" r="6" fill="#111"/><circle cx="22" cy="-228" r="6" fill="#111"/>
  <path d="M-34 -248 h22 M12 -248 h22" stroke="#111" stroke-width="6" stroke-linecap="round"/>
  <path d="${mouth}" stroke="#5a2a20" stroke-width="5" fill="none" stroke-linecap="round"/>
  </g>`;
}

const bgRoom = (glow = C.panel) => `<rect width="1080" height="1920" fill="${C.night}"/>
  ${[...Array(4)].map((_, r) => [...Array(3)].map((_, c) => `<rect x="${60 + c * 330}" y="${520 + r * 190}" width="300" height="160" rx="10" fill="${glow}" opacity=".35"/>`).join('')).join('')}
  <rect y="1420" width="1080" height="500" fill="#151935"/><rect y="1416" width="1080" height="8" fill="#4a55a0" opacity=".6"/>`;
const vignette = `<defs><radialGradient id="vg" cx="50%" cy="45%" r="75%"><stop offset="55%" stop-color="#000" stop-opacity="0"/><stop offset="100%" stop-color="#000" stop-opacity=".75"/></radialGradient></defs><rect width="1080" height="1920" fill="url(#vg)"/>`;

// ฉากแต่ละแบบ
const SCENES = {
  intro: () => bgRoom() + `<rect x="250" y="560" width="580" height="520" rx="16" fill="#0d1028" stroke="#5560b0" stroke-width="6"/>` + woman(540, 1300, 'n', 1.25),
  arrest: () => `<rect width="1080" height="1920" fill="#2b3150"/><rect y="0" width="1080" height="900" fill="#556a9a" opacity=".5"/>
    <path d="M150 900 L540 600 L930 900Z" fill="#8a4a3a"/><rect x="200" y="890" width="680" height="530" fill="#e6dccb"/>
    <rect x="270" y="980" width="150" height="130" fill="#8fb0d8"/><rect x="660" y="980" width="150" height="130" fill="#8fb0d8"/><rect x="470" y="1180" width="140" height="240" fill="#6b4a32"/>
    <rect x="60" y="1300" width="960" height="120" fill="#b9b2a2"/>
    <rect y="1420" width="1080" height="500" fill="#3b3f4d"/>
    ${[0, 1, 2].map((i) => `<g transform="translate(${170 + i * 70},1500)"><rect x="-16" y="-170" width="10" height="170" fill="#222"/><rect x="-26" y="-200" width="30" height="40" rx="8" fill="${[C.red, C.gold, '#4ab0ff'][i]}"/></g>`).join('')}
    ${[[860, 1500], [980, 1540]].map(([x, y]) => `<g transform="translate(${x},${y})"><circle cy="-250" r="44" fill="#1d2235"/><rect x="-58" y="-200" width="116" height="200" rx="26" fill="#1d2235"/><rect x="-46" y="-268" width="92" height="22" rx="6" fill="#28324f"/></g>`).join('')}` + woman(540, 1520, 'w', 1.1),
  charges: () => bgRoom('#4a3a70') + woman(540, 1520, 'w', 1.1),
  map: () => `<rect width="1080" height="1920" fill="#20304a"/><path d="M120 1500 C 260 900, 380 760, 560 640 S 900 520, 980 820 L 960 1420 Z" fill="#3c6a58"/><path d="M300 1500 C 420 1200, 520 1000, 700 900" stroke="#6aa0d8" stroke-width="22" fill="none" opacity=".7"/>
    ${[[380, 1180], [520, 960], [690, 830], [780, 1120]].map(([x, y], i) => `<g transform="translate(${x},${y})"><path d="M0 0 C -40 -50 -40 -110 0 -110 C 40 -110 40 -50 0 0Z" fill="${C.red}"/><circle cy="-72" r="16" fill="#fff"/><text y="-60" text-anchor="middle" font-size="26" font-weight="700" fill="${C.red}" font-family="Kanit">${i + 1}</text></g>`).join('')}`,
  money: () => bgRoom(),
  personal: () => bgRoom('#5a3550') + `${[[230, 1160], [850, 1180], [300, 1300]].map(([x, y]) => `<g transform="translate(${x},${y})"><rect x="-70" y="-50" width="140" height="100" rx="18" fill="#c58a4a"/><path d="M-36 -50 q36 -50 72 0" stroke="#7a4f22" stroke-width="10" fill="none"/></g>`).join('')}
    <g transform="translate(800,1340)"><rect x="-120" y="-60" width="240" height="90" rx="30" fill="#e8e8f0"/><circle cx="-70" cy="34" r="30" fill="#222"/><circle cx="70" cy="34" r="30" fill="#222"/><rect x="-100" y="-46" width="80" height="40" rx="8" fill="#8fb8e8"/></g>` + woman(470, 1520, 'w', 1.05),
  freeze: () => `<rect width="1080" height="1920" fill="${C.night}"/>` + [...Array(18)].map((_, i) => { const x = 130 + (i % 6) * 140, y = 760 + Math.floor(i / 6) * 170; return `<g transform="translate(${x},${y})"><rect x="-56" y="-38" width="112" height="76" rx="10" fill="#3a4380" stroke="#7d88d0" stroke-width="4"/><rect x="-40" y="-22" width="44" height="10" rx="4" fill="#9aa4e8"/><g transform="translate(36,26)"><rect x="-18" y="-6" width="36" height="28" rx="5" fill="${C.gold}"/><path d="M-10 -6 v-10 a10 10 0 0 1 20 0 v10" stroke="${C.gold}" stroke-width="5" fill="none"/></g></g>`; }).join(''),
  court: () => `<rect width="1080" height="1920" fill="#3a4a6a"/><rect x="140" y="620" width="800" height="800" fill="#e8e2d4"/><path d="M100 640 L540 420 L980 640Z" fill="#cfc6b0"/>
    ${[...Array(6)].map((_, i) => `<rect x="${190 + i * 130}" y="680" width="44" height="740" fill="#d4ccb8"/>`).join('')}
    <rect x="370" y="1040" width="340" height="70" rx="6" fill="#20283f"/><text x="540" y="1088" text-anchor="middle" font-size="38" fill="${C.gold}" font-family="Kanit">ศาลอาญา</text>
    <rect y="1420" width="1080" height="500" fill="#2a2f3f"/>` + woman(400, 1560, 's', 1.05) + man(690, 1560, 'n', 1.05),
  sorry: () => bgRoom() + `${[0, 1, 2, 3, 4].map((i) => `<g transform="translate(${360 + i * 90},1180)"><rect x="-8" y="0" width="16" height="200" fill="#333"/><rect x="-24" y="-40" width="48" height="56" rx="12" fill="${[C.red, '#4ab0ff', C.gold, '#5cd48a', '#c06cff'][i]}"/></g>`).join('')}` + woman(540, 1180, 's', 1.15),
  cta: () => bgRoom() + `<g transform="translate(540,1090)"><rect x="-150" y="-240" width="300" height="500" rx="40" fill="#f4f4f8"/><rect x="-130" y="-200" width="260" height="380" rx="10" fill="#dde3f5"/><text y="-60" text-anchor="middle" font-size="44" font-weight="700" fill="${C.night}" font-family="Kanit">โอนเงิน</text><text y="20" text-anchor="middle" font-size="90" fill="${C.red}" font-family="Kanit">?</text></g>`,
};

const page = (body, fgOnly) => `<!doctype html><html><head><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Kanit:wght@400;600;800&display=block" rel="stylesheet">
<style>html,body{margin:0;width:1080px;height:1920px;overflow:hidden;background:${fgOnly ? 'transparent' : '#000'};font-family:Kanit,sans-serif}
.tag{position:absolute;left:70px;top:250px;background:${C.gold};color:#1a1a1a;font-weight:600;font-size:42px;padding:6px 22px;border-radius:12px}
.head{position:absolute;left:60px;right:60px;top:330px;text-align:center;color:#fff;font-weight:800;font-size:76px;line-height:1.25;text-shadow:0 6px 20px #000a}
.head b,.sub b{color:${C.gold}} .head i,.sub i{color:${C.red};font-style:normal}
.chips{position:absolute;left:60px;right:60px;top:560px;display:flex;flex-wrap:wrap;gap:20px;justify-content:center}
.chips span{background:#fff;color:#1c2140;font-weight:600;font-size:46px;padding:10px 28px;border-radius:40px}
.card{position:absolute;left:150px;right:150px;top:620px;background:#f6f6fa;border-radius:36px;padding:40px;text-align:center;box-shadow:0 20px 50px #0008}
.card .l{font-size:40px;color:#555}.card .n{font-size:190px;font-weight:800;color:${C.red};line-height:1.05}.card .u{font-size:54px;font-weight:600;color:#1c2140}
.sub{position:absolute;left:40px;right:40px;top:1150px;text-align:center}.sub span{display:inline-block;background:#0b0e22cc;color:#fff;font-weight:600;font-size:56px;line-height:1.3;padding:10px 26px;border-radius:18px}
.src{position:absolute;left:70px;top:200px;color:#fff9;font-size:26px}
</style></head><body>${body}</body></html>`;

(async () => {
  const b = await chromium.launch({ channel: 'chrome' });
  const p = await b.newPage({ viewport: { width: 1080, height: 1920 } });
  for (const [k, s] of spec.shots.entries()) {
    await p.setContent(page(`<svg width="1080" height="1920" viewBox="0 0 1080 1920">${SCENES[s.scene]()}${vignette}</svg>`), { waitUntil: 'networkidle' });
    await p.screenshot({ path: path.join(out, `bg_${k}.png`) });
    const fg = [s.tag && `<div class="tag">${s.tag}</div>`, s.head && `<div class="head">${s.head}</div>`,
      s.chips && `<div class="chips">${s.chips.map((c) => `<span>${c}</span>`).join('')}</div>`,
      s.card && `<div class="card"><div class="l">${s.card[0]}</div><div class="n">${s.card[1]}</div><div class="u">${s.card[2]}</div></div>`,
      s.sub && `<div class="sub"><span>${s.sub}</span></div>`, `<div class="src">ที่มา: ${spec.source}</div>`].filter(Boolean).join('');
    await p.setContent(page(fg, true), { waitUntil: 'networkidle' });
    await p.evaluate(() => document.fonts.ready);
    await p.screenshot({ path: path.join(out, `fg_${k}.png`), omitBackground: true });
    console.log('shot', k, s.scene);
  }
  await b.close();
})();
