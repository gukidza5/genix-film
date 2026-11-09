// self-check โหมดขายของ ไม่ต้องใช้ Meta AI: node_modules\electron\dist\electron.exe test-shopee.js
const { app, BrowserWindow } = require('electron');
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { ShopeePipeline } = require('./shopee');

const probe = (f, what) => execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', what, '-of', 'csv=p=0', f]).toString().trim();

app.whenReady().then(async () => {
  const cap = new BrowserWindow({ show: false, webPreferences: { offscreen: true } });
  await cap.loadFile(path.join(__dirname, 'ui', 'caption.html'));
  const renderPng = async (s) => Buffer.from((await cap.webContents.executeJavaScript(`render(${JSON.stringify(s)})`)).split(',')[1], 'base64');

  const dir = path.join(__dirname, 'test-out-shopee');
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  const prod = path.join(dir, 'product.jpg'), frame = path.join(dir, 'frame.jpg'), vid = path.join(dir, 'v.mp4');
  execFileSync('ffmpeg', ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'testsrc=s=800x800', '-frames:v', '1', prod]);
  execFileSync('ffmpeg', ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'testsrc=s=720x1280', '-frames:v', '1', frame]);
  execFileSync('ffmpeg', ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'testsrc2=s=1280x720:d=2', vid]);

  for (const [aspect, size] of [['9:16', '1080,1920'], ['1:1', '1080,1080']]) {
    const pl = new ShopeePipeline({ metaWin: null, renderPng, emit: () => {} });
    pl.dir = path.join(dir, aspect.replace(':', 'x'));
    [pl.W, pl.H] = size.split(',').map(Number);
    pl.p = { aspect, voice: 'female', voicetype: 'female', clips: 1, scenes: 3, tone: 'hype', register: 'casual', accent: 'isan', presence: 'hands', style: 'ugc', scene: 'home',
      product: { title: 'พัดลมพกพา ชาร์จ USB ลมแรง 3 ระดับ', price: '฿159', file: prod } };
    const C = { scenes: [
      { overlay: 'ร้อนจนละลาย?', line: 'ร้อนขนาดนี้ มีตัวนี้ตัวเดียวรอดเลยเด้อ', frame, video: vid },
      { overlay: 'ลมแรง 3 ระดับ', line: 'เปิดสุดคือเย็นฉ่ำ แบตอยู่ได้ทั้งวัน', frame },
      { overlay: 'ราคาแค่ 159', line: 'กดตะกร้าไปเลย ของหมดไวมาก' },
    ] };
    const prompt = pl.scriptPrompt(1);
    assert(prompt.includes('ภาษาอีสาน') && prompt.includes('฿159'), 'prompt ต้องมีสำเนียงและราคา');
    const final = await pl.edit(1, C), cover = await pl.coverShot(1, C);
    const d = parseFloat(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', final]).toString());
    assert(d > 10, `duration ${d}`);
    assert.strictEqual(probe(final, 'stream=width,height'), size);
    assert(fs.statSync(cover).size > 10000);
    console.log('OK', aspect, final, d.toFixed(1) + 's');
  }
  app.quit();
}).catch((e) => { console.error(e); app.exit(1); });
