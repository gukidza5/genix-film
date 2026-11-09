# ตัวติดตั้งเครื่องใหม่: ffmpeg, Python + edge-tts, Node, Chrome + ไอคอนเดสก์ท็อป
# รันซ้ำได้ ของที่มีแล้วข้าม · เรียกจาก "ติดตั้ง.bat"
$ErrorActionPreference = 'Continue'
$app = $PSScriptRoot
function Refresh-Path { $env:Path = [Environment]::GetEnvironmentVariable('Path', 'Machine') + ';' + [Environment]::GetEnvironmentVariable('Path', 'User') }
function Has($cmd) { $c = Get-Command $cmd -ErrorAction SilentlyContinue; $c -and $c.Source -notlike '*WindowsApps*' }  # WindowsApps = ทางลัด Store ปลอม
function Ok($m) { Write-Host "  OK  $m" -ForegroundColor Green }
function Step($m) { Write-Host "`n>> $m" -ForegroundColor Yellow }

if (-not (Get-Command winget -ErrorAction SilentlyContinue)) {
  Write-Host 'ไม่มี winget ในเครื่องนี้ — ลง "App Installer" จาก Microsoft Store ก่อน แล้วรันใหม่' -ForegroundColor Red; exit 1
}
function WG($id, $name) {
  Step "ลง $name"
  winget install --id $id -e --silent --accept-package-agreements --accept-source-agreements --scope user 2>$null
  if ($LASTEXITCODE -ne 0) { winget install --id $id -e --silent --accept-package-agreements --accept-source-agreements }
  Refresh-Path
}

Refresh-Path
if (Has ffmpeg) { Ok 'ffmpeg' } else { WG 'Gyan.FFmpeg' 'ffmpeg' }
if (Has python) { Ok 'Python' } else { WG 'Python.Python.3.12' 'Python 3.12' }
if (Has node) { Ok 'Node' } else { WG 'OpenJS.NodeJS.LTS' 'Node.js' }
$chrome = @("$env:ProgramFiles\Google\Chrome\Application\chrome.exe", "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe", "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe") | ? { Test-Path $_ }
if ($chrome) { Ok 'Chrome' } else { WG 'Google.Chrome' 'Google Chrome' }

Step 'ลง edge-tts (เสียงพากย์)'
python -m pip install --upgrade --quiet edge-tts
if ($LASTEXITCODE -eq 0) { Ok 'edge-tts' } else { Write-Host '  ลง edge-tts ไม่ได้' -ForegroundColor Red }

if (-not (Test-Path "$app\node_modules\electron\dist\electron.exe")) {
  Step 'ลงตัวแอป (npm install)'
  Push-Location $app; npm.cmd install; Pop-Location
}
$e = "$app\node_modules\electron"
if ((Test-Path "$e\package.json") -and -not (Test-Path "$e\dist\electron.exe")) {
  # Node 24 บางเครื่องแตก zip ของ electron ไม่ออก (ได้แค่ LICENSES) → โหลดเองแล้วแตกด้วย tar
  Step 'โหลดตัว electron เอง'
  $v = (Get-Content "$e\package.json" -Raw | ConvertFrom-Json).version; $z = "$env:TEMP\electron-$v.zip"
  $ProgressPreference = 'SilentlyContinue'
  Invoke-WebRequest "https://github.com/electron/electron/releases/download/v$v/electron-v$v-win32-x64.zip" -OutFile $z
  Remove-Item "$e\dist" -Recurse -Force -ErrorAction SilentlyContinue; New-Item -ItemType Directory "$e\dist" | Out-Null
  tar.exe -xf $z -C "$e\dist"; Set-Content "$e\path.txt" 'electron.exe' -NoNewline; Remove-Item $z
  if (Test-Path "$e\dist\electron.exe") { Ok "electron $v" } else { Write-Host '  ลง electron ไม่ได้' -ForegroundColor Red }
}

Step 'ทำไอคอนบนเดสก์ท็อป'
$lnk = Join-Path ([Environment]::GetFolderPath('Desktop')) 'Genix Film.lnk'
$s = (New-Object -ComObject WScript.Shell).CreateShortcut($lnk)
$s.TargetPath = "$app\node_modules\electron\dist\electron.exe"; $s.Arguments = '.'; $s.WorkingDirectory = $app; $s.IconLocation = "$app\icon.ico"
$s.Save(); Ok $lnk

Step 'เช็คผล'
Refresh-Path
$bad = @('ffmpeg', 'ffprobe', 'python', 'node') | ? { -not (Has $_) }
python -c "import edge_tts" 2>$null; if ($LASTEXITCODE -ne 0) { $bad += 'edge-tts' }
if ($bad) { Write-Host "ยังขาด: $($bad -join ', ')  ลองรีเครื่องแล้วรันใหม่" -ForegroundColor Red }
else { Ok 'ของพื้นฐานครบ' }

