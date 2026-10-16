@echo off
chcp 65001 >nul
cd /d "%~dp0"
if not exist "apps\committee_Lex6won\.venv\Scripts\python.exe" (
  echo Python environment missing. Read apps/evaluations_u-jing/README.md.
  pause
  exit /b 1
)
echo Open http://127.0.0.1:5190/ after the server starts.
"apps\committee_Lex6won\.venv\Scripts\python.exe" "apps\evaluations_u-jing\run_web.py" --demo --original-ui --port 5190 --samples "C:\coding\제안요청서, 제안서 샘플"
