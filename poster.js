// โพสต์คลิปขึ้น TikTok / Facebook Reels / Shopee Video + ปักตะกร้า ผ่าน Chrome ตัวเดียวกับ Flow (ล็อกอินไว้ในนั้น)
// shortcut: ยังไม่เคยเทสกับหน้าเว็บจริง (เขียน 7 พ.ย. 2026 ตอนยังไม่ได้ล็อกอิน) — ปุ่มหาจากข้อความไทย/อังกฤษ
//           ถ้าเว็บเปลี่ยนหรือหาไม่เจอจะ error บอกชื่อปุ่ม ให้แก้ที่ DRIVERS ทีละเว็บตอนเทสจริง
// โหมดทดลอง (ค่าเริ่มต้น) = ทำทุกอย่างแต่หยุดก่อนกดโพสต์ ให้คนดูแล้วกดเอง
const fs = require('fs');
const path = require('path');

const PLATFORMS = { tiktok: 'TikTok', facebook: 'Facebook Reels', youtube: 'YouTube Shorts', shopee: 'Shopee Video' };
const LOGIN = {
  youtube: 'https://www.youtube.com/upload',
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
      const txt = file.replace(/\.mp4$/i, '_post.txt'), lnk = file.replace(/\.mp4$/i, '_link.txt'); // ลิงก์ที่แปะในหน้าโพสต์ (จำไว้ต่อคลิป)
      const ep = (f.match(/\d+/) || [''])[0];
      out.push({
        dir, file, name: f, title: p.title || p.product?.title || d, mode: p.mode || 'film', created: p.created,
        caption: fs.existsSync(txt) ? fs.readFileSync(txt, 'utf8').trim() : `${p.title || ''} EP.${ep} 🎬\n#หนังสั้น #ซีรีส์ #${(p.genre || 'ละคร').replace(/\s/g, '')}`, // kidza 10 พ.ย.: ไม่เอาบรรทัดเครดิตเสียงในแคปชัน
        product: p.product?.title || '', link: fs.existsSync(lnk) ? fs.readFileSync(lnk, 'utf8').trim() : p.product?.url || '', shop: p.shop || (p.mode === 'shopee' ? 'shopee' : ''),
        posted: posted[f] || {},
      });
    }
  }
  return out.sort((a, b) => (b.created || 0) - (a.created || 0));
}

// หน้าโพสต์แก้แคปชัน/ลิงก์แล้วจำไว้ข้างคลิป: โพสต์อัตโนมัติ/เปิดหน้าใหม่ก็ใช้ค่านี้
function saveClipMeta(file, { caption, link }) {
  if (!/\.mp4$/i.test(file) || !fs.existsSync(file)) throw new Error('ไม่มีคลิปนี้');
  if (caption !== undefined) fs.writeFileSync(file.replace(/\.mp4$/i, '_post.txt'), String(caption));
  if (link !== undefined) {
    const f = file.replace(/\.mp4$/i, '_link.txt'), v = String(link).trim();
    if (v && !/^https?:\/\/\S+$/i.test(v)) throw new Error('ลิงก์ต้องขึ้นต้นด้วย http');
    if (v) fs.writeFileSync(f, v); else fs.rmSync(f, { force: true });
  }
  return true;
}

function readJson(f, def) { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return def; } }

