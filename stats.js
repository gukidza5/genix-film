// ยอดวิวคลิปข่าว (kidza 9 พ.ย.): อ่านจากแท็บ Reels ของเพจเฟส + YouTube Studio ผ่าน Chrome ของแอป
// จับคู่กับคลิปด้วยบรรทัดแรกของแคปชัน (ชื่อ YouTube = บรรทัดแรก, คลิปเฟสเปิดดูแคปชันทีละอันแล้วจำ id ไว้)
// เก็บที่ userData/newsstats.json { clips: {dir: {title, fb, yt, at}}, fbmap: {reelId: dir|''} }
const fs = require('fs');
const path = require('path');

const readJson = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return d; } };
const key = (s) => String(s || '').replace(/\s+/g, '').slice(0, 30);
// "536" / "8.6 พัน" / "1.5 แสน" / "3 หมื่น" / "2 ล้าน" / "1.2K" → ตัวเลข
function num(s) {
  const m = String(s || '').replace(/,/g, '').match(/([\d.]+)\s*(พัน|หมื่น|แสน|ล้าน|K|M)?/i);
  if (!m) return null;
  const mul = { พัน: 1e3, หมื่น: 1e4, แสน: 1e5, ล้าน: 1e6, k: 1e3, m: 1e6 }[(m[2] || '').toLowerCase()] || 1;
  return Math.round(parseFloat(m[1]) * mul);
}

async function collect({ flow, settings, clips, userData, log = () => {} }) {
  const f = path.join(userData, 'newsstats.json');
  const st = readJson(f, { clips: {}, fbmap: {} });
  const byKey = new Map(clips.map((c) => [key(c.caption.split('\n').find((l) => l.trim())), c]));
  await flow.connect();
  const page = await flow.browser.contexts()[0].newPage();
  const put = (c, k, v) => { const o = (st.clips[c.dir] ||= { title: c.caption.split('\n')[0].slice(0, 80), created: c.created }); o[k] = v; o.at = new Date().toISOString(); };
  try {
    // --- Facebook: แท็บ Reels ของเพจ = เลขวิวบนรูปปก ---
    if (settings.fbPage) {
      const url = /profile\.php\?id=/.test(settings.fbPage) ? settings.fbPage + '&sk=reels_tab' : settings.fbPage.replace(/\/$/, '') + '/reels';
      await page.goto(url, { waitUntil: 'domcontentloaded' }); await page.waitForTimeout(5000);
      const tiles = new Map();
      for (let i = 0; i < 4; i++) {
        for (const t of await page.evaluate(() => [...document.querySelectorAll('a[href*="/reel/"][aria-label]')].map((a) => ({ id: (a.href.match(/reel\/(\d+)/) || [])[1], v: a.innerText.trim() }))))
          if (t.id) tiles.set(t.id, t.v);
        await page.mouse.wheel(0, 2500); await page.waitForTimeout(1500);
      }
      let opened = 0;
      for (const [id, v] of tiles) {
        if (!(id in st.fbmap) && opened < 12) { // ยังไม่รู้ว่าคลิปไหน → เปิดดูแคปชันครั้งเดียวแล้วจำไว้
          opened++;
          await page.goto(`https://www.facebook.com/reel/${id}/`, { waitUntil: 'domcontentloaded' }); await page.waitForTimeout(4000);
          const body = (await page.evaluate(() => document.body.innerText.slice(0, 3000))).replace(/\s+/g, '');
          st.fbmap[id] = [...byKey].find(([k]) => k && body.includes(k))?.[1].dir || '';
        }
        const c = clips.find((x) => x.dir === st.fbmap[id]);
        if (c) put(c, 'fb', num(v));
      }
      log(`📊 Facebook: อ่าน ${tiles.size} คลิป`);
    }
    // --- YouTube Studio: แท็บ Shorts ---
    const ch = (String(settings.ytChannel || '').match(/channel\/(UC[\w-]{20,})/) || [])[1];
    await page.goto(ch ? `https://studio.youtube.com/channel/${ch}` : 'https://studio.youtube.com/', { waitUntil: 'domcontentloaded' }); await page.waitForTimeout(5000);
    const base = (page.url().match(/https:\/\/studio\.youtube\.com\/channel\/UC[\w-]+/) || [])[0];
    if (base) {
      await page.goto(base + '/videos/short', { waitUntil: 'domcontentloaded' }); await page.waitForTimeout(6000);
      const rows = await page.evaluate(() => [...document.querySelectorAll('ytcp-video-row')].map((r) => ({ t: r.querySelector('#video-title')?.innerText || '', v: r.querySelector('.tablecell-views')?.innerText || '' })));
      for (const r of rows) { const c = byKey.get(key(r.t)); if (c && num(r.v) != null) put(c, 'yt', num(r.v)); }
      log(`📊 YouTube: อ่าน ${rows.length} คลิป`);
    }
  } finally { await page.close().catch(() => {}); fs.writeFileSync(f, JSON.stringify(st, null, 1)); }
  return st;
}

// ข่าวที่คนดูเยอะ/น้อย ไว้บอก AI ตอนเลือกข่าว + สรุปส่ง LINE
function ranked(st, days = 14) {
  const since = Date.now() - days * 864e5;
  return Object.values(st.clips || {}).filter((c) => (c.created || 0) > since)
    .map((c) => ({ ...c, total: (c.fb || 0) + (c.yt || 0) })).sort((a, b) => b.total - a.total);
}

module.exports = { collect, ranked, num };

if (require.main === module) { // self-check: node stats.js
  const a = require('assert');
  a.strictEqual(num('536'), 536); a.strictEqual(num('8.6 พัน'), 8600); a.strictEqual(num('1.5 แสน'), 150000);
  a.strictEqual(num('3 หมื่น'), 30000); a.strictEqual(num('1.2K'), 1200); a.strictEqual(num(''), null);
  console.log('stats ok');
}
