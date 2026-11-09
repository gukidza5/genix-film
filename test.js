// self-check ที่ไม่ต้องใช้ Meta AI: npx electron test.js
const { app, BrowserWindow } = require('electron');
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { extractJson } = require('./meta');
const { Pipeline } = require('./pipeline');

assert.deepStrictEqual(extractJson('ตอบ JSON ครอบด้วย GENIX_START และ GENIX_END\nGENIX_START\njson\nCopy\n[{"a":1}]\nGENIX_END'), [{ a: 1 }]);
assert.strictEqual(extractJson('ครอบด้วย GENIX_START แล้ว GENIX_END'), null);

app.whenReady().then(async () => {
  const cap = new BrowserWindow({ show: false, webPreferences: { offscreen: true } });
  await cap.loadFile(path.join(__dirname, 'ui', 'caption.html'));
  const renderPng = async (s) => Buffer.from((await cap.webContents.executeJavaScript(`render(${JSON.stringify(s)})`)).split(',')[1], 'base64');

  const dir = path.join(__dirname, 'test-out');
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(path.join(dir, 'ep1'), { recursive: true });
  const img = path.join(dir, 'ep1', 's1.jpg'), vid = path.join(dir, 'ep1', 's2.mp4');
  execFileSync('ffmpeg', ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'testsrc=s=720x1280', '-frames:v', '1', img]);
  execFileSync('ffmpeg', ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'testsrc2=s=1280x720:d=2', vid]);

  const pl = new Pipeline({ metaWin: null, renderPng, emit: () => {} });
  pl.dir = dir;
  pl.p = { title: 'บ้านที่ไม่มีใครรอ', voice: true, cast: { characters: [{ name: 'ต้น', gender: 'male', img }, { name: 'แม่', gender: 'female' }] } };
  const E = { title: 'กลับบ้าน', scenes: [
    { speaker: 'ต้น', line: 'ผมกลับมาแล้วครับแม่ ไม่ต้องร้องไห้นะ', frame: img },
    { speaker: 'แม่', line: 'ลูกจ๋า แม่คิดถึงลูกที่สุดเลย', video: vid },
    { action: 'ฉากนี้ไม่มีภาพเลย' },
  ] };
  const final = await pl.edit(1, E), cover = await pl.cover(1, E);
  const d = parseFloat(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', final]).toString());
  assert(d > 9, `duration ${d}`);
  assert(fs.statSync(cover).size > 10000);
  console.log('OK', final, d.toFixed(1) + 's', cover);
  app.quit();
}).catch((e) => { console.error(e); app.exit(1); });
