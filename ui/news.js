const $ = (id) => document.getElementById(id);
const fileUrl = (p) => 'file:///' + p.replace(/\\/g, '/').split('/').map(encodeURIComponent).join('/').replace('%3A', ':');
let dir = null, busy = false;

// จำของในหน้านี้ไว้ (สลับไปเมนูอื่นแล้วกลับมา หน้าโหลดใหม่ ของต้องอยู่ครบ)
const LS = (k, v) => { try { if (v === undefined) return localStorage['news.' + k]; if (v === null) delete localStorage['news.' + k]; else localStorage['news.' + k] = v; } catch {} };
const keep = () => { for (const k of ['text', 'spec', 'cap']) LS(k, $(k).value); LS('log', $('log').textContent.slice(-20000)); LS('dir', dir); };

function log(m) {
  const l = $('log');
  l.textContent += `[${new Date().toLocaleTimeString('th-TH')}] ${m}\n`;
  l.scrollTop = l.scrollHeight;
  keep();
}
genix.on('newslog', log);
genix.on('postlog', log);
for (const k of ['text', 'spec', 'cap']) { $(k).value = LS(k) || ''; $(k).addEventListener('input', keep); }
$('log').textContent = LS('log') || '';
function showClip(d) {
  dir = d || null;
  $('outCard').hidden = !dir;
  if (dir) $('vid').src = fileUrl(dir + '\\output\\ข่าว.mp4');
  keep();
}
showClip(LS('dir'));

