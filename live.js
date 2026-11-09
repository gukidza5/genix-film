// ไลฟ์ขายของ TikTok: วนปักตะกร้าทีละสินค้าตามเวลา + เสียง AI พูดเรื่องสินค้าที่ปักอยู่
// บท: Meta AI เขียนทีละรอบ (ทุกสินค้า) · จำทุกประโยคที่เคยพูดใน live-history.json แล้วส่งให้ AI ห้ามซ้ำ + กรองซ้ำเองอีกชั้น
// รอบถัดไปเขียนล่วงหน้าตั้งแต่ต้นรอบ จบรอบแล้วต่อได้ทันทีไม่เงียบ
// เสียง: edge-tts → หน้า UI เล่นไฟล์ (LIVE Studio ต้องเลือกจับเสียงจากคอม/แอปนี้)
// ปักตะกร้า: หน้า LIVE Manager ใน Chrome 9334 (ตัวเดียวกับหน้าโพสต์) — หาแถวที่มีชื่อสินค้า แล้วกดปุ่ม ปักหมุด/Pin ในแถวนั้น
// shortcut: ปุ่ม/แถวสินค้าเดาจากข้อความไทย/อังกฤษ ยังไม่เคยเทสกับไลฟ์จริง (8 พ.ย. 2026) ถ้าปักไม่ได้จะเขียนบันทึกแล้วพูดต่อ ไม่หยุดไลฟ์
const fs = require('fs');
const path = require('path');
const { ask } = require('./meta');
const { run } = require('./pipeline');
const { LipSync } = require('./lipsync');

const VOICE = { female: 'th-TH-PremwadeeNeural', male: 'th-TH-NiwatNeural' };
const DEF_URL = 'https://shop.tiktok.com/streamer/live/product/dashboard';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const readJson = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return d; } };

// ---------- กันบทซ้ำ ----------
const norm = (s) => String(s).replace(/[\s\p{P}\p{S}]/gu, '').toLowerCase();
const grams = (s) => { const n = norm(s), g = new Set(); for (let i = 0; i < n.length - 2; i++) g.add(n.slice(i, i + 3)); return g; };
function similar(a, b) {
  const A = grams(a), B = grams(b);
  if (!A.size || !B.size) return norm(a) === norm(b);
  let x = 0; for (const g of A) if (B.has(g)) x++;
  return x / Math.min(A.size, B.size) > 0.6; // ประโยคที่ซ้ำกันเกินครึ่ง = นับว่าซ้ำ
}
// คัดประโยคใหม่ที่ไม่ซ้ำของเก่าและไม่ซ้ำกันเอง
function fresh(lines, old) {
  const out = [];
  for (const l of lines.map((x) => String(x || '').trim()).filter((x) => x.length > 8)) {
    if (!old.some((o) => similar(o, l)) && !out.some((o) => similar(o, l))) out.push(l);
  }
  return out;
}
const keyOf = (p) => norm(p.name).slice(0, 60);
const fileUrl = (f) => 'file:///' + f.replace(/\\/g, '/').split('/').map(encodeURIComponent).join('/').replace('%3A', ':');
const toSrc = (f) => (!f ? '' : /^(https?|file|data):/i.test(f) ? f : fileUrl(f));

// สินค้าจากคลิปขายของที่ทำไว้ (โปรเจกต์ mode shopee ที่มี output/*.mp4) รวมคลิปตามชื่อสินค้า
function productsFromClips(root) {
  const by = new Map();
  if (!fs.existsSync(root)) return [];
  for (const d of fs.readdirSync(root)) {
    const dir = path.join(root, d);
    const p = readJson(path.join(dir, 'project.json'), null);
    const odir = path.join(dir, 'output');
    if (p?.mode !== 'shopee' || !p.product?.title || !fs.existsSync(odir)) continue;
    const clips = fs.readdirSync(odir).filter((f) => /\.mp4$/i.test(f)).map((f) => path.join(odir, f));
    if (!clips.length) continue;
    const t = p.product.title.trim();
    const cur = by.get(t) || { name: t, price: p.product.price || '', info: [p.product.desc, p.note].filter(Boolean).join(' · ').slice(0, 300), image: p.product.file || p.product.image || '', clips: [] };
    cur.clips.push(...clips);
    by.set(t, cur);
  }
  return [...by.values()];
}

class Live {
  // metaWin = หน้าต่าง Meta แยกของไลฟ์ (partition เดียวกัน ไม่แย่งกับงานทำหนัง) · ui = หน้าต่างซ่อนที่เล่นเสียง
  constructor({ metaWin, flow, ui, dataDir, log, state }) {
    Object.assign(this, { metaWin, flow, ui, log, state });
    this.cfgFile = path.join(dataDir, 'live.json');
    this.histFile = path.join(dataDir, 'live-history.json');
    this.audioDir = path.join(dataDir, 'live-audio');
    this.running = false;
  }

