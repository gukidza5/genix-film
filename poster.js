// โพสต์คลิปขึ้น TikTok / Facebook Reels / Shopee Video + ปักตะกร้า ผ่าน Chrome ตัวเดียวกับ Flow (ล็อกอินไว้ในนั้น)
// shortcut: ยังไม่เคยเทสกับหน้าเว็บจริง (เขียน 7 พ.ย. 2026 ตอนยังไม่ได้ล็อกอิน) — ปุ่มหาจากข้อความไทย/อังกฤษ
//           ถ้าเว็บเปลี่ยนหรือหาไม่เจอจะ error บอกชื่อปุ่ม ให้แก้ที่ DRIVERS ทีละเว็บตอนเทสจริง
// โหมดทดลอง (ค่าเริ่มต้น) = ทำทุกอย่างแต่หยุดก่อนกดโพสต์ ให้คนดูแล้วกดเอง
const fs = require('fs');
const path = require('path');

const PLATFORMS = { tiktok: 'TikTok', facebook: 'Facebook Reels', shopee: 'Shopee Video' };
const LOGIN = {
  tiktok: 'https://www.tiktok.com/tiktokstudio/upload',
  facebook: 'https://www.facebook.com/',
  shopee: 'https://seller.shopee.co.th/', // shortcut: Shopee Video บนเว็บน่าจะมีแค่ Seller Centre, affiliate อย่างเดียวอาจต้องใช้แอปมือถือ
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// รายการคลิปที่ทำเสร็จทุกโปรเจกต์ + แคปชัน/สินค้าเริ่มต้น + ประวัติว่าโพสต์ไปไหนแล้ว
function listClips(root) {
  if (!fs.existsSync(root)) return [];
  const out = [];
  for (const d of fs.readdirSync(root)) {
    const dir = path.join(root, d);
    let p;
    try { p = JSON.parse(fs.readFileSync(path.join(dir, 'project.json'), 'utf8')); } catch { continue; }
    const posted = readJson(path.join(dir, 'posted.json'), {});
    const odir = path.join(dir, 'output');
    if (!fs.existsSync(odir)) continue;
    for (const f of fs.readdirSync(odir).filter((x) => /\.mp4$/i.test(x)).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))) {
      const file = path.join(odir, f);
      const txt = file.replace(/\.mp4$/i, '_post.txt');
      const ep = (f.match(/\d+/) || [''])[0];
      out.push({
        dir, file, name: f, title: p.title || p.product?.title || d, mode: p.mode || 'film', created: p.created,
        caption: fs.existsSync(txt) ? fs.readFileSync(txt, 'utf8').trim() : `${p.title || ''} EP.${ep} 🎬\n#หนังสั้น #ซีรีส์ #${(p.genre || 'ละคร').replace(/\s/g, '')}${p.tts === 'f5' ? '\nเสียงพากย์: F5-TTS-THAI (CC BY 4.0), เสียงต้นแบบ THAI SER โดย VISTEC (CC BY-SA 4.0)' : ''}`,
        product: p.product?.title || '', link: p.product?.url || '', shop: p.shop || (p.mode === 'shopee' ? 'shopee' : ''),
        posted: posted[f] || {},
      });
    }
  }
  return out.sort((a, b) => (b.created || 0) - (a.created || 0));
}

function readJson(f, def) { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return def; } }

class Poster {
  constructor({ flow, settingsFile, log }) {
    Object.assign(this, { flow, settingsFile, log });
    this.chain = Promise.resolve(); // โพสต์ทีละอัน ไม่ให้แย่ง Chrome กัน
  }

  settings() { return { platforms: { tiktok: true, facebook: true, shopee: false }, autopost: false, dryRun: true, gapMin: 60, ...readJson(this.settingsFile, {}) }; }
  // เว้นช่วงโพสต์ต่อเว็บ (kidza 9 พ.ย.: ไม่เอาโพสต์ติดกัน) — จำเวลาโพสต์ล่าสุดไว้ในไฟล์ข้าง post.json
  // shortcut: รอในแอป ถ้าปิดแอประหว่างรอ คลิปนั้นจะไม่ถูกโพสต์ (ไปกดโพสต์เองในหน้าโพสต์)
  get lastFile() { return path.join(path.dirname(this.settingsFile), 'lastpost.json'); }
  async waitGap(pf, gapMin) {
    const last = readJson(this.lastFile, {})[pf];
    const wait = last ? Date.parse(last) + gapMin * 60000 - Date.now() : 0;
    if (wait <= 0) return;
    this.log(`⏳ ${PLATFORMS[pf]}: รอ ${Math.ceil(wait / 60000)} นาที (เว้นห่างโพสต์ก่อน ${gapMin} นาที) จะโพสต์ราว ${new Date(Date.now() + wait).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })}`);
    await sleep(wait);
  }
  saveSettings(s) { fs.writeFileSync(this.settingsFile, JSON.stringify({ ...this.settings(), ...s }, null, 2)); return this.settings(); }

