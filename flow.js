// คุม Google Flow (flow.google.com) ผ่าน Chrome ตัวจริง — Google ไม่ให้ล็อกอินในหน้าต่าง Electron
// เปิด Chrome โปรไฟล์แยก (ล็อกอินครั้งเดียว) + remote debugging แล้วต่อด้วย playwright-core
// shortcut: หาปุ่มจากข้อความ/aria ภาษาไทย+อังกฤษตามหน้าเว็บ 7 พ.ย. 2026 ถ้า Google เปลี่ยนหน้าจนพังให้แก้ตรง SEL
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const http = require('http');
const { chromium } = require('playwright-core');

const PORT = 9334;
const HOME = 'https://flow.google.com/';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const CHROME = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  path.join(process.env.LOCALAPPDATA || '', 'Google\\Chrome\\Application\\chrome.exe'),
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
].find((p) => fs.existsSync(p));

const SEL = {
  prompt: '[role=textbox][contenteditable=true]',
  add: 'button[aria-label="เพิ่มองค์ประกอบลงในช่องพรอมต์"], button[aria-label*="Add" i][aria-label*="prompt" i]',
  settings: 'button[aria-label="ทริกเกอร์การตั้งค่า"], button[aria-label*="settings trigger" i]',
  go: 'button[aria-label="เริ่มสร้าง"], button[aria-label*="Create" i], button[aria-label*="Generate" i]',
  upload: /อัปโหลดสื่อ|Upload media/i,
  newProject: /โปรเจกต์ใหม่|โปรเจ็กต์ใหม่|New project/i,
};

const alive = () => new Promise((res) => http.get(`http://127.0.0.1:${PORT}/json/version`, (r) => { r.resume(); res(r.statusCode === 200); }).on('error', () => res(false)));

class Flow {
  constructor(profileDir) { this.profileDir = profileDir; this.browser = null; this.page = null; }

  // เปิด Chrome โปรไฟล์ของแอป (ถ้ายังไม่เปิด) แล้วต่อเข้าไป
  async connect() {
    if (this.page && !this.page.isClosed()) return this.page;
    if (!(await alive())) {
      if (!CHROME) throw new Error('ไม่เจอ Google Chrome / Edge ในเครื่อง');
      spawn(CHROME, [`--remote-debugging-port=${PORT}`, `--user-data-dir=${this.profileDir}`, '--no-first-run', '--no-default-browser-check', HOME], { detached: true, stdio: 'ignore' }).unref();
      for (let i = 0; i < 30 && !(await alive()); i++) await sleep(500);
    }
    this.browser = await chromium.connectOverCDP(`http://127.0.0.1:${PORT}`);
    const ctx = this.browser.contexts()[0];
    this.page = ctx.pages().find((p) => p.url().includes('flow.google.com')) || ctx.pages()[0] || (await ctx.newPage());
    return this.page;
  }

  async show() {
    const page = await this.connect();
    if (!page.url().includes('flow.google.com')) await page.goto(HOME);
    await page.bringToFront();
  }

  async ready() {
    if (!(await alive())) return false;
    try {
      const page = await this.connect();
      return page.url().includes('flow.google.com') && !/accounts\.google/.test(page.url());
    } catch { return false; }
  }

