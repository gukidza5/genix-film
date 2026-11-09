# ลง AI ในเครื่องแบบเครื่อง kidza: ComfyUI (ฉากอนิเมะ/วิดีโอ), MuseTalk (ปากขยับ), F5-TTS-THAI (เสียงพากย์)
# ลงที่ C:\AI และ C:\vo-clone (แอปหาเองผ่าน paths.js) · รันซ้ำได้ โหลดค้างต่อจากเดิม
# usage: setup_ai.ps1 [-Pack full|image]   full = ครบ (~110GB) · image = ไม่เอาวิดีโอ Wan (~45GB)
param([ValidateSet('full', 'image')][string]$Pack = 'full')
$ErrorActionPreference = 'Continue'
$ProgressPreference = 'SilentlyContinue'
$app = $PSScriptRoot
$AI = 'C:\AI'; $VO = 'C:\vo-clone'
function Ok($m) { Write-Host "  OK  $m" -ForegroundColor Green }
function Bad($m) { Write-Host "  !!  $m" -ForegroundColor Red }
function Step($m) { Write-Host "`n>> $m" -ForegroundColor Yellow }
function Refresh-Path { $env:Path = [Environment]::GetEnvironmentVariable('Path', 'Machine') + ';' + [Environment]::GetEnvironmentVariable('Path', 'User') }
function WG($id) { winget install --id $id -e --silent --accept-package-agreements --accept-source-agreements; Refresh-Path }
function Get($url, $out) {
  if ((Test-Path $out) -and -not (Test-Path "$out.part")) { return $true }
  New-Item -ItemType Directory -Force (Split-Path $out) | Out-Null
  Write-Host "  โหลด $(Split-Path $out -Leaf)"
  curl.exe -L --fail --retry 5 -C - -o "$out.part" $url
  if ($LASTEXITCODE -eq 0) { Move-Item "$out.part" $out -Force; return $true }
  Bad "โหลดไม่ได้: $url"; return $false
}

# ---------- ComfyUI ----------
Step 'ComfyUI (ฉากอนิเมะ / วิดีโอ)'
$cu = "$AI\ComfyUI_windows_portable"
if (-not (Test-Path "$cu\python_embeded\python.exe")) {
  $7z = "$env:ProgramFiles\7-Zip\7z.exe"
  if (-not (Test-Path $7z)) { WG '7zip.7zip' }
  $pkg = "$AI\_dl\ComfyUI_windows_portable_nvidia.7z"
  if (Get 'https://github.com/Comfy-Org/ComfyUI/releases/download/v0.44.0/ComfyUI_windows_portable_nvidia.7z' $pkg) {
    & $7z x $pkg "-o$AI" -y | Out-Null
    if (Test-Path "$cu\python_embeded\python.exe") { Remove-Item $pkg; Ok 'ComfyUI 0.44.0' } else { Bad 'แตกไฟล์ ComfyUI ไม่ได้' }
  }
} else { Ok 'ComfyUI มีแล้ว' }
$HF = 'https://huggingface.co'
$models = @(
  @('Comfy-Org/z_image_turbo', 'diffusion_models/z_image_turbo_bf16.safetensors'),
  @('Comfy-Org/z_image_turbo', 'text_encoders/qwen_3_4b.safetensors'),
  @('Comfy-Org/z_image_turbo', 'vae/ae.safetensors')
)
if ($Pack -eq 'full') {
  $w = 'Comfy-Org/Wan_2.2_ComfyUI_Repackaged'
  $models += @(
    @($w, 'diffusion_models/wan2.2_i2v_high_noise_14B_fp8_scaled.safetensors'),
    @($w, 'diffusion_models/wan2.2_i2v_low_noise_14B_fp8_scaled.safetensors'),
    @($w, 'diffusion_models/wan2.2_s2v_14B_fp8_scaled.safetensors'),
    @($w, 'loras/wan2.2_i2v_lightx2v_4steps_lora_v1_high_noise.safetensors'),
    @($w, 'loras/wan2.2_i2v_lightx2v_4steps_lora_v1_low_noise.safetensors'),
    @($w, 'loras/wan2.2_t2v_lightx2v_4steps_lora_v1.1_high_noise.safetensors'),
    @($w, 'text_encoders/umt5_xxl_fp8_e4m3fn_scaled.safetensors'),
    @($w, 'vae/wan_2.1_vae.safetensors'),
    @($w, 'audio_encoders/wav2vec2_large_english_fp16.safetensors')
  )
}
foreach ($m in $models) { if (Get "$HF/$($m[0])/resolve/main/split_files/$($m[1])" "$cu\ComfyUI\models\$($m[1] -replace '/', '\')") { Ok (Split-Path $m[1] -Leaf) } }