const exec = (cmd, args) => new Promise((ok, no) => require('child_process').execFile(cmd, args, { windowsHide: true, maxBuffer: 1e7 }, (e, so, se) => (e ? no(new Error(String(se || e.message).slice(-300))) : ok(so))));
// คลิปเดียวลงหลายเพจร้าน (kidza 14 พ.ย.): ทำไฟล์ต่างกันนิดต่อเพจ ให้เฟสไม่มองเป็นคลิปซ้ำ — ตัดท้าย 0.4–1 วิ, ซูม 2–4% เลื่อนกรอบ, สี/ความสว่าง, เสียงดังค่อย
// สุ่มจากชื่อเพจ (โพสต์ซ้ำเพจเดิมได้ไฟล์เดิม) · ไม่ตัดหัว (เสียงพากย์เริ่มทันที) · ไม่กลับด้าน (ตัวหนังสือบนคลิปกลับ) · ไม่เปลี่ยนเพลง
// แคปชันเฟสต่อเพจ (kidza 14 พ.ย.): ตัดบรรทัดที่มีลิงก์ · อีโมจิหน้าบรรทัดแรก + สลับลำดับแฮชแท็ก + ประโยคชี้ไปคอมเมนต์ สุ่มจากชื่อเพจ (เพจเดิมได้แบบเดิม)
function fbCaption(caption, seed, hasLink) {
  let h = 2166136261;
  for (const c of seed) h = Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0;
  const r = (n) => { h = (Math.imul(h, 1103515245) + 12345) >>> 0; return h % n; };
  const lines = String(caption).split('\n').filter((l) => !/https?:\/\//i.test(l));
  const tagRe = /^\s*(#\S+\s*)+$/;
  const i0 = lines.findIndex((l) => l.trim());
  if (i0 >= 0) lines[i0] = ['', '🔥 ', '✨ ', '👉 ', '💥 ', '⚡ '][r(6)] + lines[i0].trim();
  for (const [i, l] of lines.entries()) {
    if (!tagRe.test(l)) continue;
    const t = l.trim().split(/\s+/);
    for (let j = t.length - 1; j > 0; j--) { const k = r(j + 1); [t[j], t[k]] = [t[k], t[j]]; }
    lines[i] = t.join(' ');
  }
  let out = lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
  if (hasLink) out += '\n\n' + ['📌 พิกัดสินค้าอยู่ในคอมเมนต์แรก 👇', '🛒 ลิงก์สินค้าอยู่ในคอมเมนต์นะ 👇', '👇 จิ้มลิงก์ในคอมเมนต์ได้เลย', '🛍️ ดูสินค้าที่คอมเมนต์แรก', '💬 พิกัดอยู่ใต้คอมเมนต์ 👇'][r(5)];
  return out;
}

async function variant(file, seed) {
  let h = 2166136261;
  for (const c of seed + path.basename(file)) h = Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0;
  const out = path.join(require('os').tmpdir(), `genix_var_${h.toString(36)}.mp4`);
  const r = (lo, hi) => { h = (Math.imul(h, 1103515245) + 12345) >>> 0; return lo + (h / 2 ** 32) * (hi - lo); };
  const info = JSON.parse(await exec('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height:format=duration', '-of', 'json', file]));
  const { width: W, height: H } = info.streams[0], dur = +info.format.duration;
  const z = r(1.02, 1.04), ox = r(0, 1), oy = r(0, 1);
  const vf = `crop=iw/${z}:ih/${z}:(iw-iw/${z})*${ox}:(ih-ih/${z})*${oy},scale=${W}:${H},eq=brightness=${r(-0.02, 0.02).toFixed(3)}:saturation=${r(1, 1.06).toFixed(3)}`;
  await exec('ffmpeg', ['-v', 'error', '-y', '-i', file, '-t', (dur - r(0.4, 1)).toFixed(2), '-vf', vf, '-af', `volume=${r(0.94, 1.06).toFixed(3)}`,
    '-c:v', 'libx264', '-crf', '20', '-preset', 'veryfast', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '160k', '-map_metadata', '-1', '-movflags', '+faststart', out]);
  return out;
}

class Poster {
  constructor({ flow, settingsFile, log }) {
    Object.assign(this, { flow, settingsFile, log });
    this.chain = Promise.resolve(); // โพสต์ทีละอัน ไม่ให้แย่ง Chrome กัน
  }

  settings() { return { platforms: { tiktok: true, facebook: true, youtube: false, shopee: false }, autopost: false, dryRun: true, gapMin: 60, ...readJson(this.settingsFile, {}) }; }
  // เว้นช่วงโพสต์ต่อเว็บ (kidza 9 พ.ย.: ไม่เอาโพสต์ติดกัน) — จำเวลาโพสต์ล่าสุดไว้ในไฟล์ข้าง post.json
  // shortcut: รอในแอป ถ้าปิดแอประหว่างรอ คลิปนั้นจะไม่ถูกโพสต์ (ไปกดโพสต์เองในหน้าโพสต์)
  get lastFile() { return path.join(path.dirname(this.settingsFile), 'lastpost.json'); }
  // เฟสนับแยกต่อเพจ (kidza 13 พ.ย.: ข่าวลงเพจข่าวแล้วคลิปเพจร้านโดนรอตาม)
  async waitGap(pf, gapMin) {
    const last = readJson(this.lastFile, {})[pf];
    const wait = last ? Date.parse(last) + gapMin * 60000 - Date.now() : 0;
    if (wait <= 0) return;
    this.log(`⏳ ${PLATFORMS[pf.split('|')[0]]}: รอ ${Math.ceil(wait / 60000)} นาที (เว้นห่างโพสต์ก่อน ${gapMin} นาที) จะโพสต์ราว ${new Date(Date.now() + wait).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })}`);
    await sleep(wait);
  }
  saveSettings(s) { fs.writeFileSync(this.settingsFile, JSON.stringify({ ...this.settings(), ...s }, null, 2)); return this.settings(); }

  // ใช้แท็บเดิมของแพลตฟอร์มนั้นซ้ำ (เคยเปิดใหม่ทุกโพสต์ แท็บกองเต็ม Chrome) · pf ไม่ระบุ = เปิดแท็บใหม่ (ปุ่มเปิดหน้าล็อกอิน)
  async page(url, pf) {
    await this.flow.connect();
    const ctx = this.flow.browser.contexts()[0];
    const host = { tiktok: /tiktok\.com/, facebook: /facebook\.com/, youtube: /youtube\.com/, shopee: /shopee\.co\.th/ }[pf];
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
  post(clip, platforms, { now = false } = {}) { // now = ไม่รอเว้นช่วง (สั่งโพสต์ข่าวที่ตกรอบให้ขึ้นทันที)
    const run = async () => {
      // อ่านสถานะโพสต์จากไฟล์ตอนถึงคิวจริง (13 พ.ย.: กดซ้ำระหว่างรอบก่อนรอเว้นช่วง → คิวหลังถือสถานะเก่า จะโพสต์ซ้ำเพจที่รอบก่อนลงไปแล้ว)
      const fresh = () => readJson(path.join(clip.dir, 'posted.json'), {})[clip.name] || {};
      clip = { ...clip, posted: fresh() };
      // ปลายทางแยกตามชนิดคลิป (kidza 10 พ.ย.: หนังสั้นหลุดไปลงเพจข่าว) — dest.film = ตั้งในหน้า KNF Film · ไม่ตั้ง = ใช้ค่ากลาง (เพจข่าว)
      const g = this.settings(), d = g.dest?.[clip.mode];
      const s = d ? { ...g, fbPage: d.fbPage || '', ytChannel: d.ytChannel || '' } : { ...g };
      // คลิปขายของลงเพจร้าน ข่าวลงเพจข่าว (kidza 12 พ.ย.: ช่องเพจเดียว สลับไปมาแล้วข่าวหลุดไปเพจร้าน)
      // หลายเพจร้าน (kidza 13 พ.ย.) = ช่องเพจร้านใส่ได้หลายบรรทัด คลิปขายของลงทุกเพจ · แต่ละเพจจำผลแยกใน posted["facebook|<เพจ>"] + เว้นช่วงของตัวเอง
      const shopPages = clip.mode === 'shopee' ? String(g.fbPageShop || '').split(/\s+/).filter(Boolean) : [];
      const res = {};
      for (const pf of platforms || (d ? d.platforms || [] : Object.keys(s.platforms).filter((k) => s.platforms[k]))) {
        // เพจที่ว่างนานสุดโพสต์ก่อน (เพจที่ต้องรอเว้นช่วงไปไว้ท้าย ไม่ให้ขวางเพจอื่น)
        const lastAt = readJson(this.lastFile, {}), ago = (pg) => Date.parse(lastAt['facebook|' + pg] || 0);
        const pages = pf === 'facebook' && shopPages.length ? [...shopPages].sort((a, b) => ago(a) - ago(b)) : [s.fbPage];
        const multi = pages.length > 1;
        const done = (v) => v && !String(v).startsWith('error') && v !== 'dry';
        const results = [], raw = []; // results = ค่าที่จำ (เวลา/error) · raw = ที่คืนให้คนเรียก ('ok'|'dry'|'error: …')
        for (const [i, fbPage] of pages.entries()) {
          const key = multi ? 'facebook|' + fbPage : pf;
          // เพจแรกเคยโพสต์ตอนยังมีเพจเดียว (จำไว้ใต้ "facebook") = นับว่าโพสต์แล้ว
          const prev = clip.posted?.[key] ?? (multi && i === 0 ? clip.posted?.[pf] : undefined);
          if (done(prev)) { results.push(prev); raw.push(prev); continue; }
          this.log(`📤 ${PLATFORMS[pf]}: ${clip.name}${multi ? ' → ' + fbPage : ''}`);
          const gapKey = pf === 'facebook' && fbPage ? 'facebook|' + fbPage : pf;
          // รอเว้นช่วงนอกคิว (13 พ.ย.: คลิปร้านรอ cobbashop 20 นาที ข่าวที่ไปคนละเพจต้องรอตาม) · ใช้ Chrome ทีละโพสต์ผ่าน excl()
          // ถึงคิวแล้วเช็คซ้ำ: เพจนี้ลงไปแล้ว = ข้าม · มีโพสต์อื่นลงเพจเดียวกันระหว่างรอ = กลับไปรอใหม่
          let out;
          for (;;) {
            if (!s.dryRun && !now) await this.waitGap(gapKey, +s.gapMin || 0);
            out = await this.excl(async () => {
              const after = fresh()[key];
              if (done(after)) return { skip: after };
              if (!s.dryRun && !now && this.gapLeft(gapKey, +s.gapMin || 0) > 0) return { again: true };
              let page, r, c = clip;
              try {
                if (multi && pf === 'facebook' && !s.dryRun) {
                  c = { ...clip, file: await variant(clip.file, fbPage).catch((e) => (this.log('⚠️ ทำไฟล์แยกเพจไม่ได้ ใช้ไฟล์เดิม: ' + e.message), clip.file)) };
                }
                page = await this.page(LOGIN[pf], pf);
                r = await DRIVERS[pf](page, c, { dryRun: s.dryRun, log: this.log, fbPage, ytChannel: s.ytChannel });
                this.log(r === 'dry' ? `🧪 ${PLATFORMS[pf]}: ทำครบแล้ว หยุดรอให้กดโพสต์เองในแท็บนั้น (โหมดทดลอง)` : `✅ ${PLATFORMS[pf]}: โพสต์แล้ว${multi ? ' ' + fbPage : ''}`);
              } catch (e) {
                r = 'error: ' + e.message;
                this.log(`❌ ${PLATFORMS[pf]}${multi ? ' ' + fbPage : ''}: ${e.message}`);
                page?.bringToFront().catch(() => {});
              }
              if (c.file !== clip.file) fs.rmSync(c.file, { force: true });
              const v = r === 'ok' ? new Date().toISOString() : r;
              this.mark(clip, key, v);
              if (r === 'ok') fs.writeFileSync(this.lastFile, JSON.stringify({ ...readJson(this.lastFile, {}), [gapKey]: v }));
              return { r, v };
            });
            if (!out.again) break;
          }
          if (out.skip) { this.log(`⏭️ ${PLATFORMS[pf]}: ${fbPage || ''} ลงไปแล้ว ข้าม`); results.push(out.skip); raw.push(out.skip); continue; }
          results.push(out.v); raw.push(out.r);
        }
        // สถานะรวมที่หน้าโพสต์โชว์: พังสักเพจ = โชว์พัง (กดโพสต์ซ้ำจะข้ามเพจที่ขึ้นแล้ว)
        res[pf] = raw.find((v) => String(v).startsWith('error')) ?? (raw.includes('ok') ? 'ok' : raw[raw.length - 1]);
        if (results.length) this.mark(clip, pf, results.find((v) => !done(v)) ?? results[results.length - 1]);
      }
      return res;
    };
    // busy = คิวโพสต์ที่ยังไม่จบ (รวมที่รอเว้นช่วง) · main.js ไม่รีแอปตอนโค้ดเปลี่ยนถ้ายังโพสต์อยู่ (13 พ.ย. รีกลางโพสต์ คลิปขึ้นแต่ไม่ได้คอมเมนต์)
    this.busy = (this.busy || 0) + 1;
    return run().finally(() => { this.busy--; });
  }

  // ใช้ Chrome ทีละงาน (แท็บเดียวกันแย่งกันไม่ได้)
  excl(fn) {
    const p = this.chain.then(fn);
    this.chain = p.catch(() => {});
    return p;
  }
  gapLeft(pf, gapMin) { const last = readJson(this.lastFile, {})[pf]; return last ? Date.parse(last) + gapMin * 60000 - Date.now() : 0; }

  mark(clip, pf, v) {
    const f = path.join(clip.dir, 'posted.json');
    const all = readJson(f, {});
    (all[clip.name] ||= {})[pf] = v;
    fs.writeFileSync(f, JSON.stringify(all, null, 2));
  }

  // โพสต์อัตโนมัติหลังทำเรื่องเสร็จ: ทุกคลิปของโปรเจกต์ที่ยังไม่เคยโพสต์
  async postProject(root, dir, force) {
    if (!force && !this.settings().autopost) return;
    // คลิปขายของ TikTok → ขึ้น TikTok อย่างเดียวพร้อมปักตะกร้า · Facebook → ขึ้น Reels อย่างเดียว + เพิ่มสินค้า (ไม่สนช่องติ๊กแพลตฟอร์มในหน้าโพสต์)
    for (const c of listClips(root).filter((x) => x.dir === dir)) await this.post(c, c.shop === 'tiktok' ? ['tiktok'] : c.shop === 'facebook' ? ['facebook'] : undefined);
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

// ดูแค่โดเมน+path ไม่ดู ?query (10 พ.ย. เฟสแปะคำ login ใน query ของลิงก์ปกติ บอทเลยคิดว่ายังไม่ล็อกอิน ทั้งที่ล็อกอินอยู่)
function needLogin(page, re) {
  const u = new URL(page.url());
  if (re.test(u.hostname + u.pathname)) throw new Error(`ยังไม่ได้ล็อกอิน (${u.hostname + u.pathname}) — กด "เปิดหน้าล็อกอิน" แล้วล็อกอินใน Chrome ก่อน`);
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

// เฟสพาร์ทเนอร์แอฟฟิลิเอต: หน้า "การตั้งค่า" มีแถว "เพิ่มสินค้า" → หน้าต่าง "เพิ่มสินค้าแอฟฟิลิเอต" (วางลิงก์ย่อ s.shopee แล้วกดบันทึก)
// โครงหน้าจริง (ดูผ่าน CDP 13 พ.ย.): [role=dialog] ของหน้าต่างนี้มีแค่หัว+ปุ่มปิด ส่วนช่อง URL และปุ่มบันทึกอยู่นอกกรอบ
// → หาช่องจาก <label> ที่ขึ้นต้นด้วย "URL" ทั้งหน้า · ปุ่มต้องชื่อ "บันทึก" ตรงตัว (มีปุ่ม "บันทึกเป็นฉบับร่าง" อยู่ด้วย ห้ามกดผิด)
async function fbAffiliate(page, link, log) {
  const vis = page.locator(':visible');
  const popup = page.context().waitForEvent('page', { timeout: 12000 }).catch(() => null);
  // ไม่มีปุ่มเลย = เพจนี้ใช้แอฟฟิลิเอตไม่ได้ (13 พ.ย. เพจ 100082049217866)
  await page.getByText(/^(เพิ่มสินค้า|Add products?)$/i).and(vis).first().click({ timeout: 15000 })
    .catch(() => { throw Object.assign(new Error('เพจนี้ไม่มีปุ่ม "เพิ่มสินค้า" (ยังใช้แอฟฟิลิเอตไม่ได้)'), { nolink: true }); });
  const head = page.locator('[role=dialog][aria-label="เพิ่มสินค้าแอฟฟิลิเอต"], [role=dialog][aria-label*="affiliate" i]').and(vis).last();
  // เพจที่ยังไม่ผูกบัญชี Shopee Affiliate (13 พ.ย. 4/6 เพจ): เฟสเปิดแท็บล็อกอิน shopee แทนหน้าต่าง
  const got = await Promise.race([head.waitFor({ timeout: 12000 }).then(() => 'dialog', () => null), popup.then((p) => p && 'popup')]);
  if (got !== 'dialog') {
    const p = await popup;
    if (p) await p.waitForURL(/shopee/i, { timeout: 5000 }).catch(() => {});
    // แท็บ shopee เก่ายังเปิดค้าง = เฟสโหลดซ้ำในแท็บเดิม ไม่เปิดใหม่ → ดูทุกแท็บที่เป็น shopee
    const shp = page.context().pages().filter((x) => x !== page && /shopee\./i.test(x.url()));
    if (shp.length) {
      for (const x of shp) await x.close().catch(() => {});
      throw Object.assign(new Error('เพจนี้ยังไม่ได้ผูกบัญชี Shopee Affiliate'), { nolink: true });
    }
    await head.waitFor({ timeout: 1000 }); // ไม่ใช่กรณีข้างบน → ให้พังแบบเดิม
  }
  const input = page.locator('label').filter({ hasText: /^\s*URL/ }).locator('input[type=text], input[type=url], input:not([type])').and(vis).first();
  await input.click({ timeout: 10000 });
  await input.fill(link);
  await sleep(3000); // เฟสเช็คลิงก์ ขึ้นติ๊กเขียว + ชื่อสินค้า
  await page.getByRole('button', { name: /^(บันทึก|Save)$/ }).and(vis).last().click({ timeout: 10000 });
  await head.waitFor({ state: 'hidden', timeout: 10000 }).catch(() => { throw new Error('กดบันทึกแล้วหน้าต่างเพิ่มสินค้ายังไม่ปิด (ลิงก์ผิด/เฟสไม่รับ?)'); });
  log('🛒 Facebook: เพิ่มสินค้าแอฟฟิลิเอตแล้ว ' + link);
}

// คอมเมนต์ลิงก์สินค้าเป็นคอมเมนต์แรกในนามเพจ (kidza 13 พ.ย.) — เทสส่งจริงแล้วกับคลิปมัทฉะ:
// หน้า Reels ของเพจ → ลิงก์ /reel/<id> เรียงใหม่→เก่า · เปิด reel → กดปุ่ม "แสดงความคิดเห็น"/"ความคิดเห็น, …" (แผงคอมเมนต์ขวา)
// → กล่อง [role=textbox][aria-label^="แสดงความคิดเห็นในชื่อ <เพจ>"] · ต้องพิมพ์ด้วย keyboard.type (insertText กล่องไม่รับ ส่งไม่ออก)
// สำเร็จ = กดส่งแล้วกล่องว่าง + ลิงก์โผล่ในแผงคอมเมนต์ · จับคู่ reel ด้วยต้นแคปชัน · มีลิงก์ในแผงแล้ว = ข้าม (ไม่คอมเมนต์ซ้ำ)
async function fbComment(page, fbPage, clip, log) {
  const text = '🛒 พิกัดสินค้า 👉 ' + clip.link;
  const bare = clip.link.replace(/^https?:\/\//, '');
  // ตัดอีโมจินำหน้า (fbCaption ใส่ให้) — เฟสวาดอีโมจิเป็นรูป innerText ไม่มี
  const key = (clip.caption.split('\n').find((l) => l.trim()) || '').replace(/\s+/g, ' ').replace(/^[^\p{L}\p{N}]+/u, '').trim().slice(0, 18);
  const list = !fbPage ? 'https://www.facebook.com/me/reels/' : /profile\.php\?id=/.test(fbPage) ? fbPage + '&sk=reels_tab' : fbPage.replace(/\/?$/, '/reels/');
  const vis = page.locator(':visible');
  const bodyText = async () => (await page.evaluate(() => document.body.innerText)).replace(/\s+/g, ' ');
  for (let tryN = 0; tryN < 6; tryN++) {
    await sleep(tryN ? 20000 : 8000); // reel เพิ่งโพสต์ต้องรอประมวลผลก่อนโผล่ในหน้าเพจ
    await page.goto(list, { waitUntil: 'domcontentloaded' });
    await sleep(5000);
    // ดูแค่ 2 อันบนสุด (กันคลิปปักหมุด) — ยังไม่ขึ้น = รอแล้วโหลดใหม่ ไม่ไล่เปิดคลิปเก่า (kidza 13 พ.ย.)
    const reels = await page.evaluate(() => [...new Set([...document.querySelectorAll('a[href*="/reel/"]')].map((a) => a.href.split('?')[0]).filter((h) => /\/reel\/\d+/.test(h)))].slice(0, 2));
    for (const url of reels) {
      await page.goto(url, { waitUntil: 'domcontentloaded' });
      await sleep(4000);
      if (!key || !(await bodyText()).includes(key)) continue;
      const box = page.locator('[role=textbox][aria-label^="แสดงความคิดเห็น"]').and(vis).first();
      // แผงคอมเมนต์เปิดเองแล้ว (คลิปคนคอมเมนต์เยอะ) กดปุ่มซ้ำ = ปิดแผง → กดเฉพาะตอนยังไม่เห็นกล่อง
      if (!(await box.isVisible().catch(() => false))) {
        await page.locator('[role=button][aria-label="แสดงความคิดเห็น"], [role=button][aria-label^="ความคิดเห็น"]').and(vis).first().click({ timeout: 6000 }).catch(() => {});
        await sleep(3000);
      }
      if ((await bodyText()).includes(bare)) { log('💬 Facebook: มีคอมเมนต์ลิงก์อยู่แล้ว ข้าม'); return true; }
      await box.click({ timeout: 10000 });
      await page.keyboard.type(text, { delay: 15 });
      await sleep(1200);
      await page.keyboard.press('Enter');
      await sleep(6000);
      const left = (await box.innerText().catch(() => '')).trim();
      const ok = !left && (await bodyText()).includes(bare);
      log(ok ? '💬 Facebook: คอมเมนต์ลิงก์สินค้าแล้ว ' + url : '⚠️ Facebook: ส่งคอมเมนต์ลิงก์ไม่ออก ' + url);
      return ok;
    }
  }
  log('⚠️ Facebook: หา reel ที่เพิ่งโพสต์ไม่เจอในหน้าเพจ ยังไม่ได้คอมเมนต์ลิงก์');
  return false;
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
    // kidza 14 พ.ย.: ไม่กด "เพิ่มสินค้า" (fbAffiliate) แล้ว — โพสต์แค่แคปชัน (ตัดบรรทัดลิงก์) ลิงก์ไปคอมเมนต์แรกอย่างเดียว · แคปชันต่างกันต่อเพจ
    const text = fbCaption(clip.caption, fbPage || 'me', !!clip.link);
    await typeInto(page, box, text);
    const post = page.getByRole('button', { name: /^(โพสต์|Post|เผยแพร่|Publish|แชร์|Share)$/i }).and(page.locator(':visible')).first();
    await until(post, 'ปุ่มโพสต์');
    const r = await finish(page, /^(โพสต์|Post|เผยแพร่|Publish|แชร์|Share)$/i, 'โพสต์', dryRun);
    // คอมเมนต์ลิงก์ไม่ได้ ≠ โพสต์พัง (คลิปขึ้นแล้ว) → แค่ log · fbComment หา reel ด้วยต้นแคปชัน → ส่งแคปชันที่โพสต์จริง
    if (r === 'ok' && clip.link) await fbComment(page, fbPage, { ...clip, caption: text }, log).catch((e) => log('⚠️ Facebook: คอมเมนต์ลิงก์ไม่ได้: ' + e.message.slice(0, 150)));
    return r;
  },

  // YouTube Studio (9 พ.ย.): youtube.com/upload → เลือกไฟล์ → ชื่อ (บรรทัดแรกแคปชัน ≤95) + คำอธิบาย → ไม่ได้ทำเพื่อเด็ก
  // → เนื้อหาดัดแปลง/สังเคราะห์ = ใช่ (เสียง AI + ผู้ประกาศปากขยับ YouTube ให้บอก) → ถัดไป ×3 → สาธารณะ → เผยแพร่
  // หาปุ่มจาก name/id ของ Studio (ไม่ขึ้นกับภาษาหน้าเว็บ) · คลิปแนวตั้ง ≤3 นาที ขึ้นเป็น Shorts เอง
  async youtube(page, clip, { dryRun, log, ytChannel }) {
    // ไอดีเดียวมีหลายช่อง: ลิงก์ /channel/UC… → เปิดหน้าอัปของช่องนั้นใน Studio ตรง ๆ
    const ch = (String(ytChannel || '').match(/channel\/(UC[\w-]{20,})/) || [])[1];
    if (ch) { log('📺 YouTube: อัปเข้าช่อง ' + ch); await page.goto(`https://studio.youtube.com/channel/${ch}/videos/upload?d=ud`, { waitUntil: 'domcontentloaded' }); }
    await page.waitForTimeout(3000);
    needLogin(page, /accounts\.google\.com|ServiceLogin/);
    await page.bringToFront();
    const file = page.locator('input[type=file]').first();
    await file.waitFor({ state: 'attached', timeout: 60000 }).catch(() => { throw new Error(`หน้าอัป YouTube ไม่ขึ้น (อยู่ที่ ${page.url()}) — ล็อกอิน YouTube ใน Chrome ของแอป หรือยังไม่ได้สร้างช่อง`); });
    await file.setInputFiles(clip.file);
    const title = page.locator('#title-textarea #textbox');
    await title.waitFor({ timeout: 120000 });
    await sleep(3000); // Studio ใส่ชื่อไฟล์ลงช่องชื่อเองหลังอัป รอให้ใส่เสร็จก่อนค่อยทับ
    const first = clip.caption.split('\n').find((l) => l.trim()) || clip.title;
    await typeInto(page, title, first.replace(/[<>]/g, '').slice(0, 95));
    await typeInto(page, page.locator('#description-textarea #textbox'), clip.caption.replace(/[<>]/g, '').slice(0, 4900));
    await page.locator('tp-yt-paper-radio-button[name="VIDEO_MADE_FOR_KIDS_NOT_MFK"]').click();
    await page.locator('#toggle-button').click().catch(() => {}); // แสดงเพิ่มเติม
    await page.locator('tp-yt-paper-radio-button[name="VIDEO_HAS_ALTERED_CONTENT_YES"]').click({ timeout: 8000 })
      .catch(() => log('ℹ️ YouTube: ไม่เจอช่อง "เนื้อหาดัดแปลง" ข้าม'));
    for (let i = 0; i < 3; i++) { await page.locator('#next-button').click(); await sleep(1500); }
    await page.locator('tp-yt-paper-radio-button[name="PUBLIC"]').click();
    if (dryRun) { await page.bringToFront(); return 'dry'; }
    await page.locator('#done-button').click();
    // ต้องรอกล่อง #dialog ข้างใน: ตัว ytcp-…-dialog เองกว้าง 0 Playwright เลยมองว่าไม่โชว์ (10 พ.ย. ฟ้องพลาด 2 รอบทั้งที่คลิปขึ้นแล้ว)
    const ok = page.locator('ytcp-video-share-dialog tp-yt-paper-dialog, ytcp-uploads-still-processing-dialog tp-yt-paper-dialog').first();
    await ok.waitFor({ timeout: 300000 })
      .catch(() => { throw new Error('กดเผยแพร่แล้วไม่ขึ้นหน้าต่างยืนยัน 5 นาที (อาจยังอัปไม่เสร็จ/ติดเช็คลิขสิทธิ์)'); });
    await ok.locator('#close-button').click({ timeout: 5000 }).catch(() => {}); // ปิดหน้าต่าง "กำลังประมวลผล" ไม่ให้ค้างจอ
    return 'ok';
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

module.exports = { Poster, listClips, PLATFORMS, saveClipMeta, fbComment, variant, fbCaption };
