// เครื่องเพื่อนใส่คีย์เองในแอป → userData/gemini.key · ไม่มีค่อยใช้ gemini.key ข้างโค้ด (เครื่อง kidza, ไม่ขึ้น GitHub)
// shortcut: เดา DOM แบบกว้าง ๆ (textarea/contenteditable, img/video ใหม่) ถ้า Meta เปลี่ยนหน้าเว็บจนพังค่อยมาแก้ selector ตรงนี้
const { session } = require('electron');

const URL_HOME = 'https://www.meta.ai/';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const START = 'GENIX_START', END = 'GENIX_END';

async function waitFor(win, expr, ms) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    try { if (await win.webContents.executeJavaScript(expr)) return true; } catch {}
    await sleep(800);
  }
  return false;
}

const SNAP = `(() => ({
  text: document.body.innerText,
  imgs: [...document.querySelectorAll('img')].filter(i => i.naturalWidth >= 400).map(i => i.currentSrc || i.src),
  vids: [...document.querySelectorAll('video')].map(v => v.currentSrc || v.src || (v.querySelector('source') || {}).src).filter(Boolean),
}))()`;

// ดึง JSON ก้อนสุดท้ายที่อยู่ระหว่าง GENIX_START ... GENIX_END (ก้อนแรกคือข้อความที่เราพิมพ์เอง parse ไม่ผ่านอยู่แล้ว)
function extractJson(text) {
  const s = text.lastIndexOf(START);
  if (s < 0) return null;
  const e = text.indexOf(END, s);
  if (e < 0) return null;
  const body = text.slice(s + START.length, e);
  const a = body.search(/[[{]/), b = Math.max(body.lastIndexOf('}'), body.lastIndexOf(']'));
  if (a < 0 || b < a) return null;
  try { return JSON.parse(body.slice(a, b + 1)); } catch { return null; }
}

async function send(win, prompt) {
  const wc = win.webContents;
  const ok = await waitFor(win, `!!document.querySelector('textarea, [contenteditable="true"]')`, 30000);
  if (!ok) throw new Error('หาช่องพิมพ์ Meta AI ไม่เจอ — กด "เปิด Meta AI" แล้วล็อกอินก่อน');
  await wc.executeJavaScript(`(() => { const el = document.querySelector('textarea, [contenteditable="true"]'); el.focus(); return true; })()`);
  await wc.insertText(prompt);
  await sleep(600);
  for (const type of ['keyDown', 'char', 'keyUp']) wc.sendInputEvent({ type, keyCode: type === 'char' ? '\r' : 'Return' });
  await sleep(1500);
  // Enter ไม่ส่ง (บางหน้า Enter = ขึ้นบรรทัด) → กดปุ่มส่งแทน
  await wc.executeJavaScript(`(() => {
    const el = document.querySelector('textarea, [contenteditable="true"]');
    if (!el || !(el.value || el.innerText || '').trim()) return;
    const b = [...document.querySelectorAll('[aria-label], button')].find(x => /send|ส่ง/i.test(x.getAttribute('aria-label') || ''));
    if (b) b.click();
  })()`);
}

/**
 * ask(win, prompt, { want: 'json'|'image'|'video', timeoutMs, isStopped })
 * json  → คืน object ที่ parse แล้ว
 * image/video → คืน array ของ URL สื่อที่เพิ่งโผล่
 */
async function ask(win, prompt, { want = 'json', timeoutMs = 180000, isStopped = () => false, files = [] } = {}) {
  if (want === 'json' && engine() === 'gemini') return gemini(prompt, files, timeoutMs);
  await win.loadURL(URL_HOME).catch(() => {});
  await sleep(2500);
  if (files.length) await attach(win, files);
  const before = await win.webContents.executeJavaScript(SNAP).catch(() => ({ imgs: [], vids: [] }));
  const seen = new Set([...before.imgs, ...before.vids]);
  const full = want === 'json'
    ? `${prompt}\n\nตอบเป็น JSON อย่างเดียว ห้ามมีคำอธิบาย ขึ้นต้นด้วยคำว่า ${START} แล้วตามด้วย JSON แล้วปิดท้ายด้วยคำว่า ${END}`
    : prompt;
  await send(win, full);

  const t0 = Date.now();
  let last = '', stable = 0;
  while (Date.now() - t0 < timeoutMs) {
    if (isStopped()) throw new Error('STOPPED');
    await sleep(2000);
    const s = await win.webContents.executeJavaScript(SNAP).catch(() => null);
    if (!s) continue;
    if (want === 'json') {
      const j = extractJson(s.text);
      stable = j && s.text === last ? stable + 1 : 0;
      last = s.text;
      if (j && stable >= 2) return j;
    } else {
      const fresh = (want === 'image' ? s.imgs : s.vids).filter((u) => !seen.has(u));
      const key = fresh.join('|');
      stable = fresh.length && key === last ? stable + 1 : 0;
      last = key;
      if (stable >= 3) return fresh;
    }
  }
  // แนบท้ายข้อความที่ Meta ตอบจริงไว้ใน error: ปฏิเสธ/ขอล็อกอิน/ตอบไม่มี GENIX_START จะได้รู้ว่าเพราะอะไร (12 พ.ย.)
  const tail = want === 'json' ? String(last || '').replace(/\s+/g, ' ').trim().slice(-160) : '';
  throw new Error(`Meta AI ไม่ตอบภายใน ${Math.round(timeoutMs / 1000)} วิ${tail ? ` — ท้ายหน้า Meta: "${tail}"` : ''}`);
}

// แนบรูป (เช่น รูปสินค้าจริง) เข้าช่องอัปโหลดของ Meta AI ผ่าน DevTools protocol
// shortcut: หา input[type=file] ตัวแรกในหน้า ถ้า Meta เปลี่ยน DOM จนแนบไม่ติด → คืน false แล้วไปต่อแบบข้อความล้วน
async function attach(win, files) {
  const dbg = win.webContents.debugger;
  try {
    if (!dbg.isAttached()) dbg.attach('1.3');
    const { root } = await dbg.sendCommand('DOM.getDocument', { depth: -1, pierce: true });
    const { nodeId } = await dbg.sendCommand('DOM.querySelector', { nodeId: root.nodeId, selector: 'input[type=file]' });
    if (!nodeId) return false;
    await dbg.sendCommand('DOM.setFileInputFiles', { nodeId, files });
    await sleep(4000); // รอรูปอัปขึ้นก่อนพิมพ์
    return true;
  } catch { return false; } finally { try { dbg.detach(); } catch {} }
}

// โหลดไฟล์จาก URL ด้วยคุกกี้ของ Meta (blob: ต้องอ่านในหน้าเว็บเอง)
async function download(win, url) {
  if (/^https?:/.test(url)) {
    const r = await session.fromPartition('persist:meta').fetch(url);
    if (!r.ok) throw new Error(`โหลดไฟล์ไม่ได้ ${r.status}`);
    return Buffer.from(await r.arrayBuffer());
  }
  const dataUrl = await win.webContents.executeJavaScript(`fetch(${JSON.stringify(url)}).then(r => r.blob()).then(b => new Promise(res => { const f = new FileReader(); f.onload = () => res(f.result); f.readAsDataURL(b); }))`);
  return Buffer.from(dataUrl.split(',')[1], 'base64');
}

// ---- Gemini API (งานเขียนบท/JSON เท่านั้น รูป/วิดีโอยังไป Meta) ----
// คีย์อยู่ gemini.key ข้างโค้ด · ตัวเลือก meta/gemini เก็บใน userData/ai.json
const fs = require('fs');
const path = require('path');
const KEY_FILE = path.join(__dirname, 'gemini.key');
// ลองตามลำดับ รุ่นแรกล่ม (503/429/ค้าง) ข้ามไปรุ่นถัดไป · 8 พ.ย. flash-latest/3.8 ค้าง 3.5 ตอบ 3 วิ
const MODELS = ['gemini-3.5-flash', 'gemini-3.1-flash-lite', 'gemini-flash-latest'];
const userKeyFile = () => path.join(require('electron').app.getPath('userData'), 'gemini.key');
const readKey = (f) => { try { return fs.readFileSync(f, 'utf8').replace(/^\uFEFF/, '').trim(); } catch { return ''; } };
const geminiKey = () => readKey(userKeyFile()) || readKey(KEY_FILE);
const setGeminiKey = (k) => { k = String(k || '').trim(); if (k) fs.writeFileSync(userKeyFile(), k); else fs.rmSync(userKeyFile(), { force: true }); return !!geminiKey(); };
const aiFile = () => path.join(require('electron').app.getPath('userData'), 'ai.json');
function engine(set) {
  if (set) fs.writeFileSync(aiFile(), JSON.stringify({ engine: set }));
  try { return JSON.parse(fs.readFileSync(aiFile(), 'utf8')).engine; } catch { return geminiKey() ? 'gemini' : 'meta'; }
}

async function gemini(prompt, files = [], timeoutMs = 180000) {
  const key = geminiKey();
  if (!key) throw new Error('ไม่มีคีย์ Gemini — กด 🔑 มุมซ้ายล่างของแอปเพื่อใส่คีย์ หรือสลับไปใช้ Meta');
  const mime = { '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.mp4': 'video/mp4' }; // mp4 = คลิปต้นแบบย่อแล้ว (inline ไม่เกิน ~20MB)
  const parts = files.filter((f) => mime[path.extname(f).toLowerCase()] && fs.existsSync(f))
    .map((f) => ({ inline_data: { mime_type: mime[path.extname(f).toLowerCase()], data: fs.readFileSync(f).toString('base64') } }));
  parts.push({ text: `${prompt}\n\nตอบเป็น JSON ล้วน ไม่ต้องมี ${START}/${END} ไม่ต้องมีคำอธิบาย` });
  const body = JSON.stringify({ contents: [{ role: 'user', parts }], generationConfig: { responseMimeType: 'application/json', temperature: 0.8 } });
  const per = Math.max(60000, Math.floor(timeoutMs / MODELS.length));
  for (let i = 0; ; i++) {
    const model = MODELS[i % MODELS.length], last = i >= MODELS.length * 2 - 1;
    let r;
    try {
      r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key }, body, signal: AbortSignal.timeout(per),
      });
    } catch (e) { if (last) throw new Error('Gemini ไม่ตอบ: ' + e.message); continue; }
    if ((r.status === 429 || r.status >= 500 || r.status === 404) && !last) { await sleep(i < MODELS.length ? 1000 : 8000); continue; }
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(`Gemini ตอบ ${r.status}: ${j.error?.message || ''}`.slice(0, 300));
    const text = (j.candidates?.[0]?.content?.parts || []).map((p) => p.text || '').join('');
    try { return JSON.parse(text); } catch {}
    const got = extractJson(`${START}${text}${END}`);
    if (got) return got;
    // ว่าง/ขาดกลางทาง (MAX_TOKENS, SAFETY, …) → ลองรุ่นถัดไปก่อน ค่อยยอมแพ้
    const why = j.candidates?.[0]?.finishReason || j.promptFeedback?.blockReason || 'ไม่ทราบสาเหตุ';
    if (!last) continue;
    throw new Error(`Gemini ส่ง JSON เพี้ยนกลับมา (${why}, ${model}): ` + (text.slice(0, 200) || '(ว่าง)'));
  }
}

