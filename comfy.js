// เจนในเครื่องผ่าน ComfyUI (D:\AI) — ไม่เสียเครดิต ไม่โดน Google บล็อก
// รูป = Z-Image Turbo · ฉากเงียบ = Wan 2.2 I2V + lightx2v 4 สเต็ป · ฉากพูด = Wan 2.2 S2V (ปากขยับตามเสียง)
// กราฟชุดเดียวกับ D:\AI\drama\shot.py / episode.py ที่เทสผ่านแล้ว ถ้าเปลี่ยนโมเดลที่นั่นต้องแก้ที่นี่ด้วย
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const HOST = 'http://127.0.0.1:8188';
const ROOT = path.join(require('./paths').AI, 'ComfyUI_windows_portable');
const COMFY = path.join(ROOT, 'ComfyUI');
const FPS = 16;
const SIZE = { '9:16': [480, 832, 720, 1248], '16:9': [832, 480, 1248, 720], '1:1': [640, 640, 1024, 1024] }; // วิดีโอ w,h + รูป w,h
const NEG = '色调艳丽，过曝，静态，细节模糊不清，字幕，风格，作品，画作，画面，静止，整体发灰，最差质量，低质量，JPEG压缩残留，丑陋的，残缺的，多余的手指，画得不好的手部，画得不好的脸部，畸形的，毁容的，形态畸形的肢体，手指融合，静止不动的画面，杂乱的背景，三条腿，背景人很多，倒着走';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const seed = () => Math.floor(Math.random() * 2 ** 31);
const framesFor = (sec) => Math.max(33, Math.ceil((sec * FPS) / 4) * 4 + 1); // Wan ต้องการ 4n+1

const imageGraph = (prompt, w, h, prefix) => ({
  1: { class_type: 'UNETLoader', inputs: { unet_name: 'z_image_turbo_bf16.safetensors', weight_dtype: 'default' } },
  2: { class_type: 'CLIPLoader', inputs: { clip_name: 'qwen_3_4b.safetensors', type: 'lumina2', device: 'default' } },
  3: { class_type: 'VAELoader', inputs: { vae_name: 'ae.safetensors' } },
  4: { class_type: 'ModelSamplingAuraFlow', inputs: { model: ['1', 0], shift: 3 } },
  5: { class_type: 'CLIPTextEncode', inputs: { clip: ['2', 0], text: prompt } },
  6: { class_type: 'ConditioningZeroOut', inputs: { conditioning: ['5', 0] } },
  7: { class_type: 'EmptySD3LatentImage', inputs: { width: w, height: h, batch_size: 1 } },
  8: { class_type: 'KSampler', inputs: { model: ['4', 0], positive: ['5', 0], negative: ['6', 0], latent_image: ['7', 0], seed: seed(), steps: 9, cfg: 1, sampler_name: 'res_multistep', scheduler: 'simple', denoise: 1 } },
  9: { class_type: 'VAEDecode', inputs: { samples: ['8', 0], vae: ['3', 0] } },
  10: { class_type: 'SaveImage', inputs: { images: ['9', 0], filename_prefix: prefix } },
});