# ---------- AI ในเครื่อง (ฟรี แต่หนัก) ----------
$gpu = Get-CimInstance Win32_VideoController | ? Name -like '*NVIDIA*' | Select-Object -First 1
$vram = 0; try { $vram = [int]((nvidia-smi --query-gpu=memory.total --format=csv,noheader,nounits 2>$null | Select-Object -First 1) / 1024) } catch {}
$haveAI = (Test-Path 'D:\AI\ComfyUI_windows_portable') -or (Test-Path 'C:\AI\ComfyUI_windows_portable')
Write-Host "`n================ AI ในเครื่อง (ฟรี) ================" -ForegroundColor Cyan
Write-Host 'ฉากอนิเมะ + ผู้ประกาศ/คนขายปากขยับ + เสียงพากย์ไทยหลายเสียง แบบเครื่อง kidza'
Write-Host "การ์ดจอเครื่องนี้: $(if ($gpu) { "$($gpu.Name) ${vram}GB" } else { 'ไม่ใช่ NVIDIA' })"
$free = [math]::Round((Get-PSDrive C).Free / 1GB)
Write-Host "ที่ว่างไดรฟ์ C: ${free}GB"
if ($haveAI) { Write-Host 'มี AI ในเครื่องอยู่แล้ว ข้ามได้' -ForegroundColor Green }
elseif ($gpu -and $vram -ge 11) { Write-Host 'แนะนำ: ลงแบบครบ (เหมือนเครื่อง kidza)' -ForegroundColor Green }
else { Write-Host 'แนะนำ: ไม่ต้องลง — การ์ดจอไม่ถึง (ต้อง NVIDIA 12GB ขึ้นไป) ลงไปก็ช้ามากหรือรันไม่ได้' -ForegroundColor Red }
Write-Host '  1 = ลงครบ รูป+วิดีโอ+ปากขยับ+เสียง (~110GB)'
Write-Host '  2 = ลงแค่รูปอนิเมะ+ปากขยับ+เสียง ไม่เอาวิดีโอ (~45GB)'
Write-Host '  3 = ไม่ลง (ใช้ฉากเวกเตอร์ รูปนิ่ง เสียง Niwat)'
$c = Read-Host 'เลือก 1/2/3'
if ($c -eq '1' -or $c -eq '2') {
  Write-Host 'เริ่มโหลด ใช้เวลานาน ปิดหน้าต่างกลางทางได้ รันใหม่จะโหลดต่อจากเดิม'
  & "$app\setup_ai.ps1" -Pack $(if ($c -eq '1') { 'full' } else { 'image' })
}

# ---------- ตัวเสียเงิน (เลือกเอง) ----------
Write-Host "`n================ ตัวเสียเงิน (ไม่บังคับ) ================" -ForegroundColor Cyan
Write-Host 'Gemini วาดรูปสินค้า/ฉากได้เหมือนกว่า Meta และเขียนบทเร็วกว่า แต่คิดเงินต่อรูปเข้าบัตรเจ้าของคีย์'
Write-Host 'ไม่ใส่ = ใช้ Meta AI (ฟรี ล็อกอินเฟสในแอป) · ใส่ทีหลังได้ที่ปุ่ม 🔑 มุมซ้ายล่างของแอป'
$k = Read-Host 'วางคีย์ Gemini (ขึ้นต้น AIza) หรือกด Enter ข้าม'
if ($k.Trim()) {
  $ud = Join-Path $env:APPDATA 'genix-film'; New-Item -ItemType Directory -Force $ud | Out-Null
  Set-Content (Join-Path $ud 'gemini.key') $k.Trim() -NoNewline; Ok 'บันทึกคีย์ Gemini แล้ว'
} else { Ok 'ใช้ Meta AI (ฟรี)' }
Write-Host "`nElevenLabs = เสียงพากย์ข่าวผู้หญิงเล่าแบบเม้าท์กับเพื่อน (เสียง Mali) เป็นธรรมชาติกว่าเสียงฟรี"
Write-Host 'ใช้เครดิตของบัญชีเจ้าของคีย์ (มีแบบฟรีให้ลอง แต่เอาไปขายของ/หาเงินต้องใช้แผนเสียเงิน) · ไม่ใส่ = ใช้เสียงฟรี'
$k2 = Read-Host 'วางคีย์ ElevenLabs (ขึ้นต้น sk_) หรือกด Enter ข้าม'
if ($k2.Trim()) {
  $ud = Join-Path $env:APPDATA 'genix-film'; New-Item -ItemType Directory -Force $ud | Out-Null
  Set-Content (Join-Path $ud 'elevenlabs.key') $k2.Trim() -NoNewline; Ok 'บันทึกคีย์ ElevenLabs แล้ว'
} else { Ok 'ใช้เสียงพากย์ฟรี' }
Write-Host "`nเสร็จหมดแล้ว เปิดแอปจากไอคอน Genix Film บนเดสก์ท็อป" -ForegroundColor Green
