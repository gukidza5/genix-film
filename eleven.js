// ElevenLabs (ตัวเสียเงิน/เครดิต) — คีย์ของแต่ละเครื่องอยู่ userData/elevenlabs.key ใส่ที่ปุ่ม 🔑 มุมซ้ายล่าง
// เสียงหลักข่าว = Mali (ผู้หญิงไทย เล่าแบบเม้าท์กับเพื่อน) รุ่น eleven_v4 อ่านแท็ก [excited] [whispers] ได้ (kidza เลือก 9 พ.ย.)
const fs = require('fs');
const path = require('path');

const VOICES = [{ id: '7XW5JhaNn90bnFojQ5DA', name: 'Mali — ผู้หญิงเม้าท์กับเพื่อน (ElevenLabs ใช้เครดิต)' }];
const keyFile = () => path.join(require('electron').app.getPath('userData'), 'elevenlabs.key');
let lastErr = '';
const key = () => { try { return fs.readFileSync(keyFile(), 'utf8').replace(/^﻿/, '').trim(); } catch (e) { lastErr = e.message; return ''; } };
const setKey = (k) => { k = String(k || '').trim(); if (k) fs.writeFileSync(keyFile(), k); else fs.rmSync(keyFile(), { force: true }); return !!key(); };

async function tts(text, out, voiceId, { stability = 0.32, similarity = 0.75, timeoutMs = 120000 } = {}) {
  const k = key();
  if (!k) throw new Error('ไม่มีคีย์ ElevenLabs — กด 🔑 มุมซ้ายล่างของแอปเพื่อใส่');
  const r = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=mp3_44100_128`, {
    method: 'POST', signal: AbortSignal.timeout(timeoutMs),
    headers: { 'xi-api-key': k, 'Content-Type': 'application/json', Accept: 'audio/mpeg' },
    body: JSON.stringify({ text, model_id: 'eleven_v4', voice_settings: { stability, similarity_boost: similarity } }),
  });
  if (!r.ok) throw new Error(`ElevenLabs ${r.status}: ${(await r.text()).slice(0, 200)}`);
  fs.writeFileSync(out, Buffer.from(await r.arrayBuffer()));
  return out;
}

module.exports = { VOICES, key, setKey, tts, keyFile, lastErr: () => lastErr };
