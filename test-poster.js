// เทสส่วนที่ไม่ต้องเข้าเว็บ: ลิสต์คลิป + แคปชันเริ่มต้น + บันทึกว่าโพสต์แล้ว (ไม่โพสต์จริง)
const fs = require('fs'), path = require('path'), os = require('os'), assert = require('assert');
const { Poster, listClips } = require('./poster');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'post-'));
const mk = (d, p, files) => { fs.mkdirSync(path.join(root, d, 'output'), { recursive: true }); fs.writeFileSync(path.join(root, d, 'project.json'), JSON.stringify(p)); for (const [f, c] of Object.entries(files)) fs.writeFileSync(path.join(root, d, 'output', f), c); };
mk('film', { title: 'บ้านหลังเดียวกัน', genre: 'ดราม่า ชีวิต', created: 1 }, { 'EP10.mp4': 'x', 'EP2.mp4': 'x', 'EP2_cover.jpg': 'x' });
mk('shop', { mode: 'shopee', product: { title: 'พัดลมพกพา', url: 'https://s.shopee.co.th/abc' }, created: 2 }, { 'clip1.mp4': 'x', 'clip1_post.txt': 'แคปชันขายของ #ป้ายยา' });
let l = listClips(root);
assert.deepEqual(l.map((c) => c.name), ['clip1.mp4', 'EP2.mp4', 'EP10.mp4']);
assert.equal(l[0].caption, 'แคปชันขายของ #ป้ายยา'); assert.equal(l[0].product, 'พัดลมพกพา'); assert.equal(l[0].link, 'https://s.shopee.co.th/abc');
assert(l[1].caption.includes('บ้านหลังเดียวกัน EP.2') && l[1].caption.includes('#ดราม่าชีวิต'));
const ps = new Poster({ flow: null, settingsFile: path.join(root, 's.json'), log: () => {} });
assert.equal(ps.settings().dryRun, true);
ps.mark(l[0], 'tiktok', 'dry');
assert.equal(listClips(root)[0].posted.tiktok, 'dry');
console.log('OK');
