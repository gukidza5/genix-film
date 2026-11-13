// คลิปขายของ Shopee: สินค้า → บท → ภาพ → วิดีโอ → ตัดต่อ (ทำได้หลายคลิปต่อสินค้า)
// เซฟ project.json ทุกขั้น เหมือน Genix Film → "ทำต่อ" ข้ามของที่เสร็จแล้ว
const fs = require('fs');
const path = require('path');
const { BrowserWindow, session } = require('electron');
const { Pipeline, run, dur } = require('./pipeline');
const { geminiImage } = require('./meta');

// พากย์ 1 ประโยคด้วย F5 ในเครื่อง (ตัวสำรองตอน edge-tts ล่ม) เสียงหญิง = serหญิง005 (kidza เลือก 12 พ.ย.) · ไม่มี F5 → false
async function f5Say(text, mp3, gender) {
  const { VO } = require('./paths');
  const py = path.join(VO, 'venv/Scripts/python.exe'), tts = path.join(VO, 'genix_tts.py');
  if (!fs.existsSync(tts)) return false;
  const voices = JSON.parse(fs.readFileSync(path.join(VO, 'refs/voices.json'), 'utf8').replace(/^﻿/, ''));
  const v = voices.find((x) => x.id === (gender === 'male' ? 'serชาย001' : 'serหญิง005')) || voices.find((x) => x.gender === gender);
  if (!v) return false;
  const r = v.emo?.['ปกติ'] || v, wav = mp3.replace(/\.mp3$/, '.f5.wav'), job = mp3.replace(/\.mp3$/, '.f5job.json');
  fs.writeFileSync(job, JSON.stringify({ items: [{ ref: r.ref, ref_text: r.ref_text, text, out: wav }] }));
  await require('./comfy').free();
  await run(py, [tts, job]).catch(() => {});
  if (!fs.existsSync(wav)) return false;
  await run('ffmpeg', ['-y', '-v', 'error', '-i', wav, '-b:a', '128k', mp3]);
  return fs.statSync(mp3).size > 1000;
}

const STAGES = ['เตรียมสินค้า', 'เขียนบท', 'สร้างภาพ', 'สร้างวิดีโอ', 'ตัดต่อ'];
const SIZE = { '9:16': [1080, 1920], '4:5': [1080, 1350], '1:1': [1080, 1080], '16:9': [1920, 1080] };
const VOICE = { female: 'th-TH-PremwadeeNeural', male: 'th-TH-NiwatNeural' };

// ข้อความที่ส่งให้ Meta AI ตามตัวเลือกในหน้าจอ
const T = {
  presence: {
    full: 'presenter: one Thai presenter, full upper body visible, holding and using the product, same face and outfit in every shot',
    hands: 'hands only: show only hands holding/using the product, never show a face',
    none: 'no people at all, product only',
    auto: 'choose whether a presenter, hands only, or product only fits this product best',
  },
  style: {
    ugc: 'realistic smartphone UGC review footage, natural light, handheld',
    review: 'realistic vertical smartphone footage filmed by a Thai woman in her own real home, POV of her hands only (manicured nails), demonstrating the product step by step on a real table, natural daylight, slightly handheld, no face',
    live: 'Thai live-selling stream look, ring light, seller at a table',
    studio: 'clean studio product photography, soft box lighting',
    cinematic: 'cinematic commercial, shallow depth of field, dramatic lighting',
    cartoon3d: '3D cartoon render, Pixar-like',
    anime: 'anime style illustration',
    timelapse: 'timelapse, fast motion',
  },
  scene: {
    auto: 'a setting that suits the product', home: 'cozy living room', kitchen: 'home kitchen', vanity: 'makeup vanity table',
    livetable: 'live-selling table', studio: 'plain seamless studio wall', outdoor: 'outdoors in daylight', shop: 'Thai market stall / shop front',
  },
  tone: { friendly: 'เป็นกันเอง', hype: 'ป้ายยา ตื่นเต้น เร้าใจ', funny: 'ตลก ขำ ๆ', teen: 'วัยรุ่น', calm: 'นุ่มนวล น่าเชื่อถือ', pro: 'มืออาชีพ' },
  register: { polite: 'สุภาพ ลงท้ายค่ะ/ครับ', casual: 'กันเอง กวน ๆ' },
  accent: { central: 'ภาษากลาง', isan: 'ภาษาอีสาน', north: 'คำเมือง (ภาษาเหนือ)', south: 'ภาษาใต้' },
};

