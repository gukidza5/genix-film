// เก็บยอดวิว Reels ของเพจ (หน้า Reels สาธารณะ ไม่ล็อกอิน) แล้วจับคู่กับคลิปข่าวของเราตามลำดับเวลาโพสต์
// ใช้: node tools/reels-stats.js [ลิงก์เพจ] → Documents/GenixFilm/stats/reels.json (สะสมทุกครั้งที่รัน) + พิมพ์ตาราง
// shortcut: จับคู่ "reel ล่าสุด N อัน" กับ "คลิปข่าวที่โพสต์เฟสสำเร็จล่าสุด N อัน" ตามลำดับ — ถ้าเคยลงเองนอกแอปหรือลบโพสต์ ลำดับจะเลื่อน
const fs = require('fs'), path = require('path'), os = require('os');
const { chromium } = require('playwright-core');
const PAGE = process.argv[2] || 'https://www.facebook.com/profile.php?id=61596364890352';
const ROOT = path.join(os.homedir(), 'Documents', 'GenixFilm');
const OUT = path.join(ROOT, 'stats', 'reels.json');

const views = (s) => { const m = String(s).replace(/,/g, '').match(/([\d.]+)\s*([KMพันหมื่นแสนล้าน]?)/i); if (!m) return null; const k = { K: 1e3, M: 1e6, พัน: 1e3, หมื่น: 1e4, แสน: 1e5, ล้าน: 1e6 }[m[2].toUpperCase?.() || m[2]] || 1; return Math.round(+m[1] * k); };

async function scrape() {
  // headless + โปรไฟล์ใหม่ทุกครั้ง: ไม่แตะคุกกี้ของใคร และไม่โฟกัสช่องล็อกอิน (เคยเด้งถาม security key ของ Meta)
  const b = await chromium.launch({ channel: 'chrome', headless: true });
  const p = await b.newPage({ viewport: { width: 1280, height: 2000 }, locale: 'th-TH' });
  await p.goto(PAGE + (PAGE.includes('?') ? '&' : '?') + 'sk=reels_tab', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await p.waitForTimeout(6000);
  for (let i = 0; i < 6; i++) { await p.evaluate(() => { document.querySelectorAll('[role=dialog]').forEach((d) => d.remove()); window.scrollBy(0, 1500); }); await p.waitForTimeout(1500); }
  const rows = await p.evaluate(() => [...new Set([...document.querySelectorAll('a[href*="/reel/"]')].map((a) => a.href.split('?')[0] + '|' + (a.innerText || '').trim()))]);
  await b.close();
  const seen = new Set();
  return rows.map((r) => { const [url, t] = r.split('|'); return { id: url.match(/reel\/(\d+)/)?.[1], url, views: views(t) }; }).filter((r) => r.id && !seen.has(r.id) && seen.add(r.id));
}

// คลิปข่าวที่โพสต์เฟสสำเร็จ เรียงใหม่→เก่า พร้อมข้อมูลไว้วิเคราะห์ (ความยาว เรื่อง ที่มา เวลา)
function ourNews() {
  const out = [];
  for (const d of fs.readdirSync(ROOT).filter((x) => /-news$/.test(x))) {
    const dir = path.join(ROOT, d);
    let posted, spec; try { posted = JSON.parse(fs.readFileSync(path.join(dir, 'posted.json'), 'utf8'))['ข่าว.mp4']; spec = JSON.parse(fs.readFileSync(path.join(dir, 'spec.json'), 'utf8')); } catch { continue; }
    const at = posted?.facebook; if (!at || !/^\d{4}-/.test(at)) continue;
    let len = null; try { len = +require('child_process').execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', path.join(dir, 'output', 'ข่าว.mp4')]).toString().trim(); } catch {}
    out.push({ dir: d, postedAt: at, title: spec.title || '', hook: spec.hook || '', source: spec.source || '', shots: spec.shots?.length, len: len && Math.round(len), person: spec.person || '', hasText: fs.existsSync(path.join(dir, 'shots', 'txt_0.png')) });
  }
  return out.sort((a, b) => b.postedAt.localeCompare(a.postedAt));
}

(async () => {
  const reels = await scrape();
  const ours = ourNews();
  const n = Math.min(reels.length, ours.length);
  const rows = reels.slice(0, n).map((r, i) => ({ ...ours[i], reel: r.url, views: r.views }));
  const hist = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, 'utf8')) : [];
  hist.push({ at: new Date().toISOString(), page: PAGE, reels, matched: rows });
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(hist, null, 1));
  console.log(`reels บนเพจ ${reels.length} · คลิปข่าวที่โพสต์เฟส ${ours.length} · จับคู่ ${n}`);
  for (const r of rows) console.log(`${String(r.views).padStart(6)} วิว | ${r.postedAt.slice(5, 16).replace('T', ' ')} UTC | ${String(r.len).padStart(3)}วิ ${r.shots}ช็อต ${r.hasText ? 'มีซับ' : 'ไม่มีซับ'} | ${r.title.slice(0, 50)}`);
})().catch((e) => { console.error('FAIL', e.message); process.exit(1); });
