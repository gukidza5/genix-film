// มุมซ้ายล่างทุกหน้า: 🔄 อัพเดท (โหลดเวอร์ชันใหม่จาก GitHub) + 🔑 คีย์ Gemini ของเครื่องนี้
(() => {
  const side = document.querySelector('aside');
  if (!side || !window.genix?.updateCheck) return;
  const box = document.createElement('div');
  box.className = 'upd';
  box.innerHTML = `<style>
    .upd{margin-top:8px;display:flex;flex-direction:column;gap:6px;font-size:12px}
    .upd button{width:100%;padding:7px 10px;border-radius:10px;border:1px solid #ffffff22;background:#ffffff0d;color:inherit;cursor:pointer;text-align:left;font:inherit}
    .upd button.new{background:#ffd84a;color:#1a1a1a;border-color:#ffd84a;font-weight:700}
    .upd button:disabled{opacity:.6;cursor:default}
    .upd .k{display:none;gap:4px}.upd .k.on{display:flex}
    .upd .k input{flex:1;min-width:0;padding:6px 8px;border-radius:8px;border:1px solid #ffffff33;background:#0006;color:inherit}
    .upd small{opacity:.6}
  </style>
  <button id="updBtn" disabled>🔄 เช็คอัพเดท…</button>
  <button id="keyBtn">🔑 คีย์ Gemini</button>
  <div class="k" id="keyBox"><input id="keyIn" type="password" placeholder="วางคีย์ AIza… (ว่าง = ลบ)"><button id="keySave" style="width:auto">บันทึก</button></div>
  <button id="elBtn">🔑 คีย์ ElevenLabs</button>
  <div class="k" id="elBox"><input id="elIn" type="password" placeholder="วางคีย์ sk_… (ว่าง = ลบ)"><button id="elSave" style="width:auto">บันทึก</button></div>
  <small id="updMsg"></small>`;
  side.appendChild(box);
  const $ = (id) => box.querySelector('#' + id);
  const btn = $('updBtn'), msg = $('updMsg');
  let info = null;

  async function check() {
    info = await window.genix.updateCheck();
    btn.classList.remove('new');
    if (info.error) { btn.textContent = '🔄 เช็คอัพเดทไม่ได้ (กดลองใหม่)'; btn.disabled = false; msg.textContent = info.error; return; }
    if (info.dev) { btn.textContent = '🛠️ เครื่องแก้โค้ด (ปล่อยด้วย ปล่อยอัพเดท.bat)'; btn.disabled = true; msg.textContent = 'ล่าสุดบน GitHub: ' + info.msg; return; }
    if (info.has) { btn.textContent = '⬆️ มีอัพเดทใหม่ กดเลย'; btn.classList.add('new'); msg.textContent = info.msg; }
    else { btn.textContent = '✅ เป็นเวอร์ชันล่าสุดแล้ว'; msg.textContent = ''; }
    btn.disabled = false;
  }
  btn.onclick = async () => {
    if (!info || info.error || !info.has) return check();
    btn.disabled = true; btn.textContent = '⏳ กำลังอัพเดท…';
    const r = await window.genix.updateApply(); // สำเร็จ = แอปเปิดใหม่เอง ไม่กลับมาที่นี่
    if (r?.error) { msg.textContent = '⚠️ ' + r.error; btn.disabled = false; btn.textContent = '⬆️ ลองอัพเดทอีกครั้ง'; }
  };
  window.genix.onUpdLog((m) => { msg.textContent = m; });

  const keyLabel = (has) => { $('keyBtn').textContent = has ? '🔑 คีย์ Gemini: ใส่แล้ว' : '🔑 ใส่คีย์ Gemini (ไม่ใส่ = ใช้ Meta)'; };
  window.genix.geminiKey().then(keyLabel);
  $('keyBtn').onclick = () => $('keyBox').classList.toggle('on');
  $('keySave').onclick = async () => {
    keyLabel(await window.genix.geminiKey($('keyIn').value));
    $('keyIn').value = ''; $('keyBox').classList.remove('on');
  };

  const elLabel = (has) => { $('elBtn').textContent = has ? '🔑 คีย์ ElevenLabs: ใส่แล้ว' : '🔑 ใส่คีย์ ElevenLabs (เสียงข่าว Mali)'; };
  window.genix.elevenKey?.().then(elLabel);
  $('elBtn').onclick = () => $('elBox').classList.toggle('on');
  $('elSave').onclick = async () => {
    elLabel(await window.genix.elevenKey($('elIn').value));
    $('elIn').value = ''; $('elBox').classList.remove('on');
    if (location.pathname.endsWith('news.html')) location.reload(); // ให้รายการเสียงข่าวขึ้น Mali
  };

  check();
  setInterval(check, 30 * 60 * 1000);
})();
