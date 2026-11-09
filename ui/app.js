const $ = (id) => document.getElementById(id);
const STEPS = [['ไอเดียเรื่อง', 'พล็อต'], ['นักแสดง & โลเคชัน', 'แคสต์'], ['บทถ่ายทำ', 'บท'], ['เฟรมภาพ', 'ภาพนิ่ง'], ['สร้างวิดีโอ', 'คลิป'], ['ตัดต่อ & ปล่อยหนัง', 'ตัดต่อ · ปก · เซฟหนัง']];
const STAGES = ['คิดพล็อต', 'แคสต์', 'ถ่ายรูปนักแสดง', 'เขียนบท', 'สร้างเฟรม', 'สร้างวิดีโอ', 'ตัดต่อ'];
const STAGE_TO_STEP = [0, 1, 1, 2, 3, 4, 5];
const fileUrl = (p) => 'file:///' + p.replace(/\\/g, '/').split('/').map(encodeURIComponent).join('/').replace('%3A', ':');

let running = false, t0 = 0, cur = null, opts = null;

function est(scenes) { return [0.2, 0.5, 3, 2, scenes * 1, scenes * 3, 1]; } // นาที โดยประมาณ

function renderStepper(active = -1) {
  $('stepper').innerHTML = STEPS.map(([a, b], i) =>
    `<li class="${i === active ? 'on' : i < active ? 'ok' : ''}"><b>${i < active ? '✓' : i + 1}</b><div>${a}<br><small>${b}</small></div></li>`).join('');
}

function renderBars(stage) {
  const e = est(opts?.scenes || 6);
  $('bars').innerHTML = STAGES.map((s, i) =>
    `<div class="${i < stage ? 'ok' : i === stage ? 'on' : ''}"><b>${i + 1}</b>${s}<br>~${e[i] < 1 ? Math.round(e[i] * 60) + ' วิ' : Math.round(e[i]) + ' นาที'}</div>`).join('');
}

function setRunning(on) {
  running = on;
  $('btnStart').textContent = on ? '➕ เพิ่มเรื่องนี้เข้าคิว' : '▶ เริ่มโหมดอัตโนมัติ';
  $('auto').hidden = !on && !cur;
  $('spin').style.visibility = on ? 'visible' : 'hidden';
  $('btnStop').hidden = !on;
  $('sideStart').classList.toggle('run', on);
  $('sideState').textContent = on ? 'กำลังทำงาน · กดเพื่อหยุด' : 'หยุดอยู่ · กดเพื่อเริ่ม';
}

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

async function start(dir) {
  opts = { genre: $('genre').value, idea: $('idea').value.trim(), eps: +$('eps').value || 1, scenes: +$('scenes').value || 6, voice: $('voice').checked,
    engine: $('engine').value, flowQuality: $('flowQuality').value, tts: $('tts').value };
  const ok = await genix.checkMeta();
  if (!ok && !confirm('ยังไม่เห็นช่องแชท Meta AI (อาจยังไม่ล็อกอิน) จะเริ่มเลยไหม?')) return genix.showMeta();
  if (opts.engine === 'flow' && !dir) {
    const per = opts.flowQuality === '360p' ? 8 : 24, n = opts.eps * opts.scenes;
    if (!confirm(`จะใช้เครดิต Google Flow ประมาณ ${n * per} เครดิต (${opts.eps} EP × ${opts.scenes} ฉาก × ${per})\nเริ่มเลยไหม?`)) return;
  }
  if (opts.engine === 'comfy' && opts.voice === false) log('ℹ️ ปิดพากย์อยู่ ฉากจะไม่มีปากขยับ');
  if (opts.engine === 'flow' && !(await genix.checkFlow())) {
    await genix.showFlow();
    return alert('เปิด Chrome ของ Flow ให้แล้ว — ล็อกอิน Google ในหน้าต่างนั้นให้เสร็จ แล้วกดเริ่มอีกครั้ง');
  }
  const r = await genix.start(opts, dir);
  if (r.error) return alert(r.error);
  if (r.queued) { log(`⏳ เข้าคิวแล้ว (คิวที่ ${r.queued}) — เรื่องที่รันอยู่เสร็จแล้วจะเริ่มเอง`); $('idea').value = ''; }
}