// เปิดลิงก์ Shopee (รวมลิงก์ s.shopee.co.th แบบย่อ) ในหน้าต่างซ่อน แล้วอ่านชื่อ ราคา รูป
// shortcut: อ่านจากหน้าเว็บตรง ๆ ไม่ใช้ Shopee Affiliate API (ต้องมี app id/secret) ถ้า Shopee เปลี่ยนหน้า/ติดล็อกอิน ให้กรอกเองในหน้าจอ
// ลิงก์แชร์สินค้า TikTok มีชื่อ+รูปฝังมาใน og_info (บางทีห่อด้วยหน้า login?redirect_url=...) อ่านได้โดยไม่ต้องเปิดหน้าเว็บ
function tiktokShare(url) {
  try {
    let u = new URL(url);
    const r = u.searchParams.get('redirect_url');
    if (r) u = new URL(r);
    const o = JSON.parse(u.searchParams.get('og_info') || '{}');
    // รูปใน og_info เป็นตัวย่อ 260px → ขอไฟล์ต้นฉบับแทน
    return { page: u.href, title: o.title || '', image: (o.image || '').replace(/~tplv-([a-z0-9]+)-[^?]+/i, '~tplv-$1-origin-jpeg.jpeg') };
  } catch { return {}; }
}

async function fetchProduct(url) {
  let tt = /tiktok/i.test(url) ? tiktokShare(url) : null;
  const fromShare = () => tt?.title && tt.image ? { url: tt.page, title: tt.title, image: tt.image, price: '', desc: '' } : null;
  if (tt?.page) url = tt.page;
  const win = new BrowserWindow({ show: false, width: 1200, height: 900, webPreferences: { partition: 'persist:shopee' } });
  try {
    await win.loadURL(url).catch(() => {});
    const t0 = Date.now();
    while (Date.now() - t0 < 25000) {
      await new Promise((r) => setTimeout(r, 1500));
      const r = await win.webContents.executeJavaScript(`(() => {
        const u = location.href;
        if (/buyer\\/login|verify\\/captcha|verify\\/traffic|tiktok\\.com\\/login/.test(u)) return { needLogin: true, url: u };
        // TikTok เด้งจิ๊กซอว์ยืนยันตัวทับหน้าสินค้า (URL ไม่เปลี่ยน) — 8 พ.ย. เคยคว้ารูปจิ๊กซอว์ไปเป็นรูปสินค้า
        if (/security check|captcha/i.test(document.title) || document.querySelector('[id*="captcha" i], [class*="captcha" i]')) return { needLogin: true, url: u };
        const og = (p) => document.querySelector('meta[property="' + p + '"]')?.content || '';
        const title = (og('og:title') || document.title).replace(/\\s*[|｜-]\\s*(Shopee|TikTok).*$/i, '').trim();
        const imgs = [...document.querySelectorAll('img')].filter(i => /susercontent|cf\\.shopee|tiktokcdn|ibyteimg/.test(i.currentSrc || i.src) && i.naturalWidth >= 300)
          .sort((a, b) => b.naturalWidth * b.naturalHeight - a.naturalWidth * a.naturalHeight);
        const image = og('og:image') || (imgs[0] && (imgs[0].currentSrc || imgs[0].src)) || '';
        const price = (document.body.innerText.match(/฿\\s?[\\d,]+(\\.\\d+)?/) || [''])[0].replace(/\\s/g, '');
        const desc = (og('og:description') || '').slice(0, 600);
        return { url: u, title, image, price, desc };
      })()`).catch(() => null);
      if (r?.needLogin) {
        if (tt && !fromShare()) tt = tiktokShare(r.url); // ลิงก์ย่อ vt.tiktok.com เด้งไปหน้า login ที่มี og_info
        return fromShare() || { needLogin: true };
      }
      if (r && r.title && r.image && !/^(shopee|tiktok)/i.test(r.title)) return r;
    }
    if (fromShare()) return fromShare();
    return { error: `อ่านข้อมูลสินค้าไม่ได้ (${/tiktok/i.test(url) ? 'TikTok' : 'Shopee'} อาจให้ล็อกอินก่อน กดปุ่ม 🔑) กรอกชื่อ/เลือกรูปเองได้` };
  } finally { win.destroy(); }
}

async function downloadImage(url, out) {
  const r = await session.fromPartition('persist:shopee').fetch(url);
  if (!r.ok) throw new Error(`โหลดรูปสินค้าไม่ได้ ${r.status}`);
  fs.writeFileSync(out, Buffer.from(await r.arrayBuffer()));
  return out;
}

