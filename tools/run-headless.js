// ทำหนังต่อจาก project.json โดยไม่ต้องเปิด/รีแอปหลัก (เช่นหลังใช้ tools/revoice.js)
// ใช้: npx electron tools/run-headless.js <โฟลเดอร์หนัง>
// แยก userData เป็นของตัวเอง (ไม่ชน single-instance lock / โปรไฟล์ Meta ของแอปหลัก) · บทต้องมีครบแล้ว ไม่เรียก AI เขียนบท
const { app, BrowserWindow } = require('electron');
const path = require('path'), fs = require('fs');
app.setPath('userData', path.join(app.getPath('appData'), 'genix-film-headless'));
const dir = path.resolve(process.argv[process.argv.length - 1]);
const log = (m) => { const l = `${new Date().toLocaleTimeString('th-TH')} ${m}`; console.log(l); fs.appendFileSync(path.join(dir, 'headless.log'), l + '\n'); };

app.whenReady().then(async () => {
  const cap = new BrowserWindow({ show: false, webPreferences: { offscreen: true } });
  await cap.loadFile(path.join(__dirname, '..', 'ui', 'caption.html'));
  const renderPng = async (spec) => Buffer.from((await cap.webContents.executeJavaScript(`render(${JSON.stringify(spec)})`)).split(',')[1], 'base64');
  const { Pipeline } = require('../pipeline');
  const Shopee = require('../shopee').ShopeePipeline; // คลิปขายของ (mode shopee) ใช้คนละคลาส
  const emit = (ch, d) => {
    if (ch === 'log') log(d);
    else if (ch === 'progress') log(`EP${d.ep}/${d.eps} ${d.label || ''} ${d.detail || ''}`);
    else if (ch === 'asset' && d.kind === 'final') log(`✅ ${d.name}: ${d.file}`);
  };
  const opts = JSON.parse(fs.readFileSync(path.join(dir, 'project.json'), 'utf8'));
  try {
    await new (opts.mode === 'shopee' ? Shopee : Pipeline)({ metaWin: null, renderPng, emit, flow: null, gate: null }).start(dir, opts);
    log('DONE');
  } catch (e) { log('❌ ' + (e.stack || e.message)); process.exitCode = 1; }
  app.quit();
});