// งานเริ่มจริง (กดเริ่มเอง หรือคิวถัดไปเริ่มเอง)
genix.on('jobstart', ({ dir, opts: o, resumed }) => {
  if (o.mode === 'shopee') return;
  opts = o;
  if (!resumed) $('gallery').innerHTML = '';
  t0 = Date.now(); cur = { ep: 1, stage: 0 };
  setRunning(true); renderBars(0); renderStepper(0);
  log(`▶ เริ่ม ${resumed ? 'ทำต่อ' : 'โปรเจกต์ใหม่'}: ${dir}`);
});
function renderQueue(list) {
  $('queue').innerHTML = list.length ? `<b>⏳ คิวรอ ${list.length} เรื่อง</b>` : '';
  $('queue').style.display = list.length ? 'grid' : 'none';
  list.forEach((t, i) => {
    const d = document.createElement('div');
    d.className = 'p';
    d.innerHTML = `<span>${i + 1}. ${t}</span><button>✕ เอาออก</button>`;
    d.querySelector('button').onclick = () => genix.unqueue(i);
    $('queue').append(d);
  });
}
genix.on('queue', renderQueue);
genix.queue().then(renderQueue);

genix.on('progress', onProgress);
// เปิดหน้านี้ทีหลัง (สลับหน้า/รีแอป) → ถามแอปว่ากำลังทำอะไรอยู่ แล้ววาดแถบให้ตรง
genix.jobState().then(({ job }) => {
  if (!job || job.opts?.mode === 'shopee') return;
  opts = job.opts; t0 = job.at; cur = { ep: 1, stage: 0 };
  setRunning(true); renderBars(0); renderStepper(0);
  $('autoTitle').textContent = `🤖 โหมดอัตโนมัติ · ${job.title || job.opts.idea || job.opts.genre}`;
  if (job.progress) onProgress(job.progress, true);
});
function onProgress(p, quiet) {
  cur = p;
  const e = est(opts?.scenes || 6);
  const left = e.slice(p.stage).reduce((a, b) => a + b, 0) + (p.eps - p.ep) * e.slice(3).reduce((a, b) => a + b, 0);
  const done = new Date(Date.now() + left * 60000).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
  $('autoTitle').textContent = `🤖 โหมดอัตโนมัติ · ขั้น ${p.stage + 1}/7: EP.${p.ep}/${p.eps} · ${p.label}${p.title ? ' — ' + p.title : ''}`;
  $('autoSub').innerHTML = `⏱ เหลืออีกประมาณ <b>${Math.ceil(left)} นาที</b> · น่าจะเสร็จราว <b>${done}</b> · ทำมาแล้ว ${Math.round((Date.now() - t0) / 1000)} วิ · ${p.detail || ''}`;
  renderBars(p.stage); renderStepper(STAGE_TO_STEP[p.stage]);
  if (!quiet) log(`EP.${p.ep} ${p.label}: ${p.detail || ''}`);
}
genix.on('log', log);
genix.on('asset', addAsset);
genix.on('done', ({ dir, left }) => {
  setRunning(false); renderStepper(6); renderBars(7); loadProjects();
  log(`🎉 เสร็จครบทุก EP: ${dir}\\output${left ? ` — ไปเรื่องถัดไปในคิว (เหลือ ${left})` : ''}`);
  if (!left) genix.open(dir + '\\output');
});
genix.on('stopped', () => { setRunning(false); log('■ หยุดแล้ว ล้างคิวด้วย (กด "ทำต่อ" ในรายการโปรเจกต์เพื่อทำต่อจากเดิม)'); loadProjects(); });
genix.on('error', (m) => { setRunning(false); log('❌ ' + m); loadProjects(); });

