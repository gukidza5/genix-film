// สั่งแอปจากมือถือ (kidza 10 พ.ย.): เว็บเล็ก ๆ ในแอป เข้าผ่าน Tailscale http://<ไอพี 100.x>:8765/?k=<รหัส>
// รหัสสุ่มครั้งแรกเก็บ userData/remote.json · ไม่มีรหัส = 403 ทุกอย่าง (คนในแลนร้านเข้าไม่ได้)
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

const PORT = 8765;

function key(userData) {
  const f = path.join(userData, 'remote.json');
  try { return JSON.parse(fs.readFileSync(f, 'utf8')).key; } catch {}
  const k = crypto.randomBytes(12).toString('hex');
  fs.writeFileSync(f, JSON.stringify({ key: k }));
  return k;
}

// ไอพี Tailscale (100.64–100.127) ถ้ามี ไม่งั้นไอพีแลน
function addr() {
  const all = Object.values(os.networkInterfaces()).flat().filter((i) => i && i.family === 'IPv4' && !i.internal).map((i) => i.address);
  return all.find((a) => /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./.test(a)) || all[0] || 'localhost';
}

// deps: { userData, root, log, state(), clips(), news(url, post), film(opts), auto(on?), stop() }
function startRemote(d) {
  const K = key(d.userData);
  const page = path.join(__dirname, 'ui', 'mobile.html');
  const json = (res, code, o) => { res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(o)); };
  const body = (req) => new Promise((ok) => { let b = ''; req.on('data', (c) => { if (b.length < 1e5) b += c; }); req.on('end', () => { try { ok(JSON.parse(b || '{}')); } catch { ok({}); } }); });
  const safeEq = (a, b) => typeof a === 'string' && a.length === b.length && crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));

  const srv = http.createServer(async (req, res) => {
    const u = new URL(req.url, 'http://x');
    try {
      if (u.pathname === '/' && req.method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
        return fs.createReadStream(page).pipe(res);
      }
      if (!safeEq(req.headers['x-key'] || u.searchParams.get('k'), K)) return json(res, 403, { error: 'รหัสไม่ถูก' });

      if (u.pathname === '/app.apk') { // แอปรีโมทมือถือ (C:\dev\genix-remote-apk) ไว้ให้มือถือโหลดไปลง
        const f = path.join(__dirname, 'GenixRemote.apk');
        if (!fs.existsSync(f)) return json(res, 404, { error: 'ไม่มีไฟล์แอป' });
        res.writeHead(200, { 'Content-Type': 'application/vnd.android.package-archive', 'Content-Disposition': 'attachment; filename="GenixRemote.apk"', 'Content-Length': fs.statSync(f).size });
        return fs.createReadStream(f).pipe(res);
      }
      if (u.pathname === '/api/state') return json(res, 200, d.state());
      if (u.pathname === '/api/clips') return json(res, 200, d.clips().slice(0, 30).map((c) => ({ file: c.file, title: c.title, name: c.name, mode: c.mode, created: c.created, posted: c.posted })));
      if (u.pathname === '/clip') {
        // ส่งได้เฉพาะ .mp4 ใต้โฟลเดอร์งาน (กันขอไฟล์อื่นในเครื่อง)
        const f = path.resolve(u.searchParams.get('f') || '');
        if (!f.toLowerCase().startsWith(path.resolve(d.root).toLowerCase() + path.sep) || !/\.mp4$/i.test(f) || !fs.existsSync(f)) return json(res, 404, { error: 'ไม่มีไฟล์' });
        const size = fs.statSync(f).size, m = /bytes=(\d*)-(\d*)/.exec(req.headers.range || '');
        if (!m) { res.writeHead(200, { 'Content-Type': 'video/mp4', 'Content-Length': size, 'Accept-Ranges': 'bytes' }); return fs.createReadStream(f).pipe(res); }
        const s = m[1] ? +m[1] : size - +m[2], e = m[1] && m[2] ? Math.min(+m[2], size - 1) : size - 1;
        res.writeHead(206, { 'Content-Type': 'video/mp4', 'Content-Length': e - s + 1, 'Content-Range': `bytes ${s}-${e}/${size}`, 'Accept-Ranges': 'bytes' });
        return fs.createReadStream(f, { start: s, end: e }).pipe(res);
      }
      if (req.method !== 'POST') return json(res, 404, { error: 'ไม่มี' });
      const b = await body(req);
      if (u.pathname === '/api/news') {
        if (!/^https?:\/\//i.test(b.url || '')) return json(res, 400, { error: 'ใส่ลิงก์ข่าว http(s)://' });
        d.news(String(b.url).trim(), b.post !== false); // ทำนาน (หลายนาที) ไม่รอ ดูผลที่สถานะ/LINE
        return json(res, 200, { ok: true });
      }
      if (u.pathname === '/api/film') return json(res, 200, await d.film({
        genre: String(b.genre || 'ดราม่าชีวิต'), idea: String(b.idea || '').slice(0, 500),
        eps: Math.min(20, Math.max(1, +b.eps || 1)), scenes: Math.min(24, Math.max(2, +b.scenes || 12)),
        style: b.style === 'cartoon' ? 'cartoon' : '', // การ์ตูน 3D แทนภาพเหมือนจริง
        ...(['f5', 'edge', 'eleven'].includes(b.tts) ? { tts: b.tts } : {}), // บังคับเสียงฟรี/เสียตังได้จากข้างนอก
      }));
      if (u.pathname === '/api/post') { // โพสต์คลิปที่ทำเสร็จแล้ว (ไฟล์ต้องอยู่ในรายการคลิปของแอป) · ไม่รอ ดูผลที่ log/LINE
        const pfs = (Array.isArray(b.platforms) ? b.platforms : []).filter((x) => ['facebook', 'tiktok', 'youtube', 'shopee'].includes(x));
        return json(res, 200, d.post(String(b.file || ''), pfs.length ? pfs : undefined));
      }
      if (u.pathname === '/api/auto') return json(res, 200, d.auto(!!b.on));
      if (u.pathname === '/api/stop') { d.stop(); return json(res, 200, { ok: true }); }
      return json(res, 404, { error: 'ไม่มี' });
    } catch (e) { json(res, 500, { error: e.message }); }
  });
  srv.on('error', (e) => d.log(`⚠️ รีโมทมือถือเปิดไม่ได้: ${e.message}`));
  srv.listen(PORT, () => d.log(`📱 สั่งจากมือถือ: เปิด http://${addr()}:${PORT}/?k=${K} (มือถือต้องเปิด Tailscale)`));
  return { url: () => `http://${addr()}:${PORT}/?k=${K}` };
}

module.exports = { startRemote };
