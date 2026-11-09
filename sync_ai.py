# เรียกจาก ปล่อยอัพเดท.bat: ก๊อปของ AI ที่ kidza แก้ใน D:\AI\MuseTalk / D:\vo-clone เข้า ai\ ให้ขึ้น GitHub ไปกับแอป
# (เครื่องเพื่อนกดอัพเดท → updater เห็น ai\ เปลี่ยน → เปิด setup_ai.ps1 ลงให้เอง)
import json, os, re, shutil, sys

APP = os.path.dirname(os.path.abspath(__file__))
MT, VO = r'D:\AI\MuseTalk', r'D:\vo-clone'
if not os.path.isdir(VO): sys.exit('ไม่มี D:\\vo-clone (ไม่ใช่เครื่อง kidza) ข้าม')

def put(src, rel):
    dst = os.path.join(APP, 'ai', rel)
    os.makedirs(os.path.dirname(dst), exist_ok=True)
    if not os.path.exists(dst) or open(src, 'rb').read() != open(dst, 'rb').read():
        shutil.copy2(src, dst); print('  ai\\' + rel)

for rel in ['knf_server.py', r'musetalk\utils\preprocessing.py', r'musetalk\utils\face_parsing\resnet.py']:
    put(os.path.join(MT, rel), os.path.join('musetalk', rel))
put(os.path.join(VO, 'genix_tts.py'), r'f5\genix_tts.py')
put(os.path.join(VO, 'constraints.txt'), r'f5\constraints.txt')
put(os.path.join(VO, 'refs', 'voices.json'), r'f5\voices.json')
base = 'D:/vo-clone/refs/'
for ref in set(re.findall(r'"ref":\s*"([^"]+)"', open(os.path.join(VO, 'refs', 'voices.json'), encoding='utf-8').read())):
    if ref.startswith(base): put(ref, os.path.join('f5', 'refs', ref[len(base):]))