(async () => {
  for (const v of await genix.newsVoices()) $('voice').add(new Option(v.name, v.id));
  // มีคีย์ ElevenLabs = ใช้ Mali เป็นหลัก (kidza ตั้ง 9 พ.ย.) ตั้งครั้งเดียว ทีหลังเลือกเองได้
  const el = [...$('voice').options].find((o) => o.value.startsWith('eleven:'));
  if (el && !localStorage.newsVoiceEl) { localStorage.newsVoice = el.value; localStorage.newsVoiceEl = '1'; }
  $('voice').value = localStorage.newsVoice || 'serชาย001';
  if (!$('voice').value) $('voice').selectedIndex = 0;
  const s = await genix.postSettings();
  $('fbPage').value = s.fbPage || '';
  $('realPost').checked = !s.dryRun;
})();
$('voice').onchange = () => (localStorage.newsVoice = $('voice').value);
$('fbPage').onchange = () => {
  const v = $('fbPage').value.trim();
  if (v && !/^https:\/\/(www\.|m\.|web\.)?facebook\.com\//i.test(v)) return alert('ใส่ลิงก์เพจเฟส เช่น https://www.facebook.com/ชื่อเพจ');
  genix.postSettings({ fbPage: v });
};
$('realPost').onchange = () => {
  if ($('realPost').checked && !confirm('เปิดโพสต์จริง? ทำเสร็จแล้วจะขึ้นเฟสทันทีโดยไม่หยุดรอ')) $('realPost').checked = false;
  genix.postSettings({ dryRun: !$('realPost').checked });
};

// ตัวเลขทุกตัวบนจอ (วันที่ เวลา ยอดเงิน) ต้องมีอยู่ในเนื้อข่าวที่วางมา — กัน Meta แต่งเลขเองก่อนขึ้นเพจ
const thaiDigits = (s) => s.replace(/[๐-๙]/g, (d) => '๐๑๒๓๔๕๖๗๘๙'.indexOf(d));
const onScreenText = (s) => [s.tag, s.head, s.sub, ...(s.chips || []), ...(s.card || [])].join(' ').replace(/<[^>]+>/g, ' ');
function badNumbers(spec, text) {
  const src = thaiDigits(text).replace(/,/g, '');
  const has = (n) => src.includes(n);
  // ปีปัจจุบัน (69 / 2569 / 2026) ไม่ใช่ตัวเลขที่ AI แต่งได้ ปล่อยผ่าน
  const y = new Date().getFullYear(), years = [String(y), String(y + 543), String(y + 543).slice(2)];
  // ปี พ.ศ.↔ค.ศ. ที่แปลงจากปีในข่าว (2567 ↔ 2024) นับว่ามีในข่าว
  const yearOk = (n) => n.length === 4 && (has(String(+n - 543)) || has(String(+n + 543)));
  const onScreen = thaiDigits(spec.shots.map(onScreenText).join(' ')).replace(/,/g, '');
  return [...new Set(onScreen.match(/\d+(\.\d+)?/g) || [])].filter((n) => !has(n) && !years.includes(n) && !yearOk(n));
}
// บอกว่าเลขที่ผิดอยู่ช็อตไหน จะได้แก้มือได้ง่าย
const whereBad = (spec, bad) => bad.map((n) => `${n} (ช็อต ${spec.shots.map((s, i) => (thaiDigits(onScreenText(s)).replace(/,/g, '').match(/\d+(\.\d+)?/g) || []).includes(n) ? i + 1 : 0).filter(Boolean).join(',')})`).join(', ');

// ช่องเนื้อข่าวมีแต่ลิงก์ → ดึงเนื้อข่าวจากเว็บมาแทน (แทนที่ในช่องเลย จะได้เห็น/แก้ได้ และตัวกันเลขใช้ตรวจ)
async function fromLink() {
  const v = $('text').value.trim();
  if (!/^https?:\/\/\S+$/i.test(v)) return;
  log('🔗 ดึงเนื้อข่าวจากลิงก์…');
  const r = await genix.newsFetch(v);
  if (r?.error) throw new Error(r.error);
  $('text').value = r;
  log(`✅ ได้เนื้อข่าว ${r.length} ตัวอักษร`);
}

async function script() {
  await fromLink();
  const text = $('text').value.trim();
  if (text.length < 80) throw new Error('วางเนื้อข่าวก่อน (ยาวกว่านี้หน่อย)');
  let r, bad = [], tried = [];
  // AI แต่งเลข → ส่งกลับให้เขียนใหม่โดยห้ามใช้เลขพวกนั้น สูงสุด 3 รอบ
  for (let i = 0; i < 3; i++) {
    log(i ? `🔁 บทมีเลขที่ไม่อยู่ในข่าว (${bad.join(', ')}) ให้ AI เขียนใหม่ รอบ ${i + 1}…` : '✍️ ส่งให้ AI เขียนบท…');
    r = await genix.newsScript(text, tried);
    if (r?.error) throw new Error(r.error);
    bad = badNumbers(r, text);
    if (!bad.length) break;
    tried = [...new Set([...tried, ...bad])];
  }
  $('cap').value = r.caption || '';
  delete r.caption;
  $('spec').value = JSON.stringify(r, null, 1);
  log(`✅ ได้บท ${r.shots.length} ช็อต`); // log() เซฟบท/แคปชันด้วย
  if (bad.length) throw new Error(`เขียนใหม่ 3 รอบแล้วยังมีเลขที่ไม่อยู่ในข่าว: ${whereBad(r, bad)} — ลบเลขพวกนี้ในบทแล้วกด 🎬 ทำคลิป หรือเติมข่าวที่มีเลขนี้`);
}

function readSpec() {
  let spec;
  try { spec = JSON.parse($('spec').value); } catch (err) { throw new Error('บทไม่ใช่ JSON ที่ถูกต้อง: ' + err.message); }
  if (!spec.shots?.length) throw new Error('บทไม่มี shots');
  const bad = badNumbers(spec, $('text').value);
  if (bad.length) throw new Error(`ตัวเลขบนจอไม่มีในเนื้อข่าว: ${whereBad(spec, bad)} — ลบเลขพวกนี้ในบทหรือเติมข่าวก่อน`);
  return { ...spec, caption: $('cap').value.trim() };
}

// หน้าผู้ประกาศประจำ ใช้ key เดียวกับหน้าขายของ (genix.face) = ผู้หญิงคนเดิมทั้ง 2 หน้า
let face = '';
try { face = localStorage.getItem('genix.face'); } catch {}
const showFace = () => { $('face').style.backgroundImage = face ? `url("${fileUrl(face)}")` : ''; $('face').textContent = face ? '' : 'เลือก'; };
const saveFace = (f) => { face = f; try { localStorage.setItem('genix.face', f); } catch {} showFace(); };
$('face').onclick = async () => { const f = await genix.pickImage(); if (f) saveFace(f); };
$('face').oncontextmenu = (e) => { e.preventDefault(); saveFace(''); };
// null = ยังไม่เคยเลือก → ใช้หน้าเริ่มต้น · '' = คลิกขวาเอาออกเอง
if (face === null) genix.defaultFace().then((f) => { face = f; showFace(); }); else showFace();

async function make() {
  const spec = readSpec();
  showClip(null);
  if (face) spec.anchor = face;
  const r = await genix.newsMake(spec, $('voice').value);
  if (r?.error) throw new Error(r.error);
  showClip(r.dir);
}

async function post(ask) {
  const clip = (await genix.postClips()).find((c) => c.dir === dir);
  if (!clip) throw new Error('หาคลิปไม่เจอ');
  const s = await genix.postSettings();
  const where = s.fbPage ? 'เพจ ' + s.fbPage : 'โปรไฟล์ที่ล็อกอิน';
  if (ask && !s.dryRun && !confirm(`โพสต์จริงลง Facebook Reels ของ${where}?`)) return;
  log(`📤 โพสต์ลง Reels (${where}${s.dryRun ? ' · โหมดทดลอง หยุดก่อนกดเผยแพร่' : ''})`);
  LS('autoPost', null); // การโพสต์วิ่งฝั่งแอป สลับหน้าระหว่างนี้ก็โพสต์ต่อจนจบ
  const r = await genix.post(clip, ['facebook']);
  if (String(r?.facebook || '').startsWith('error')) throw new Error(r.facebook);
}

// ปุ่มไหนก็ทำทีละงาน ล็อกปุ่มทั้งหมดระหว่างทำ
const lock = (on) => { busy = on; document.querySelectorAll('main button').forEach((b) => (b.disabled = on)); };
function action(fn) {
  return async () => {
    if (busy) return;
    lock(true);
    // ไม่ใช้ alert: บน Windows หลังปิด alert ช่องพิมพ์ใน Electron จะพิมพ์ไม่ได้จนกว่าจะสลับหน้าต่าง
    try { await fn(); } catch (e) { LS('autoPost', null); log('❌ ' + e.message); $('log').scrollIntoView({ block: 'center' }); }
    lock(false);
  };
}

// กลับมาหน้านี้ระหว่าง/หลังทำคลิป (ทำคลิปวิ่งฝั่งแอป ไม่หยุดตอนสลับหน้า) → ทำต่อ + ถ้ากดรวดเดียวไว้ก็โพสต์ต่อเอง
(async () => {
  const st = await genix.newsState();
  const finish = action(async () => {
    const last = (await genix.newsState()).last;
    if (last?.error) throw new Error(last.error);
    if (last?.dir) showClip(last.dir);
    if (LS('autoPost') && dir) { await post(false); log('🏁 จบรวดเดียว'); }
  });
  if (st.busy) {
    log('⏳ ยังทำคลิปข่าวอยู่ (ทำต่อตอนสลับไปหน้าอื่น) รอให้เสร็จ…');
    lock(true);
    genix.on('newsdone', () => { lock(false); finish(); });
  } else if (LS('autoPost') && st.last?.dir && st.last.dir !== dir) {
    log('✅ คลิปทำเสร็จตอนอยู่หน้าอื่น ไปโพสต์ต่อ');
    finish();
  }
})();

$('btnScript').onclick = action(script);
$('btnMake').onclick = action(make);
$('btnPost').onclick = action(() => post(true));
$('btnAll').onclick = action(async () => {
  const s = await genix.postSettings();
  if (!s.fbPage && !confirm('ยังไม่ได้ใส่ลิงก์เพจ จะโพสต์ในนามโปรไฟล์ที่ล็อกอินอยู่ ต่อไหม?')) return;
  await script();
  LS('autoPost', '1'); // สลับหน้าระหว่างทำคลิป กลับมาแล้วโพสต์ต่อให้
  await make();
  await post(false);
  log('🏁 จบรวดเดียว');
});
$('btnOpen').onclick = () => dir && genix.open(dir);