class ShopeePipeline extends Pipeline {
  step(clip, stage, detail) {
    this.emit('progress', { ep: clip, eps: this.p.clips, stage, label: STAGES[stage], detail, title: this.p.product.title, stages: STAGES });
  }

  async start(dir, opts) {
    this.dir = dir;
    const pj = path.join(dir, 'project.json');
    this.p = fs.existsSync(pj) ? JSON.parse(fs.readFileSync(pj, 'utf8')) : { ...opts, mode: 'shopee', created: Date.now(), episodes: [] };
    const p = this.p;
    p.title = p.product.title;
    p.eps = p.clips; // ให้รายการโปรเจกต์ในหน้าจอใช้ตัวนับเดียวกับหนังสั้น
    this.save();
    [this.W, this.H] = SIZE[p.aspect] || SIZE['9:16'];

    // 1 รูปสินค้า: เอาที่ผู้ใช้เลือก หรือโหลดจากลิงก์ Shopee
    this.step(1, 0, p.product.title);
    if (!p.product.file || !fs.existsSync(p.product.file)) {
      if (!p.product.image) throw new Error('ไม่มีรูปสินค้า — กด "เลือกรูป" หรือใส่ลิงก์ Shopee');
      p.product.file = await downloadImage(p.product.image, this.f('product.jpg'));
      this.save();
    }
    this.emit('asset', { kind: 'cast', file: p.product.file, name: 'สินค้า' });

    for (let n = 1; n <= p.clips; n++) {
      const C = (p.episodes[n - 1] ||= { ep: n });
      if (C.final && fs.existsSync(C.final)) continue;

      // 2 บท
      if (!C.scenes) {
        this.step(n, 1, `คลิป ${n}/${p.clips}`);
        Object.assign(C, await this.ask(this.scriptPrompt(n), 'json', 240000, [p.product.file]));
        this.save();
        this.log(`📝 คลิป ${n}: ${C.scenes.map((s) => s.overlay).join(' / ')}`);
      }

      // 3 ภาพ (แนบรูปสินค้าจริงทุกครั้ง ให้หน้าตาสินค้าตรงของจริง)
      // มีหน้าประจำ (p.face) = แนบรูปหน้าเป็นไฟล์ที่ 2 แล้วสั่งใช้หน้านั้น แทนคำบรรยายหน้าที่บอทแต่งใหม่ทุกคลิป
      // รวมเป็นรูปเดียว ซ้ายสินค้า ขวาหน้า (ช่องแนบของ Meta อาจรับไฟล์เดียว)
      let face = null;
      if (p.face && fs.existsSync(p.face)) {
        face = this.f('product_face.jpg');
        if (!fs.existsSync(face)) await run('ffmpeg', ['-y', '-i', p.product.file, '-i', p.face, '-filter_complex', '[0]scale=-2:768[a];[1]scale=-2:768[b];[a][b]hstack', '-q:v', '3', face]);
      }
      const who = face ? 'The presenter is exactly the same woman as the person on the RIGHT half of the attached image: same face, same hairstyle, same skin tone (only the outfit may follow the scene). The product is the item on the LEFT half' : C.presenter;
      const look = [C.product_look, p.presence === 'none' ? '' : who].filter(Boolean).join('. ');
      for (const [i, s] of C.scenes.entries()) {
        this.step(n, 2, `ฉาก ${i + 1}/${C.scenes.length}`);
        s.frame = await this.geminiFrame(n, i, s, p, look);
        if (!s.frame) s.frame = await this.media(`Imagine, using the attached product photo exactly as the product: ${s.image_prompt}. ${look}. ${T.style[p.style]}, ${T.scene[p.scene]}, ${p.aspect} aspect ratio`,
          'image', this.f(`clip${n}`, `s${i + 1}.jpg`), 240000, [face || p.product.file]);
        this.save();
        if (s.frame) this.emit('asset', { kind: 'frame', file: s.frame, name: `คลิป ${n} ฉาก ${i + 1}` });
      }

      // 4 วิดีโอ (ไม่ได้ก็ใช้ภาพนิ่งซูมแทน)
      for (const [i, s] of C.scenes.entries()) {
        if (s.video !== undefined) continue;
        this.step(n, 3, `ฉาก ${i + 1}/${C.scenes.length}`);
        // วิดีโอ: ComfyUI ในเครื่องเป็นค่าเริ่มต้น (9 พ.ย. Meta เงียบฉากละ 10 นาทีไม่ได้สักฉาก) · zoom = ภาพนิ่งซูม ไม่เจนเลย
        if ((p.video || 'comfy') === 'zoom') { s.video = null; this.save(); continue; }
        if ((p.video || 'comfy') === 'comfy') {
          s.video = s.frame ? await this.comfyRun({ kind: 'video', motion: `${s.motion}. ${T.style[p.style]}`, image: s.frame, seconds: 4, out: this.f(`clip${n}`, `s${i + 1}.mp4`) }) : null;
          this.save();
          continue;
        }
        s.video = await this.media(`Create a video: ${s.image_prompt}. ${look}. ${s.motion}. ${T.style[p.style]}, ${p.aspect}`,
          'video', this.f(`clip${n}`, `s${i + 1}.mp4`), 300000, s.frame ? [s.frame] : [p.product.file]);
        this.save();
      }

      // 5 ตัดต่อ + ปก + แคปชันโพสต์
      this.step(n, 4, 'เสียง ซับ การ์ดราคา');
      C.final = await this.edit(n, C);
      C.cover = await this.coverShot(n, C);
      C.post = this.f('output', `clip${n}_post.txt`);
      // ลิงก์ Shopee ย่อท้ายแคปชันด้วย (kidza 12 พ.ย.) + เฟสใส่ซ้ำที่ "เพิ่มสินค้า" (poster.js) · TikTok ปักตะกร้าแทน ไม่ใส่
      fs.writeFileSync(C.post, [C.caption || '', (C.hashtags || []).join(' '), p.product.url && p.shop !== 'tiktok' ? `\n🛒 ${p.product.url}` : ''].join('\n').trim());
      this.save();
      this.emit('asset', { kind: 'final', file: C.final, cover: C.cover, name: `คลิป ${n}: ${C.scenes[0]?.overlay || ''}` });
      this.log(`✅ คลิป ${n} เสร็จ: ${C.final}`);
    }
    this.emit('done', { dir });
  }

