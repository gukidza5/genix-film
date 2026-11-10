// คลิปสรุปข่าว 1 นาที แนวการ์ตูนเวกเตอร์ (ลง Reels/TikTok)
// บท: Meta AI เขียนจากเนื้อข่าวที่วางมา (ห้ามแต่งเพิ่ม) → คนตรวจ/แก้ JSON → render.js วาดฉาก → เสียง edge-tts หรือ F5 (THAI SER) → build.py ประกอบ
// ผลลัพธ์เป็นโปรเจกต์ mode:'news' ใน GenixFilm/ → โผล่ในหน้า "โพสต์" อัตโนมัติ (output/ข่าว.mp4 + ข่าว_post.txt)
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { ask, gemini, hasGeminiKey } = require('./meta');
const comfy = require('./comfy');
const { LipSync } = require('./lipsync');

const DIR = path.join(__dirname, 'news');
const { AI, VO } = require('./paths');
const eleven = require('./eleven');
const SCENES = {
  intro: 'เปิดเรื่อง ตัวละครหญิงยืนหน้าจอห้องข่าว', arrest: 'หน้าบ้าน มีไมค์นักข่าว+ตำรวจ (จับกุม/บุกค้น)', charges: 'ห้องมืด ใช้กับ chips (ข้อหา/ประเด็น)',
  map: 'แผนที่ปักหมุด 4 จุด', money: 'ห้องข่าวโล่ง ใช้กับ card ตัวเลขใหญ่', personal: 'กระเป๋า+รถ+ตัวละคร (ใช้เงินผิดทาง) ใช้กับ card',
  freeze: 'บัญชีโดนล็อก 18 ใบ', court: 'ศาล + ตัวละครหญิงชาย', sorry: 'ตัวละครหญิงหน้าไมค์ (แถลง/ขอโทษ)', cta: 'มือถือ ? (ปิดท้ายถามคนดู)',
};
const EMO = ['ปกติ', 'โกรธ', 'โกรธแรง', 'ดีใจ', 'เศร้า', 'หงุดหงิด'];

function voices() {
  const list = [...(eleven.key() ? eleven.VOICES.map((v) => ({ id: 'eleven:' + v.id, name: v.name })) : []), { id: 'edge', name: 'Niwat (edge-tts ชาย)' }];
  try {
    for (const v of JSON.parse(fs.readFileSync(path.join(VO, 'refs', 'voices.json'), 'utf8'))) if (v.emo) list.push({ id: v.id, name: `${v.id} อายุ ${v.age}` });
  } catch {}
  return list;
}

