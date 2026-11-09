const $ = (id) => document.getElementById(id);
let st = { running: false };

function log(m) {
  const l = $('log');
  l.textContent += m + '\n';
  l.scrollTop = l.scrollHeight;
}
genix.on('livelog', log);

function addRow(p = {}) {
  const d = document.createElement('div');
  d.className = 'prod';
  d.innerHTML = `<b></b><input data-k="name" placeholder="เช่น ครีมกันแดด SPF50 50ml"><input data-k="match" placeholder="(ว่างได้)"><input data-k="price" placeholder="฿">
    <textarea data-k="info" placeholder="เนื้อบางเบา ไม่เหนียว, ซื้อ 2 แถม 1 (ใส่เฉพาะโปรที่มีจริง)"></textarea><input data-k="minutes" type="number" min="1" max="60"><button class="clips"></button><button class="del" title="ลบ">✕</button>`;
  for (const i of d.querySelectorAll('[data-k]')) i.value = p[i.dataset.k] || '';
  d.clips = p.clips || []; d.image = p.image || '';
  const cb = d.querySelector('.clips');
  const label = () => { cb.textContent = d.clips.length ? `🎬 ${d.clips.length} คลิป` : '🎬 เลือกคลิป'; cb.title = d.clips.join('\n') || 'ไม่มีคลิป = AI พูดอย่างเดียว'; };
  label();
  cb.onclick = async () => { const f = await genix.livePickClips(); if (f) { d.clips = f; label(); save(); } };
  cb.oncontextmenu = (e) => { e.preventDefault(); d.clips = []; label(); save(); }; // คลิกขวา = ล้างคลิป
  d.querySelector('.del').onclick = () => { d.remove(); renum(); save(); };
  d.oninput = save;
  $('prods').append(d);
  renum();
}
const renum = () => [...$('prods').children].forEach((d, i) => (d.querySelector('b').textContent = i + 1));
const products = () => [...$('prods').children].map((d) => ({ ...Object.fromEntries([...d.querySelectorAll('[data-k]')].map((i) => [i.dataset.k, i.value.trim()])), clips: d.clips, image: d.image }));
const media = { bg: '', presenter: '' };
const base = (f) => f.split(/[\\/]/).pop();
const mediaLabels = () => {
  $('btnBg').textContent = media.bg ? '🖼️ ' + base(media.bg) : '🖼️ เลือกรูป';
  $('btnPres').textContent = media.presenter ? '🧍 ' + base(media.presenter) : '🧍 เลือกคลิป';
};
const pickMedia = (btn, key, kind) => {
  $(btn).onclick = async () => { const f = await genix.livePickFile(kind); if (f) { media[key] = f; mediaLabels(); save(); } };
  $(btn).oncontextmenu = (e) => { e.preventDefault(); media[key] = ''; mediaLabels(); save(); };
};
pickMedia('btnBg', 'bg', 'image');
pickMedia('btnPres', 'presenter', 'video');
const cfg = () => ({ ...media, greenKey: $('greenKey').checked, lipsync: $('lipsync').checked, top: $('top').checked, products: products(), minutes: +$('minutes').value || 5, between: $('between').value === '' ? 2 : +$('between').value, voice: $('voice').value, style: $('style').value.trim(), pin: $('pin').checked, url: $('url').value.trim() });
let t;
const save = () => { clearTimeout(t); t = setTimeout(() => genix.liveSettings(cfg()), 600); };

function show(s) {
  st = s;
  [...$('prods').children].forEach((d, i) => d.classList.toggle('on', s.running && s.product === i));
  $('btnStart').disabled = s.running;
  if (!s.running) { $('now').textContent = '— ยังไม่เริ่ม —'; $('line').textContent = ''; return; }
  const left = Math.max(0, Math.round((s.until - Date.now()) / 1000));
  $('now').innerHTML = '';
  $('now').append(`📌 ${s.name} `, Object.assign(document.createElement('small'), { textContent: `รอบ ${s.round} · สินค้า ${s.product + 1} · เปลี่ยนชิ้นในอีก ${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}` }));
  $('line').textContent = s.line ? '🗣️ ' + s.line : '';
}
genix.on('livestate', show);
setInterval(() => st.running && show(st), 1000);

(async () => {
  const s = await genix.liveSettings();
  (s.products.length ? s.products : [{}]).forEach(addRow);
  media.bg = s.bg || ''; media.presenter = s.presenter || ''; mediaLabels();
  $('greenKey').checked = !!s.greenKey; $('lipsync').checked = !!s.lipsync; $('top').checked = s.top !== false;
  $('minutes').value = s.minutes; $('between').value = s.between ?? 2; $('voice').value = s.voice; $('style').value = s.style; $('pin').checked = s.pin; $('url').value = s.url;
  show(await genix.liveState());
})();
for (const id of ['greenKey', 'lipsync', 'top', 'minutes', 'between', 'voice', 'style', 'pin', 'url']) $(id).onchange = save;

$('btnAdd').onclick = () => { addRow(); save(); };
$('btnPlayer').onclick = () => genix.livePlayer();
// เพิ่มสินค้าจากคลิปขายของที่ทำในแอป (ชื่อเดียวกันที่มีอยู่แล้ว = อัปเดตรายการคลิปให้)
$('btnFrom').onclick = async () => {
  const list = await genix.liveFromClips();
  if (!list.length) return alert('ยังไม่มีคลิปขายของที่ทำเสร็จ (ต้องมี output/*.mp4)');
  let add = 0;
  for (const p of list) {
    const row = [...$('prods').children].find((d) => d.querySelector('[data-k=name]').value.trim() === p.name);
    if (row) { row.clips = p.clips; row.image ||= p.image; row.querySelector('.clips').textContent = `🎬 ${p.clips.length} คลิป`; }
    else { [...$('prods').children].filter((d) => !d.querySelector('[data-k=name]').value.trim()).forEach((d) => d.remove()); addRow(p); add++; }
  }
  save();
  log(`📥 ดึงจากคลิปที่ทำไว้: ${list.length} สินค้า (เพิ่มใหม่ ${add})`);
};
$('btnMeta').onclick = () => genix.liveMeta();
$('btnPage').onclick = async () => { await genix.liveSettings(cfg()); const r = await genix.liveOpenPage(); if (r?.error) alert(r.error); };
$('btnStart').onclick = async () => {
  const r = await genix.liveStart(cfg());
  if (r.error) alert(r.error); else log('▶️ เริ่มไลฟ์ — กำลังให้ AI เขียนบทรอบแรก (~1–2 นาที)');
};
$('btnStop').onclick = () => genix.liveStop();