  // เข้าโปรเจกต์ (เก็บ url ไว้ใช้ซ้ำทั้งเรื่อง) — ไม่มีก็สร้างใหม่
  async openProject(url) {
    const page = await this.connect();
    if (url) {
      if (!page.url().startsWith(url)) await page.goto(url);
    } else {
      await page.goto(HOME);
      if (/accounts\.google/.test(page.url())) throw new Error('ยังไม่ได้ล็อกอิน Google ใน Chrome ของ Flow — กด "เปิด Flow / ล็อกอิน" ก่อน');
      await page.getByRole('button', { name: SEL.newProject }).first().click({ timeout: 20000 });
      await page.waitForURL(/\/project\//, { timeout: 30000 });
    }
    await page.locator(SEL.prompt).first().waitFor({ timeout: 30000 });
    await page.keyboard.press('Escape').catch(() => {}); // ปิดป๊อปอัปแนะนำฟีเจอร์ใหม่ถ้ามี
    return page.url().split('?')[0];
  }

  // ตั้งค่าในป๊อปอัปข้างช่องพิมพ์: รูป/วิดีโอ, เฟรม/องค์ประกอบ, สัดส่วน, ความละเอียด, จำนวน x1 (กันเครดิตหายเป็น 2 เท่า)
  async configure({ kind, aspect, mode, quality }) {
    const page = this.page;
    await page.locator(SEL.settings).first().click();
    await sleep(600);
    // ปุ่มในป๊อปอัปที่มองเห็นอยู่ (ไม่นับปุ่มชิปตั้งค่าเอง ซึ่งมีคำว่า วิดีโอ/720p อยู่ด้วย)
    const pick = async (re) => {
      const b = page.locator('button:visible:not([aria-label="ทริกเกอร์การตั้งค่า"])').filter({ hasText: re }).last();
      if (await b.count()) await b.click();
      await sleep(250);
    };
    await pick(kind === 'video' ? /วิดีโอ|^Video/i : /รูปภาพ|^Image/i);
    if (kind === 'video') {
      await pick(mode === 'ingredients' ? /องค์ประกอบ|Ingredients/i : /เฟรม|Frames/i);
      await pick(quality === '360p' ? /^360p/ : /^720p/);
    }
    await pick(new RegExp(aspect.replace(':', '\\s*:\\s*')));
    await pick(/^x1$/);
    await page.keyboard.press('Escape');
    await sleep(400);
  }

  // อัปโหลดรูปแล้วแนบเข้าช่องพรอมต์
  async attach(files) {
    const page = this.page;
    for (const f of files) {
      await page.locator(SEL.add).first().click();
      const [chooser] = await Promise.all([
        page.waitForEvent('filechooser', { timeout: 15000 }),
        page.getByRole('button', { name: SEL.upload }).first().click(),
      ]);
      await chooser.setFiles(f);
      await sleep(2000);
      // กล่อง "สิทธิ์ในการใช้รูปภาพนี้" = ยอมรับข้อตกลง Google → ให้ผู้ใช้กดเอง บอทรอสูงสุด 3 นาที
      const rights = page.getByText(/สิทธิ์ในการใช้รูปภาพนี้|rights to use this image/i);
      if (await rights.isVisible().catch(() => false)) {
        this.onNotice?.('⚠️ Flow ถามเรื่องสิทธิ์ใช้รูป — ไปกด "ฉันยอมรับ" ในหน้าต่าง Chrome ของ Flow ก่อน บอทรออยู่');
        await page.bringToFront();
        await rights.waitFor({ state: 'hidden', timeout: 180000 }).catch(() => { throw new Error('ยังไม่ได้กดยอมรับสิทธิ์ใช้รูปใน Chrome ของ Flow'); });
      }
      await sleep(5000); // รออัปโหลด/แนบเสร็จ
      await page.keyboard.press('Escape').catch(() => {});
    }
  }

  // ลิสต์สื่อที่เห็นในกริดตอนนี้ (กันเอาของเก่ามาใช้)
  snap() {
    return this.page.evaluate(() => ({
      imgs: [...document.querySelectorAll('main img, img')].filter((i) => i.naturalWidth >= 256).map((i) => i.currentSrc || i.src),
      vids: [...document.querySelectorAll('video')].map((v) => v.currentSrc || v.src || v.querySelector('source')?.src).filter(Boolean),
      text: document.body.innerText.slice(-3000),
      fails: (document.body.innerText.match(/ล้มเหลว|\bFailed\b/g) || []).length, // การ์ดที่เจนไม่ผ่าน
    }));
  }

  /**
   * generate({ kind: 'image'|'video', prompt, files, aspect, mode, out, timeoutMs, isStopped })
   * คืน path ไฟล์ที่เซฟ
   */
  async generate({ kind, prompt, files = [], aspect = '9:16', mode = 'frames', quality = '720p', out, timeoutMs = 600000, isStopped = () => false, project }) {
    await this.connect();
    this.project = await this.openProject(project || this.project);
    await this.configure({ kind, aspect, mode, quality });
    if (files.length) await this.attach(files);
    // รูปที่อัปโผล่ในกริดช้า → รอจนจำนวนสื่อนิ่งก่อนจดว่า "อันไหนของเก่า" ไม่งั้นจะคว้ารูปที่เราอัปเองไปเป็นผลลัพธ์
    let before = await this.snap();
    for (let i = 0, same = 0; i < 15 && same < 3; i++) {
      await sleep(1500);
      const s = await this.snap();
      same = s.imgs.length + s.vids.length === before.imgs.length + before.vids.length ? same + 1 : 0;
      before = s;
    }
    const seen = new Set([...before.imgs, ...before.vids]);

    const box = this.page.locator(SEL.prompt).first();
    await box.click();
    await this.page.keyboard.insertText(prompt);
    await sleep(500);
    await this.page.locator(SEL.go).first().click();

    const t0 = Date.now();
    let last = '', stable = 0;
    while (Date.now() - t0 < timeoutMs) {
      if (isStopped()) throw new Error('STOPPED');
      await sleep(3000);
      const s = await this.snap().catch(() => null);
      if (!s) continue;
      if (/เครดิตไม่พอ|not enough credits|out of credits/i.test(s.text)) throw new Error('เครดิต Flow ไม่พอ');
      // การ์ด "ล้มเหลว" ใบใหม่ = งานนี้พัง (เช่น Google ขึ้นว่าพบกิจกรรมผิดปกติ) — ไม่งั้นจะไปคว้ารูปอื่นมาแทน
      if (s.fails > before.fails) throw new Error('Flow ขึ้น "ล้มเหลว" (Google แจ้งว่าไม่ได้หักเครดิต)');
      // 20 วิแรกหลังกดสร้าง ของที่โผล่ใหม่ = รูปที่เราอัปเอง (เจนจริงใช้ 25 วิขึ้นไป)
      if (Date.now() - t0 < 20000) { [...s.imgs, ...s.vids].forEach((u) => seen.add(u)); continue; }
      if (/ไม่สามารถสร้าง|couldn.t generate|violat|นโยบาย/i.test(s.text.slice(-600)) && Date.now() - t0 > 20000) throw new Error('Flow ไม่ยอมสร้าง (อาจติดนโยบายเนื้อหา)');
      const fresh = (kind === 'video' ? s.vids : s.imgs).filter((u) => !seen.has(u));
      const key = fresh.join('|');
      stable = fresh.length && key === last ? stable + 1 : 0;
      last = key;
      if (stable >= 2) {
        fs.writeFileSync(out, await this.download(fresh[0]));
        return out;
      }
    }
    throw new Error(`Flow ไม่เสร็จภายใน ${Math.round(timeoutMs / 60000)} นาที`);
  }

  async download(url) {
    const b64 = await this.page.evaluate(async (u) => {
      const r = await fetch(u);
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const buf = new Uint8Array(await r.arrayBuffer());
      let s = '';
      for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode(...buf.subarray(i, i + 0x8000));
      return btoa(s);
    }, url).catch(() => null);
    if (b64) return Buffer.from(b64, 'base64');
    const r = await this.page.context().request.get(url); // เผื่อ CORS ไม่ให้ fetch ในหน้า
    if (!r.ok()) throw new Error(`โหลดไฟล์จาก Flow ไม่ได้ ${r.status()}`);
    return r.body();
  }
}

module.exports = { Flow };