async function writeScript(metaWin, text, bad = []) {
  const redo = bad.length ? `\nสำคัญ: รอบก่อนบทมีตัวเลข ${bad.join(', ')} ซึ่งไม่มีอยู่ในเนื้อข่าว ห้ามใช้ตัวเลขพวกนี้อีก ให้ตัดออก หรือใช้เฉพาะตัวเลขที่เขียนอยู่ในเนื้อข่าวจริง ๆ (ห้ามแปลงปี ห้ามคำนวณเลขใหม่)` : '';
  const spec = await ask(metaWin, `คุณคือคนเขียนบทคลิปสรุปข่าวแนวตั้ง 55–65 วินาที ภาษาไทย อ่านแล้วตื่นเต้นแบบข่าว
กฎเหล็ก: ใช้เฉพาะข้อเท็จจริง ตัวเลข วันที่ ที่อยู่ในเนื้อข่าวด้านล่างเท่านั้น ห้ามเดาหรือเติมเอง ห้ามเติมปีถ้าข่าวไม่ได้เขียนปี ห้ามคำนวณตัวเลขใหม่ (บวก ลบ แปลงหน่วย) ·${redo} คนที่ยังไม่มีคำพิพากษาให้เรียก "ผู้ต้องหา"/"ถูกกล่าวหา" และใช้ "ตำรวจแถลงว่า" กับตัวเลขของตำรวจ · ภาษาสุภาพ ไม่ใช้ กู/มึง
ทำ 8–10 ช็อต แต่ละช็อตเลือก scene จาก: ${Object.entries(SCENES).map(([k, v]) => `${k}=${v}`).join(' | ')}
ช่อง: head=หัวข้อบนจอสั้นๆ (ใช้ <b>คำ</b> ไฮไลต์เหลือง, <br> ขึ้นบรรทัด) · sub=ซับล่างสั้นๆ · tag=วันที่ (ถ้ามี) · chips=รายการสั้น 2–4 อัน (ถ้ามี) · card=[ป้าย, ตัวเลข, หน่วย] (ถ้าเป็นช็อตตัวเลข)
vo=คำพูดพากย์ ≤ 110 ตัวอักษร เขียนตัวเลขเป็นคำอ่าน · vo_el=เนื้อหาเดียวกับ vo ข้อเท็จจริงเดิมทุกตัว ห้ามเพิ่มข้อมูล แต่เล่าแบบผู้หญิงเม้าท์ข่าวกับเพื่อนสาว (แก / อะ / เลยนะ / จริงดิ) ใส่แท็กอารมณ์ภาษาอังกฤษในวงเล็บเหลี่ยมตรงจุดสำคัญ ช็อตละ 1–2 แท็ก เลือกจาก [excited] [whispers] [surprised] [laughs] [serious] [sighs] เขียนติดกันแบบภาษาพูดปกติ เว้นวรรคเฉพาะระหว่างวลี ห้ามเว้นวรรคทุกคำ (เน้นได้แค่ตัวเลขสำคัญ 1 จุด เช่น "ไม่เกิน ห้า เซนติเมตร") ≤ 130 ตัวอักษร · vo_f5=เหมือน vo แต่สะกดตัวย่อเป็นเสียงอ่าน (ปอศ.→ปอสอ, พ.ร.บ.→พอรอบอ) · emo=${EMO.join('/')} (ส่วนใหญ่ "โกรธ" ให้มีพลัง ตัวเลขช็อก "โกรธแรง" ข้อสงวนทางกฎหมาย "ปกติ")
img=ภาษาอังกฤษ บรรยายภาพถ่ายของช็อตนี้ (สถานที่ คน การกระทำ อารมณ์ มุมกล้อง) คนในภาพเป็นคนไทยทั่วไปไม่เหมือนคนจริง ห้ามมีตัวหนังสือในภาพ
person (ระดับบนสุด)=ชื่อคนดังที่เป็นตัวหลักของข่าว เฉพาะคนที่คนทั้งประเทศรู้จัก (ดารา นักร้อง อินฟลูดัง นักการเมือง นักกีฬา) เขียนแบบที่ค้นรูปเจอ เช่น "ชื่อเล่น ชื่อจริง นามสกุล" · ข่าวคนธรรมดา/ผู้ต้องหาทั่วไป/ไม่แน่ใจว่าดัง ใส่ "" · sfx เลือกจาก impact_big/whoosh_cine/whoosh_fast/popclick/bass_hit/hit_drum หรือ null · ช็อตแรกเปิดด้วยประโยคที่ทำให้อยากดูต่อ ช็อตสุดท้าย scene=cta ถามคนดูให้คอมเมนต์
ตอบเป็น JSON อย่างเดียว คั่นด้วย GENIX_START ... GENIX_END:
GENIX_START{"title":"","person":"","source":"ชื่อสำนักข่าว (วันที่)","caption":"แคปชันโพสต์ Reels: บรรทัดแรกพาดหัวดึงคน แล้วเล่าเนื้อหาข่าว 4–6 บรรทัด (ข้อเท็จจริงจากข่าวเท่านั้น) + บรรทัดถามคนดู + แฮชแท็ก 5–8 อัน (ชื่อคน/เรื่อง/#ข่าววันนี้ #สรุปข่าว) + บรรทัดที่มา","shots":[{"scene":"intro","tag":"","head":"","chips":[],"card":null,"sub":"","vo":"","vo_el":"","vo_f5":"","img":"","emo":"โกรธ","sfx":"impact_big"}]}GENIX_END

เนื้อข่าว:
${text}`, { want: 'json', timeoutMs: 240000 });
  if (!spec?.shots?.length) throw new Error('Meta ไม่ส่งบทกลับมา');
  return spec;
}