  settings() { return { products: [], minutes: 5, between: 2, bg: '', presenter: '', greenKey: false, lipsync: false, top: true, voice: 'female', url: DEF_URL, pin: true, style: 'แม่ค้าไลฟ์สดเป็นกันเอง ตื่นเต้น', ...readJson(this.cfgFile, {}) }; }
  saveSettings(s) { fs.writeFileSync(this.cfgFile, JSON.stringify({ ...this.settings(), ...s }, null, 2)); return this.settings(); }

  // ---------- บท ----------
  async writeRound(cfg, round, pending = []) {
    const hist = readJson(this.histFile, {});
    const per = (p) => Math.ceil(((+p.minutes || cfg.minutes) * 60) / 9) + 3; // ~9 วิ/ประโยค
    const prompt = `คุณคือคนเขียนบทพูดไลฟ์ขายของ TikTok ภาษาไทย สไตล์: ${cfg.style}
เขียนประโยคพูดสำหรับรอบที่ ${round} ของแต่ละสินค้าด้านล่าง ประโยคละ 1–2 ประโยคสั้น พูดจบใน 6–12 วินาที
ผสมหลายแบบ: เปิดตัวสินค้า จุดเด่น วิธีใช้ เทียบความคุ้ม ตอบข้อสงสัยที่คนมักถาม ชวนกดตะกร้า/กดหัวใจ/กดติดตาม เล่าประสบการณ์ใช้
กฎ: พูดถึงเฉพาะสินค้าที่กำหนดในแต่ละช่อง ห้ามแต่งราคา/โปรโมชัน/ของแถมที่ไม่มีในข้อมูล ไม่ใช้คำหยาบ ไม่อ้างสรรพคุณทางการแพทย์
ห้ามซ้ำหรือคล้ายกับ "เคยพูดแล้ว" ทั้งเนื้อหาและคำขึ้นต้น ห้ามขึ้นต้นประโยคด้วยคำเดิมติดกัน เขียนตัวเลขราคาเป็นคำอ่าน
${cfg.products.map((p, i) => {
  const old = [...(hist[keyOf(p)] || []), ...(pending[i] || [])].slice(-40);
  return `--- สินค้า ${i + 1}: ${p.name}
ราคา: ${p.price || '-'} · ข้อมูล: ${p.info || '-'}
ต้องการ ${per(p)} ประโยค${old.length ? `\nเคยพูดแล้ว (ห้ามซ้ำ):\n${old.map((l) => '- ' + l).join('\n')}` : ''}`;
}).join('\n')}
ตอบเป็น JSON อย่างเดียว คั่นด้วย GENIX_START ... GENIX_END:
GENIX_START{"products":[{"no":1,"lines":["..."]}]}GENIX_END`;
    let res;
    for (let k = 0; k < 3 && !res; k++) {
      try { res = await ask(this.metaWin, prompt, { want: 'json', timeoutMs: 300000, isStopped: () => !this.running }); }
      catch (e) { if (!this.running) throw e; this.log(`⚠️ เขียนบทไม่ได้ (${e.message}) ลองใหม่`); await sleep(5000); }
    }
    const script = cfg.products.map((p, i) => {
      const got = res?.products?.find((x) => +x.no === i + 1)?.lines || res?.products?.[i]?.lines || [];
      const lines = fresh(got, [...(hist[keyOf(p)] || []), ...(pending[i] || [])]);
      if (got.length - lines.length) this.log(`✂️ ${p.name}: ตัดประโยคซ้ำของเก่าทิ้ง ${got.length - lines.length}`);
      return lines;
    });
    if (!script.some((l) => l.length)) throw new Error('AI ไม่ส่งบทกลับมา (ดูหน้าต่าง Meta AI ว่าติดอะไร)');
    return script;
  }

  remember(p, line) {
    const hist = readJson(this.histFile, {});
    (hist[keyOf(p)] ||= []).push(line);
    hist[keyOf(p)] = hist[keyOf(p)].slice(-300);
    fs.writeFileSync(this.histFile, JSON.stringify(hist, null, 1));
  }