  // ใช้แท็บเดิมของแพลตฟอร์มนั้นซ้ำ (เคยเปิดใหม่ทุกโพสต์ แท็บกองเต็ม Chrome) · pf ไม่ระบุ = เปิดแท็บใหม่ (ปุ่มเปิดหน้าล็อกอิน)
  async page(url, pf) {
    await this.flow.connect();
    const ctx = this.flow.browser.contexts()[0];
    const host = { tiktok: /tiktok\.com/, facebook: /facebook\.com/, shopee: /shopee\.co\.th/ }[pf];
    let page = (this.tabs ||= {})[pf];
    if (!page || page.isClosed()) page = host && ctx.pages().filter((p) => host.test(p.url())).at(-1);
    page ||= await ctx.newPage();
    if (pf && this.tabs[pf] !== page) {
      this.tabs[pf] = page;
      // แท็บเดิมค้างหน้าอัปครึ่งทาง เฟสจะถาม "ออกจากหน้านี้?" → ตอบออก ไม่งั้นเปลี่ยนหน้าไม่ได้
      page.on('dialog', (d) => (d.type() === 'beforeunload' ? d.accept() : d.dismiss()).catch(() => {}));
    }
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    return page;
  }

  async openLogins() {
    for (const u of Object.values(LOGIN)) await this.page(u);
  }

  // โพสต์ 1 คลิปขึ้นแพลตฟอร์มที่เลือก — คืน { platform: 'ok'|'dry'|'error: ...' }
  post(clip, platforms) {
    const run = async () => {
      const s = this.settings();
      const res = {};
      for (const pf of platforms || Object.keys(s.platforms).filter((k) => s.platforms[k])) {
        if (clip.posted?.[pf] && !String(clip.posted[pf]).startsWith('error') && clip.posted[pf] !== 'dry') { res[pf] = clip.posted[pf]; continue; }
        this.log(`📤 ${PLATFORMS[pf]}: ${clip.name}`);
        let page;
        try {
          if (!s.dryRun) await this.waitGap(pf, +s.gapMin || 0);
          page = await this.page(LOGIN[pf], pf);
          res[pf] = await DRIVERS[pf](page, clip, { dryRun: s.dryRun, log: this.log, fbPage: s.fbPage });
          this.log(res[pf] === 'dry' ? `🧪 ${PLATFORMS[pf]}: ทำครบแล้ว หยุดรอให้กดโพสต์เองในแท็บนั้น (โหมดทดลอง)` : `✅ ${PLATFORMS[pf]}: โพสต์แล้ว`);
        } catch (e) {
          res[pf] = 'error: ' + e.message;
          this.log(`❌ ${PLATFORMS[pf]}: ${e.message}`);
          page?.bringToFront().catch(() => {});
        }
        this.mark(clip, pf, res[pf] === 'ok' ? new Date().toISOString() : res[pf]);
        if (res[pf] === 'ok') fs.writeFileSync(this.lastFile, JSON.stringify({ ...readJson(this.lastFile, {}), [pf]: new Date().toISOString() }));
      }
      return res;
    };
    return (this.chain = this.chain.then(run, run));
  }

  mark(clip, pf, v) {
    const f = path.join(clip.dir, 'posted.json');
    const all = readJson(f, {});
    (all[clip.name] ||= {})[pf] = v;
    fs.writeFileSync(f, JSON.stringify(all, null, 2));
  }

  // โพสต์อัตโนมัติหลังทำเรื่องเสร็จ: ทุกคลิปของโปรเจกต์ที่ยังไม่เคยโพสต์
  async postProject(root, dir, force) {
    if (!force && !this.settings().autopost) return;
    // คลิปขายของ TikTok → ขึ้น TikTok อย่างเดียวพร้อมปักตะกร้า (ไม่สนช่องติ๊กแพลตฟอร์มในหน้าโพสต์)
    for (const c of listClips(root).filter((x) => x.dir === dir)) await this.post(c, c.shop === 'tiktok' ? ['tiktok'] : undefined);
  }
}