// วางลิงก์ข่าวแทนเนื้อข่าว: ดึงจาก JSON-LD (NewsArticle.articleBody) ที่เว็บข่าวไทยส่วนใหญ่มี ไม่มีค่อยเก็บ <p> ใน <article>
// shortcut: เว็บที่โหลดเนื้อหาด้วย JS ล้วน ๆ จะดึงไม่ได้ → ให้ก๊อปเนื้อข่าวมาวางเอง
async function fetchArticle(url) {
  if (!/^https?:\/\//i.test(url)) throw new Error('ลิงก์ข่าวต้องขึ้นต้นด้วย http');
  const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130 Safari/537.36' }, signal: AbortSignal.timeout(20000) });
  if (!r.ok) throw new Error(`เปิดหน้าข่าวไม่ได้ (${r.status})`);
  const html = await r.text();
  const unesc = (s) => s.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#(\d+);/g, (_, n) => String.fromCharCode(n)).replace(/[ \t]+/g, ' ').trim();
  let art = null;
  for (const m of html.matchAll(/<script[^>]*ld\+json[^>]*>([\s\S]*?)<\/script>/gi)) {
    let j; try { j = JSON.parse(m[1]); } catch { continue; }
    for (const x of [j, ...(Array.isArray(j) ? j : []), ...(j['@graph'] || [])].flat()) if (/Article/.test(x?.['@type']) && (x.articleBody || x.description)) art ||= x;
  }
  const host = new URL(url).hostname.replace(/^www\./, '');
  const meta = (p) => (html.match(new RegExp(`<meta[^>]+(?:property|name)="${p}"[^>]+content="([^"]*)"`, 'i')) || [])[1] || '';
  const title = unesc(art?.headline || meta('og:title'));
  let body = unesc(art?.articleBody || '');
  if (body.length < 200) {
    const scope = (html.match(/<article[\s\S]*?<\/article>/i) || [html])[0];
    body = [...scope.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi)].map((m) => unesc(m[1])).filter((t) => t.length > 40).join('\n');
  }
  if (body.length < 200) throw new Error('ดึงเนื้อข่าวจากลิงก์นี้ไม่ได้ ก๊อปเนื้อข่าวมาวางเองแทน');
  const date = (art?.datePublished || meta('article:published_time') || '').slice(0, 10);
  const pub = art?.publisher?.name || host;
  return `ที่มา: ${pub} (${host}) ${date}\nหัวข้อ: ${title}\n\n${body}`.slice(0, 12000);
}

// ลิงก์โพสต์เฟส: เฟสไม่ให้อ่านถ้าไม่ล็อกอิน → เปิดใน Chrome ของแอป (ล็อกอินเฟสไว้) อ่านข้อความโพสต์
// เพจข่าวชอบเขียนสั้น ๆ แล้วแปะลิงก์ข่าวเต็มในคอมเมนต์ตัวเอง → ตามลิงก์นั้นไปดึงเนื้อข่าวเต็มมาต่อท้าย
async function fetchFacebook(url, flow) {
  await flow.connect();
  const page = await flow.browser.contexts()[0].newPage(); // แท็บแยก ไม่ไปทับแท็บที่บอทใช้โพสต์
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    await page.locator('[data-ad-preview="message"], [data-ad-comet-preview="message"]').first().waitFor({ timeout: 20000 }).catch(() => {});
    await page.waitForTimeout(2500); // รอคอมเมนต์โหลด
    const r = await page.evaluate(() => {
      const author = document.title.replace(/^\(\d+\)\s*/, '').split(' - ')[0].trim();
      const msg = document.querySelector('[data-ad-preview="message"], [data-ad-comet-preview="message"]')?.innerText || '';
      const out = (a) => { try { const u = new URL(a.href); const v = u.hostname.startsWith('l.facebook.com') ? u.searchParams.get('u') : a.href; return v && !/facebook\.com|fb\.me/.test(new URL(v).hostname) ? v : null; } catch { return null; } };
      const mine = [...document.querySelectorAll('[role=article]')].filter((e) => !e.getAttribute('aria-label') || e.getAttribute('aria-label').includes(author));
      const link = mine.flatMap((e) => [...e.querySelectorAll('a[href]')].map(out)).find(Boolean)
        || mine.map((e) => (e.innerText.match(/https?:\/\/[^\s]+/) || [])[0]).find((v) => v && !/facebook\.com/.test(v));
      return { author, msg, link };
    });
    if (!r.msg && !r.link) throw new Error(/login/.test(page.url()) ? 'Chrome ของแอปยังไม่ได้ล็อกอินเฟส' : 'อ่านโพสต์เฟสนี้ไม่ได้ ก๊อปเนื้อข่าวมาวางเองแทน');
    let full = '';
    if (r.link) full = await fetchArticle(r.link).catch(() => '');
    const head = `ที่มา: โพสต์เฟสเพจ ${r.author}\n\n${r.msg.trim()}`;
    return (full ? `${head}\n\n--- ข่าวเต็มจากลิงก์ในโพสต์ ---\n${full}` : head).slice(0, 12000);
  } finally { await page.close().catch(() => {}); }
}