const videoGraph = (img, motion, w, h, frames, prefix) => {
  const s = seed();
  const ks = (model, latent, a, b, noise) => ({ class_type: 'KSamplerAdvanced', inputs: { model, positive: ['12', 0], negative: ['12', 1], latent_image: latent, add_noise: noise ? 'enable' : 'disable', noise_seed: s, steps: 4, cfg: 1, sampler_name: 'euler', scheduler: 'simple', start_at_step: a, end_at_step: b, return_with_leftover_noise: noise ? 'enable' : 'disable' } });
  return {
    1: { class_type: 'UNETLoader', inputs: { unet_name: 'wan2.2_i2v_high_noise_14B_fp8_scaled.safetensors', weight_dtype: 'default' } },
    2: { class_type: 'UNETLoader', inputs: { unet_name: 'wan2.2_i2v_low_noise_14B_fp8_scaled.safetensors', weight_dtype: 'default' } },
    3: { class_type: 'LoraLoaderModelOnly', inputs: { model: ['1', 0], lora_name: 'wan2.2_i2v_lightx2v_4steps_lora_v1_high_noise.safetensors', strength_model: 1.0 } },
    4: { class_type: 'LoraLoaderModelOnly', inputs: { model: ['2', 0], lora_name: 'wan2.2_i2v_lightx2v_4steps_lora_v1_low_noise.safetensors', strength_model: 1.0 } },
    5: { class_type: 'ModelSamplingSD3', inputs: { model: ['3', 0], shift: 5.0 } },
    6: { class_type: 'ModelSamplingSD3', inputs: { model: ['4', 0], shift: 5.0 } },
    7: { class_type: 'CLIPLoader', inputs: { clip_name: 'umt5_xxl_fp8_e4m3fn_scaled.safetensors', type: 'wan', device: 'default' } },
    8: { class_type: 'VAELoader', inputs: { vae_name: 'wan_2.1_vae.safetensors' } },
    9: { class_type: 'CLIPTextEncode', inputs: { clip: ['7', 0], text: motion } },
    10: { class_type: 'CLIPTextEncode', inputs: { clip: ['7', 0], text: NEG } },
    11: { class_type: 'LoadImage', inputs: { image: img } },
    12: { class_type: 'WanImageToVideo', inputs: { positive: ['9', 0], negative: ['10', 0], vae: ['8', 0], start_image: ['11', 0], width: w, height: h, length: frames, batch_size: 1 } },
    13: ks(['5', 0], ['12', 2], 0, 2, true),
    14: ks(['6', 0], ['13', 0], 2, 10000, false),
    15: { class_type: 'VAEDecode', inputs: { samples: ['14', 0], vae: ['8', 0] } },
    16: { class_type: 'CreateVideo', inputs: { images: ['15', 0], fps: FPS } },
    17: { class_type: 'SaveVideo', inputs: { video: ['16', 0], filename_prefix: prefix, format: 'auto', codec: 'auto' } },
  };
};

const talkGraph = (img, wav, motion, w, h, frames, prefix) => ({
  1: { class_type: 'UNETLoader', inputs: { unet_name: 'wan2.2_s2v_14B_fp8_scaled.safetensors', weight_dtype: 'default' } },
  2: { class_type: 'LoraLoaderModelOnly', inputs: { model: ['1', 0], lora_name: 'wan2.2_t2v_lightx2v_4steps_lora_v1.1_high_noise.safetensors', strength_model: 1.0 } },
  3: { class_type: 'ModelSamplingSD3', inputs: { model: ['2', 0], shift: 8.0 } },
  4: { class_type: 'CLIPLoader', inputs: { clip_name: 'umt5_xxl_fp8_e4m3fn_scaled.safetensors', type: 'wan', device: 'default' } },
  5: { class_type: 'VAELoader', inputs: { vae_name: 'wan_2.1_vae.safetensors' } },
  6: { class_type: 'CLIPTextEncode', inputs: { clip: ['4', 0], text: motion } },
  7: { class_type: 'CLIPTextEncode', inputs: { clip: ['4', 0], text: NEG } },
  8: { class_type: 'LoadImage', inputs: { image: img } },
  9: { class_type: 'LoadAudio', inputs: { audio: wav } },
  10: { class_type: 'AudioEncoderLoader', inputs: { audio_encoder_name: 'wav2vec2_large_english_fp16.safetensors' } },
  11: { class_type: 'AudioEncoderEncode', inputs: { audio_encoder: ['10', 0], audio: ['9', 0] } },
  12: { class_type: 'WanSoundImageToVideo', inputs: { positive: ['6', 0], negative: ['7', 0], vae: ['5', 0], width: w, height: h, length: frames, batch_size: 1, audio_encoder_output: ['11', 0], ref_image: ['8', 0] } },
  13: { class_type: 'KSampler', inputs: { model: ['3', 0], positive: ['12', 0], negative: ['12', 1], latent_image: ['12', 2], seed: seed(), steps: 4, cfg: 1, sampler_name: 'uni_pc', scheduler: 'simple', denoise: 1 } },
  14: { class_type: 'VAEDecode', inputs: { samples: ['13', 0], vae: ['5', 0] } },
  15: { class_type: 'CreateVideo', inputs: { images: ['14', 0], fps: FPS } },
  16: { class_type: 'SaveVideo', inputs: { video: ['15', 0], filename_prefix: prefix, format: 'auto', codec: 'auto' } },
});

