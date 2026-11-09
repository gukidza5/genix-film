const { app, BrowserWindow, ipcMain, shell, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const { Pipeline } = require('./pipeline');
const { ShopeePipeline, fetchProduct } = require('./shopee');
const { Flow } = require('./flow');
const { Poster, listClips } = require('./poster');
const { URL_HOME, engine, setGeminiKey, hasGeminiKey } = require('./meta');
const updater = require('./updater');
const news = require('./news');
const { Live } = require('./live');

let ui, metaWin, capWin, job = null;
const ROOT = path.join(app.getPath('documents'), 'GenixFilm');
const flow = new Flow(path.join(app.getPath('userData'), 'flow-chrome')); // Chrome โปรไฟล์แยกของแอป ล็อกอิน Google ครั้งเดียว
const poster = new Poster({ flow, settingsFile: path.join(app.getPath('userData'), 'post.json'), log: (m) => send('postlog', m) });

function createMetaWin() {
  metaWin = new BrowserWindow({
    width: 1100, height: 850, show: false, title: 'Meta AI — KNF',
    webPreferences: { partition: 'persist:meta', backgroundThrottling: false },
  });
  metaWin.loadURL(URL_HOME);
  metaWin.on('close', (e) => { if (!app.quitting) { e.preventDefault(); metaWin.hide(); } });
}

// หน้าต่างซ่อนไว้วาดซับ/ปกเป็น PNG ด้วย canvas ของ Chromium (สระ/วรรณยุกต์ไทยไม่เพี้ยนแบบ ffmpeg drawtext)
function createCapWin() {
  capWin = new BrowserWindow({ show: false, webPreferences: { offscreen: true } });
  capWin.loadFile(path.join(__dirname, 'ui', 'caption.html'));
}
async function renderPng(spec) {
  const dataUrl = await capWin.webContents.executeJavaScript(`render(${JSON.stringify(spec)})`);
  return Buffer.from(dataUrl.split(',')[1], 'base64');
}

const send = (ch, data) => ui && !ui.isDestroyed() && ui.webContents.send(ch, data);

// กดไอคอนซ้ำตอนเปิดอยู่ = เด้งหน้าต่างเดิมขึ้นมา ไม่เปิดตัวที่ 2 (ไม่งั้นสองตัวแย่งโปรไฟล์ Meta/งานกัน)
if (!app.requestSingleInstanceLock()) app.quit();
app.on('second-instance', () => { if (ui && !ui.isDestroyed()) { if (ui.isMinimized()) ui.restore(); ui.focus(); } });

app.whenReady().then(() => {
  ui = new BrowserWindow({
    width: 1340, height: 920, backgroundColor: '#0b0d17', title: 'KNF', icon: path.join(__dirname, 'icon.png'),
    webPreferences: { preload: path.join(__dirname, 'preload.js') },
  });
  ui.setMenuBarVisibility(false);
  // ปิดหน้าต่างหลัก = ปิดแอป (ไม่งั้นหน้าต่าง Meta ที่ซ่อนอยู่ทำให้แอปค้างอยู่เบื้องหลัง แล้วกดไอคอนก็ไม่ขึ้น)
  ui.on('closed', () => app.quit());
  ui.loadFile(path.join(__dirname, 'ui', 'index.html'));
  ui.webContents.once('did-finish-load', () => setTimeout(resumeSaved, 4000)); // รอ Meta โหลดก่อน
  createMetaWin();
  createCapWin();
  createLive();
});

// ไลฟ์ขายของ TikTok: Meta แยกหน้าต่าง (partition เดิม ล็อกอินชุดเดียวกัน) + หน้าต่างซ่อนเล่นเสียง
let live, liveState = { running: false }, liveMeta;
function createLive() {
  liveMeta = new BrowserWindow({ width: 1100, height: 850, show: false, title: 'Meta AI (ไลฟ์) — KNF', webPreferences: { partition: 'persist:meta', backgroundThrottling: false } });
  liveMeta.loadURL(URL_HOME);
  liveMeta.on('close', (e) => { if (!app.quitting) { e.preventDefault(); liveMeta.hide(); } });
  // จอไลฟ์ 9:16 ให้ LIVE Studio จับหน้าต่าง (ปิด = ซ่อน)
  const player = new BrowserWindow({ width: 540, height: 960, show: false, title: 'KNF LIVE', icon: path.join(__dirname, 'icon.png'), webPreferences: { backgroundThrottling: false, autoplayPolicy: 'no-user-gesture-required' } });
  player.setMenuBarVisibility(false);
  player.loadFile(path.join(__dirname, 'ui', 'live-player.html'));
  player.on('close', (e) => { if (!app.quitting) { e.preventDefault(); player.hide(); } });
  live = new Live({
    metaWin: liveMeta, flow, ui: player, dataDir: app.getPath('userData'),
    log: (m) => send('livelog', `${new Date().toLocaleTimeString('th-TH')} ${m}`),
    state: (s) => send('livestate', (liveState = s)),
  });
}
app.on('before-quit', () => { app.quitting = true; live?.lip?.stop(); });
app.on('window-all-closed', () => app.quit());

ipcMain.handle('meta:show', () => { metaWin.show(); metaWin.focus(); });
ipcMain.handle('meta:check', () => metaWin.webContents.executeJavaScript(`!!document.querySelector('textarea, [contenteditable="true"]')`).catch(() => false));
ipcMain.handle('open', (_e, p) => shell.openPath(p));

ipcMain.handle('projects', () => {
  if (!fs.existsSync(ROOT)) return [];
  return fs.readdirSync(ROOT).map((d) => {
    try { return { dir: path.join(ROOT, d), ...JSON.parse(fs.readFileSync(path.join(ROOT, d, 'project.json'), 'utf8')) }; } catch { return null; }
  }).filter(Boolean).sort((a, b) => b.created - a.created);
});

ipcMain.handle('flow:show', () => flow.show().catch((e) => ({ error: e.message })));
ipcMain.handle('flow:check', () => flow.ready());
ipcMain.handle('product', (_e, url) => fetchProduct(url));
// หน้าผู้ประกาศ/พรีเซนเตอร์เริ่มต้น (เจนจาก Z-Image 9 พ.ย.) ใช้เมื่อยังไม่เคยเลือกรูปเอง
ipcMain.handle('face:default', () => { const f = path.join(ROOT, 'presenter', 'face.png'); return fs.existsSync(f) ? f : ''; });
ipcMain.handle('pickImage', async () => {
  const r = await dialog.showOpenDialog(ui, { properties: ['openFile'], filters: [{ name: 'รูปสินค้า', extensions: ['jpg', 'jpeg', 'png', 'webp'] }] });
  return r.canceled ? null : r.filePaths[0];
});
// Shopee ติดล็อกอิน/แคปช่า → เปิดให้ผู้ใช้จัดการเองในหน้าต่างที่ใช้คุกกี้ชุดเดียวกับตัวดึงข้อมูล
ipcMain.handle('shopee:show', (_e, url) => {
  const w = new BrowserWindow({ width: 1100, height: 850, title: /tiktok/i.test(url || '') ? 'TikTok' : 'Shopee', webPreferences: { partition: 'persist:shopee' } });
  w.loadURL(url || 'https://shopee.co.th/buyer/login');
});

// คิวงาน: มีงานรันอยู่ก็ต่อท้ายไว้ เสร็จ (หรือพัง) แล้วเริ่มอันถัดไปเอง · กดหยุด = หยุดงานนี้และล้างคิว
// คิว + งานที่รันอยู่เซฟลงไฟล์: ปิดแอปกลางคันแล้วเปิดใหม่ = ทำต่อเอง (กดหยุด/เสร็จ/พัง = ไม่ทำต่อ)
const QFILE = path.join(app.getPath('userData'), 'queue.json');
const queue = [];
let current = null;
const saveQueue = () => fs.writeFileSync(QFILE, JSON.stringify({ current, queue }, null, 2));
const sendQueue = () => { saveQueue(); send('queue', queue.map((q) => q.opts.idea || (q.opts.product?.title && `🛒 ${q.opts.product.title}`) || q.opts.genre)); };
let jobState = null, lastError = null;
const readTitle = (dir) => { try { return JSON.parse(fs.readFileSync(path.join(dir, 'project.json'), 'utf8')).title || ''; } catch { return ''; } };
ipcMain.handle('job:state', () => ({ job: jobState, queue: queue.map((q) => q.opts.idea || q.opts.genre), lastError }));
function runJob({ opts, dir }, auto = false) {
  dir ||= path.join(ROOT, (opts.mode === 'shopee' ? 'shopee-' : '') + new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-'));
  fs.mkdirSync(dir, { recursive: true });
  const emit = (ch, d) => {
    if (ch === 'progress') { jobState.progress = d; send('jobstate', jobState); }
    send(ch, ch === 'done' ? { ...d, left: queue.length } : d);
    // โพสต์อัตโนมัติ: งานที่เลือก "ทำเสร็จแล้ว" เอง (คลิปขายของ) ชนะค่าในหน้าโพสต์ · no = เก็บไว้โพสต์เองทีหลัง
    if (ch === 'done' && opts.autopost !== 'no') poster.postProject(ROOT, dir, opts.autopost === 'yes').catch((e) => send('postlog', '❌ ' + e.message));
  };
  job = new (opts.mode === 'shopee' ? ShopeePipeline : Pipeline)({ metaWin, renderPng, emit, flow });
  current = { opts, dir }; saveQueue();
  const resumed = fs.existsSync(path.join(dir, 'project.json'));
  // สถานะงานตอนนี้ ให้ทุกหน้าถามได้ (เปิดหน้าใหม่/รีแอปแล้วยังรู้ว่าทำเรื่องอะไร ถึงไหน ใครสั่ง)
  jobState = { dir, opts, resumed, how: auto === true ? 'resume' : auto || (resumed ? 'continue' : 'new'), title: readTitle(dir), progress: null, error: null, at: Date.now() };
  send('jobstate', jobState);
  send('jobstart', { dir, opts, resumed });
  let stopped = false;
  job.start(dir, opts)
    .catch((err) => {
      stopped = err.message === 'STOPPED';
      if (!stopped) { lastError = { title: readTitle(dir) || opts.idea || opts.genre, msg: err.message, at: Date.now() }; try { fs.appendFileSync(path.join(dir, 'error.log'), `${new Date().toISOString()} ${err.stack || err.message}\n`); } catch {} }
      send(stopped ? 'stopped' : 'error', err.message);
    })
    .finally(() => {
      job = null; current = null; jobState = null; send('jobstate', null);
      if (stopped) queue.length = 0;
      const next = queue.shift();
      sendQueue();
      if (next) setTimeout(() => runJob(next, 'queue'), 3000);
    });
  return dir;
}
ipcMain.handle('start', async (_e, { opts, dir }) => {
  if (job) { queue.push({ opts, dir }); sendQueue(); return { queued: queue.length }; }
  return { dir: runJob({ opts, dir }) };
});
// เปิดแอปมาเจองานค้างจากรอบก่อน → ทำต่อ
function resumeSaved() {
  let st;
  try { st = JSON.parse(fs.readFileSync(QFILE, 'utf8')); } catch { return; }
  const list = [st.current, ...(st.queue || [])].filter(Boolean);
  if (!list.length || job) return;
  queue.push(...list.slice(1));
  send('log', `♻️ ทำงานที่ค้างจากรอบก่อนต่อ (${list.length} เรื่อง)`);
  runJob(list[0], true);
  sendQueue();
}
ipcMain.handle('queue', () => queue.map((q) => q.opts.idea || (q.opts.product?.title && `🛒 ${q.opts.product.title}`) || q.opts.genre));
ipcMain.handle('unqueue', (_e, i) => { queue.splice(i, 1); sendQueue(); });
// ต่อตอนเรื่องที่จบแล้ว: เพิ่มจำนวน EP (ฉากต่อ EP ใช้ค่าจากฟอร์มตอนนี้) แล้ว UI กดทำต่อ
ipcMain.handle('extend', (_e, { dir, add, scenes }) => {
  const pj = path.join(dir, 'project.json');
  const p = JSON.parse(fs.readFileSync(pj, 'utf8'));
  p.eps += add;
  if (scenes) p.scenes = scenes;
  fs.writeFileSync(pj, JSON.stringify(p, null, 2));
  return p;
});
ipcMain.handle('post:clips', () => listClips(ROOT));
ipcMain.handle('post:settings', (_e, s) => (s ? poster.saveSettings(s) : poster.settings()));
ipcMain.handle('post:run', (_e, { clip, platforms }) => poster.post(clip, platforms));
ipcMain.handle('news:voices', () => news.voices());
ipcMain.handle('key:gemini', (_e, k) => (k === undefined || k === null ? hasGeminiKey() : setGeminiKey(k)));
ipcMain.handle('key:line', async (_e, k) => {
  const n = require('./notify');
  if (k === undefined || k === null) return n.hasToken();
  const on = n.setToken(k);
  if (!on) return { on };
  try { await n.line('🔔 Genix Film: เชื่อมแจ้งเตือน LINE แล้ว ข่าวอัตโนมัติจะแจ้งทุกรอบ + สรุปยอดวิวทุกคืน 23:30'); return { on }; }
  catch (e) { return { on, error: e.message }; }
});
ipcMain.handle('key:eleven', (_e, k) => { const el = require('./eleven'); return k === undefined || k === null ? !!el.key() : el.setKey(k); });
ipcMain.handle('update:check', () => updater.check().catch((e) => ({ error: e.message })));
ipcMain.handle('update:apply', async () => {
  if (job) return { error: 'กำลังทำงานอยู่ รอให้เสร็จก่อนค่อยอัพเดท' };
  try { await updater.apply((m) => send('updlog', m)); } catch (e) { return { error: e.message }; }
  app.quitting = true; app.relaunch(); app.exit(0);
});
ipcMain.handle('ai:engine', (_e, set) => engine(set === 'meta' || set === 'gemini' ? set : undefined));
ipcMain.handle('news:script', (_e, text, bad) => news.writeScript(metaWin, text, Array.isArray(bad) ? bad.map(String) : []).catch((e) => ({ error: e.message })));
ipcMain.handle('news:fetch', (_e, url) => (/^https?:\/\/([a-z]+\.)?(facebook\.com|fb\.watch)\//i.test(url) ? news.fetchFacebook(String(url), flow) : news.fetchArticle(String(url))).catch((e) => ({ error: e.message })));
// ทำคลิปข่าววิ่งฝั่งนี้ หน้าข่าวสลับไปหน้าอื่นได้ กลับมาถาม news:state แล้วรู้ผล (newsdone)
let newsBusy = false, newsLast = null;
ipcMain.handle('news:state', () => ({ busy: newsBusy, last: newsLast }));
ipcMain.handle('news:make', async (_e, { spec, voice }) => {
  if (newsBusy) return { error: 'กำลังทำคลิปข่าวอีกอันอยู่' };
  newsBusy = true;
  try { newsLast = { dir: await news.make(ROOT, spec, voice, { log: (m) => send('newslog', m), gpuBusy: () => !!job }) }; }
  catch (e) { send('newslog', '❌ ' + e.message); newsLast = { error: e.message }; }
  finally { newsBusy = false; send('newsdone', newsLast); }
  return newsLast;
});
// ข่าวอัตโนมัติ ทุก 2 ชม. 08–22 (newsauto.js) ใช้ newsBusy ตัวเดียวกับปุ่มทำคลิปในหน้าข่าว
const { NewsAuto } = require('./newsauto');
const newsAuto = new NewsAuto({
  userData: app.getPath('userData'), root: ROOT, news, ask: require('./meta').ask, metaWin: () => metaWin, poster, listClips, flow,
  log: (m) => { send('newslog', m); fs.appendFileSync(path.join(app.getPath('userData'), 'newsauto.log'), `[${new Date().toLocaleString('th-TH')}] ${m}\n`); },
  busy: () => newsBusy || !!job, setBusy: (b) => { newsBusy = b; if (!b) send('newsdone', newsLast); },
  defaultFace: () => { const f = path.join(ROOT, 'presenter', 'face.png'); return fs.existsSync(f) ? f : ''; },
});
newsAuto.start();
ipcMain.handle('newsauto:cfg', (_e, set) => newsAuto.cfg(set || undefined));
ipcMain.handle('newsauto:run', () => newsAuto.round().catch((e) => { newsAuto.log('❌ ข่าวอัตโนมัติ: ' + e.message); return { error: e.message }; }));
ipcMain.handle('post:logins', () => poster.openLogins().catch((e) => ({ error: e.message })));
// แก้ฉาก: ลบไฟล์ของฉากที่สั่ง (เปลี่ยนคนพูดได้) + ไฟล์ตัดต่อของ EP นั้น แล้ว UI กดทำต่อให้เจนเฉพาะฉากนั้นใหม่
// specs = [{ ep, scene, speaker? }]
ipcMain.handle('redo', (_e, { dir, specs }) => {
  const pj = path.join(dir, 'project.json');
  const p = JSON.parse(fs.readFileSync(pj, 'utf8'));
  const rm = (...a) => fs.rmSync(path.join(dir, ...a), { force: true });
  const done = [];
  for (const { ep, scene, speaker } of specs) {
    const E = p.episodes[ep - 1], s = E?.scenes?.[scene - 1];
    if (!s) throw new Error(`ไม่มี EP.${ep} ฉาก ${scene}`);
    if (speaker) {
      if (!p.cast.characters.some((c) => c.name === speaker)) throw new Error(`ไม่มีตัวละครชื่อ "${speaker}" (มี: ${p.cast.characters.map((c) => c.name).join(', ')})`);
      s.speaker = speaker;
    }
    for (const ext of ['jpg', 'mp4']) rm(`ep${ep}`, `s${scene}.${ext}`);
    for (const ext of ['mp3', 'wav', 'f5.wav', 'mp4', 'png']) rm(`ep${ep}`, 'cut', `s${scene}.${ext}`);
    rm('output', `EP${ep}.mp4`); rm('output', `EP${ep}_cover.jpg`);
    delete s.frame; delete s.video; delete s.talk; delete E.final; delete E.cover;
    done.push(`EP.${ep} ฉาก ${scene}${speaker ? ` (ให้ ${speaker} พูด)` : ''}`);
  }
  fs.writeFileSync(pj, JSON.stringify(p, null, 2));
  return done;
});
ipcMain.handle('stop', () => job && job.stop());
ipcMain.handle('live:settings', (_e, s) => (s ? live.saveSettings(s) : live.settings()));
ipcMain.handle('live:player', () => { live.ui.show(); live.ui.focus(); });
ipcMain.handle('live:fromClips', () => require('./live').productsFromClips(ROOT));
ipcMain.handle('live:pickClips', async () => {
  const r = await dialog.showOpenDialog(ui, { defaultPath: ROOT, properties: ['openFile', 'multiSelections'], filters: [{ name: 'คลิป', extensions: ['mp4', 'webm', 'mov'] }] });
  return r.canceled ? null : r.filePaths;
});
ipcMain.handle('live:pickFile', async (_e, kind) => {
  const ext = kind === 'video' ? ['mp4', 'webm', 'mov'] : ['jpg', 'jpeg', 'png', 'webp'];
  const r = await dialog.showOpenDialog(ui, { defaultPath: ROOT, properties: ['openFile'], filters: [{ name: kind === 'video' ? 'วิดีโอ' : 'รูป', extensions: ext }] });
  return r.canceled ? null : r.filePaths[0];
});
ipcMain.handle('live:start', (_e, cfg) => (live.ui.show(), live.start(cfg)).then(() => ({ ok: true }), (e) => ({ error: e.message })));
ipcMain.handle('live:stop', () => live.stop());
ipcMain.handle('live:state', () => liveState);
ipcMain.handle('live:meta', () => { liveMeta.show(); liveMeta.focus(); });
ipcMain.handle('live:openPage', async () => { try { await (await live.livePage(live.settings())).bringToFront(); } catch (e) { return { error: e.message }; } });