  // วาดฉากด้วย Gemini (แนบสินค้า + หน้าคนขายแยก 2 รูป) · พังครั้งเดียว (ไม่มีโควตา/บิล) = ปิดทั้งงาน ถอยไป Meta ไม่ยิงซ้ำทุกฉาก
  async geminiFrame(n, i, s, p, look) {
    if (this.gimgOff) return null;
    const face = p.presence !== 'none' && p.presence !== 'hands' && p.face && fs.existsSync(p.face) ? p.face : null;
    const who = face ? 'The second attached image is the presenter: use exactly this woman, same face, same hairstyle, same skin tone. Her outfit should match the mood of the product and scene (not necessarily the outfit in the photo).' : look; // ไม่มีหน้าประจำ: ใช้คำบรรยายหน้าตาจากบท
    try {
      return await geminiImage(`The first attached image is the product: keep the product exactly as it looks (shape, color, label). ${who} Scene: ${s.image_prompt}. ${T.style[p.style]}, ${T.scene[p.scene]}. No text, no watermark.`,
        face ? [p.product.file, face] : [p.product.file], this.f(`clip${n}`, `s${i + 1}.png`), p.aspect);
    } catch (e) {
      this.gimgOff = true;
      this.log(`⚠️ Gemini วาดรูปไม่ได้ (${e.message.slice(0, 120)}) — ใช้ Meta แทนทั้งงานนี้`);
      return null;
    }
  }

