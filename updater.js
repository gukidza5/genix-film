// ปุ่มอัพเดท: เทียบ commit ล่าสุดบน GitHub กับที่ลงไว้ → โหลด zip มาทับโค้ด แล้วเปิดแอปใหม่
// kidza ปล่อยอัพเดท = push ขึ้น repo (ปล่อยอัพเดท.bat) · เครื่องที่มี .git คือเครื่องพัฒนา ไม่ทับ
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFile, spawn } = require('child_process');

const REPO = 'gukidza5/genix-film';
const APP = __dirname;
const VER = path.join(APP, '.version'); // sha ของ commit ที่ลงอยู่
const KEEP = new Set(['node_modules', 'gemini.key', '.git', '.version']); // ไม่ทับ/ไม่ลบ

const current = () => { try { return fs.readFileSync(VER, 'utf8').trim(); } catch { return ''; } };
const isDev = () => fs.existsSync(path.join(APP, '.git'));

async function check() {
  const r = await fetch(`https://api.github.com/repos/${REPO}/commits/main`, { headers: { 'User-Agent': 'genix-film-updater' } });
  if (!r.ok) throw new Error(`GitHub ตอบ ${r.status}`);
  const c = await r.json();
  return { latest: c.sha, current: current(), has: !isDev() && c.sha !== current(), dev: isDev(),
    msg: c.commit.message.split('\n')[0], date: c.commit.committer.date };
}

const run = (cmd, args, o = {}) => new Promise((ok, no) => execFile(cmd, args, { windowsHide: true, ...o }, (e, _o, err) => e ? no(new Error(err || e.message)) : ok()));

async function apply(log = () => {}) {
  if (isDev()) throw new Error('เครื่องนี้เป็นเครื่องแก้โค้ด (มี .git) ไม่อัพเดททับ');
  const info = await check();
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'genix-upd-'));
  try {
    log('⬇️ โหลดเวอร์ชันใหม่');
    const r = await fetch(`https://codeload.github.com/${REPO}/zip/${info.latest}`);
    if (!r.ok) throw new Error(`โหลดไม่ได้ ${r.status}`);
    const zip = path.join(tmp, 'app.zip');
    fs.writeFileSync(zip, Buffer.from(await r.arrayBuffer()));
    await run(path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'tar.exe'), ['-xf', zip, '-C', tmp]);
    const src = fs.readdirSync(tmp).map((d) => path.join(tmp, d)).find((d) => fs.statSync(d).isDirectory());
    if (!src || !fs.existsSync(path.join(src, 'main.js'))) throw new Error('ไฟล์ที่โหลดมาไม่ครบ');
    const oldPkg = fs.readFileSync(path.join(APP, 'package.json'), 'utf8');
    const same = (rel) => { try { return fs.readFileSync(path.join(src, rel)).equals(fs.readFileSync(path.join(APP, rel))); } catch { return false; } };
    const aiFiles = ['setup_ai.ps1', ...fs.readdirSync(path.join(src, 'ai'), { recursive: true }).map((f) => path.join('ai', f)).filter((f) => fs.statSync(path.join(src, f)).isFile())];
    const aiChanged = aiFiles.some((f) => !same(f));
    log('📦 ลงไฟล์ใหม่');
    for (const f of fs.readdirSync(src)) if (!KEEP.has(f)) fs.cpSync(path.join(src, f), path.join(APP, f), { recursive: true, force: true });
    const pkgChanged = JSON.stringify(JSON.parse(oldPkg).dependencies) !== JSON.stringify(JSON.parse(fs.readFileSync(path.join(src, 'package.json'), 'utf8')).dependencies);
    if (pkgChanged) { log('📚 ลงไลบรารีเพิ่ม (npm install)'); await run('npm', ['install', '--prefix', `"${APP}"`], { shell: true, timeout: 600000 }).catch((e) => log('⚠️ npm install ไม่ได้: ' + e.message.slice(0, 120))); }
    fs.writeFileSync(VER, info.latest);
    // ของ AI เปลี่ยน + เครื่องนี้ลง AI ไว้ → เปิดหน้าต่างตัวติดตั้ง AI ให้โหลดเฉพาะที่ขาด (แยกจากแอป แอปเปิดใหม่ได้เลย)
    const cu = 'C:/AI/ComfyUI_windows_portable/ComfyUI/models/diffusion_models';
    if (aiChanged && fs.existsSync(cu)) {
      const pack = fs.existsSync(path.join(cu, 'wan2.2_s2v_14B_fp8_scaled.safetensors')) ? 'full' : 'image';
      log('🧠 มีของ AI ใหม่ เปิดหน้าต่างลงเพิ่ม');
      spawn('cmd.exe', ['/c', 'start', '"Genix AI"', 'powershell', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-NoExit', '-File', `"${path.join(APP, 'setup_ai.ps1')}"`, '-Pack', pack], { detached: true, stdio: 'ignore', windowsVerbatimArguments: true }).unref();
    }
    return info;
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
}

module.exports = { check, apply, current, isDev };