  // ---------- เสียง ----------
  async tts(text, voice, n) {
    const f = path.join(this.audioDir, `l${n % 12}.mp3`); // วนใช้ 12 ไฟล์ (ล่วงหน้าได้ถึง 4 + ที่เล่นอยู่) ไม่ให้โฟลเดอร์บวม
    for (let k = 0; k < 4; k++) {
      try {
        await run('python', ['-m', 'edge_tts', '--voice', VOICE[voice] || VOICE.female, '--rate=+10%', '--text', text, '--write-media', f]);
        if (fs.statSync(f).size > 1000) return f;
      } catch {}
      await sleep(2000);
    }
    return null;
  }
  // เสียง + (ถ้าเปิดขยับปาก) วิดีโอคนขายพูดตามเสียง → { audio, video? } หรือ null
  async voice(text, voice, n) {
    const audio = await this.tts(text, voice, n);
    if (!audio || !this.lip) return audio && { audio };
    const out = path.join(this.audioDir, `t${n % 12}.mp4`);
    const r = await this.lip.speak(audio, out).catch((e) => ({ error: e.message }));
    if (r.error) { this.log('⚠️ ขยับปากไม่ได้ ใช้เสียงอย่างเดียว: ' + r.error); return { audio }; }
    if (r.realtime < 1) this.log(`🐢 ขยับปากช้ากว่าเวลาจริง (x${r.realtime}) อาจมีช่วงรอ`);
    return { audio, video: out };
  }
  // จอไลฟ์ (ui/live-player.html)
  js(fn, ...a) { return this.ui.webContents.executeJavaScript(`${fn}(${a.map((x) => JSON.stringify(x)).join(',')})`).catch(() => {}); }
  play(v, line) {
    return v.video ? this.js('playTalk', fileUrl(v.video) + '?' + Date.now(), line) : this.js('playLive', fileUrl(v.audio) + '?' + Date.now(), line);
  }
  clip(file) { return this.js('playClip', fileUrl(file)); }
  card() { return this.js('talk'); }
  setProduct(p, no) { return this.js('setProduct', { name: p.name, price: p.price, image: toSrc(p.image), no }); }
  setup(cfg) { return this.js('setup', { bg: toSrc(cfg.bg), presenter: toSrc(cfg.presenter), greenKey: !!cfg.greenKey, top: cfg.top !== false }); }

  // ---------- ปักตะกร้า ----------
  async livePage(cfg) {
    if (this.page && !this.page.isClosed()) return this.page;
    await this.flow.connect();
    const ctx = this.flow.browser.contexts()[0];
    let page = ctx.pages().find((p) => /streamer|live/i.test(p.url()) && /tiktok/i.test(p.url()));
    if (!page) { page = await ctx.newPage(); await page.goto(cfg.url || DEF_URL, { waitUntil: 'domcontentloaded' }); await sleep(4000); }
    return (this.page = page);
  }
  async pin(cfg, p) {
    const page = await this.livePage(cfg);
    const btn = /^(ปักหมุด|ปัก|Pin)$/i;
    // แถวที่ลึกที่สุดที่มีทั้งชื่อสินค้าและปุ่มปักหมุด
    const row = page.locator('li, tr, div').filter({ hasText: p.match || p.name }).filter({ has: page.getByRole('button', { name: btn }).or(page.getByText(btn)) }).last();
    if (!(await row.count())) {
      const pinned = page.locator('li, tr, div').filter({ hasText: p.match || p.name }).filter({ has: page.getByText(/^(เลิกปักหมุด|ยกเลิกการปักหมุด|Unpin)$/i) });
      if (await pinned.count()) return 'already';
      throw new Error(`ไม่เจอ "${p.match || p.name}" ที่มีปุ่มปักหมุดในหน้าไลฟ์ (ยังไม่เริ่มไลฟ์/ยังไม่ได้เพิ่มสินค้าเข้าไลฟ์/ชื่อไม่ตรง)`);
    }
    await row.getByRole('button', { name: btn }).or(row.getByText(btn)).last().click();
    await sleep(800);
    await page.getByRole('button', { name: /^(ยืนยัน|ตกลง|Confirm|OK)$/i }).first().click({ timeout: 1500 }).catch(() => {}); // บางทีเด้งถามแทนที่ของเก่า
    return 'ok';
  }

  // ---------- วนไลฟ์ ----------
  async start(cfg) {
    if (this.running) throw new Error('ไลฟ์รันอยู่แล้ว');
    cfg = this.saveSettings(cfg);
    cfg.products = cfg.products.filter((p) => p.name?.trim());
    if (!cfg.products.length) throw new Error('ใส่สินค้าอย่างน้อย 1 ชิ้น');
    fs.mkdirSync(this.audioDir, { recursive: true });
    this.running = true;
    this.state({ running: true, round: 1, product: -1, name: 'กำลังให้ AI เขียนบทรอบแรก…', until: Date.now() });
    this.loop(cfg).catch((e) => this.log('❌ ' + e.message)).finally(() => { this.running = false; this.lip?.stop(); this.lip = null; this.state({ running: false }); });
  }
  stop() {
    this.running = false;
    this.ui.webContents.executeJavaScript('stopLive()').catch(() => {});
  }

