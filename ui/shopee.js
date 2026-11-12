const $ = (id) => document.getElementById(id);
const STAGES = ['เตรียมสินค้า', 'เขียนบท', 'สร้างภาพ', 'สร้างวิดีโอ', 'ตัดต่อ'];
const OPTS = ['presence', 'style', 'scene', 'aspect', 'tone', 'register', 'accent', 'voice', 'clips', 'scenes', 'cta', 'video', 'autopost'];
const fileUrl = (p) => 'file:///' + p.replace(/\\/g, '/').split('/').map(encodeURIComponent).join('/').replace('%3A', ':');

let running = false, t0 = 0, product = {};
// หน้าเดียวใช้ 3 แบบ: shopee.html (Shopee) / ?shop=tiktok (TikTok Shop) / ?shop=facebook (ลิงก์ Shopee แอฟฟิลิเอต → Facebook Reels "เพิ่มสินค้า")
const SHOP = ['tiktok', 'facebook'].includes(new URLSearchParams(location.search).get('shop')) ? new URLSearchParams(location.search).get('shop') : 'shopee';
const SHOPNAME = SHOP === 'tiktok' ? 'TikTok Shop' : 'Shopee';
if (SHOP === 'shopee') document.querySelector('#autopost option[value=yes]').textContent = 'โพสต์เลย (ตามที่ติ๊กในหน้าโพสต์)';
if (SHOP === 'facebook') {
  document.title = 'KNF · คลิปขายของ Facebook';
  document.querySelector('.logo small').textContent = 'FACEBOOK';
  document.querySelector('nav a.on')?.removeAttribute('class');
  document.querySelector('nav a[href="shopee.html?shop=facebook"]').className = 'on';
  document.querySelector('.head .pill').textContent = 'Facebook Reels + Shopee Affiliate';
  document.querySelector('#autopost option[value=yes]').textContent = 'โพสต์เลย (ขึ้น Facebook Reels + เพิ่มสินค้า)';
  $('url').placeholder = 'https://s.shopee.co.th/... (ลิงก์ย่อแอฟฟิลิเอต)';
  $('cta').value = 'จิ้มป้ายสินค้าในคลิปเลย 🛒';
}
if (SHOP === 'tiktok') {
  document.title = 'KNF · คลิปขายของ TikTok';
  document.querySelector('.logo small').textContent = 'TIKTOK';
  document.querySelector('nav a.on').removeAttribute('class');
  document.querySelector('nav a[href="shopee.html?shop=tiktok"]').className = 'on';
  document.querySelector('nav a[href="shopee.html"]')?.removeAttribute('class');
  document.querySelector('.head .pill').textContent = 'TikTok Shop Affiliate';
  document.querySelector('label.wide').firstChild.textContent = 'ลิงก์สินค้า TikTok Shop (ลิงก์ affiliate/โชว์เคสก็ได้)';
  $('url').placeholder = 'https://vt.tiktok.com/... หรือ https://shop.tiktok.com/...';
  $('cta').value = 'กดตะกร้าเหลืองเลย 🛒';
}

function setPic(src) {
  $('pic').style.backgroundImage = src ? `url("${src}")` : '';
  $('pic').textContent = src ? '' : 'เลือกรูปสินค้า';
}

function renderBars(stage) {
  $('bars').innerHTML = STAGES.map((s, i) => `<div class="${i < stage ? 'ok' : i === stage ? 'on' : ''}"><b>${i + 1}</b>${s}</div>`).join('');
}

// ระหว่างทำ ฟอร์มยังใช้ได้: กรอกสินค้าถัดไปแล้วกดปุ่มเดิม = เข้าคิว (แอปเริ่มให้เองเมื่ออันที่รันอยู่เสร็จ)
function setRunning(on) {
  running = on;
  $('btnStart').textContent = on ? '➕ เข้าคิวทำต่อจากอันนี้' : '▶ เริ่มทำคลิปขายของ';
  $('auto').hidden = !on;
  $('btnStop').hidden = !on;
  $('sideStart').classList.toggle('run', on);
  $('sideState').textContent = on ? 'กำลังทำงาน · กดเพื่อหยุด' : 'หยุดอยู่ · กดเพื่อเริ่ม';
}

// ไม่ใช้ alert: บน Windows ปิด alert แล้วช่องพิมพ์ใน Electron พิมพ์ไม่ได้จนกว่าจะสลับหน้าต่าง
function warn(msg, field) {
  log('⚠️ ' + msg);
  const el = field && $(field);
  if (!el) return;
  el.scrollIntoView({ block: 'center' });
  el.focus?.();
  el.style.outline = '2px solid #f55';
  setTimeout(() => (el.style.outline = ''), 3000);
}

function clearForm() {
  product = {};
  for (const k of ['url', 'title', 'price', 'note']) $(k).value = '';
  setPic('');
}