async function call(p, body) {
  const r = await fetch(HOST + p, body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {});
  const j = await r.json();
  if (!r.ok) throw new Error(`ComfyUI ${r.status}: ${JSON.stringify(j.error || j).slice(0, 300)}`);
  return j;
}

const alive = () => fetch(HOST + '/system_stats', { signal: AbortSignal.timeout(2000) }).then((r) => r.ok, () => false);

// เปิด ComfyUI ให้ถ้ายังไม่เปิด (โหลดรอบแรก ~1 นาที)
async function ensure(log) {
  if (await alive()) return;
  if (!fs.existsSync(path.join(ROOT, 'run_nvidia_gpu.bat'))) throw new Error(`ไม่เจอ ComfyUI ที่ ${ROOT}`);
  log?.('🖥️ เปิด ComfyUI ในเครื่อง (รอบแรกรอประมาณ 1 นาที)');
  spawn('cmd', ['/c', 'start', '/min', '', 'run_nvidia_gpu.bat'], { cwd: ROOT, detached: true, stdio: 'ignore', windowsHide: true }).unref();
  for (let i = 0; i < 90; i++) { if (await alive()) return; await sleep(2000); }
  throw new Error('เปิด ComfyUI ไม่ขึ้นใน 3 นาที');
}

async function runGraph(graph, isStopped) {
  const { prompt_id: id } = await call('/prompt', { prompt: graph });
  for (;;) {
    if (isStopped?.()) { await call('/interrupt', {}).catch(() => {}); throw new Error('STOPPED'); }
    const h = await call(`/history/${id}`);
    if (h[id]) {
      const st = h[id].status || {};
      if (st.status_str === 'error') throw new Error('ComfyUI error: ' + JSON.stringify(st.messages || '').slice(-400));
      const files = Object.values(h[id].outputs).flatMap((o) => [...(o.images || []), ...(o.videos || []), ...(o.gifs || [])]);
      if (!files.length) throw new Error('ComfyUI ไม่คืนไฟล์');
      const f = files[0];
      return path.join(COMFY, f.type || 'output', f.subfolder || '', f.filename);
    }
    await sleep(2000);
  }
}

// โยนไฟล์เข้าโฟลเดอร์ input ของ ComfyUI แล้วคืนชื่อ
function put(file) {
  const name = `genix_${Date.now()}_${path.basename(file)}`;
  fs.copyFileSync(file, path.join(COMFY, 'input', name));
  return name;
}

/**
 * generate({ kind: 'image'|'video', prompt, motion, image, wav, seconds, aspect, out, isStopped, log })
 * video + wav = ฉากพูด (S2V ปากขยับ, ยาวตามเสียง) · video ไม่มี wav = ฉากเงียบ (I2V)
 */
async function generate({ kind, prompt, motion, image, wav, seconds = 4, aspect = '9:16', out, isStopped, log }) {
  await ensure(log);
  const [vw, vh, iw, ih] = SIZE[aspect] || SIZE['9:16'];
  let res;
  if (kind === 'image') res = await runGraph(imageGraph(prompt, iw, ih, 'genix/img'), isStopped);
  else if (wav) res = await runGraph(talkGraph(put(image), put(wav), motion || 'the person is talking, natural expression', vw, vh, framesFor(seconds), 'genix/talk'), isStopped);
  else res = await runGraph(videoGraph(put(image), motion, vw, vh, framesFor(seconds), 'genix/vid'), isStopped);
  fs.copyFileSync(res, out);
  return out;
}

// คืน VRAM (โมเดลจะโหลดใหม่เองตอนงานถัดไป) — ใช้ก่อนรันงานการ์ดจออื่น เช่นพากย์ F5
const free = () => call('/free', { unload_models: true, free_memory: true }).catch(() => {});

module.exports = { generate, alive, ensure, framesFor, free };
