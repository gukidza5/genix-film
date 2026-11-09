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
else { Write-Host "`nเสร็จ เปิดแอปจากไอคอน Genix Film บนเดสก์ท็อปได้เลย" -ForegroundColor Green }
Write-Host '(ฉากอนิเมะ / ปากขยับ / เสียง F5 ต้องใช้ ComfyUI, MuseTalk, F5 ที่ D:\AI และ D:\vo-clone — ไม่มีแอปก็ใช้แบบธรรมดาแทน)'
