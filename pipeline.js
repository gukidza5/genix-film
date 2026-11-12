// Genix Film: พล็อต → แคสต์ → รูปนักแสดง → บท → เฟรม → วิดีโอ → ตัดต่อ (ทำซ้ำทุก EP)
// เซฟ project.json ทุกขั้น → กด "ทำต่อ" แล้วข้ามของที่เสร็จแล้ว
const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');
const { ask, download } = require('./meta');
const comfy = require('./comfy');

const STAGES = ['คิดพล็อต', 'แคสต์', 'ถ่ายรูปนักแสดง', 'เขียนบท', 'สร้างเฟรม', 'สร้างวิดีโอ', 'ตัดต่อ'];
const VOICE = { male: 'th-TH-NiwatNeural', female: 'th-TH-PremwadeeNeural' };
const W = 1080, H = 1920;
const EMO = { กลัว: 'เศร้าแรง', ตะโกน: 'โกรธแรง', ร้องไห้: 'เศร้าแรง' }; // อารมณ์ที่ THAI SER ไม่มี ใช้ระดับเข้มข้นแทน
const { VO } = require('./paths');
const F5 = { python: path.join(VO, 'venv/Scripts/python.exe'), py: path.join(VO, 'genix_tts.py'), voices: path.join(VO, 'refs/voices.json') };
// แนวที่ชื่ออย่างเดียวไม่พอให้ AI เข้าใจ → อธิบายเพิ่มในคำสั่งพล็อต (kidza เพิ่มคำคมบาดใจ 9 พ.ย.)
const GENRE_HINT = {
  คำคมบาดใจ: '(เรื่องชีวิตจริงสั้น ๆ ที่สะเทือนใจ เช่น ความรัก ครอบครัว เพื่อนทรยศ คนที่เราให้ใจ แต่ละตอนจบด้วยตัวละครพูดคำคมบาดใจ 1 ประโยคสั้น ๆ จำง่าย แคปไปแชร์ต่อได้ เป็นคำคมที่แต่งใหม่ ไม่ลอกของคนดัง)',
};

const run = (cmd, args) => new Promise((res, rej) =>
  execFile(cmd, args, { maxBuffer: 64 << 20, windowsHide: true }, (e, out, err) => (e ? rej(new Error(`${cmd}: ${String(err).slice(-400)}`)) : res(out))));