  scriptPrompt(n) {
    const p = this.p, pr = p.product;
    const voice = p.voice === 'none' ? 'ไม่มีเสียงพูด ใส่ line เป็นข้อความสั้นบนจอแทน' : `เสียงบรรยายพูดทับภาพ (${p.voicetype === 'male' ? 'ผู้ชาย' : 'ผู้หญิง'})`;
    return `รูปที่แนบคือสินค้าจริง: "${pr.title}"${pr.price ? ` ราคา ${pr.price}` : ''}${pr.desc ? `\nรายละเอียด: ${pr.desc}` : ''}${p.note ? `\nจุดเด่นที่อยากเน้น: ${p.note}` : ''}
เขียนบทคลิปขายของสั้น ${p.scenes} ฉาก รวมประมาณ ${p.scenes * 4} วินาที (คลิปที่ ${n} จาก ${p.clips} — ทุกคลิปต้องใช้มุมขายและประโยคเปิดคนละแบบ)
- ฉากแรกต้องเป็น hook ทำให้คนหยุดเลื่อนภายใน 2 วิ ฉากสุดท้ายชวน${p.shop === 'tiktok' ? 'กดตะกร้าเหลือง (คลิปลง TikTok Shop)' : p.shop === 'facebook' ? 'จิ้มป้ายสินค้าในคลิป (คลิปลง Facebook Reels)' : 'กดตะกร้า/ลิงก์'}
- โทน: ${T.tone[p.tone]} · ระดับภาษา: ${T.register[p.register]} · เขียนบทพูดเป็น${T.accent[p.accent]} · ${voice}
- ผู้แสดง: ${T.presence[p.presence]}
${p.style === 'review' ? `- แนวรีวิวเล่าเอง (kidza 13 พ.ย. ตามคลิปตัวอย่าง): ผู้หญิงเล่าเป็นประสบการณ์ตัวเองแบบเพื่อนเล่าให้ฟัง ใช้ "เรา" ลงท้าย "ค่ะ/นะคะ" ไล่เรื่อง: เปิด "รีวิว<ชื่อสินค้าสั้นๆ>" → ปัญหาที่เจอก่อนซื้อ → ตัดสินใจซื้อ/แอบลุ้นว่าจะดีไหม → ลองใช้จริง ชี้จุดเด่นทีละข้อ → สรุปว่าตรงปก ใช้งานได้จริง แนะนำใครที่... → ปิด "พิกัดแปะไว้ให้แล้ว"
- ทุกฉากเห็นแค่มือกำลังทำอะไรกับสินค้าจริงๆ (แกะกล่อง ประกอบ ใส่ของ เปิด-ปิด กด ลองใช้ เทียบก่อน-หลัง) ห้ามเห็นหน้า แต่ละฉากเป็นการกระทำคนละอย่าง ไม่ใช่ถือสินค้าเฉยๆ
- line แต่ละฉากต่อกันเป็นเรื่องเดียวลื่นๆ ไม่ขึ้นต้นใหม่ทุกฉาก
` : ''}- ห้ามอ้างสรรพคุณเกินจริง ห้ามเคลมรักษาโรค ห้ามแต่งตัวเลขยอดขาย/รีวิว
- line = บทพูดไทยไม่เกิน 20 คำ, overlay = คำโปรยตัวใหญ่บนจอ 2-5 คำ
- image_prompt และ motion เป็นภาษาอังกฤษ ฉากทุกฉากอยู่ที่ ${T.scene[p.scene]}
- product_look = บรรยายหน้าตาสินค้าในรูปเป็นภาษาอังกฤษละเอียดพอให้วาดซ้ำได้, presenter = หน้าตาผู้แสดงภาษาอังกฤษ (ไม่มีให้ใส่ "")
- caption = แคปชันโพสต์ TikTok/Reels 1-2 ประโยค, hashtags = 5-8 แท็ก
รูปแบบ: {"product_look":"","presenter":"","scenes":[{"line":"","overlay":"","image_prompt":"","motion":""}],"caption":"","hashtags":["#"]}`;
  }