async function loadProjects() {
  const list = (await genix.projects()).filter((p) => p.mode !== 'shopee' && p.mode !== 'news');
  $('projects').innerHTML = list.length ? '' : '<small>ยังไม่มี</small>';
  for (const p of list) {
    const done = (p.episodes || []).slice(0, p.eps).filter((e) => e.final).length;
    const d = document.createElement('div');
    d.className = 'p';
    d.innerHTML = `<span>${p.title || '(ยังไม่มีชื่อ)'} <small>· ${p.genre} · ${done}/${p.eps} EP · ${new Date(p.created).toLocaleString('th-TH')}</small></span>
      <button data-a="open">📂 เปิด</button>${done < p.eps ? '<button data-a="resume">▶ ทำต่อ</button>'
        : p.plot ? '<input data-a="n" type="number" min="1" max="10" value="3" title="จำนวนตอนที่จะเพิ่ม" style="width:52px"><button data-a="more">➕ ทำตอนต่อ</button>' : ''}
      ${(p.episodes || []).some((e) => e.scenes) ? '<input data-a="fix" placeholder="แก้ฉาก เช่น 2-5 หรือ 2-5=มิน" title="EP-ฉาก คั่นด้วยจุลภาค · =ชื่อ เปลี่ยนคนพูด" style="width:190px"><button data-a="redo">🔁 ทำฉากใหม่</button>' : ''}`;
    d.querySelector('[data-a=open]').onclick = () => genix.open(p.dir);
    const r = d.querySelector('[data-a=resume]');
    if (r) r.onclick = () => {
      $('genre').value = p.genre; $('idea').value = p.idea || ''; $('eps').value = p.eps; $('scenes').value = p.scenes; $('voice').checked = !!p.voice;
      $('engine').value = p.engine || 'meta'; $('flowQuality').value = p.flowQuality || '720p';
      start(p.dir);
    };
    const fx = d.querySelector('[data-a=redo]');
    if (fx) fx.onclick = async () => {
      const raw = d.querySelector('[data-a=fix]').value.trim();
      const specs = raw.split(/[,\s]+/).filter(Boolean).map((t) => {
        const m = t.match(/^(\d+)-(\d+)(?:=(.+))?$/);
        return m && { ep: +m[1], scene: +m[2], speaker: m[3] };
      });
      if (!specs.length || specs.includes(null)) return alert('พิมพ์แบบ EP-ฉาก เช่น 2-5 หรือหลายฉาก 1-3, 2-5=มิน (=ชื่อ คือเปลี่ยนคนพูด)');
      try {
        const done = await genix.redo(p.dir, specs);
        log(`🔁 จะทำใหม่: ${done.join(', ')}`);
      } catch (e) { return alert(String(e.message).replace(/^Error invoking remote method 'redo': (Error: )?/, '')); }
      $('engine').value = p.engine || 'meta';
      start(p.dir);
    };
    const m = d.querySelector('[data-a=more]');
    if (m) m.onclick = async () => {
      const add = +d.querySelector('[data-a=n]').value || 1, sc = +$('scenes').value || p.scenes;
      if (!confirm(`ทำ "${p.title}" ต่ออีก ${add} ตอน (EP.${p.eps + 1}-${p.eps + add}) ตอนละ ${sc} ฉาก?`)) return;
      const q = await genix.extend(p.dir, add, sc);
      $('genre').value = q.genre; $('eps').value = q.eps; $('voice').checked = !!q.voice;
      $('engine').value = q.engine || 'meta'; $('flowQuality').value = q.flowQuality || '720p';
      start(p.dir);
    };
    $('projects').append(d);
  }
}

async function checkMeta() {
  const ok = await genix.checkMeta();
  $('metaBadge').textContent = ok ? 'พร้อม' : 'ล็อกอิน';
  $('metaBadge').className = ok ? '' : 'warn';
}

// เครดิต Flow โดยประมาณ: Omni 1.2 Flash ฉากละ 8 วิ × 3 เครดิต/วิ (720p) หรือ × 1 (360p) · รูป Nano Banana 0 เครดิต
function credit() {
  const flowOn = $('engine').value === 'flow';
  $('flowQuality').disabled = running || !flowOn;
  const per = $('flowQuality').value === '360p' ? 8 : 24, n = (+$('eps').value || 1) * (+$('scenes').value || 6);
  const sc = +$('scenes').value || 6; // วัดจริง 7 พ.ย.: ฉากละ ~4 วิ, ComfyUI เจน ~1.2 นาที/ฉาก
  const len = `<span>🎞️ ยาวประมาณ <b style="color:var(--txt)">${Math.round(sc * 4.1)} วิ/EP</b>${$('engine').value === 'comfy' ? ` · เจนราว ${Math.round(sc * 1.2 + 2)} นาที/EP` : ''}</span>`;
  $('credit').innerHTML = len + (flowOn ? ` <span>· 💳 ใช้เครดิต Flow ประมาณ <b style="color:var(--txt)">${n * per}</b> (${n} ฉาก × ${per})</span>` : '');
}
['engine', 'flowQuality', 'eps', 'scenes'].forEach((id) => $(id).addEventListener('input', credit));
async function checkFlow() {
  const ok = await genix.checkFlow();
  $('flowBadge').textContent = ok ? 'พร้อม' : 'เปิด/ล็อกอิน';
  $('flowBadge').className = ok ? '' : 'warn';
}
$('navFlow').onclick = async () => { const r = await genix.showFlow(); if (r?.error) alert(r.error); setTimeout(checkFlow, 3000); };
credit(); checkFlow(); setInterval(checkFlow, 15000);

$('btnStart').onclick = () => start();
$('btnStop').onclick = () => genix.stop();
$('sideStart').onclick = () => (running ? genix.stop() : start());
$('btnMeta').onclick = $('navMeta').onclick = () => genix.showMeta();

renderStepper(0); setRunning(false); loadProjects();
checkMeta(); setInterval(checkMeta, 15000);