const has = (f) => { try { return fs.statSync(f).size > 1000; } catch { return false; } }; // ไฟล์เสียงเปล่า (edge-tts ล่ม) = ไม่มี
const dur = async (f) => parseFloat(await run('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f])) || 0;

// ส่วนผมของ look ("short black hair with side part")
const hairOf = (look) => (look.match(/[^,]*(hair|bald|ponytail|bun|braid)[^,]*/i) || [''])[0].trim();

// พรอมต์เฟรม: รูปเจนจากข้อความล้วน พอมีหลายคนในพรอมต์เดียว ลักษณะชอบสลับกัน (ผมยาวไปอยู่ที่ผู้ชาย)
// ฉากมีบทพูด → ถ่ายคนพูดคนเดียว (ปากที่ขยับจะได้เป็นของคนพูดแน่ ๆ และไม่มีคนอื่นให้ลักษณะสลับ)
// ฉากรวม → ย้ำทรงผม/เพศของแต่ละคนท้ายพรอมต์
// มุมกล้องแบบละคร (8 พ.ย. เทียบกับไอละครจีน): ของเดิมทุกคนหันหน้าตรงกล้องเหมือนรูปติดบัตร → บังคับมุมเฉียง มองกันเอง ฉากหลังเบลอ
// โหมดการ์ตูน: พรอมต์ทั้งหมดเขียนแบบหนังคนจริง → สลับคำเป็นแอนิเมชัน 3D ตอนส่งเข้า ComfyUI
const toon = (s) => s.replace(/photo-?realistic,?\s*/gi, '').replace(/\bphoto\b/gi, 'image').replace(/(TV drama |cinematic )?film still/gi, 'animated movie frame')
  + ', 3D animated cartoon style like a Pixar movie, stylized cartoon characters with big expressive eyes, soft colorful lighting';
const FILM = 'three-quarter angle, eyes looking at the other person not at the camera, shallow depth of field with blurred background, soft cinematic lighting, TV drama film still';
function framePrompt(s, spk, chars, locs = []) {
  if (s.line && spk) {
    // บทเก่าไม่มี setting → หาโลเคชันที่ image_prompt อ้างถึง (ใช้ image_prompt ตรง ๆ คนพูดจะโผล่ซ้ำเป็นคนที่สองข้างหลัง)
    const bg = s.setting || locs.find((l) => s.image_prompt.includes(l.look.slice(0, 30)))?.look || s.image_prompt;
    // คนฟังโผล่ได้แค่ข้างหลังหัวเบลอ ๆ หน้าไม่เห็น S2V จะได้ไม่ไปขยับปากเขา
    const lst = chars.find((c) => c.name === s.listener && c.name !== spk.name);
    const ots = lst ? `, framed over the shoulder of ${lst.gender === 'female' ? 'a woman' : 'a man'} with ${hairOf(lst.look) || 'dark hair'} seen from behind in the blurred foreground (back of head and shoulder only, face NOT visible)` : '';
    return `Medium close-up of ONE talking person: ${spk.look}, speaking to someone off-camera${ots}, ${FILM}. Only the speaker's face is visible, no other people and no duplicate of the speaker in the background. Background: ${bg}. Hair check: this ${spk.gender === 'female' ? 'woman' : 'man'} has ${hairOf(spk.look)}`;
  }
  const inShot = chars.filter((c) => s.image_prompt.includes(c.look.slice(0, 30)) || (s.action || '').includes(c.name));
  const check = inShot.map((c) => `the ${c.gender === 'female' ? 'woman' : 'man'} has ${hairOf(c.look)}`).filter((x) => !/has $/.test(x));
  return `${s.image_prompt}, ${FILM}` + (check.length > 1 ? `. Keep each person distinct, do not mix features: ${check.join('; ')}` : '');
}

class Pipeline {
  constructor({ metaWin, renderPng, emit, flow, gate }) {
    Object.assign(this, { metaWin, renderPng, emit, flow, gate });
    this.stopped = false;
  }

  stop() { this.stopped = true; }
  check() { if (this.stopped) throw new Error('STOPPED'); }
  save() { fs.writeFileSync(path.join(this.dir, 'project.json'), JSON.stringify(this.p, null, 2)); }
  log(msg) { this.emit('log', msg); }
  step(ep, stage, detail) { this.emit('progress', { ep, eps: this.p.eps, stage, label: STAGES[stage], detail, title: this.p.title || '' }); }
  f(...a) { const fp = path.join(this.dir, ...a); fs.mkdirSync(path.dirname(fp), { recursive: true }); return fp; }

  ask(prompt, want, timeoutMs, files) {
    this.check();
    return ask(this.metaWin, prompt, { want, timeoutMs, files, isStopped: () => this.stopped });
  }

  // ขอรูปจาก Meta AI แล้วเซฟรูปแรกลงไฟล์ (ลองใหม่ 1 รอบถ้าพัง)
  async media(prompt, want, out, timeoutMs, files) {
    if (fs.existsSync(out)) return out;
    if (this.p.engine === 'flow' && !this.flowOff) return this.flowMedia(prompt, want, out, files);
    if (this.p.engine === 'comfy' && want === 'image') {
      // มีรูปตัวละคร + โมเดลแก้รูป → วางคนเดิมลงฉากใหม่ หน้าไม่เปลี่ยนทุกฉาก (Qwen-Image-Edit, comfy.js)
      const refs = (files || []).filter(Boolean), clean = prompt.replace(/^Imagine,?\s*/i, '');
      const pre = refs.length && comfy.editReady() ? `Create a new photo with the same ${refs.length > 1 ? 'people as in the reference pictures (picture 1, 2, 3 are different people)' : 'person as in the reference picture'}: keep exactly the same face, age, hairstyle and clothes. New scene: ` : '';
      const cartoon = this.p.style === 'cartoon';
      return this.comfyRun({ kind: 'image', prompt: cartoon ? toon(pre + clean) : pre + clean, refs, out, style: this.p.style });
    }
    for (let i = 0; i < 2; i++) {
      try {
        const urls = await this.ask(prompt, want, timeoutMs, files);
        fs.writeFileSync(out, await download(this.metaWin, urls[0]));
        return out;
      } catch (e) {
        if (e.message === 'STOPPED') throw e;
        this.log(`⚠️ ${path.basename(out)}: ${e.message}${i ? '' : ' — ลองใหม่'}`);
      }
    }
    return null;
  }

  // Google Flow: รูป (Nano Banana, 0 เครดิต) ลองใหม่ได้ · วิดีโอเสียเครดิต → ไม่ลองซ้ำ กันโดนหักสองรอบ
  async flowMedia(prompt, want, out, files = []) {
    const clean = prompt.replace(/^(Imagine,?|Create a video:)\s*/i, '');
    const tries = want === 'video' ? 1 : 2;
    this.flow.onNotice = (m) => this.log(m);
    for (let i = 0; i < tries; i++) {
      this.check();
      try {
        await this.flow.generate({
          kind: want, prompt: clean, files: files.filter(Boolean), aspect: this.p.aspect || '9:16', mode: 'frames', quality: this.p.flowQuality || '720p',
          out, project: this.p.flowProject, timeoutMs: want === 'video' ? 900000 : 300000, isStopped: () => this.stopped,
        });
        if (this.flow.project && this.p.flowProject !== this.flow.project) { this.p.flowProject = this.flow.project; this.save(); }
        return out;
      } catch (e) {
        if (e.message === 'STOPPED') throw e;
        this.log(`⚠️ Flow ${path.basename(out)}: ${e.message}`);
        if (/เครดิต|ล็อกอิน|Chrome/.test(e.message)) { this.flowOff = true; this.log('↩️ ที่เหลือกลับไปใช้ Meta AI / ภาพนิ่งแทน'); return null; }
      }
    }
    return null;
  }

  // ComfyUI ในเครื่อง: พังก็คืน null ให้ตัดต่อใช้ภาพนิ่งแทน
  async comfyRun(o) {
    this.check();
    try { return await comfy.generate({ aspect: this.p.aspect || '9:16', isStopped: () => this.stopped, log: (m) => this.log(m), ...o }); }
    catch (e) { if (e.message === 'STOPPED') throw e; this.log(`⚠️ ComfyUI ${path.basename(o.out)}: ${e.message}`); return null; }
  }

  // ฉากมีบทพูด → พากย์ก่อน แล้วให้ S2V ขยับปากตามเสียง (เว้นหัว 0.2 ท้าย 0.4 วิ ให้ปากมีจังหวะ) · ไม่มีบท → I2V 4 วิ
  async comfyVideo(ep, i, s) {
    if (!s.frame) return null;
    const out = this.f(`ep${ep}`, `s${i + 1}.mp4`);
    if (fs.existsSync(out)) return out;
    const mp3 = this.p.voice && s.line ? await this.voice(ep, i, s) : null;
    if (!mp3) return this.comfyRun({ kind: 'video', motion: s.motion, image: s.frame, seconds: s.line ? 4 : 3, out });
    const wav = this.f(`ep${ep}`, 'cut', `s${i + 1}.wav`);
    await run('ffmpeg', ['-y', '-v', 'error', '-i', mp3, '-af', 'adelay=200:all=1,apad=pad_dur=0.4', '-ar', '16000', '-ac', '1', wav]);
    // ฉากมีหลายคน: บอก S2V ให้ชัดว่าใครพูด คนอื่นหุบปากฟัง (ไม่งั้นชายพูดแต่ปากหญิงขยับ)
    const spk = this.p.cast.characters.find((x) => x.name === s.speaker);
    const who = spk ? `Only the ${spk.gender === 'female' ? 'woman' : 'man'} (${spk.look.split(',').slice(0, 3).join(',')}) is speaking with lips moving; everyone else keeps their mouth closed and listens silently` : 'The person is speaking, lips moving naturally';
    const v = await this.comfyRun({ kind: 'video', motion: `${s.motion}. ${who}`, image: s.frame, wav, seconds: await dur(wav), out });
    if (v) s.talk = wav;
    return v;
  }

  // พากย์ 1 ฉาก (มีไฟล์แล้วใช้ของเดิม) · edge-tts บางทีตอบ NoAudioReceived ชั่วคราว → ลอง 3 รอบ ไม่ได้ก็คืน null
  // F5-TTS-THAI (D:/vo-clone): ตัวละครละเสียง ก๊อปจากเสียงตัวอย่าง FLEURS (CC BY 4.0) ใน refs/voices.json
  // พากย์ทั้ง EP รอบเดียว (โหลดโมเดลครั้งเดียว) ลงไฟล์ s{n}.mp3 ที่ voice() ใช้ · บรรทัดไหนพังจะตกไปใช้ edge-tts เอง
  async voiceAll(ep, E) {
    if (!this.p.voice || this.p.tts !== 'f5' || !fs.existsSync(F5.py)) return;
    const voices = JSON.parse(fs.readFileSync(F5.voices, 'utf8').replace(/^﻿/, '')); // ไฟล์ที่ PowerShell เขียนมี BOM (MM 12 พ.ย.)
    const chars = this.p.cast.characters;
    for (const c of chars) {
      if (c.f5) continue; // จำเสียงไว้ในโปรเจกต์ ทุก EP ได้เสียงเดิม
      const g = c.gender === 'female' ? 'female' : 'male', pool = [...voices.filter((v) => v.gender === g && v.emo), ...voices.filter((v) => v.gender === g && !v.emo)]; // เสียงที่มีอารมณ์ (THAI SER) ก่อน
      const taken = chars.filter((x) => x.f5).map((x) => x.f5);
      c.f5 = (pool.find((v) => !taken.includes(v.id)) || pool[0])?.id;
    }
    this.save();
    const items = [];
    for (const [i, s] of E.scenes.entries()) {
      const mp3 = this.f(`ep${ep}`, 'cut', `s${i + 1}.mp3`), v = voices.find((x) => x.id === chars.find((c) => c.name === s.speaker)?.f5);
      const r = v?.emo?.[EMO[s.emotion] || s.emotion] || v; // คลิปตัวอย่างตามอารมณ์ของบรรทัด ไม่มีก็ใช้เสียงปกติ
      if (s.line && v && !has(mp3)) items.push({ ref: r.ref, ref_text: r.ref_text, text: s.say || s.line, out: mp3.replace(/\.mp3$/, '.f5.wav'), mp3 }); // say = คำอ่านให้ F5 ออกเสียงถูก ซับยังใช้ line
    }
    if (!items.length) return;
    this.step(ep, 5, `พากย์เสียง ${items.length} ประโยค (F5)`);
    const job = this.f(`ep${ep}`, 'cut', 'f5_job.json');
    fs.writeFileSync(job, JSON.stringify({ items }));
    const go = (env) => new Promise((res) => execFile(F5.python, [F5.py, job], { env: { ...process.env, ...env }, maxBuffer: 16 << 20, windowsHide: true }, (e, out, err) => res(String(out) + String(err))));
    await comfy.free(); // ComfyUI จองการ์ดจอเกือบเต็ม → ปล่อยก่อน ไม่งั้น F5 ล้น
    let out = await go({});
    if (/out of memory|CUDA error/i.test(out)) { this.log('🔁 การ์ดจอเต็ม พากย์ F5 บน CPU แทน (ช้ากว่า)'); out = await go({ CUDA_VISIBLE_DEVICES: '-1' }); }
    let ok = 0;
    for (const it of items) {
      if (!fs.existsSync(it.out)) continue;
      await run('ffmpeg', ['-y', '-v', 'error', '-i', it.out, '-b:a', '128k', it.mp3]);
      ok++;
    }
    if (ok < items.length) this.log(`⚠️ F5 พากย์ได้ ${ok}/${items.length} ที่เหลือใช้ edge-tts${ok ? '' : ': ' + out.slice(-200)}`);
  }

  async voice(ep, i, s) {
    const audio = this.f(`ep${ep}`, 'cut', `s${i + 1}.mp3`);
    if (has(audio)) return audio;
    const chars = this.p.cast.characters, c = chars.find((x) => x.name === s.speaker);
    // edge-tts ไทยมีแค่เสียงชาย 1 หญิง 1 → ตัวละครเพศเดียวกันคนที่ 2, 3 ปรับโทน/ความเร็ว ไม่ให้เสียงเหมือนคนเดียวกันคุยกันเอง
    const k2 = c ? chars.filter((x) => x.gender === c.gender).indexOf(c) : 0;
    const tone = [[], ['--pitch=+14Hz', '--rate=+6%'], ['--pitch=-14Hz', '--rate=-8%'], ['--pitch=+26Hz', '--rate=+12%']][k2] || [];
    for (let k = 0; k < 5; k++) {
      try { await run('python', ['-m', 'edge_tts', '--voice', VOICE[c?.gender] || VOICE.male, ...tone, '--text', s.line, '--write-media', audio]); if (has(audio)) return audio; throw new Error('ได้ไฟล์เสียงเปล่า'); }
      catch (e) { if (k === 4) this.log(`⚠️ พากย์ฉาก ${i + 1} ไม่ได้: ${e.message.slice(-120)}`); else await new Promise((r) => setTimeout(r, 3000)); }
    }
    fs.rmSync(audio, { force: true });
    return null;
  }

  async start(dir, opts) {
    this.dir = dir;
    const pj = path.join(dir, 'project.json');
    this.p = fs.existsSync(pj) ? JSON.parse(fs.readFileSync(pj, 'utf8')) : { ...opts, created: Date.now(), episodes: [] };
    this.save();
    const p = this.p;

    // 1 พล็อต
    if (!p.plot) {
      this.step(1, 0, 'ให้ Meta AI แนะนำพล็อต 6 แบบ');
      p.plots = await this.ask(
        `คิดพล็อตหนังสั้นแนว "${p.genre}" ${GENRE_HINT[p.genre] || ''} ${p.idea ? `ไอเดียตั้งต้น: ${p.idea}` : ''} มา 6 แบบ สำหรับซีรีส์คลิปแนวตั้ง ${p.eps} ตอน ตอนละ ${p.scenes} ฉาก ภาษาไทย
รูปแบบ: [{"title":"ชื่อเรื่อง","logline":"เรื่องย่อ 2 ประโยค","episodes":["สรุปตอน 1","สรุปตอน 2"]}]`, 'json');
      p.plot = p.plots[0]; // โหมดอัตโนมัติ: เอาแบบแรก
      p.title = p.plot.title;
      this.save();
      this.log(`🎬 เลือกพล็อต: ${p.title}`);
    }

    // 2 แคสต์ + โลเคชัน
    if (!p.cast) {
      this.step(1, 1, 'คัดนักแสดงและโลเคชัน');
      p.cast = await this.ask(
        `เรื่อง "${p.title}": ${p.plot.logline}
กำหนดตัวละครหลัก 2-4 ตัว และโลเคชัน 2-4 ที่ โดย look ต้องเป็นภาษาอังกฤษ บรรยายหน้าตา อายุ ทรงผม เสื้อผ้า ละเอียดพอให้วาดซ้ำได้หน้าเดิม
รูปแบบ: {"characters":[{"name":"ชื่อไทย","gender":"male|female","role":"บทบาท","look":"english description"}],"locations":[{"name":"ชื่อไทย","look":"english description"}]}`, 'json');
      this.save();
    }

    // 3 รูปนักแสดง
    for (const [i, c] of p.cast.characters.entries()) {
      this.step(1, 2, `${c.name} (${i + 1}/${p.cast.characters.length})`);
      c.img = await this.media(`Imagine a photorealistic cinematic portrait of ${c.look}, plain background, vertical 9:16`, 'image', this.f('cast', `${i + 1}.jpg`), 240000);
      this.save();
      if (c.img) this.emit('asset', { kind: 'cast', file: c.img, name: c.name });
    }

    const looks = p.cast.characters.map((c) => `${c.name} = ${c.look}`).join('\n');

    // ต่อตอน: EP ที่เพิ่มทีหลังยังไม่มีเรื่องย่อ → ให้ Meta คิดต่อจากสิ่งที่เกิดขึ้นจริงในตอนที่ทำไปแล้ว
    const have = (p.plot.episodes ||= []).length;
    if (have < p.eps && p.episodes[have - 1]?.scenes) {
      this.step(have + 1, 0, `คิดเรื่องต่อ EP.${have + 1}-${p.eps}`);
      const story = p.episodes.slice(0, have).map((E) => `EP.${E.ep} ${E.title || ''}: ${(E.scenes || []).map((x) => x.action).join(' / ')}`).join('\n');
      const more = await this.ask(`ซีรีส์ "${p.title}" (${p.plot.logline}) ทำไปแล้ว ${have} ตอน เรื่องที่เกิดขึ้น:\n${story}
คิดเรื่องย่อตอนต่อไปอีก ${p.eps - have} ตอน (EP.${have + 1}-${p.eps}) ให้ต่อจากตอนจบล่าสุดตรง ๆ ใช้ตัวละครเดิม มีปมใหม่และจบตอนแบบค้างให้อยากดูต่อ ภาษาไทย
รูปแบบ: ["สรุปตอน ${have + 1}","สรุปตอน ${have + 2}"]`, 'json');
      p.plot.episodes.push(...(Array.isArray(more) ? more : []).slice(0, p.eps - have).map(String));
      this.save();
      this.log(`📖 คิดเรื่องต่อแล้ว ${p.plot.episodes.length - have} ตอน`);
    }
    for (let ep = 1; ep <= p.eps; ep++) {
      const E = (p.episodes[ep - 1] ||= { ep });
      if (E.final && fs.existsSync(E.final)) continue;
      // ข่าวอัตโนมัติถึงรอบ → พักหนังตรงรอยต่อ EP ให้ข่าวใช้การ์ดจอก่อน (10 พ.ย. หนัง 10 ตอนบังข่าวทั้งวัน)
      if (this.gate) await this.gate();
      this.check();

      // 4 บท
      // Gemini บางทีตอบ JSON ผิดรูป (ไม่มี scenes / ส่งมาเป็น array เปล่า ๆ) → ขอใหม่ 3 รอบ (ลุงตู่ EP5 พัง 12 พ.ย.)
      for (let t = 0; t < 3 && !E.scenes?.length; t++) {
        this.step(ep, 3, `เขียนบท EP.${ep}${t ? ` (ลองใหม่ ${t + 1})` : ''}`);
        const r = await this.ask(
          `เขียนบทถ่ายทำซีรีส์ "${p.title}" ตอนที่ ${ep}/${p.eps} (${(p.plot.episodes || [])[ep - 1] || p.plot.logline}) จำนวน ${p.scenes} ฉาก
${p.episodes[ep - 2]?.scenes ? `ตอนก่อนหน้าจบที่: ${p.episodes[ep - 2].scenes.at(-1).action} — เริ่มตอนนี้ต่อจากตรงนั้น\n` : ''}ตัวละคร:\n${looks}\nโลเคชัน: ${p.cast.locations.map((l) => `${l.name} = ${l.look}`).join('; ')}
image_prompt และ motion ต้องเป็นภาษาอังกฤษ และใส่หน้าตาตัวละครเต็ม ๆ ทุกครั้ง, line คือบทพูดไทยสั้นไม่เกิน 20 คำ, emotion คืออารมณ์ตอนพูด เลือก 1 คำ: ปกติ/โกรธ/เศร้า/ดีใจ/หงุดหงิด/กลัว/ตะโกน
ถ่ายแบบละครจริง:
- ประมาณ 1 ใน 3 ของฉากเป็น "ช็อตรีแอ็กชัน" ไม่มีบท (speaker "" line "") แทรกหลังประโยคแรง ๆ โชว์หน้าคนฟังที่ตกใจ/โกรธ/อึ้ง/แอบยิ้ม ช็อตสั้น
- listener = ชื่อคนที่ถูกพูดด้วย (ฉากมีบท) หรือคนที่โชว์หน้า (ช็อตรีแอ็กชัน)
- image_prompt ห้ามให้ใครมองกล้องหรือยืนเรียงหน้าตรง ใช้มุมเฉียง 3/4 ข้ามไหล่ หรือสองคนหันหน้าเข้าหากัน ฉากหลังเบลอ
- motion ต้องมีการแสดงเจาะจง 1-2 อย่างที่เห็นชัด เช่น glances sideways then frowns / covers mouth and giggles / presses hand to chest in shock / turns head to look at him / eyes widen, lips part / sighs and looks down พร้อมกล้อง slow push-in หรือ subtle handheld ห้ามเขียนกว้าง ๆ แค่ "talking" หรือ "standing"
รูปแบบ: {"ep_title":"ชื่อตอน","scenes":[{"speaker":"ชื่อตัวละครที่พูด","listener":"ชื่อคนฟัง","line":"บทพูด","emotion":"ปกติ","action":"เกิดอะไรขึ้น (ไทย)","image_prompt":"english","setting":"english background/location only, no people","motion":"english acting + camera"}]}`, 'json', 240000);
        const sc = (Array.isArray(r) ? r : r?.scenes || Object.values(r || {}).find(Array.isArray) || []).filter((x) => x?.image_prompt);
        if (!sc.length) { this.log(`⚠️ บท EP.${ep} ไม่มีฉาก ขอใหม่`); continue; }
        Object.assign(E, { title: r?.ep_title || E.title, scenes: sc });
        this.save();
      }
      if (!E.scenes?.length) throw new Error(`เขียนบท EP.${ep} ไม่ได้ 3 รอบ`);

      // 5 เฟรม
      for (const [i, s] of E.scenes.entries()) {
        if (this.gate) await this.gate(); // ข่าวถึงรอบ = พักระหว่างฉาก ไม่ต้องรอจบ EP (EP ละ ~20 นาที)
        this.step(ep, 4, `ฉาก ${i + 1}/${E.scenes.length}`);
        // แนบรูปนักแสดงที่พูดในฉากไปด้วย หน้าจะได้ตรงกันทุกฉาก (Meta แนบไม่ติดก็ไม่เป็นไร)
        // ช็อตรีแอ็กชันไม่มีคนพูด → ใช้รูปคนที่โชว์หน้า (listener) เป็นแบบแทน
        const spk = p.cast.characters.find((c) => c.name === s.speaker), lst = p.cast.characters.find((c) => c.name === s.listener);
        // ฉากพูด = รูปคนพูดคนเดียว · ฉากรวม = ทุกคนที่อยู่ในภาพ (สูงสุด 3) · รีแอ็กชัน = คนที่โชว์หน้า
        const inShot = p.cast.characters.filter((c) => s.image_prompt.includes(c.look.slice(0, 30)) || (s.action || '').includes(c.name));
        const refs = (s.line && spk ? [spk] : inShot.length ? inShot : [spk || lst]).map((c) => c?.img).filter(Boolean).slice(0, 3);
        // ฉากมีบทพูด: ให้คนพูดเด่นหน้ากล้อง ไม่งั้นตอนทำปากขยับ (S2V) จะไปขยับปากอีกคนในภาพ
        s.frame = await this.media(`Imagine ${framePrompt(s, spk, p.cast.characters, p.cast.locations)}, cinematic film still, dramatic lighting, vertical 9:16`, 'image', this.f(`ep${ep}`, `s${i + 1}.jpg`), 240000, refs);
        this.save();
        if (s.frame) this.emit('asset', { kind: 'frame', file: s.frame, name: `EP${ep} ฉาก ${i + 1}` });
      }

      // 6 วิดีโอ (ไม่ได้ก็ใช้เฟรมนิ่งซูมแทนตอนตัดต่อ) — พากย์ทั้ง EP ก่อน ฉากพูดต้องใช้เสียงทำปากขยับ
      await this.voiceAll(ep, E);
      for (const [i, s] of E.scenes.entries()) {
        if (s.video !== undefined) continue;
        if (this.gate) await this.gate();
        this.step(ep, 5, `ฉาก ${i + 1}/${E.scenes.length}`);
        s.video = this.p.engine === 'comfy' ? await this.comfyVideo(ep, i, s) : await this.media(`Create a video: ${s.image_prompt}. ${s.motion}. Cinematic, vertical 9:16`, 'video', this.f(`ep${ep}`, `s${i + 1}.mp4`), 300000, s.frame ? [s.frame] : []);
        this.save();
      }

      // 7 ตัดต่อ
      this.step(ep, 6, 'เสียงพากย์ ซับ ปก');
      E.final = await this.edit(ep, E);
      E.cover = await this.cover(ep, E);
      this.save();
      this.emit('asset', { kind: 'final', file: E.final, cover: E.cover, name: `EP.${ep} ${E.title || ''}` });
      this.log(`✅ EP.${ep} เสร็จ: ${E.final}`);
    }
    this.emit('done', { dir });
  }

  async edit(ep, E) {
    const parts = [];
    for (const [i, s] of E.scenes.entries()) {
      this.check();
      const tag = `s${i + 1}`;
      const out = this.f(`ep${ep}`, 'cut', `${tag}.mp4`);
      parts.push(out);
      if (fs.existsSync(out)) continue;

      // ช็อตพากย์ยาวตามเสียง · ช็อตรีแอ็กชันไม่มีบท 2.5 วิแล้วตัด (แบบไอละคร) · ไม่มีเสียงพากย์ค้างไว้ 4 วิให้อ่านซับทัน
      let audio = null, len = this.p.voice && s.line ? 2 : s.line ? 4 : 2.5;
      if (this.p.voice && s.line) {
        // ฉากปากขยับ: ใช้เสียงตัวเดียวกับที่ป้อน S2V ปากจะได้ตรงจังหวะ
        audio = s.video && s.talk && has(s.talk) ? s.talk : await this.voice(ep, i, s);
        if (audio) len = Math.max(len, (await dur(audio)) + (audio === s.talk ? 0 : 0.7));
      }
      const cap = this.f(`ep${ep}`, 'cut', `${tag}.png`);
      fs.writeFileSync(cap, await this.renderPng({ kind: 'caption', speaker: s.speaker, text: s.line || (s.speaker ? s.action : '') }));

      const fit = `scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},setsar=1`;
      const frames = Math.ceil(len * 30);
      const img = s.frame || this.p.cast.characters.find((c) => c.img)?.img;
      const vin = s.video ? ['-i', s.video]
        : img ? ['-i', img]
        : ['-f', 'lavfi', '-i', `color=c=black:s=${W}x${H}:r=30`];
      const vf = s.video || !img ? `${fit},fps=30,tpad=stop_mode=clone:stop_duration=${len.toFixed(2)}` : `scale=${W * 3}:${H * 3}:force_original_aspect_ratio=increase,crop=${W * 3}:${H * 3},setsar=1,zoompan=z='min(zoom+0.0007,1.15)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${frames}:s=${W}x${H}:fps=30`;
      const ain = audio ? ['-i', audio] : ['-f', 'lavfi', '-i', 'anullsrc=r=44100:cl=stereo'];
      await run('ffmpeg', ['-y', ...vin, '-i', cap, ...ain,
        '-filter_complex', `[0:v]${vf}[v];[v][1:v]overlay=0:0[o];[2:a]afade=t=in:d=0.03,afade=t=out:st=${(len - 0.06).toFixed(2)}:d=0.06[a]`, '-map', '[o]', '-map', '[a]',
        '-t', len.toFixed(2), '-r', '30', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', '-pix_fmt', 'yuv420p',
        '-c:a', 'aac', '-ar', '44100', '-ac', '2', out]);
    }
    const list = this.f(`ep${ep}`, 'cut', 'list.txt');
    fs.writeFileSync(list, parts.map((x) => `file '${x.replace(/\\/g, '/')}'`).join('\n'));
    const final = this.f('output', `EP${ep}.mp4`);
    await run('ffmpeg', ['-y', '-f', 'concat', '-safe', '0', '-i', list, '-c', 'copy', '-movflags', '+faststart', final]);
    return final;
  }

  async cover(ep, E) {
    const src = E.scenes.find((s) => s.frame)?.frame || this.p.cast.characters.find((c) => c.img)?.img;
    const out = this.f('output', `EP${ep}_cover.jpg`);
    if (!src) return null;
    const title = this.f(`ep${ep}`, 'cut', 'title.png');
    fs.writeFileSync(title, await this.renderPng({ kind: 'cover', text: this.p.title, sub: `EP.${ep} ${E.title || ''}` }));
    await run('ffmpeg', ['-y', '-i', src, '-i', title, '-filter_complex',
      `[0:v]scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H}[b];[b][1:v]overlay=0:0`, '-frames:v', '1', '-q:v', '2', out]);
    return out;
  }
}

module.exports = { Pipeline, STAGES, run, dur, framePrompt, hairOf };
