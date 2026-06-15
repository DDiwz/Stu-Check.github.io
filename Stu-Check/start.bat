@echo off
title STU-Check Local Server
echo Starting local server on http://localhost:8000...
echo Opening STU-Check in browser...
start http://localhost:8000/Stu-Check.html
python -m http.server 8000
pause