// วาดรูปด้วย Gemini (เสียตังค์ต่อรูป · kidza ตกลง 9 พ.ย.) แนบได้หลายรูป เช่น สินค้า + หน้าคนขาย → เขียนไฟล์ out คืน path
const IMG_MODELS = ['gemini-3.1-flash-image', 'gemini-2.5-flash-image'];
async function geminiImage(prompt, files = [], out, aspect = '9:16', timeoutMs = 180000) {
  const key = geminiKey();
  if (!key) throw new Error('ไม่มีคีย์ Gemini');
  const mime = { '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg' };
  const parts = files.filter((f) => f && mime[path.extname(f).toLowerCase()] && fs.existsSync(f))
    .map((f) => ({ inline_data: { mime_type: mime[path.extname(f).toLowerCase()], data: fs.readFileSync(f).toString('base64') } }));
  parts.push({ text: prompt });
  const body = JSON.stringify({ contents: [{ role: 'user', parts }], generationConfig: { responseModalities: ['IMAGE'], imageConfig: { aspectRatio: aspect } } });
  let err;
  for (const model of IMG_MODELS) {
    try {
      const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key }, body, signal: AbortSignal.timeout(timeoutMs),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { err = new Error(`Gemini วาดรูปไม่ได้ ${r.status}: ${j.error?.message || ''}`.slice(0, 300)); continue; }
      const img = (j.candidates?.[0]?.content?.parts || []).find((p) => p.inlineData || p.inline_data);
      if (!img) { err = new Error('Gemini ไม่ส่งรูปกลับมา (' + (j.candidates?.[0]?.finishReason || j.promptFeedback?.blockReason || '?') + ')'); continue; }
      fs.writeFileSync(out, Buffer.from((img.inlineData || img.inline_data).data, 'base64'));
      return out;
    } catch (e) { err = e; }
  }
  throw err;
}

module.exports = { ask, attach, download, extractJson, URL_HOME, engine, gemini, geminiImage, setGeminiKey, hasGeminiKey: () => !!geminiKey() };
