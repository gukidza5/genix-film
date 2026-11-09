# สร้าง jobs.json ให้ D:\vo-clone\genix_tts.py จาก spec (เสียง THAI SER + อารมณ์ต่อช็อต)
# usage: python f5job.py <job-dir> <voice-id> <out-subdir>
import json, os, sys
job, vid, sub = sys.argv[1:4]
spec = json.load(open(os.path.join(job, 'spec.json'), encoding='utf-8'))
v = next(x for x in json.load(open(r'D:\vo-clone\refs\voices.json', encoding='utf-8')) if x['id'] == vid)
od = os.path.abspath(os.path.join(job, sub)); os.makedirs(od, exist_ok=True)
items = []
for k, s in enumerate(spec['shots']):
    r = v['emo'].get(s.get('emo', 'ปกติ'), v)
    items.append({'ref': r['ref'], 'ref_text': r['ref_text'], 'text': s.get('vo_f5') or s['vo'], 'out': os.path.join(od, f'vo{k}.wav'), 'speed': spec.get('f5_speed', 1.0)})
json.dump({'model': 'v1', 'items': items}, open(os.path.join(od, 'jobs.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print(os.path.join(od, 'jobs.json'))