function renderQueue(list) {
  $('queue').innerHTML = list.length ? `<b>⏳ คิวรอ ${list.length} งาน</b>` : '';
  $('queue').style.display = list.length ? 'grid' : 'none';
  list.forEach((t, i) => {
    const d = document.createElement('div');
    d.className = 'p';
    d.innerHTML = `<span></span><button>✕ เอาออก</button>`;
    d.querySelector("span").textContent = `${i + 1}. ${t || "🛒 คลิปขายของ"}`;
    d.querySelector('button').onclick = () => genix.unqueue(i);
    $('queue').append(d);
  });
}
genix.on('queue', renderQueue);
genix.queue().then(renderQueue);

function log(msg) {
  const l = $('log');
  l.textContent += `[${new Date().toLocaleTimeString('th-TH')}] ${msg}\n`;
  l.scrollTop = l.scrollHeight;
}

function addAsset({ kind, file, name, cover }) {
  const f = document.createElement('figure');
  f.className = kind;
  f.innerHTML = kind === 'final'
    ? `<video src="${fileUrl(file)}" poster="${cover ? fileUrl(cover) : ''}" controls></video><figcaption>🎬 ${name}</figcaption>`
    : `<img src="${fileUrl(file)}"><figcaption>${name}</figcaption>`;
  f.querySelector('img')?.addEventListener('click', () => genix.open(file));
  kind === 'final' ? $('gallery').prepend(f) : $('gallery').append(f);
}

async function fetchProduct() {
  const url = $('url').value.trim();
  if (!(SHOP === 'tiktok' ? /^https?:\/\/\S*tiktok/i : /^https?:\/\/\S*shopee/i).test(url)) return warn(`ใส่ลิงก์ ${SHOPNAME} ก่อน`, 'url');
  $('btnFetch').disabled = true; $('btnFetch').textContent = 'กำลังดึง…';
  try {
    const r = await genix.product(url);
    if (r.needLogin) { log(`⚠️ ${SHOPNAME} ให้ล็อกอิน/ยืนยันตัว — ล็อกอินในหน้าต่างที่เปิดขึ้นแล้วกดดึงข้อมูลใหม่`); return genix.showShopee(url); }
    if (r.error) return log('⚠️ ' + r.error);
    // ลิงก์ย่อ s.shopee (แอฟฟิลิเอต) เก็บตามที่แปะ: เฟส "เพิ่มสินค้า" ใช้ลิงก์นี้ ลิงก์ปลายทางยาวใช้ไม่ได้ (kidza 12 พ.ย.)
    product = { url: /^https?:\/\/s\.shopee\./i.test(url) ? url : r.url || url, page: r.url, image: r.image, desc: r.desc };
    $('title').value = r.title; $('price').value = r.price || '';
    setPic(r.image);
    log(`🛒 ${r.title} ${r.price || ''}`);
  } finally { $('btnFetch').disabled = false; $('btnFetch').textContent = 'ดึงข้อมูล'; }
}

async function start(dir, saved) {
  const opts = saved || Object.fromEntries(OPTS.map((k) => [k, $(k).type === 'number' ? +$(k).value : $(k).value]));
  if (!saved) {
    opts.mode = 'shopee';
    opts.shop = SHOP;
    opts.voicetype = opts.voice === 'male' ? 'male' : 'female';
    opts.note = $('note').value.trim();
    if (face && opts.presence !== 'hands' && opts.presence !== 'none') opts.face = face;
    opts.product = { ...product, url: product.url || $('url').value.trim(), title: $('title').value.trim(), price: $('price').value.trim() };
    if (!opts.product.title) return warn('ใส่ชื่อสินค้าก่อน (วางลิงก์แล้วกดดึงข้อมูล หรือพิมพ์เอง)', 'url');
    if (!opts.product.file && !opts.product.image) return warn('ยังไม่มีรูปสินค้า — กดช่องรูปเพื่อเลือกไฟล์ หรือดึงจากลิงก์', 'pic');
  }
  if (!(await genix.checkMeta()) && !confirm('ยังไม่เห็นช่องแชท Meta AI (อาจยังไม่ล็อกอิน) จะเริ่มเลยไหม?')) return genix.showMeta();
  const r = await genix.start(opts, dir);
  if (r.error) return warn(r.error);
  if (r.queued) { log(`⏳ เข้าคิวที่ ${r.queued}: ${opts.product?.title || ''} — อันที่รันอยู่เสร็จแล้วเริ่มเอง`); if (!saved) clearForm(); return; }
  if (!saved) clearForm();
}

// งานเริ่มจริง (กดเริ่มเอง หรือคิวถัดไปเริ่มเอง)
genix.on('jobstart', ({ dir, opts: o, resumed }) => {
  if (o.mode !== 'shopee') return;
  if (!resumed) $('gallery').innerHTML = '';
  t0 = Date.now();
  setRunning(true); renderBars(0);
  log(`▶ เริ่ม ${resumed ? 'ทำต่อ' : 'งานใหม่'}: ${o.product?.title || ''} (${dir})`);
});
// เปิดหน้านี้ทีหลัง (สลับหน้า/รีแอป) → ถามแอปว่ายังทำอยู่ไหม
genix.jobState().then(({ job }) => {
  if (job?.opts?.mode !== 'shopee') return;
  t0 = job.at || Date.now();
  setRunning(true); renderBars(0);
  // วาดขั้นที่ทำถึงจริง (ไม่งั้นแถบโชว์ขั้น 1 ทั้งที่ทำต่อจากขั้น 4 อยู่ ดูเหมือนเริ่มใหม่)
  if (job.progress) onProgress(job.progress, true);
  else $('autoTitle').textContent = `🤖 กำลังทำ: ${job.opts.product?.title || ''}`;
});

