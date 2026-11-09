// เทสไลฟ์ + ขยับปากจริง (MuseTalk) ไม่ใช้ TikTok/Meta: node_modules\electron\dist\electron.exe test-lipsync.js [คลิปคนขาย]
// ผล: test-out-live\lip_*.png (แคปจอตอนพูด) + เวลาที่ใช้ต่อประโยค
const { app, BrowserWindow } = require('electron');
const assert = require('assert');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { Live } = require('./live');

const pres = process.argv.find((a) => /\.mp4$/i.test(a)) || 'D:\\AI\\MuseTalk\\data\\video\\sun.mp4';
const out = path.join(__dirname, 'test-out-live');

app.whenReady().then(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'liplive-'));
  const player = new BrowserWindow({ width: 540, height: 960, useContentSize: true, show: true, webPreferences: { backgroundThrottling: false, autoplayPolicy: 'no-user-gesture-required' } });
  await player.loadFile(path.join(__dirname, 'ui', 'live-player.html'));
  const talks = [];
  const live = new Live({ metaWin: null, flow: null, ui: player, dataDir: dir, log: (m) => console.log('  ' + m), state: () => {} });
  const realJs = live.js.bind(live);
  live.js = (fn, ...a) => { if (fn === 'playTalk') talks.push(Date.now()); return realJs(fn, ...a); };
  live.saveSettings = (s) => s;
  live.writeRound = async () => [[
    'สวัสดีค่ะทุกคน วันนี้มีครีมกันแดดตัวใหม่มาแนะนำ',
    'เนื้อบางเบามาก ทาแล้วไม่เหนียวเลยค่ะ',
    'ใครสนใจกดตะกร้าด้านล่างได้เลยนะคะ',
  ]];
  const t0 = Date.now();
  await live.start({ products: [{ name: 'ครีมกันแดด SPF50', price: '฿199', minutes: 3 }], minutes: 3, between: 2, voice: 'female', pin: false, style: 'x', presenter: pres, lipsync: true, greenKey: false, top: true });
  while (talks.length < 2 && Date.now() - t0 < 600000) await new Promise((r) => setTimeout(r, 300));
  await new Promise((r) => setTimeout(r, 1500));
  fs.writeFileSync(path.join(out, 'lip_talking.png'), (await player.capturePage()).toPNG());
  while (talks.length < 3 && Date.now() - t0 < 600000) await new Promise((r) => setTimeout(r, 300));
  console.log('talk starts (s from start):', talks.map((t) => ((t - t0) / 1000).toFixed(1)).join(', '));
  live.stop();
  assert(talks.length >= 3, 'ต้องพูดแบบขยับปากครบ 3 ประโยค');
  console.log('ALL PASS');
  app.exit(0);
}).catch((e) => { console.error('FAIL', e); app.exit(1); });
