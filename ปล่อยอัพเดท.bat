@echo off
chcp 65001 >nul
cd /d "%~dp0"
set /p MSG=อัพเดทอะไร (กด Enter ข้ามได้): 
if "%MSG%"=="" set MSG=อัพเดท %date% %time:~0,5%
python -X utf8 sync_ai.py
git add -A
git commit -m "%MSG%"
git push
echo.
echo เสร็จ เครื่องเพื่อนกดปุ่ม อัพเดท ได้เลย
pause
