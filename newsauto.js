// ข่าวอัตโนมัติ (kidza 9 พ.ย.): เปิดอยู่ = ทุก 2 ชม. 08:00–22:00 ดึงข่าวใหม่จากเว็บที่ตั้งไว้ → AI เลือก 1 ข่าว → เขียนบท (กันเลขแต่ง)
// → ทำคลิป (เสียง Mali / ผู้ประกาศ) → โพสต์ตามช่องในหน้าโพสต์ · ตั้งค่าอยู่ userData/newsauto.json ข่าวที่ทำแล้วอยู่ newsauto_seen.json
const fs = require('fs');
const path = require('path');

const UA = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130 Safari/537.36' };
const readJson = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return d; } };

// ลิงก์ข่าวจากหน้าเว็บ: RSS ก่อน (ลิงก์ <link> ใน <item>) ไม่มีค่อยเก็บ <a href> โดเมนเดียวกันที่หน้าตาเป็นหน้าข่าว (มีเลข id หรือ slug ยาว)
async function links(site) {
  const r = await fetch(site, { headers: UA, signal: AbortSignal.timeout(20000) });
  if (!r.ok) throw new Error(`${site} เปิดไม่ได้ (${r.status})`);
  const html = await r.text();
  const base = new URL(r.url);
  const rss = [...html.matchAll(/<item[\s\S]*?<link>(?:<!\[CDATA\[)?\s*([^<\]\s]+)/gi)].map((m) => m[1]);
  if (rss.length) return [...new Set(rss)].slice(0, 30);
  const out = new Set();
  for (const m of html.matchAll(/<a[^>]+href="([^"#]+)"/gi)) {
    let u; try { u = new URL(m[1].replace(/&amp;/g, '&'), base); } catch { continue; }
    if (u.hostname.replace(/^www\./, '') !== base.hostname.replace(/^www\./, '')) continue;
    const p = decodeURIComponent(u.pathname);
    if (/\/(tag|tags|category|author|search|video|live|horoscope|lotto|login)\b/i.test(p)) continue;
    if (/\d{5,}/.test(p) || p.split('/').pop().length > 25) out.add(u.origin + u.pathname);
  }
  return [...out].slice(0, 30);
}

// ตัวเลขบนจอต้องมีในเนื้อข่าว (ก๊อปจาก ui/news.js badNumbers — ฝั่งหน้าเว็บ require ไฟล์นี้ไม่ได้ แก้ต้องแก้คู่กัน)
const thaiDigits = (s) => s.replace(/[๐-๙]/g, (d) => '๐๑๒๓๔๕๖๗๘๙'.indexOf(d));
const onScreenText = (s) => [s.tag, s.head, s.sub, ...(s.chips || []), ...(s.card || [])].join(' ').replace(/<[^>]+>/g, ' ');
function badNumbers(spec, text) {
  const src = thaiDigits(text).replace(/,/g, '');
  const has = (n) => src.includes(n);
  const y = new Date().getFullYear(), years = [String(y), String(y + 543), String(y + 543).slice(2)];
  const yearOk = (n) => n.length === 4 && (has(String(+n - 543)) || has(String(+n + 543)));
  const onScreen = thaiDigits(spec.shots.map(onScreenText).join(' ')).replace(/,/g, '');
  return [...new Set(onScreen.match(/\d+(\.\d+)?/g) || [])].filter((n) => !has(n) && !years.includes(n) && !yearOk(n));
}

class NewsAuto {
  // deps: { userData, root, news, ask, metaWin(), poster, listClips, log, busy(): bool, setBusy(bool), defaultFace() }
  constructor(deps) {
    Object.assign(this, deps);
    this.cfgFile = path.join(this.userData, 'newsauto.json');
    this.seenFile = path.join(this.userData, 'newsauto_seen.json');
    this.running = false;
  }
  cfg(set) {
    const def = { on: false, sites: [], everyH: 2, start: 8, end: 22, voice: '', platforms: ['facebook'], anchor: '', last: null, lastSlot: '' };
    if (set) fs.writeFileSync(this.cfgFile, JSON.stringify({ ...this.cfg(), ...set }, null, 2));
    return { ...def, ...readJson(this.cfgFile, {}) };
  }
  // รอบเวลา: 08,10,…,22 (start + everyH*n) ตามนาฬิกาเครื่อง · เปิดแอปช้ากว่ารอบ = ทำรอบนั้นทันทีถ้ายังอยู่ในชั่วโมงนั้น
  slotNow(c = this.cfg(), d = new Date()) {
    const h = d.getHours();
    if (h < c.start || h > c.end || (h - c.start) % c.everyH) return '';
    return `${d.toISOString().slice(0, 10)}-${h}`;
  }
  start() { this.timer = setInterval(() => this.tick().catch((e) => this.log('❌ ข่าวอัตโนมัติ: ' + e.message)), 60000); }
  async tick() {
    const c = this.cfg();
    const slot = this.slotNow(c);
    if (!c.on || !slot || slot === c.lastSlot || this.running || this.busy()) return;
    this.cfg({ lastSlot: slot });
    await this.round();
  }

  async round() {
    if (this.running) throw new Error('ข่าวอัตโนมัติกำลังทำอยู่');
    const c = this.cfg();
    if (!c.sites.length) throw new Error('ยังไม่ได้ใส่เว็บข่าว');
    this.running = true; this.setBusy(true);
    const log = (m) => this.log('🤖 ' + m);
    try {
      const seen = new Set(readJson(this.seenFile, []));
      log(`ดึงข่าวจาก ${c.sites.length} เว็บ`);
      let cand = [];
      for (const s of c.sites) {
        try { const l = (await links(s)).filter((u) => !seen.has(u)); cand.push(...l.slice(0, 8)); log(`  ${new URL(s).hostname}: ข่าวใหม่ ${l.length}`); }
        catch (e) { log(`  ⚠️ ${s}: ${e.message}`); }
      }
      cand = [...new Set(cand)];
      if (!cand.length) { log('ไม่มีข่าวใหม่ รอบนี้ข้าม'); return { skipped: 'no news' }; }
      // อ่านหัวข่าว แล้วให้ AI เลือกข่าวที่คนน่าจะดูที่สุด
      const arts = [];
      for (const u of cand.slice(0, 15)) { try { arts.push({ url: u, text: await this.news.fetchArticle(u) }); } catch {} }
      if (!arts.length) { log('อ่านเนื้อข่าวไม่ได้สักข่าว รอบนี้ข้าม'); return { skipped: 'unreadable' }; }
      const title = (a) => (a.text.match(/หัวข้อ: (.*)/) || [])[1] || a.url;
      const titles = arts.map((a, i) => `${i}. ${title(a)}`).join('\n');
      // เว็บเดียวลงเรื่องเดิมหลายลิงก์ (บุ๋มคืนที่ 1, 2, …) → บอก AI เรื่องที่ทำไปแล้ว ห้ามซ้ำ
      const done = (c.recent || []).slice(-12).join('\n') || '-';
      const pick = await this.ask(this.metaWin(), `เลือกข่าวที่คนไทยบน TikTok/Facebook น่าจะสนใจดูคลิปสรุปที่สุด เรียงจากน่าทำที่สุด 3 ข่าว (ห้ามเลือกข่าวหวย/ดูดวง/โฆษณา/ข่าวที่ไม่มีเนื้อหา และห้ามเลือกข่าวที่เป็นเรื่องเดียวกับที่ทำไปแล้ว)\nทำไปแล้ว:\n${done}\n\nข่าวใหม่:\n${titles}\nตอบ JSON: {"order":[เลขข่าว,…]} ถ้าทุกข่าวซ้ำเรื่องเดิมหมด ตอบ {"order":[]}`, { want: 'json', timeoutMs: 120000 }).catch(() => null);
      if (pick && Array.isArray(pick.order) && !pick.order.length) { log('ข่าวใหม่ซ้ำเรื่องที่ทำไปแล้วหมด รอบนี้ข้าม'); arts.forEach((a) => seen.add(a.url)); fs.writeFileSync(this.seenFile, JSON.stringify([...seen].slice(-2000))); return { skipped: 'duplicate' }; }
      const order = pick ? (pick.order || []).map(Number).filter((i) => arts[i]) : [...arts.keys()];
      for (const i of order.slice(0, 3)) {
        const a = arts[i];
        seen.add(a.url); fs.writeFileSync(this.seenFile, JSON.stringify([...seen].slice(-2000)));
        log(`ข่าว: ${(a.text.match(/หัวข้อ: (.*)/) || [])[1] || a.url}`);
        let spec, bad = [], tried = [];
        for (let k = 0; k < 3; k++) {
          spec = await this.news.writeScript(this.metaWin(), a.text, tried);
          bad = badNumbers({ shots: [...spec.shots, { sub: (spec.caption || '').replace(/#\S+/g, '') }] }, a.text); // แคปชันโพสต์ด้วย (แฮชแท็กไม่นับ)
          if (!bad.length) break;
          tried = [...new Set([...tried, ...bad])];
          log(`  บทมีเลขที่ไม่อยู่ในข่าว (${bad.join(', ')}) เขียนใหม่`);
        }
        if (bad.length) { log('  เลขแต่งไม่หาย ข้ามข่าวนี้'); continue; }
        const anchor = c.anchor && fs.existsSync(c.anchor) ? c.anchor : this.defaultFace();
        if (anchor) spec.anchor = anchor;
        const voice = c.voice || (this.news.voices()[0] || {}).id || 'edge';
        const dir = await this.news.make(this.root, spec, voice, { log: this.log, gpuBusy: () => false });
        const clip = this.listClips(this.root).find((x) => x.dir === dir);
        if (clip && c.platforms.length) { log('โพสต์'); await this.poster.post(clip, c.platforms); }
        this.cfg({ last: { at: new Date().toISOString(), dir, url: a.url }, recent: [...(this.cfg().recent || []), title(a)].slice(-30) });
        log('✅ รอบนี้เสร็จ');
        return { dir };
      }
      log('ทำไม่ได้สักข่าวในรอบนี้');
      return { skipped: 'all failed' };
    } finally { this.running = false; this.setBusy(false); }
  }
}

module.exports = { NewsAuto, links, badNumbers };
