// แคปจอไลฟ์ซ้อนชั้น: node_modules\electron\dist\electron.exe test-live-player.js <รูปสินค้า> → test-out-live\*.png
const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');

const out = path.join(__dirname, 'test-out-live');
fs.mkdirSync(out, { recursive: true });
const prod = process.argv.find((a) => /\.(jpe?g|png|webp)$/i.test(a));
const url = (f) => 'file:///' + f.replace(/\\/g, '/');
// คนขายจำลองบนฉากเขียว (วงรีสีผิว + ตัวสีฟ้า) · พื้นหลังไล่สีอุ่น
const pres = path.join(out, 'pres_green.mp4'), bg = path.join(out, 'bg.png');
execFileSync('ffmpeg', ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'color=c=0x00b140:s=540x960:d=3', '-vf',
  "drawbox=x=170:y=380:w=200:h=580:c=0x6fa8dc:t=fill,geq=lum='if(lte(pow(X-270,2)/8100+pow(Y-300,2)/12100,1),190,lum(X,Y))':cb='if(lte(pow(X-270,2)/8100+pow(Y-300,2)/12100,1),110,cb(X,Y))':cr='if(lte(pow(X-270,2)/8100+pow(Y-300,2)/12100,1),150,cr(X,Y))'",
  '-pix_fmt', 'yuv420p', pres]);
execFileSync('ffmpeg', ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'gradients=s=540x960:c0=0xd9c2a0:c1=0x5a4636:x0=0:y0=0:x1=540:y1=960:d=1', '-frames:v', '1', bg]);

app.whenReady().then(async () => {
  const w = new BrowserWindow({ width: 540, height: 960, useContentSize: true, show: true, webPreferences: { backgroundThrottling: false, autoplayPolicy: 'no-user-gesture-required' } });
  await w.loadFile(path.join(__dirname, 'ui', 'live-player.html'));
  const js = (s) => w.webContents.executeJavaScript(s);
  const shot = async (name) => { await new Promise((r) => setTimeout(r, 1200)); fs.writeFileSync(path.join(out, name), (await w.capturePage()).toPNG()); console.log('shot', name); };
  const p = JSON.stringify({ name: 'ขาตั้งยกสูงแบบพกพา สำหรับคีย์บอร์ด', price: '฿129', image: prod ? url(prod) : '', no: 1 });

  await js(`setup(${JSON.stringify({ bg: url(bg), presenter: url(pres), greenKey: true, top: true })}); setProduct(${p}); playLive('', 'ขาตั้งตัวนี้พับเก็บได้ พกไปไหนก็ง่ายมากค่ะ')`);
  await shot('1_presenter_greenkey.png');
  await js(`setup(${JSON.stringify({ bg: url(bg), presenter: '', top: true })}); setProduct(${p}); document.getElementById('sub').textContent='ไม่มีคลิปคนขาย = รูปสินค้าใหญ่กลางจอ'`);
  await shot('2_no_presenter.png');
  app.exit(0);
}).catch((e) => { console.error(e); app.exit(1); });