function onProgress(p, quiet) {
  $('autoTitle').textContent = `🤖 คลิป ${p.ep}/${p.eps} · ขั้น ${p.stage + 1}/5: ${p.label} — ${p.title}`;
  $('autoSub').textContent = `ทำมาแล้ว ${Math.round((Date.now() - t0) / 60000)} นาที · ${p.detail || ''}`;
  renderBars(p.stage);
  if (!quiet) log(`คลิป ${p.ep} ${p.label}: ${p.detail || ''}`);
}
genix.on('progress', (p) => onProgress(p));
genix.on('log', log);
genix.on('asset', addAsset);
genix.on('done', ({ dir }) => { setRunning(false); renderBars(5); log('🎉 เสร็จครบ — ไฟล์ clipN.mp4 + ปก + clipN_post.txt (แคปชัน) อยู่ในโฟลเดอร์ output'); genix.open(dir + '\\output'); loadProjects(); });
genix.on('stopped', () => { setRunning(false); log('■ หยุดแล้ว (กด "ทำต่อ" ด้านล่างเพื่อทำต่อจากเดิม)'); loadProjects(); });
genix.on('error', (m) => { setRunning(false); log('❌ ' + m); loadProjects(); });

async function loadProjects() {
  const list = (await genix.projects()).filter((p) => p.mode === 'shopee' && (p.shop || 'shopee') === SHOP);
  $('projects').innerHTML = list.length ? '' : '<small>ยังไม่มี</small>';
  for (const p of list) {
    const done = (p.episodes || []).filter((e) => e.final).length;
    const d = document.createElement('div');
    d.className = 'p';
    d.innerHTML = `<span></span><button data-a="open">📂 เปิด</button>${done < p.clips ? '<button data-a="resume">▶ ทำต่อ</button>' : ''}`;
    d.querySelector('span').textContent = `${p.product?.title || '(ไม่มีชื่อ)'} · ${done}/${p.clips} คลิป · ${new Date(p.created).toLocaleString('th-TH')}`;
    d.querySelector('[data-a=open]').onclick = () => genix.open(p.dir + '\\output');
    const r = d.querySelector('[data-a=resume]');
    if (r) r.onclick = () => start(p.dir, p); // รันอยู่ = เข้าคิว
    $('projects').append(d);
  }
}

async function checkMeta() {
  const ok = await genix.checkMeta();
  $('metaBadge').textContent = ok ? 'พร้อม' : 'ล็อกอิน';
  $('metaBadge').className = ok ? '' : 'warn';
}

$('pic').onclick = async () => {
  const f = await genix.pickImage();
  if (f) { product.file = f; setPic(fileUrl(f)); }
};
// หน้าพรีเซนเตอร์ประจำ: เลือกครั้งเดียว จำไว้ทุกงาน (คลิกขวา = เอาออก)
let face = '';
try { face = localStorage.getItem('genix.face'); } catch {}
const showFace = () => { $('face').style.backgroundImage = face ? `url("${fileUrl(face)}")` : ''; $('face').textContent = face ? '' : 'เลือกรูปหน้า'; };
const saveFace = (f) => { face = f; try { localStorage.setItem('genix.face', f); } catch {} showFace(); };
$('face').onclick = async () => { const f = await genix.pickImage(); if (f) saveFace(f); };
$('face').oncontextmenu = (e) => { e.preventDefault(); saveFace(''); };
// null = ยังไม่เคยเลือก → ใช้หน้าเริ่มต้น · '' = คลิกขวาเอาออกเอง
if (face === null) genix.defaultFace().then((f) => { face = f; showFace(); }); else showFace();
// จำ "ทำเสร็จแล้ว" ข้ามการเปิดหน้า/รีแอป
try { const v = localStorage.getItem('genix.autopost'); if (v) $('autopost').value = v; } catch {}
$('autopost').onchange = () => { try { localStorage.setItem('genix.autopost', $('autopost').value); } catch {} };
$('btnFetch').onclick = fetchProduct;
$('btnShopee').onclick = () => genix.showShopee($('url').value.trim() || (SHOP === 'tiktok' ? 'https://www.tiktok.com/login' : ''));
$('btnStart').onclick = () => start();
$('btnStop').onclick = () => genix.stop();
$('sideStart').onclick = () => (running ? genix.stop() : start());
$('btnMeta').onclick = $('navMeta').onclick = () => genix.showMeta();

renderBars(-1); setRunning(false); loadProjects();
checkMeta(); setInterval(checkMeta, 15000);
