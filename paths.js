// ที่อยู่ AI ในเครื่อง: เครื่อง kidza อยู่ D: · เครื่องอื่น (MM/เพื่อน) ไม่มี D: ลงไว้ที่ C:
const fs = require('fs');
const pick = (...a) => a.find((p) => fs.existsSync(p)) || a[0];
module.exports = { AI: pick('D:/AI', 'C:/AI'), VO: pick('D:/vo-clone', 'C:/vo-clone') };
