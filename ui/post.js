const $ = (id) => document.getElementById(id);
const PF = { tiktok: 'TikTok', facebook: 'FB', shopee: 'Shopee' };
const fileUrl = (p) => 'file:///' + p.replace(/\\/g, '/').split('/').map(encodeURIComponent).join('/').replace('%3A', ':');
const esc = (s) => String(s || '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function log(m) {
  const l = $('log');
  l.textContent += `[${new Date().toLocaleTimeString('th-TH')}] ${m}\n`;
  l.scrollTop = l.scrollHeight;
}
genix.on('postlog', (m) => { log(m); if (/✅|🧪|❌/.test(m)) loadClips(); });

async function loadSettings() {
  const s = await genix.postSettings();
  for (const k of Object.keys(PF)) $('pf_' + k).checked = !!s.platforms[k];
  $('dryRun').checked = s.dryRun; $('autopost').checked = s.autopost; $('gapMin').value = s.gapMin ?? 60; $('fbPage').value = s.fbPage || '';
}
function saveSettings() {
  genix.postSettings({ platforms: Object.fromEntries(Object.keys(PF).map((k) => [k, $('pf_' + k).checked])), dryRun: $('dryRun').checked, autopost: $('autopost').checked, gapMin: Math.max(0, +$('gapMin').value || 0), fbPage: $('fbPage').value.trim() });
}
document.querySelectorAll('.set input').forEach((x) => x.addEventListener('change', () => {
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
    d.innerHTML = `<video src="${fileUrl(c.file)}" preload="metadata" muted></video>
      <div><b>${esc(c.title)}</b> <small>· ${esc(c.name)}</small><span class="st">${status(c.posted)}</span>
        <textarea data-k="caption">${esc(c.caption)}</textarea>
        <div class="row"><label>สินค้าในตะกร้า (ชื่อ/รหัส)<input data-k="product" value="${esc(c.product)}" placeholder="ไม่ใส่ = ไม่ปักตะกร้า"></label>
          <label>ลิงก์สินค้า (แปะในเฟส)<input data-k="link" value="${esc(c.link)}" placeholder="https://s.shopee.co.th/..."></label></div>
        <button data-a="post" class="primary">📤 โพสต์คลิปนี้</button> <button data-a="open">📂 เปิดไฟล์</button></div>`;
    d.querySelector('video').onclick = (e) => (e.target.paused ? e.target.play() : e.target.pause());
    d.querySelector('[data-a=open]').onclick = () => genix.open(c.file);
    d.querySelector('[data-a=post]').onclick = async (e) => {
      const clip = { ...c };
      d.querySelectorAll('[data-k]').forEach((x) => (clip[x.dataset.k] = x.value.trim()));
      const on = Object.keys(PF).filter((k) => $('pf_' + k).checked);
      if (!on.length) return alert('ติ๊กแพลตฟอร์มที่จะโพสต์ก่อน');
      if (!$('dryRun').checked && !confirm(`โพสต์จริง "${c.name}" ขึ้น ${on.map((k) => PF[k]).join(', ')}?`)) return;
      e.target.disabled = true;
      await genix.post(clip, on);
      e.target.disabled = false;
    };
    $('clips').append(d);
  }
}

$('btnLogin').onclick = async () => { const r = await genix.postLogins(); if (r?.error) alert(r.error); };
loadSettings(); loadClips();