  async loop(cfg) {
    let n = 0, round = 1;
    await this.setup(cfg);
    // ขยับปาก: เปิด MuseTalk + เตรียมหน้าคนขาย ไปพร้อมกับให้ AI เขียนบทรอบแรก
    this.lip = null;
    const lipP = cfg.lipsync && cfg.presenter
      ? (async () => { const l = new LipSync(this.log); try { await l.start(cfg.presenter); this.lip = l; } catch (e) { l.stop(); this.log('⚠️ ขยับปากไม่ได้ ใช้คลิปคนขายวนเฉย ๆ: ' + e.message); } })()
      : null;
    this.log('✍️ เขียนบทรอบ 1');
    let script = await this.writeRound(cfg, 1);
    await lipP;
    while (this.running) {
      // เขียนบทรอบหน้าไว้ก่อนเลย ระหว่างพูดรอบนี้
      const nextP = this.writeRound(cfg, round + 1, script).catch((e) => e); // ส่งบทรอบนี้ไปด้วย กันซ้ำกับที่ยังไม่ได้พูด
      for (let i = 0; i < cfg.products.length && this.running; i++) {
        const p = cfg.products[i];
        const lines = [...script[i]];
        const end = Date.now() + (+p.minutes || +cfg.minutes || 5) * 60000;
        this.state({ running: true, round, product: i, name: p.name, until: end });
        this.log(`🛒 รอบ ${round} · สินค้า ${i + 1}/${cfg.products.length}: ${p.name}`);
        if (cfg.pin) {
          await this.pin(cfg, p).then((r) => this.log(r === 'already' ? '📌 ปักอยู่แล้ว' : '📌 ปักตะกร้าแล้ว'), (e) => this.log('⚠️ ปักไม่ได้: ' + e.message));
        }
        // มีคลิป: เล่นคลิปของชิ้นนี้ → AI พูดคั่น cfg.between ประโยค → คลิปถัดไป วนจนหมดเวลา · ไม่มีคลิป: AI พูดยาวบนการ์ดสินค้า
        const clips = (p.clips || []).filter((f) => fs.existsSync(f));
        const between = clips.length ? Math.max(0, +cfg.between || 0) : Infinity;
        const live = () => this.running && Date.now() < end;
        // ทำเสียง(+ปาก)ล่วงหน้า: ขยับปากช้ากว่าเวลาจริง เลยเตรียมไว้หลายประโยคระหว่างคลิปเล่น
        const AHEAD = this.lip ? 4 : 1, pending = [];
        let li = 0, ci = 0;
        const fill = () => { while (pending.length < AHEAD && li < lines.length) { const line = lines[li++]; pending.push({ line, v: this.voice(line, cfg.voice, n++) }); } };
        fill();
        await this.setProduct(p, i + 1);
        if (!clips.length) await this.card(p);
        while (live()) {
          if (clips.length) {
            const c = clips[ci++ % clips.length];
            this.state({ running: true, round, product: i, name: p.name, until: end, line: '🎬 ' + path.basename(path.dirname(path.dirname(c))) + ' / ' + path.basename(c) });
            await this.clip(c);
            if (live() && between && pending.length) await this.card(p);
          }
          for (let k = 0; live() && pending.length && k < between; k++) {
            const { line, v } = pending.shift();
            fill();
            const file = await v;
            if (!file) { this.log('⚠️ ทำเสียงไม่ได้ ข้าม: ' + line); continue; }
            this.state({ running: true, round, product: i, name: p.name, until: end, line });
            this.remember(p, line);
            await this.play(file, line);
            await sleep(700 + Math.random() * 900);
          }
          if (!clips.length && !pending.length) break;
        }
        // shortcut: ไม่มีคลิปและบทหมดก่อนหมดเวลา = เงียบรอจนครบเวลา (ให้ AI เขียนเผื่อไว้แล้ว ~9 วิ/ประโยค)
        while (live()) await sleep(1000);
      }
      if (!this.running) break;
      round++;
      const s = await nextP;
      if (s instanceof Error) { this.log(`⚠️ บทรอบ ${round} ไม่มา (${s.message}) เขียนใหม่`); script = await this.writeRound(cfg, round); }
      else script = s;
      this.log(`🔁 จบรอบ เริ่มรอบ ${round} ด้วยบทใหม่`);
    }
    this.log('⏹️ หยุดไลฟ์แล้ว');
  }
}

module.exports = { Live, fresh, similar, productsFromClips };
