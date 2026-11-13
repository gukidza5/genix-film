const $ = (id) => document.getElementById(id);
const PF = { tiktok: 'TikTok', facebook: 'FB', shopee: 'Shopee' };
const fileUrl = (p) => 'file:///' + p.replace(/\\/g, '/').split('/').map(encodeURIComponent).join('/').replace('%3A', ':');
const esc = (s) => String(s || '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function log(m) {
  const l = $('log');
  l.textContent += `[${new Date().toLocaleTimeString('th-TH')}] ${m}\n`;
  l.scrollTop = l.scrollHeight;
}
// สถานะบนปุ่มระหว่างโพสต์ (kidza 13 พ.ย.: กดแล้วไม่รู้ว่ากำลังโพสต์/รออยู่) · โพสต์ทีละคลิปตามคิว → ข้อความ log เป็นของคลิปหัวคิว
const queue = [], busy = {};
const btnText = (file) => busy[file] || '📤 โพสต์คลิปนี้';
function setBusy(file, text) {
  if (text) busy[file] = text; else delete busy[file];
  const b = document.querySelector(`[data-a=post][data-file="${CSS.escape(file)}"]`);
  if (b) { b.textContent = btnText(file); b.disabled = !!text; }
}
genix.on('postlog', (m) => {
  log(m);
  const cur = queue[0];
  if (cur) {
    const at = m.match(/จะโพสต์ราว (\S+)/), pg = m.match(/→ \S*facebook\.com\/([^/\s]+)/);
    if (at) setBusy(cur, '⏳ รอเว้นช่วง โพสต์ราว ' + at[1]);
    else if (/📤/.test(m)) setBusy(cur, '📤 กำลังโพสต์…' + (pg ? ' ' + pg[1] : ''));
  }
  if (/✅|🧪|❌/.test(m)) loadClips();
});

async function loadSettings() {
  const s = await genix.postSettings();
  for (const k of Object.keys(PF)) $('pf_' + k).checked = !!s.platforms[k];
  $('dryRun').checked = s.dryRun; $('autopost').checked = s.autopost; $('gapMin').value = s.gapMin ?? 60; $('fbPage').value = s.fbPage || ''; $('fbPageShop').value = s.fbPageShop || '';
}
function saveSettings() {
  genix.postSettings({ platforms: Object.fromEntries(Object.keys(PF).map((k) => [k, $('pf_' + k).checked])), dryRun: $('dryRun').checked, autopost: $('autopost').checked, gapMin: Math.max(0, +$('gapMin').value || 0), fbPage: $('fbPage').value.trim(), fbPageShop: $('fbPageShop').value.split(/\s+/).filter(Boolean).join('\n') });
}
document.querySelectorAll('.set input, .set textarea').forEach((x) => x.addEventListener('change', () => {
  if (x.id === 'autopost' && x.checked && !$('dryRun').checked && !confirm('เปิดโพสต์อัตโนมัติแบบโพสต์จริง? คลิปที่ทำเสร็จจะขึ้นทุกแพลตฟอร์มที่ติ๊กไว้ทันที')) x.checked = false;
  saveSettings();
}));

function status(posted) {
  return Object.entries(PF).map(([k, n]) => {
    const v = posted[k];
    if (!v) return '';
    const cls = v === 'dry' ? 'dry' : String(v).startsWith('error') ? 'err' : 'ok';
    const txt = cls === 'dry' ? 'ทดลอง' : cls === 'err' ? 'พัง' : 'โพสต์แล้ว';
    return `<b class="${cls}" title="${esc(v)}">${n}: ${txt}</b>`;
  }).filter(Boolean).join(' · ');
}

async function loadClips() {
  const list = await genix.postClips();
  $('clips').innerHTML = list.length ? '' : '<small>ยังไม่มีคลิปที่ทำเสร็จ</small>';
  for (const c of list) {
    const d = document.createElement('div');
    d.className = 'clip';
    d.innerHTML = `<video src="${fileUrl(c.file)}" preload="metadata" controls></video>
      <div><b>${esc(c.title)}</b> <small>· ${esc(c.name)}</small><span class="st">${status(c.posted)}</span>
        <textarea data-k="caption">${esc(c.caption)}</textarea>
        <div class="row"><label>สินค้าในตะกร้า (ชื่อ/รหัส)<input data-k="product" value="${esc(c.product)}" placeholder="ไม่ใส่ = ไม่ปักตะกร้า"></label>
          <label>ลิงก์แอฟฟิลิเอต (เฟสแนบเป็นแบนเนอร์สินค้า ไม่ได้ค่อยแปะท้ายแคปชัน)<input data-k="link" value="${esc(c.link)}" placeholder="วางลิงก์ Shopee เช่น https://s.shopee.co.th/..."></label></div>
        <button data-a="post" class="primary" data-file="${esc(c.file)}" ${busy[c.file] ? 'disabled' : ''}>${btnText(c.file)}</button> <button data-a="open">📂 เปิดไฟล์</button></div>`;
    // แก้แคปชัน/ลิงก์แล้วจำไว้ข้างคลิปทันที (โพสต์อัตโนมัติก็ใช้ค่านี้)
    d.querySelectorAll('[data-k=caption],[data-k=link]').forEach((x) => x.addEventListener('change', async () => {
      const r = await genix.postSave(c.file, { [x.dataset.k]: x.value.trim() });
      if (r?.error) { alert(r.error); return; }
      x.style.outline = '2px solid #3c6'; setTimeout(() => (x.style.outline = ''), 800);
    }));
    d.querySelector('[data-a=open]').onclick = () => genix.open(c.file);
    d.querySelector('[data-a=post]').onclick = async (e) => {
      const clip = { ...c };
      d.querySelectorAll('[data-k]').forEach((x) => (clip[x.dataset.k] = x.value.trim()));
      const on = Object.keys(PF).filter((k) => $('pf_' + k).checked);
      if (!on.length) return alert('ติ๊กแพลตฟอร์มที่จะโพสต์ก่อน');
      if (!$('dryRun').checked && !confirm(`โพสต์จริง "${c.name}" ขึ้น ${on.map((k) => PF[k]).join(', ')}?`)) return;
      queue.push(c.file);
      setBusy(c.file, queue.length > 1 ? '🕒 รอคิว (มีคลิปโพสต์อยู่ก่อน)' : '📤 กำลังโพสต์…');
      try { await genix.post(clip, on); } finally {
        queue.splice(queue.indexOf(c.file), 1);
        setBusy(c.file, '');
        loadClips();
      }
    };
    $('clips').append(d);
  }
}

$('btnLogin').onclick = async () => { const r = await genix.postLogins(); if (r?.error) alert(r.error); };
loadSettings(); loadClips();