// ---------- ตัวคุมแต่ละเว็บ ----------
async function click(page, re, what, timeout = 20000) {
  // เอาเฉพาะปุ่มที่มองเห็น (.first() เฉย ๆ ชอบได้ปุ่มซ่อนของหน้าก่อน แล้วรอจนหมดเวลา)
  const b = page.getByRole('button', { name: re }).or(page.getByRole('menuitem', { name: re })).or(page.getByRole('tab', { name: re })).and(page.locator(':visible')).first();
  await b.waitFor({ timeout }).catch(() => { throw new Error(`หาปุ่ม "${what}" ไม่เจอ (ยังไม่ล็อกอิน หรือหน้าเว็บเปลี่ยน)`); });
  await b.click();
  await sleep(800);
}

// แท็บอยู่ข้างหลัง = เฟส/TikTok ไม่รับตัวหนังสือ (8 พ.ย. แคปชันว่างทั้งที่บอทพิมพ์) → ดึงแท็บขึ้นหน้า เลือกทั้งช่องแล้วพิมพ์ อ่านกลับเช็คว่าเข้าจริง
async function typeInto(page, loc, text) {
  await loc.waitFor({ timeout: 120000 });
  const want = text.replace(/\s+/g, '').slice(0, 20);
  for (let i = 0; i < 3; i++) {
    await page.bringToFront();
    await loc.click().catch(() => {});
    await loc.focus();
    await loc.evaluate((e) => { const r = document.createRange(); r.selectNodeContents(e); const s = getSelection(); s.removeAllRanges(); s.addRange(r); });
    await page.keyboard.press('Delete');
    await page.keyboard.insertText(text);
    await sleep(800);
    const got = (await loc.evaluate((e) => e.innerText || e.value || '').catch(() => '')).replace(/\s+/g, '');
    if (got.includes(want)) return;
  }
  throw new Error('พิมพ์แคปชันไม่เข้า (ช่องไม่รับตัวหนังสือ)');
}

function needLogin(page, re) {
  if (re.test(page.url())) throw new Error('ยังไม่ได้ล็อกอิน — กด "เปิดหน้าล็อกอิน" แล้วล็อกอินใน Chrome ก่อน');
}

// เลือกสินค้าตัวแรกจากผลค้นหาในป๊อปอัป (ใช้ทั้ง TikTok และ Shopee)
async function pickProduct(page, query) {
  const search = page.locator('input[type=search], input[placeholder*="ค้นหา"], input[placeholder*="Search" i]').last();
  await search.waitFor({ timeout: 20000 }).catch(() => { throw new Error('หาช่องค้นหาสินค้าไม่เจอ (ไอดีอาจยังไม่มีสิทธิ์ตะกร้า)'); });
  // ชื่อสินค้าเต็มยาวเกิน ช่องค้นหาตะกร้า/โชว์เคสหาไม่เจอ → ใช้แค่ต้นชื่อ
  await search.fill(query.split(/\s+/).slice(0, 3).join(' ').slice(0, 30));
  await page.keyboard.press('Enter');
  await sleep(2500);
  const pick = page.locator('[role=dialog] input[type=radio], [role=dialog] input[type=checkbox], [role=dialog] [role=radio], [role=dialog] [role=checkbox]').first();
  await pick.waitFor({ timeout: 15000 }).catch(() => { throw new Error(`ไม่เจอสินค้า "${query}" ในตะกร้า/โชว์เคส`); });
  await pick.click({ force: true });
}

// ป๊อปอัปที่ TikTok Studio เด้งทับหน้าอัป: ถามเปิดเช็คลิขสิทธิ์อัตโนมัติ (ตอบ Cancel = ไม่เปลี่ยนการตั้งค่า) + ทิปฟีเจอร์ใหม่ (Got it)
async function ttPopups(page) {
  await page.locator('[role=dialog]').filter({ hasText: 'automatic content checks' }).getByRole('button', { name: 'Cancel', exact: true }).click({ timeout: 1500 }).catch(() => {});
  await page.getByRole('button', { name: 'Got it', exact: true }).and(page.locator(':visible')).first().click({ timeout: 1500 }).catch(() => {});
}

async function finish(page, re, what, dryRun) {
  if (dryRun) { await page.bringToFront(); return 'dry'; }
  await click(page, re, what, 60000);
  await sleep(8000);
  return 'ok';
}