// เพจเฟส (ข่าวอัตโนมัติ): เปิดหน้าเพจใน Chrome ของแอป (ล็อกอินเฟสไว้) เลื่อนลงนิดหน่อย เก็บลิงก์โพสต์ล่าสุด
// shortcut: อ่านแค่โพสต์ที่โหลดมาตอนเลื่อน 3 รอบ (~10 โพสต์) พอสำหรับรอบละ 2 ชม.
async function fbPagePosts(pageUrl, flow, max = 10) {
  await flow.connect();
  const page = await flow.browser.contexts()[0].newPage();
  try {
    await page.goto(pageUrl, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(4000);
    if (/login|checkpoint/.test(page.url())) throw new Error('Chrome ของแอปยังไม่ได้ล็อกอินเฟส');
    // ฟีดเฟสโหลดทีละช่วงแล้วเคลียร์ของเก่า → เก็บสะสมทุกครั้งที่เลื่อน · เอาเฉพาะโพสต์ที่มีข้อความ (คลิป/รีลที่แคปชันสั้นข้าม)
    const got = new Map();
    let name = '';
    for (let i = 0; i < 8 && got.size < max; i++) {
      const r = await page.evaluate(() => [...document.querySelectorAll('[aria-posinset]')].map((e) => ({
        msg: e.querySelector('[data-ad-preview="message"], [data-ad-comet-preview="message"]')?.innerText || '',
        href: [...e.querySelectorAll('a[href]')].map((a) => a.href).find((h) => /\/posts\/pfbid|\/posts\/\d|story_fbid|\/videos\/\d|reel\/\d/.test(h)) || '',
        who: (e.querySelector('[data-ad-rendering-role="profile_name"], h2, h3')?.innerText || '').trim(),
      })));
      for (const p of r) {
        if (p.href && p.msg.length > 60) got.set(p.href.replace(/[?&]__cft__.*$/, '').split('?comment')[0], p.msg);
        if (p.who) name ||= p.who; // หน้าเพจไม่มีชื่อใน title/h1 → เอาจากหัวโพสต์ของเพจเอง
      }
      await page.mouse.wheel(0, 2500); await page.waitForTimeout(2000);
    }
    const out = [...got.keys()].slice(0, max);
    out.pageName = name.split('\n')[0].trim(); // ชื่อเพจไว้ใส่บรรทัดที่มา
    return out;
  } finally { await page.close().catch(() => {}); }
}

function sh(cmd, args, opts, log) {
  return new Promise((res, rej) => {
    const p = spawn(cmd, args, { windowsHide: true, ...opts, env: { ...process.env, PYTHONIOENCODING: 'utf-8', ...(opts?.env || {}) } });
    let err = '';
    p.stdout.on('data', (d) => String(d).split('\n').filter((l) => /^(shot|ok|FAIL|done)/.test(l)).forEach((l) => log('   ' + l.trim())));
    p.stderr.on('data', (d) => (err += d));
    p.on('close', (c) => (c ? rej(new Error(`${path.basename(args[0] || cmd)} พัง: ${err.slice(-400)}`)) : res()));
  });
}

// ฉากอนิเมะ (Z-Image ใน ComfyUI ฟรี ~8 วิ/ภาพ) ทับ bg_k.png ของ render.js · พังช็อตไหนก็ใช้ฉากเวกเตอร์เดิมช็อตนั้น
const ANIME = 'anime illustration, Japanese TV anime style, cel shading, clean line art, vibrant colors, cinematic composition, vertical. Generic anime characters, not resembling any real person. No text, no letters, no watermark. ';
const SCENE_EN = {
  intro: 'a female anime news reporter in a modern TV newsroom with screens behind', arrest: 'police officers raiding a house, reporters with microphones and camera flashes',
  charges: 'dark dramatic room, legal documents and handcuffs on a table, moody light', map: 'top-down anime city map of Thailand with glowing location pins',
  money: 'stacks of Thai baht banknotes on a desk in a dim office', personal: 'luxury handbags and an expensive car, suspicious mood',
  freeze: 'bank cards and a laptop screen showing a locked padlock icon', court: 'anime courtroom with a judge bench and lawyers',
  sorry: 'a person bowing at a press conference with many microphones', cta: 'a hand holding a smartphone, question mark mood, cozy lighting',
};
async function animeScenes(dir, spec, log) {
  if (!fs.existsSync(path.join(AI, 'ComfyUI_windows_portable'))) return log('ℹ️ เครื่องนี้ไม่มี ComfyUI ใช้ฉากเวกเตอร์'), 0;
  log('🎨 วาดฉากอนิเมะ (ComfyUI ในเครื่อง)');
  let ok = 0;
  for (const [k, s] of spec.shots.entries()) {
    const raw = path.join(dir, 'tmp', `anime_${k}.png`), bg = path.join(dir, 'shots', `bg_${k}.png`);
    try {
      fs.mkdirSync(path.dirname(raw), { recursive: true });
      await comfy.generate({ kind: 'image', prompt: ANIME + (s.img || SCENE_EN[s.scene] || s.head || ''), aspect: '9:16', out: raw, log });
      // มืดลงนิดหน่อย + ขอบเข้ม ให้ตัวหนังสือขาวบนภาพอ่านออก
      await sh('ffmpeg', ['-v', 'error', '-y', '-i', raw, '-vf', 'scale=1080:1920,eq=brightness=-0.06:saturation=1.05,vignette=PI/4.5', bg], {}, log);
      ok++; log(`   ok ฉาก ${k + 1}/${spec.shots.length}`);
    } catch (e) { log(`   ⚠️ ฉาก ${k + 1} ใช้แบบเวกเตอร์ (${e.message.slice(0, 80)})`); }
  }
  await comfy.free(); // คืนการ์ดจอให้ F5/MuseTalk
  return ok;
}

// ผู้ประกาศปากขยับ (MuseTalk) วงกลมมุมขวาบน · ไม่มี MuseTalk/การ์ดจอไม่ว่าง = ใช้รูปนิ่งในวงกลมแทน
async function addAnchor(dir, face, src, out, { log, gpuBusy }) {
  const sq = "crop=w='min(iw,ih)*0.8':h='min(iw,ih)*0.8':x='(iw-ow)/2':y=0,scale=512:512";
  let talk = null;
  if (LipSync.installed() && !gpuBusy()) {
    const ls = new LipSync(log);
    try {
      // วิดีโอนิ่งของหน้า (MuseTalk แคชตามไฟล์+เวลาแก้ไข → ทำใหม่เฉพาะตอนเปลี่ยนหน้า)
      const m = Math.floor(fs.statSync(face).mtimeMs);
      let av = path.join(path.dirname(face), `anchor_live_${m}.mp4`);
      // ท่าขยับ (หัว/ไหล่/กระพริบตา) จาก Wan I2V ทำครั้งเดียวต่อหน้า แล้ว MuseTalk ขยับปากทับ (kidza 10 พ.ย.: รูปนิ่งแข็งเป็นหิน)
      if (!fs.existsSync(av)) {
        try {
          log('🧍 ทำท่าขยับให้ผู้ประกาศ (ครั้งเดียวต่อหน้า ~2–4 นาที)');
          const raw = av.replace(/\.mp4$/, '_raw.mp4');
          await comfy.generate({ kind: 'video', image: face, seconds: 5, aspect: '1:1', out: raw, log,
            motion: 'A news anchor sitting still at the desk looking at the camera, natural idle movement: gentle slight head tilts and small nods, natural eye blinks, subtle breathing and shoulder movement, lips closed, calm friendly expression, static camera, same framing' });
          await comfy.free();
          // เล่นไป-กลับ ให้วนลูปไม่กระตุก
          await sh('ffmpeg', ['-v', 'error', '-y', '-i', raw, '-filter_complex', `[0:v]fps=25,${sq},split[a][b];[b]reverse[r];[a][r]concat=n=2:v=1[v]`, '-map', '[v]', '-pix_fmt', 'yuv420p', av], {}, log);
          fs.rmSync(raw, { force: true });
        } catch (e) { fs.rmSync(av, { force: true }); log('⚠️ ทำท่าขยับไม่ได้ ใช้หน้านิ่งไปก่อน: ' + e.message.slice(0, 150)); }
      }
      if (!fs.existsSync(av)) {
        av = path.join(path.dirname(face), `anchor_${m}.mp4`);
        if (!fs.existsSync(av)) await sh('ffmpeg', ['-v', 'error', '-y', '-loop', '1', '-i', face, '-t', '4', '-r', '25', '-vf', sq, '-pix_fmt', 'yuv420p', av], {}, log);
      }
      await ls.start(av);
      log('👄 ผู้ประกาศพูดตามเสียงพากย์');
      talk = path.join(dir, 'tmp', 'anchor_talk.mp4');
      await ls.speak(path.join(dir, 'tmp', 'vo_track.wav'), talk, 600000);
    } catch (e) { talk = null; log('⚠️ ผู้ประกาศปากขยับไม่ได้ ใช้รูปนิ่งแทน: ' + e.message.slice(0, 150)); }
    finally { ls.stop(); }
  }
  // กรอบสี่เหลี่ยม 3:4 ขอบทอง มุมขวาล่าง (kidza ขอ 9 พ.ย.) — ซับย้ายขึ้นไป 1150 ใน render.js
  const W = 360, H = 480, R = 8;
  const x = 1080 - W - 2 * R - 30, y = 1920 - H - 2 * R - 60;
  const vin = talk ? ['-i', talk] : ['-loop', '1', '-i', face];
  const crop = talk ? "crop=w='ih*3/4':h=ih" : "crop=w='min(iw,ih*3/4)':h='min(iw,ih*3/4)*4/3':x='(iw-ow)/2':y=0";
  const fc = `[1:v]${crop},scale=${W}:${H},pad=${W + 2 * R}:${H + 2 * R}:${R}:${R}:color=0xffd84a[f];[0:v][f]overlay=${x}:${y}:eof_action=repeat:shortest=${talk ? 0 : 1}[v]`;
  await sh('ffmpeg', ['-v', 'error', '-y', '-i', src, ...vin, '-filter_complex', fc, '-map', '[v]', '-map', '0:a', '-c:v', 'libx264', '-crf', '20', '-pix_fmt', 'yuv420p', '-c:a', 'copy', '-shortest', out], {}, log);
  return out;
}

const probe = (f) => new Promise((res) => {
  const p = spawn('ffprobe', ['-v', 'error', '-select_streams', 'v', '-show_entries', 'stream=width,height', '-of', 'csv=p=0', f], { windowsHide: true });
  let o = ''; p.stdout.on('data', (d) => (o += d)); p.on('close', () => { const [w, h] = o.trim().split(',').map(Number); res({ w, h }); });
});

// ข่าวคนดัง: ค้นรูปตามชื่อใน Bing (ผ่าน Chrome ของแอป) → Gemini คัดเฉพาะรูปของคนที่ซ้ำกันมากสุด ไม่มีตัวหนังสือ/โลโก้
// ต้องมีคีย์ Gemini (ไม่มีตัวคัด = ไม่เสี่ยงเอารูปคนผิดมาใช้) · ได้ไม่ถึง 3 รูป = คืน [] ไปใช้รูป AI
async function celebPhotos(dir, name, flow, log) {
  if (!flow || !hasGeminiKey()) return [];
  log(`🔎 ค้นรูป ${name}`);
  await flow.connect();
  const page = await flow.browser.contexts()[0].newPage();
  let urls = [];
  try {
    await page.goto(`https://www.bing.com/images/search?q=${encodeURIComponent(name)}&qft=+filterui:imagesize-large&form=IRFLTR`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3500);
    urls = await page.evaluate(() => [...document.querySelectorAll('a.iusc')].map((a) => { try { return JSON.parse(a.getAttribute('m')).murl; } catch { return null; } }).filter(Boolean));
  } finally { await page.close().catch(() => {}); }
  const cd = path.join(dir, 'celeb'), cand = [];
  fs.mkdirSync(cd, { recursive: true });
  for (const [i, u] of urls.slice(0, 24).entries()) {
    if (cand.length >= 12) break;
    try {
      const r = await fetch(u, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130 Safari/537.36' }, signal: AbortSignal.timeout(12000) });
      if (!r.ok) continue;
      const raw = path.join(cd, `r${i}`);
      fs.writeFileSync(raw, Buffer.from(await r.arrayBuffer()));
      const { w, h } = await probe(raw);
      if (!(Math.min(w, h) >= 500) || w / h > 1.9) continue;
      const jpg = path.join(cd, `c${cand.length}.jpg`);
      await sh('ffmpeg', ['-v', 'error', '-y', '-i', raw, '-vf', "scale='min(1600,iw)':-2", '-frames:v', '1', '-q:v', '3', jpg], {}, log);
      cand.push(jpg);
    } catch {}
  }
  if (cand.length < 3) return log(`   เจอรูปใช้ได้แค่ ${cand.length} รูป`), [];
  log(`🧐 ให้ AI คัดรูป ${cand.length} รูป`);
  const r = await gemini(`รูปที่แนบ ${cand.length} รูป (เลข 0 ถึง ${cand.length - 1} ตามลำดับ) ได้มาจากการค้นชื่อ "${name}"
1) หาคนที่ปรากฏซ้ำมากที่สุด (คนหลักของการค้น) ถ้าไม่มีหน้าคนเดียวกันซ้ำอย่างน้อย 3 รูป ตอบ {"keep":[]}
2) keep = เลขรูปที่เป็นคนหลักคนนั้นแน่ ๆ และเป็นรูปถ่ายจริงชัด เห็นหน้าชัด ไม่มีตัวหนังสือ/โลโก้/ลายน้ำ/กรอบ/พาดหัวข่าว ไม่ใช่ภาพตัดต่อหลายช่อง ไม่มีคนอื่นเด่นกว่า ไม่โป๊/ไม่ล่อแหลม เรียงจากรูปชัดสวยที่สุด
ตอบ JSON {"keep":[เลข]}`, cand, 120000).catch((e) => (log('⚠️ AI คัดรูปไม่ได้: ' + e.message.slice(0, 120)), null));
  const keep = [...new Set((r?.keep || []).map(Number))].filter((i) => cand[i]).map((i) => cand[i]);
  return keep.length >= 3 ? keep : (log(`   รูปผ่านแค่ ${keep.length} รูป ไม่พอ`), []);
}

// ข่าวคนธรรมดา: ภาพสมจริงจาก Z-Image ตามคำบรรยายช็อต (img) · คนในภาพเป็นคนทั่วไป ไม่เหมือนคนจริง
const REAL = 'realistic photograph, photojournalism, natural light, DSLR, shallow depth of field, vertical frame. Ordinary Thai people, faces not resembling any real person. No text, no letters, no watermark, no logo. ';
async function realPhotos(dir, spec, log) {
  if (!fs.existsSync(path.join(AI, 'ComfyUI_windows_portable'))) return [];
  log('📷 ทำภาพสมจริงด้วย AI (ComfyUI ในเครื่อง)');
  const out = [];
  for (const [k, s] of spec.shots.entries()) {
    const f = path.join(dir, 'tmp', `real_${k}.png`);
    fs.mkdirSync(path.dirname(f), { recursive: true });
    try { await comfy.generate({ kind: 'image', prompt: REAL + (s.img || s.head || ''), aspect: '9:16', out: f, log }); out[k] = f; log(`   ok ภาพ ${k + 1}/${spec.shots.length}`); }
    catch (e) { log(`   ⚠️ ภาพ ${k + 1}: ${e.message.slice(0, 80)}`); }
  }
  await comfy.free();
  return out;
}
// รูปไหนก็ได้ → พื้น 1080x1920 · รูปแนวตั้งครอบเต็มจอ · รูปแนวนอนวางกลางสูง 1150 บนพื้นรูปเดียวกันเบลอ
async function photoFrame(src, out, log) {
  const { w, h } = await probe(src);
  const fc = h / w >= 1.1 // แนวตั้งนิด ๆ (3:4, 4:5) ก็ครอบเต็มจอ ตัดข้างนิดเดียว เหมือนคลิปต้นแบบ
    ? "[0]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920:(iw-ow)/2:(ih-oh)/3"
    : "[0]split[a][b];[a]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,boxblur=28:2,eq=brightness=-0.18[bg];[b]scale=-2:1150,crop='min(iw,1080)':1150[fg];[bg][fg]overlay=(W-w)/2:(H-h)/2";
  await sh('ffmpeg', ['-v', 'error', '-y', '-i', src, '-filter_complex', fc, '-frames:v', '1', out], {}, log);
}

// spec ที่ตรวจแล้ว → โปรเจกต์ใหม่ใน root, คืน dir
async function make(root, spec, voice, { log, gpuBusy, flow }) {
  for (const s of spec.shots) if (!SCENES[s.scene]) throw new Error(`ไม่มีฉาก "${s.scene}" (มี: ${Object.keys(SCENES).join(', ')})`);
  const stamp = new Date().toISOString().slice(0, 19).replace(/[T:]/g, '-');
  const dir = path.join(root, `${stamp}-news`);
  fs.mkdirSync(path.join(dir, 'output'), { recursive: true });
  spec = { voice: 'th-TH-NiwatNeural', rate: '+8%', f5_speed: 1.1, ...spec };
  // แบบหลัก (kidza 10 พ.ย. ตามคลิปเพจเล่าข่าวคดีดัง): รูปเต็มจอ ซูมช้า เฟดดำ เสียงเล่าล้วน ไม่มีตัวหนังสือ/ผู้ประกาศ
  // ข่าวคนดัง = รูปจริงค้นตามชื่อ · คนธรรมดา = ภาพ AI สมจริง (ไม่ค้นหน้าคนธรรมดา กันได้หน้าคนผิด) · ไม่มี ComfyUI = แบบเดิม อนิเมะ/เวกเตอร์+ผู้ประกาศ
  // ไม่เคยดึงรูปจากโพสต์ข่าว: ส่วนใหญ่เป็นการ์ดมีพาดหัว และเคยหลุดรูปคนที่ไม่เกี่ยวข้องมา (10 พ.ย.)
  fs.mkdirSync(path.join(dir, 'shots'), { recursive: true });
  let pick = null;
  const celeb = spec.person ? await celebPhotos(dir, spec.person, flow, log).catch((e) => (log('⚠️ ค้นรูปไม่ได้: ' + e.message.slice(0, 120)), [])) : [];
  if (celeb.length) { log(`🖼️ ใช้รูปจริงของ ${spec.person} ${celeb.length} รูป`); pick = (k) => celeb[k % celeb.length]; }
  else {
    const real = await realPhotos(dir, spec, log).catch(() => []);
    if (real.some(Boolean)) pick = (k) => real[k] || real.find(Boolean);
  }
  if (pick) {
    spec.style = 'photo';
    for (const k of spec.shots.keys()) await photoFrame(pick(k), path.join(dir, 'shots', `bg_${k}.png`), log);
  }
  fs.writeFileSync(path.join(dir, 'spec.json'), JSON.stringify(spec, null, 1));
  fs.writeFileSync(path.join(dir, 'project.json'), JSON.stringify({ title: spec.title || 'สรุปข่าว', mode: 'news', created: Date.now(), voice }, null, 2));

  if (!pick) {
    log('🎨 วาดฉาก');
    await sh('node', [path.join(DIR, 'render.js'), path.join(dir, 'spec.json'), path.join(dir, 'shots')], {}, log);
    await animeScenes(dir, spec, log).catch((e) => log('⚠️ ฉากอนิเมะไม่ได้ ใช้แบบเวกเตอร์: ' + e.message));
  }
  let sub = '';
  if (voice.startsWith('eleven:')) {
    log('🎙️ พากย์ด้วย ElevenLabs (Mali เม้าท์)');
    try {
      fs.mkdirSync(path.join(dir, 'el'), { recursive: true });
      for (const [k, s] of spec.shots.entries()) {
        const mp3 = path.join(dir, 'el', `vo${k}.mp3`), wav = path.join(dir, 'el', `vo${k}.wav`);
        if (!fs.existsSync(wav)) {
          await eleven.tts(s.vo_el || s.vo, mp3, voice.slice(7));
          await sh('ffmpeg', ['-v', 'error', '-y', '-i', mp3, '-ar', '44100', wav], {}, log);
        }
      }
      sub = 'el';
    } catch (e) { log('⚠️ ElevenLabs ไม่ได้ ใช้เสียง Niwat แทน: ' + e.message.slice(0, 200)); voice = 'edge'; }
  } else if (voice !== 'edge') {
    log(`🎙️ พากย์ด้วย ${voice}${gpuBusy() ? ' (CPU เพราะการ์ดจอทำละครอยู่ — ช้าหน่อย)' : ''}`);
    sub = 'f5';
    await sh('python', [path.join(DIR, 'f5job.py'), dir, voice, sub], {}, log);
    await sh(path.join(VO, 'venv', 'Scripts', 'python.exe'), ['-X', 'utf8', path.join(VO, 'genix_tts.py'), path.join(dir, sub, 'jobs.json')],
      { cwd: VO, env: gpuBusy() ? { CUDA_VISIBLE_DEVICES: '' } : {} }, log);
    const miss = spec.shots.map((_, k) => k).filter((k) => !fs.existsSync(path.join(dir, sub, `vo${k}.wav`)));
    if (miss.length) throw new Error(`F5 พากย์ไม่ออก ช็อต ${miss.map((k) => k + 1).join(', ')} — ลองเลือกเสียง Niwat`);
  } else log('🎙️ พากย์ด้วย Niwat');
  log('🎬 ประกอบคลิป');
  await sh('python', [path.join(DIR, 'build.py'), dir, ...(sub ? [sub] : [])], {}, log);
  const built = path.join(dir, sub ? `out_${sub}.mp4` : 'out.mp4');
  if (spec.anchor && fs.existsSync(spec.anchor)) { // ผู้ประกาศมุมขวาล่างทุกแบบ (kidza 10 พ.ย. ขอคืนหลังเปลี่ยนเป็นแบบรูปเต็มจอ)
    try { await addAnchor(dir, spec.anchor, built, path.join(dir, 'output', 'ข่าว.mp4'), { log, gpuBusy }); }
    catch (e) { log('⚠️ ใส่ผู้ประกาศไม่ได้: ' + e.message.slice(0, 200)); fs.copyFileSync(built, path.join(dir, 'output', 'ข่าว.mp4')); }
  } else fs.copyFileSync(built, path.join(dir, 'output', 'ข่าว.mp4'));
  fs.writeFileSync(path.join(dir, 'output', 'ข่าว_post.txt'), spec.caption || `${spec.title}\n\n#สรุปข่าว #ข่าววันนี้\nที่มา: ${spec.source || ''}`);
  log('✅ เสร็จ: ' + path.join(dir, 'output', 'ข่าว.mp4'));
  return dir;
}

module.exports = { voices, writeScript, make, fetchArticle, fetchFacebook, fbPagePosts, SCENES, animeScenes, addAnchor };