  async edit(n, C) {
    const { W, H, p } = this;
    const fit = `scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},setsar=1`;
    const parts = [];
    for (const [i, s] of C.scenes.entries()) {
      this.check();
      const tag = `s${i + 1}`, out = this.f(`clip${n}`, 'cut', `${tag}.mp4`);
      parts.push(out);
      if (fs.existsSync(out)) continue;

      let audio = null, len = 3.5;
      if (p.voice !== 'none' && s.line) {
        audio = this.f(`clip${n}`, 'cut', `${tag}.mp3`);
        // เสียงหญิง Premwadee ฝั่ง Microsoft ตอบ NoAudioReceived แบบสุ่ม (12 พ.ย. พังติดกันทั้งชั่วโมง ฉากเงียบ) → ลอง 6 รอบ ไม่ได้ใช้ F5 เสียงหญิงในเครื่อง
        let ok = false;
        for (let k = 0; k < 6 && !ok; k++) {
          try { await run('python', ['-m', 'edge_tts', '--voice', VOICE[p.voicetype] || VOICE.female, '--rate=+12%', '--text', s.line, '--write-media', audio]); ok = fs.statSync(audio).size > 1000; }
          catch {}
          if (!ok) await new Promise((r) => setTimeout(r, 2000 + k * 1500));
        }
        if (!ok) ok = await f5Say(s.line, audio, p.voicetype === 'male' ? 'male' : 'female').catch(() => false);
        if (!ok) { this.log(`⚠️ พากย์ฉาก ${i + 1} ไม่ได้ (edge-tts และ F5)`); fs.rmSync(audio, { force: true }); audio = null; }
        if (audio) len = Math.max(len, (await dur(audio)) + 0.4);
      }
      const cap = this.f(`clip${n}`, 'cut', `${tag}.png`);
      fs.writeFileSync(cap, await this.renderPng({ kind: 'promo', w: W, h: H, sub: s.overlay, text: s.line }));

      const img = s.frame || p.product.file;
      const frames = Math.ceil(len * 30);
      const vin = s.video ? ['-i', s.video] : ['-i', img];
      const vf = s.video ? `${fit},fps=30,tpad=stop_mode=clone:stop_duration=${len.toFixed(2)}` : `scale=${W * 3}:${H * 3}:force_original_aspect_ratio=increase,crop=${W * 3}:${H * 3},setsar=1,zoompan=z='min(zoom+0.0012,1.2)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${frames}:s=${W}x${H}:fps=30`;
      const ain = audio ? ['-i', audio] : ['-f', 'lavfi', '-i', 'anullsrc=r=44100:cl=stereo'];
      await run('ffmpeg', ['-y', ...vin, '-i', cap, ...ain,
        '-filter_complex', `[0:v]${vf}[v];[v][1:v]overlay=0:0[o];[2:a]afade=t=in:d=0.03,afade=t=out:st=${(len - 0.06).toFixed(2)}:d=0.06[a]`, '-map', '[o]', '-map', '[a]',
        '-t', len.toFixed(2), '-r', '30', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', '-pix_fmt', 'yuv420p',
        '-c:a', 'aac', '-ar', '44100', '-ac', '2', out]);
    }

    // ฉากปิด: รูปสินค้าจริงบนพื้นขาว + ชื่อ ราคา ปุ่ม 2.5 วิ
    const card = this.f(`clip${n}`, 'cut', 'card.mp4');
    if (!fs.existsSync(card)) {
      const png = this.f(`clip${n}`, 'cut', 'card.png');
      fs.writeFileSync(png, await this.renderPng({ kind: 'card', w: W, h: H, text: p.product.title, price: p.product.price, cta: p.cta || 'กดตะกร้าเลย 🛒' }));
      const pw = Math.round(W * 0.82), ph = Math.round(H * 0.58);
      await run('ffmpeg', ['-y', '-f', 'lavfi', '-i', `color=c=white:s=${W}x${H}:r=30`, '-i', p.product.file, '-i', png,
        '-f', 'lavfi', '-i', 'anullsrc=r=44100:cl=stereo', '-filter_complex',
        `[1:v]scale=${pw}:${ph}:force_original_aspect_ratio=decrease[pi];[0:v][pi]overlay=(W-w)/2:${Math.round(H * 0.05)}+(${ph}-h)/2[b];[b][2:v]overlay=0:0,setsar=1[o]`,
        '-map', '[o]', '-map', '3:a', '-t', '2.5', '-r', '30', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', '-pix_fmt', 'yuv420p',
        '-c:a', 'aac', '-ar', '44100', '-ac', '2', card]);
    }
    parts.push(card);

    const list = this.f(`clip${n}`, 'cut', 'list.txt');
    fs.writeFileSync(list, parts.map((x) => `file '${x.replace(/\\/g, '/')}'`).join('\n'));
    const final = this.f('output', `clip${n}.mp4`);
    await run('ffmpeg', ['-y', '-f', 'concat', '-safe', '0', '-i', list, '-c', 'copy', '-movflags', '+faststart', final]);
    return final;
  }

  async coverShot(n, C) {
    const { W, H } = this;
    const src = C.scenes.find((s) => s.frame)?.frame || this.p.product.file;
    const png = this.f(`clip${n}`, 'cut', 'cover.png'), out = this.f('output', `clip${n}_cover.jpg`);
    fs.writeFileSync(png, await this.renderPng({ kind: 'promo', w: W, h: H, sub: C.scenes[0]?.overlay || this.p.product.title }));
    await run('ffmpeg', ['-y', '-i', src, '-i', png, '-filter_complex',
      `[0:v]scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H}[b];[b][1:v]overlay=0:0`, '-frames:v', '1', '-q:v', '2', out]);
    return out;
  }
}

module.exports = { ShopeePipeline, fetchProduct, STAGES };
