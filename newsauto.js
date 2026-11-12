// ข่าวอัตโนมัติ (kidza 9 พ.ย.): เปิดอยู่ = ทุก 2 ชม. 08:00–22:00 ดึงข่าวใหม่จากเว็บที่ตั้งไว้ → AI เลือก 1 ข่าว → เขียนบท (กันเลขแต่ง)
// → ทำคลิป (เสียง Mali / ผู้ประกาศ) → โพสต์ตามช่องในหน้าโพสต์ · ตั้งค่าอยู่ userData/newsauto.json ข่าวที่ทำแล้วอยู่ newsauto_seen.json
const fs = require('fs');
const path = require('path');

const stats = require('./stats');
const { line } = require('./notify');
const PF = { facebook: 'Facebook', youtube: 'YouTube', tiktok: 'TikTok' };
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

const isFb = (u) => /^https?:\/\/([a-z]+\.)?facebook\.com\//i.test(u);
const title = (a) => ((a.text.match(/หัวข้อ: (.*)/) || [])[1] || a.text.split('\n').find((l) => l.trim() && !l.startsWith('ที่มา:')) || a.url).slice(0, 140);

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
  // รอบเวลา: 08,10,…,22 (start + everyH*n) ตามนาฬิกาเครื่อง · คืนรอบล่าสุดที่ถึงเวลาแล้ว (ถึงเที่ยงคืน)
  // แอปติดทำหนัง/เปิดช้า → รอบนั้นยังค้างอยู่ ทำทันทีที่ว่าง (10 พ.ย. รอบ 8 โมงหายเพราะติดทำหนัง)
  slotNow(c = this.cfg(), d = new Date()) {
    const h = d.getHours();
    if (h < c.start) return '';
    const s = Math.min(c.end, c.start + Math.floor((h - c.start) / c.everyH) * c.everyH);
    return `${d.toLocaleDateString('sv')}-${s}`;
  }
  due(c = this.cfg()) { const s = this.slotNow(c); return !!(c.on && c.sites.length && s && s !== c.lastSlot); }
  start() { this.timer = setInterval(() => this.tick().catch((e) => this.log('❌ ข่าวอัตโนมัติ: ' + e.message)), 60000); }
  async tick() {
    const c = this.cfg();
    const now = new Date(), today = now.toLocaleDateString('sv');
    // 23:30 เก็บยอดวิว + สรุปเข้า LINE วันละครั้ง
    if (c.on && now.getHours() === 23 && now.getMinutes() >= 30 && c.statsDay !== today && !this.running && !this.busy()) {
      this.cfg({ statsDay: today });
      return this.dailyStats().catch((e) => this.log('❌ เก็บยอดวิว: ' + e.message)).finally(() => this.cleanup());
    }
    const slot = this.slotNow(c);
    if (!c.on || !slot || slot === c.lastSlot || this.running || this.busy()) return;
    this.cfg({ lastSlot: slot });
    const at = `${String(now.getHours()).padStart(2, '0')}:00`;
    try {
      const r = await this.round();
      if (r.dir) await this.say(`✅ ข่าว ${at} ${r.posted ? 'โพสต์แล้ว' : 'ทำเสร็จ (ไม่ได้ติ๊กที่โพสต์)'}\n${r.title}\n${Object.entries(r.posted || {}).map(([p, v]) => `${PF[p] || p}: ${v === 'ok' || /^\d{4}-/.test(v) ? '✓' : v === 'dry' ? 'โหมดทดลอง' : '✗ ' + String(v).replace(/^error: /, '').slice(0, 120)}`).join('\n')}`);
      else if (r.skipped === 'all failed') await this.say(`⚠️ ข่าว ${at}: ทำไม่ได้สักข่าว (บทมีเลขแต่ง/เขียนบทพัง) ดูบันทึกในแอป`);
    } catch (e) { await this.say(`❌ ข่าว ${at} พัง: ${e.message.slice(0, 300)}`); throw e; }
  }
  // kidza 11 พ.ย.: ลบคลิปข่าวที่โพสต์ครบแล้วทุกวัน (หลังเก็บยอดวิว 23:30) · โพสต์ไม่ผ่านสักช่อง/ยังไม่โพสต์ = เก็บไว้ให้โพสต์ซ้ำ
  cleanup() {
    const ok = (v) => v === 'ok' || /^\d{4}-/.test(String(v));
    let n = 0;
    for (const d of fs.readdirSync(this.root)) {
      if (!/-news$/.test(d)) continue;
      const dir = path.join(this.root, d);
      const vals = Object.values(readJson(path.join(dir, 'posted.json'), {})).flatMap((o) => Object.values(o || {}));
      if (!vals.length || !vals.every(ok)) continue;
      try { fs.rmSync(dir, { recursive: true, force: true }); n++; } catch (e) { this.log(`⚠️ ลบ ${d} ไม่ได้: ${e.message}`); }
    }
    if (n) { this.log(`🧹 ลบคลิปข่าวที่โพสต์แล้ว ${n} อัน`); this.say(`🧹 ลบคลิปข่าวที่โพสต์แล้ว ${n} อัน (ที่โพสต์ไม่ผ่านยังเก็บไว้)`); }
    return n;
  }
  say(text) { return line(text).catch((e) => this.log('⚠️ แจ้ง LINE ไม่ได้: ' + e.message)); }

  async dailyStats() {
    const clips = this.listClips(this.root).filter((x) => x.mode === 'news' && Object.values(x.posted || {}).some((v) => /^\d{4}-/.test(String(v))));
    if (!clips.length) return;
    this.log('📊 เก็บยอดวิวคลิปข่าว');
    const st = await stats.collect({ flow: this.flow, settings: this.poster.settings(), clips, userData: this.userData, log: this.log });
    const r = stats.ranked(st, 7);
    if (!r.length) return;
    const row = (x, i) => `${i + 1}. ${x.total.toLocaleString()} วิว (FB ${x.fb ?? '-'} / YT ${x.yt ?? '-'}) ${x.title.slice(0, 45)}`;
    await this.say(`📊 ยอดวิวคลิปข่าว 7 วัน (${r.length} คลิป รวม ${r.reduce((s, x) => s + x.total, 0).toLocaleString()} วิว)\n🔥 คนดูเยอะ\n${r.slice(0, 3).map(row).join('\n')}${r.length > 5 ? `\n🥶 คนดูน้อย\n${r.slice(-2).map((x, i) => row(x, r.length - 2 + i)).join('\n')}` : ''}`);
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
        try {
          // เพจเฟส = เปิดผ่าน Chrome ของแอป (ล็อกอินเฟส) · เว็บข่าว = RSS/หน้าแรก
          const all = isFb(s) ? await this.news.fbPagePosts(s, this.flow) : await links(s);
          const l = all.filter((u) => !seen.has(u));
          cand.push(...l.slice(0, 5).map((url) => ({ url, page: all.pageName })));
          log(`  ${all.pageName || new URL(s).hostname}: ข่าวใหม่ ${l.length}`);
        } catch (e) { log(`  ⚠️ ${s}: ${e.message}`); }
      }
      if (!cand.length) { log('ไม่มีข่าวใหม่ รอบนี้ข้าม'); return { skipped: 'no news' }; }
      // อ่านเนื้อข่าว แล้วให้ AI เลือกข่าวที่คนน่าจะดูที่สุด
      const arts = [];
      for (const { url, page } of cand.slice(0, 16)) {
        try {
          let text = isFb(url) ? await this.news.fetchFacebook(url, this.flow) : await this.news.fetchArticle(url);
          if (page) text = text.replace(/^ที่มา: โพสต์เฟสเพจ .*/, `ที่มา: โพสต์เฟสเพจ ${page}`);
          if (text.length > 250) arts.push({ url, text });
        } catch {}
      }
      if (!arts.length) { log('อ่านเนื้อข่าวไม่ได้สักข่าว รอบนี้ข้าม'); return { skipped: 'unreadable' }; }
      // หัวข่าว: หัวข้อจากเว็บ ถ้าไม่มี (โพสต์เฟสล้วน) ใช้บรรทัดแรกของโพสต์
      const titles = arts.map((a, i) => `${i}. ${title(a)}`).join('\n');
      // เว็บเดียวลงเรื่องเดิมหลายลิงก์ (บุ๋มคืนที่ 1, 2, …) → บอก AI เรื่องที่ทำไปแล้ว ห้ามซ้ำ
      const done = (c.recent || []).slice(-12).join('\n') || '-';
      // ยอดวิวจริงของคลิปที่ผ่านมา (เก็บทุกคืน 23:30) → ให้ AI เลือกแนวที่คนดูเยอะ
      const rk = stats.ranked(readJson(path.join(this.userData, 'newsstats.json'), {}), 14).filter((x) => x.total > 0);
      const hint = rk.length >= 4 ? `\nยอดวิวจริงของเพจเรา — แนวที่คนดูเยอะ:\n${rk.slice(0, 5).map((x) => `${x.total} วิว: ${x.title}`).join('\n')}\nแนวที่คนดูน้อย:\n${rk.slice(-3).map((x) => `${x.total} วิว: ${x.title}`).join('\n')}\nให้น้ำหนักข่าวแนวที่คนดูเยอะ` : '';
      const pick = await this.ask(this.metaWin(), `เลือกข่าวที่คนไทยบน TikTok/Facebook น่าจะสนใจดูคลิปสรุปที่สุด เรียงจากน่าทำที่สุด 3 ข่าว (ห้ามเลือกข่าวหวย/ดูดวง/โฆษณา/ข่าวที่ไม่มีเนื้อหา และห้ามเลือกข่าวที่เป็นเรื่องเดียวกับที่ทำไปแล้ว)${hint}\nทำไปแล้ว:\n${done}\n\nข่าวใหม่:\n${titles}\nตอบ JSON: {"order":[เลขข่าว,…]} ถ้าทุกข่าวซ้ำเรื่องเดิมหมด ตอบ {"order":[]}`, { want: 'json', timeoutMs: 120000 }).catch(() => null);
      if (pick && Array.isArray(pick.order) && !pick.order.length) { log('ข่าวใหม่ซ้ำเรื่องที่ทำไปแล้วหมด รอบนี้ข้าม'); arts.forEach((a) => seen.add(a.url)); fs.writeFileSync(this.seenFile, JSON.stringify([...seen].slice(-2000))); return { skipped: 'duplicate' }; }
      const order = pick ? (pick.order || []).map(Number).filter((i) => arts[i]) : [...arts.keys()];
      for (const i of order.slice(0, 3)) {
        const a = arts[i];
        seen.add(a.url); fs.writeFileSync(this.seenFile, JSON.stringify([...seen].slice(-2000)));
        const r = await this.makeOne(a, c, log);
        if (r) return r;
      }
      log('ทำไม่ได้สักข่าวในรอบนี้');
      return { skipped: 'all failed' };
    } finally { this.running = false; this.setBusy(false); }
  }

  // สั่งจากมือถือ (remote.js): ลิงก์ข่าว/โพสต์เฟส 1 อัน → บท → คลิป → โพสต์ (post=false = ทำเสร็จเก็บไว้)
  async fromUrl(url, post = true) {
    if (this.running) throw new Error('กำลังทำข่าวอยู่ รอรอบนี้เสร็จก่อน');
    this.running = true; this.setBusy(true);
    const log = (m) => this.log('📱 ' + m);
    try {
      log('อ่านข่าว ' + url);
      const text = isFb(url) ? await this.news.fetchFacebook(url, this.flow) : await this.news.fetchArticle(url);
      if (!text || text.length < 250) throw new Error('อ่านเนื้อข่าวไม่ได้ (สั้นเกิน/เปิดไม่ได้)');
      const c = this.cfg();
      const r = await this.makeOne({ url, text }, { ...c, platforms: post ? c.platforms : [] }, log);
      if (!r) throw new Error('บทมีเลขที่ไม่อยู่ในข่าว เขียนใหม่ 3 รอบไม่หาย ข้าม');
      await this.say(`📱 ข่าวที่สั่งจากมือถือ ${r.posted ? 'โพสต์แล้ว' : 'ทำเสร็จ (ไม่โพสต์)'}\n${r.title}`);
      return r;
    } finally { this.running = false; this.setBusy(false); }
  }

  // ข่าว 1 อัน { url, text } → คลิป (+โพสต์ตาม c.platforms) · คืน null ถ้าบทมีเลขแต่ง
  async makeOne(a, c, log) {
        log(`ข่าว: ${title(a)}`);
        const anchor = c.anchor && fs.existsSync(c.anchor) ? c.anchor : this.defaultFace();
        let spec, bad = [], tried = [];
        for (let k = 0; k < 3; k++) {
          spec = await this.news.writeScript(this.metaWin(), a.text, tried, false); // ผู้ประกาศหญิงคนเดียว (kidza 12 พ.ย. เลิกข่าวคู่)
          bad = badNumbers({ shots: [...spec.shots, { sub: (spec.caption || '').replace(/#\S+/g, '') }] }, a.text); // แคปชันโพสต์ด้วย (แฮชแท็กไม่นับ)
          if (!bad.length) break;
          tried = [...new Set([...tried, ...bad])];
          log(`  บทมีเลขที่ไม่อยู่ในข่าว (${bad.join(', ')}) เขียนใหม่`);
        }
        if (bad.length) { log('  เลขแต่งไม่หาย ข้ามข่าวนี้'); return null; }
        if (anchor) spec.anchor = anchor;
        // มีคีย์ ElevenLabs = ข่าวอัตโนมัติใช้ Mali เสมอ (kidza ซื้อแล้ว 10 พ.ย. — ช่องเสียงในหน้าข่าวเคยเพี้ยนเป็น F5 แล้วพากย์ผิด)
        const voice = this.news.voices().find((v) => v.id.startsWith('eleven:'))?.id || c.voice || 'edge';
        const dir = await this.news.make(this.root, spec, voice, { log: this.log, gpuBusy: () => false, flow: this.flow });
        const clip = this.listClips(this.root).find((x) => x.dir === dir);
        let posted = null;
        if (clip && c.platforms.length) { log('โพสต์'); posted = await this.poster.post(clip, c.platforms); }
        this.cfg({ last: { at: new Date().toISOString(), dir, url: a.url }, recent: [...(this.cfg().recent || []), title(a)].slice(-30) });
        log('✅ รอบนี้เสร็จ');
        return { dir, title: title(a), posted };
  }
}

module.exports = { NewsAuto, links, badNumbers };