# ---------- MuseTalk ----------
Step 'MuseTalk (ผู้ประกาศ/คนขายปากขยับ)'
$mt = "$AI\MuseTalk"
$py311 = "$env:LOCALAPPDATA\Programs\Python\Python311\python.exe"
if (-not (Test-Path $py311)) { WG 'Python.Python.3.11' }
if (-not (Get-Command git -ErrorAction SilentlyContinue)) { WG 'Git.Git' }
if (-not (Test-Path "$mt\.git")) { git clone https://github.com/TMElyralab/MuseTalk.git $mt; git -C $mt checkout -q 0a89dec }
Copy-Item "$app\ai\musetalk\*" $mt -Recurse -Force   # knf_server.py + แพตช์ไม่ใช้ mmpose ของ kidza
if (-not (Test-Path "$mt\venv\Scripts\python.exe")) { & $py311 -m venv "$mt\venv" }
$vp = "$mt\venv\Scripts\python.exe"
& $vp -c "import torch,face_alignment" 2>$null
if ($LASTEXITCODE -ne 0) {
  & $vp -m pip install -q --upgrade pip
  & $vp -m pip install -q torch==2.7.1 torchvision==0.22.1 torchaudio==2.7.1 --index-url https://download.pytorch.org/whl/cu128
  & $vp -m pip install -q diffusers==0.30.2 accelerate==0.28.0 numpy==1.26.4 transformers==4.39.2 opencv-python==4.9.0.80 soundfile==0.12.1 librosa==0.11.0 einops==0.8.1 omegaconf ffmpeg-python face_alignment==1.4.1 "huggingface_hub[hf_xet]==0.30.2" "imageio[ffmpeg]" requests tqdm
}
$hf = "$mt\venv\Scripts\huggingface-cli.exe"
Push-Location $mt
if (-not (Test-Path 'models\musetalkV15\unet.pth')) { & $hf download TMElyralab/MuseTalk --local-dir models --include 'musetalkV15/*' 'musetalk/musetalk.json' }
if (-not (Test-Path 'models\sd-vae\diffusion_pytorch_model.bin')) { & $hf download stabilityai/sd-vae-ft-mse --local-dir models\sd-vae --include config.json diffusion_pytorch_model.bin }
if (-not (Test-Path 'models\whisper\pytorch_model.bin')) { & $hf download openai/whisper-tiny --local-dir models\whisper --include config.json pytorch_model.bin preprocessor_config.json }
if (-not (Test-Path 'models\face-parse-bisent\79999_iter.pth')) { & $hf download ManyOtherFunctions/face-parse-bisent --local-dir models\face-parse-bisent --include 79999_iter.pth resnet18-5c106cde.pth }
Pop-Location
& $vp -c "import torch;print('  torch',torch.__version__,'GPU' if torch.cuda.is_available() else 'NO GPU')"

# ---------- F5-TTS-THAI ----------
Step 'F5-TTS-THAI (เสียงพากย์ไทยหลายเสียง)'
$py312 = "$env:LOCALAPPDATA\Programs\Python\Python312\python.exe"
if (-not (Test-Path $py312)) { WG 'Python.Python.3.12' }
New-Item -ItemType Directory -Force "$VO\refs" | Out-Null
Copy-Item "$app\ai\f5\genix_tts.py", "$app\ai\f5\constraints.txt" $VO -Force
Copy-Item "$app\ai\f5\refs\*" "$VO\refs" -Recurse -Force   # เสียงตัวอย่าง FLEURS (CC BY 4.0) + THAI SER (thaiser\ ชื่อไฟล์ไทย)
(Get-Content "$app\ai\f5\voices.json" -Raw -Encoding UTF8) -replace 'D:/vo-clone/refs/', 'C:/vo-clone/refs/' | Set-Content "$VO\refs\voices.json" -Encoding UTF8
if (-not (Test-Path "$VO\venv\Scripts\python.exe")) { & $py312 -m venv "$VO\venv" }
$fp = "$VO\venv\Scripts\python.exe"
& $fp -c "import f5_tts_th" 2>$null
if ($LASTEXITCODE -ne 0) {
  & $fp -m pip install -q --upgrade pip
  & $fp -m pip install -q torch==2.11.0 torchaudio==2.11.0 --index-url https://download.pytorch.org/whl/cu128
  & $fp -m pip install -q f5-tts-th==1.0.9 soundfile -c "$VO\constraints.txt"
}
& $fp -c "import f5_tts_th, torch; print('  F5 พร้อม', 'GPU' if torch.cuda.is_available() else 'CPU')"
Write-Host "`nลง AI เสร็จ (โมเดลเสียง F5 จะโหลดเองตอนพากย์ครั้งแรก ~2.6GB)" -ForegroundColor Green
