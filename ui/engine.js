// ใช้ร่วมทุกหน้า: ตัวเลือก AI เขียนบท + แถบ "กำลังทำอะไรอยู่" ใต้เมนูซ้าย
(async () => {
  const nav = document.querySelector('aside nav');
  if (!nav || !window.genix?.aiEngine) return;

  // แถบสถานะงาน
  const st = document.createElement('a');
  st.href = 'index.html';
  st.style.cssText = 'display:block;margin:14px 12px 0;padding:10px 12px;border-radius:12px;font-size:12px;line-height:1.5;text-decoration:none;color:inherit;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.08)';
  nav.after(st);
  const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  const HOW = { resume: '♻️ ทำต่อจากที่ค้างตอนปิดแอป', queue: '⏳ เริ่มเองจากคิว', continue: '▶ กดทำต่อ', new: '▶ กดเริ่มเอง', remote: '📱 สั่งจากมือถือ' };
  let S = { job: null, queue: [], lastError: null };
  function render() {
    const j = S.job, p = j?.progress;
    if (!j) {
      st.innerHTML = `<b>💤 ว่าง ไม่มีงานทำอยู่</b>${S.queue.length ? `<br>คิวรอ ${S.queue.length}` : ''}`
        + (S.lastError ? `<br><span style="color:#ff7b7b">❌ งานล่าสุดพัง: ${esc(S.lastError.title)}<br>${esc(S.lastError.msg).slice(0, 140)}</span>` : '');
      return;
    }
    const shop = j.opts?.mode === 'shopee';
    const title = p?.title || j.title || j.opts?.idea || j.opts?.genre || '';
    const n = p?.stages?.length || 7;
    st.innerHTML = `<b>${shop ? '🛒 คลิปขายของ' : '🎬 หนัง'}: ${esc(title)}</b>`
      + (p ? `<br>${shop ? 'คลิป' : 'EP.'}${p.ep}/${p.eps} · ขั้น ${p.stage + 1}/${n} ${esc(p.label)}<br><span style="opacity:.75">${esc(p.detail)}</span>` : '<br>กำลังเริ่ม…')
      + `<br><span style="opacity:.6">${HOW[j.how] || ''}${S.queue.length ? ` · คิวรอ ${S.queue.length}` : ''}</span>`;
  }
  const refresh = async () => { S = await genix.jobState(); render(); };
  genix.on('jobstate', refresh);
  genix.on('queue', refresh);
  genix.on('error', refresh);
  await refresh();

  // ตัวเลือก AI
  const box = document.createElement('label');
  box.style.cssText = 'display:flex;flex-direction:column;gap:4px;margin:14px 12px 0;font-size:12px;color:var(--mut)';
  box.innerHTML = 'AI เขียนบท <select><option value="gemini">Gemini (API เร็ว)</option><option value="meta">Meta AI (หน้าเว็บ)</option></select>';
  st.after(box);
  const sel = box.querySelector('select');
  sel.value = await genix.aiEngine();
  sel.onchange = async () => (sel.value = await genix.aiEngine(sel.value));
})();
