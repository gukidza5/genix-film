// เทสไลฟ์โดยไม่ใช้ TikTok/Meta จริง: npx electron test-live.js  (หรือ node_modules\electron\dist\electron.exe test-live.js)
// - กันซ้ำ (fresh/similar) · ปักตะกร้ากับหน้า mock · วน 2 สินค้า × 2 รอบ เสียง edge-tts จริงเล่นในหน้าต่างซ่อน · จบรอบได้บทใหม่
const { app, BrowserWindow } = require('electron');
const assert = require('assert');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { chromium } = require('playwright-core');
const { Live, fresh, similar } = require('./live');

assert(similar('ครีมตัวนี้เนื้อบางเบามากค่ะ ทาแล้วไม่เหนียวเลย', 'ครีมตัวนี้เนื้อบางเบามาก ๆ ค่ะ ทาแล้วไม่เหนียวเลยนะ'));
assert(!similar('ครีมตัวนี้เนื้อบางเบามากค่ะ', 'ใครอยากได้กดตะกร้าสีเหลืองด้านล่างเลยนะคะ'));
assert.deepStrictEqual(fresh(['ใหม่เอี่ยมเลยค่ะ ลองดูนะคะ', 'ของเก่าที่เคยพูดไปแล้วค่ะ', 'ใหม่เอี่ยมเลยค่ะ ลองดูนะคะ!'], ['ของเก่าที่เคยพูดไปแล้วค่ะ']), ['ใหม่เอี่ยมเลยค่ะ ลองดูนะคะ']);
console.log('ok กันซ้ำ');

const MOCK = `<!doctype html><meta charset=utf-8><ul>
${['ครีมกันแดด SPF50', 'เซรั่มวิตซี'].map((n, i) => `<li><div class=info><span>${i + 1}</span> <span>${n} ขนาด 50ml</span></div><div class=act><button onclick="document.querySelectorAll('li button').forEach(b=>b.textContent='ปักหมุด');this.textContent='เลิกปักหมุด';window.pins=(window.pins||[]).concat(${i})">ปักหมุด</button></div></li>`).join('')}
</ul>`;

app.whenReady().then(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'livetest-'));
  const mock = path.join(dir, 'mock.html');
  fs.writeFileSync(mock, MOCK);
  const exe = ['C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'].find(fs.existsSync);
  const browser = await chromium.launch({ executablePath: exe, headless: true });
  const page = await browser.newPage();
  await page.goto('file:///' + mock.replace(/\\/g, '/'));

  const audioWin = new BrowserWindow({ show: false, webPreferences: { backgroundThrottling: false, autoplayPolicy: 'no-user-gesture-required' } });
  await audioWin.loadFile(path.join(__dirname, 'ui', 'live-player.html'));
  const played = [], states = [], clipsPlayed = [];
  const live = new Live({ metaWin: null, flow: { connect: async () => {} }, ui: audioWin, dataDir: dir, log: (m) => console.log('  ' + m), state: (s) => states.push(s) });
  live.page = page;
  const realPlay = live.play.bind(live);
  live.play = (f, l) => { played.push(f); return realPlay(f, l); };
  const realClip = live.clip.bind(live);
  live.clip = (f) => { clipsPlayed.push(f); return realClip(f); };
  const clip = path.join(dir, "c1.mp4");
  require("child_process").execFileSync("ffmpeg", ["-y", "-v", "error", "-f", "lavfi", "-i", "testsrc=size=270x480:rate=25:duration=2", "-f", "lavfi", "-i", "sine=duration=2", "-shortest", "-pix_fmt", "yuv420p", clip]);
  let rounds = 0;
  live.writeRound = async (cfg, round, pending) => {
    rounds++;
    if (round === 2) assert.strictEqual(pending.length, 2, 'รอบหน้าต้องได้บทรอบนี้ไปกันซ้ำ');
    return cfg.products.map((p) => [`รอบ${round} ${p.name} ประโยคแรกค่ะ`, `รอบ${round} ${p.name} ประโยคสองกดตะกร้าเลย`]);
  };
  live.saveSettings = (s) => s;
  await live.start({ products: [{ name: 'ครีมกันแดด SPF50', minutes: 0.3, clips: [clip] }, { name: 'วิตซีบำรุงผิว', match: 'เซรั่มวิตซี', minutes: 0.3 }], minutes: 1, between: 1, voice: 'female', pin: true, style: 'x' });
  while (rounds < 3) await new Promise((r) => setTimeout(r, 500)); // รอให้ขึ้นรอบ 2 (ตอนนั้นเริ่มเขียนรอบ 3 ล่วงหน้า)
  for (let i = 0; i < 40 && !states.some((s) => s.line?.startsWith('รอบ2')); i++) await new Promise((r) => setTimeout(r, 500));
  live.stop();
  await new Promise((r) => setTimeout(r, 1500));

  const pins = await page.evaluate(() => window.pins);
  console.log('pins', pins, 'played', played.length, 'rounds', rounds);
  assert.deepStrictEqual(pins.slice(0, 3), [0, 1, 0], 'ปักสลับตามลำดับ');
  assert(played.length >= 4, 'ต้องพูดครบรอบแรก');
  const hist = JSON.parse(fs.readFileSync(path.join(dir, 'live-history.json'), 'utf8'));
  assert(Object.values(hist).flat().some((l) => l.startsWith('รอบ2')), 'รอบ 2 ใช้บทใหม่');
  assert(states.some((s) => s.round === 2 && s.product === 0));
  assert(clipsPlayed.length >= 2 && clipsPlayed.every((c) => c === clip), 'เล่นคลิปของชิ้นที่ปัก');
  console.log('clips', clipsPlayed.length);
  console.log('ALL PASS');
  await browser.close();
  app.exit(0);
}).catch((e) => { console.error('FAIL', e); app.exit(1); });