const DRIVERS = {
  // TikTok Studio (เทสจริง 9 พ.ย. หน้าอังกฤษ): อัป → ช่อง Description (DraftJS) → Add link: Select › Products › Next
  // → แท็บ Showcase products ค้นด้วยรหัสสินค้าจากลิงก์ → เลือก → Next → ชื่อบนคลิป (ตัด 30 ตัวให้เอง) → Add → Post
  async tiktok(page, clip, { dryRun, log }) {
    needLogin(page, /\/login/);
    await page.locator('input[type=file]').first().setInputFiles(clip.file);
    const box = page.locator('.public-DraftEditor-content[contenteditable=true], [contenteditable=true]').first();
    await box.waitFor({ timeout: 120000 });
    await ttPopups(page);
    await typeInto(page, box, clip.caption);
    if (clip.product) {
      log('🛒 TikTok: ปักตะกร้า ' + clip.product);
      await ttPopups(page);
      const dlg = (t) => page.locator('[role=dialog]').filter({ hasText: t }).and(page.locator(':visible')).last();
      await page.getByRole('button', { name: 'Add', exact: true }).click();
      await dlg('Link type').getByText('Select', { exact: true }).click();
      await page.locator('li[role=option]').filter({ hasText: /^(Products|สินค้า)$/ }).and(page.locator(':visible')).first().click();
      await dlg('Link type').getByRole('button', { name: 'Next', exact: true }).click();
      const pick = dlg('Add product links');
      const id = (clip.link.match(/product\/(\d{10,})/) || [])[1];
      const radio = pick.locator('input[type=radio]').first();
      // กดแท็บโชว์เคสตอนหน้าต่างยังโหลด แท็บเด้งกลับ My shop (9 พ.ย. ฮับ USB ค้นไม่เจอทั้งที่อยู่ในโชว์เคส) → กดแท็บ+ค้นซ้ำ
      let found = false;
      for (let i = 0; i < 3 && !found; i++) {
        await sleep(2000);
        await pick.getByText('Showcase products', { exact: true }).click();
        await sleep(1500);
        await pick.getByPlaceholder('Search products').fill(id || clip.product.split(/\s+/).slice(0, 3).join(' ').slice(0, 30));
        await page.keyboard.press('Enter');
        found = await radio.waitFor({ state: 'attached', timeout: 6000 }).then(() => true, () => false);
      }
      if (!found) throw new Error(`ไม่เจอ "${clip.product}" ในโชว์เคส — เพิ่มสินค้าเข้าโชว์เคสก่อน`);
      await sleep(1500); // รอผลค้นหาแทนรายการเดิม
      await radio.click({ force: true });
      await pick.getByRole('button', { name: 'Next', exact: true }).click();
      await dlg('Product name').getByRole('button', { name: 'Add', exact: true }).click();
      await sleep(1500);
    }
    // รออัปโหลดเสร็จก่อนกดโพสต์
    await page.getByText(/อัปโหลดแล้ว|Uploaded/i).first().waitFor({ timeout: 600000 }).catch(() => {});
    await ttPopups(page);
    return finish(page, /^(โพสต์|Post)$/i, 'โพสต์', dryRun);
  },

  // เฟสไม่มีตะกร้า: แปะลิงก์สินค้าท้ายแคปชันแทน
  async facebook(page, clip, { dryRun, log, fbPage }) {
    // โพสต์ในนามเพจ: เปิดหน้าเพจแล้วกด "สลับ" เป็นเพจก่อน (เพจแบบใหม่) — shortcut: ยังไม่เคยเทสกับเฟสจริง ถ้าไม่มีปุ่มสลับจะโพสต์ในนามที่ใช้อยู่
    if (fbPage) {
      log('👤 Facebook: สลับไปโพสต์ในนามเพจ ' + fbPage);
      await page.goto(fbPage, { waitUntil: 'domcontentloaded' });
      needLogin(page, /login|checkpoint/);
      await click(page, /^(สลับ|สลับเลย|สลับตอนนี้|Switch|Switch now)$/i, 'สลับเป็นเพจ', 10000)
        .then(() => click(page, /^(สลับ|Switch)$/i, 'ยืนยันสลับ', 5000).catch(() => {}))
        .then(() => sleep(5000))
        .catch(() => log('ℹ️ ไม่เจอปุ่มสลับ (อาจอยู่ในนามเพจแล้ว) — ไปต่อ'));
    }
    await page.goto('https://www.facebook.com/reels/create', { waitUntil: 'domcontentloaded' });
    await page.bringToFront();
    needLogin(page, /login|checkpoint/);
    await page.locator('input[type=file]').first().setInputFiles(clip.file);
    // ขั้นตอนเฟส (เทสจริง 8 พ.ย.): อัป → ถัดไป → หน้าแก้ไข (ช่องอธิบายคลิป) → ถัดไป → หน้าตั้งค่า (ปุ่ม "โพสต์")
    // 8 พ.ย. ดึก: เฟสพาเข้าหน้าแก้ไขเองหลังอัป ไม่ต้องกดถัดไปก่อนแล้ว — ห้ามกดถัดไปแบบไม่ดู ไม่งั้นข้ามหน้าแคปชัน
    const box = page.locator('[contenteditable=true][role=textbox]:visible').first();
    // หน้าถัดไปของเฟสโหลดช้าไม่แน่นอน (8 พ.ย. ช้าเกิน 8 วิ บอทกดถัดไปซ้ำในหน้าที่ไม่มีปุ่มแล้วพัง)
    // → วนดูทุก 2 วิจนกว่าของที่รอจะขึ้น ระหว่างนั้นถ้ามีปุ่มถัดไปโผล่ค่อยกด ไม่เจอก็รอต่อ
    const next = page.getByRole('button', { name: /^(ถัดไป|Next)$/i }).and(page.locator(':visible')).first();
    // ปุ่มถัดไปโผล่ก่อนช่องแคปชันเสมอ → กดเฉพาะตอนปุ่มค้างเกิน 10 วิแล้วของที่รอยังไม่มา (กันกดข้ามหน้าแคปชัน)
    const until = async (loc, what) => {
      let seen = 0;
      for (const t = Date.now(); Date.now() - t < 120000; await sleep(2000)) {
        if (await loc.isVisible().catch(() => false)) return;
        seen = (await next.isVisible().catch(() => false)) ? seen || Date.now() : 0;
        if (seen && Date.now() - seen > 10000) { await next.click().catch(() => {}); seen = 0; }
      }
      throw new Error(`รอ${what}นานเกิน 2 นาที (หน้าเฟสเปลี่ยน?)`);
    };
    await until(box, 'ช่องแคปชัน');
    const text = clip.link ? `${clip.caption}

🛒 สั่งซื้อ: ${clip.link}` : clip.caption;
    await typeInto(page, box, text);
    const post = page.getByRole('button', { name: /^(โพสต์|Post|เผยแพร่|Publish|แชร์|Share)$/i }).and(page.locator(':visible')).first();
    await until(post, 'ปุ่มโพสต์');
    return finish(page, /^(โพสต์|Post|เผยแพร่|Publish|แชร์|Share)$/i, 'โพสต์', dryRun);
  },

  async shopee(page, clip, { dryRun, log }) {
    needLogin(page, /login|signin|account\/signin/);
    // shortcut: ทางเข้า Shopee Video ใน Seller Centre ยังไม่รู้ URL ตรง ๆ → กดตามเมนู
    await click(page, /Shopee Video|ช้อปปี้วิดีโอ/i, 'Shopee Video', 30000).catch(async () => {
      await page.getByText(/Shopee Video/i).first().click({ timeout: 10000 });
    });
    await click(page, /อัปโหลด|Upload|สร้างวิดีโอ|Create/i, 'อัปโหลดวิดีโอ');
    await page.locator('input[type=file]').first().setInputFiles(clip.file);
    await typeInto(page, page.locator('textarea, [contenteditable=true]').first(), clip.caption.slice(0, 150));
    if (clip.product) {
      log('🛒 Shopee: ผูกสินค้า ' + clip.product);
      await click(page, /เพิ่มสินค้า|Add products?/i, 'เพิ่มสินค้า');
      await pickProduct(page, clip.product);
      await click(page, /^(ยืนยัน|Confirm|เพิ่ม|Add)$/i, 'ยืนยันสินค้า');
    }
    await page.getByText(/อัปโหลดสำเร็จ|Upload(ed)? success|100%/i).first().waitFor({ timeout: 600000 }).catch(() => {});
    return finish(page, /^(โพสต์|Post|เผยแพร่|Publish)$/i, 'โพสต์', dryRun);
  },
};

module.exports = { Poster, listClips, PLATFORMS };
