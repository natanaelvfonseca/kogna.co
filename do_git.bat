@echo off
cd /d "d:\Kogna.co"
echo START > git_result.txt
taskkill /F /IM git.exe /T >> git_result.txt 2>&1
timeout /t 3 >nul
del .git\index.lock 2>nul
del .git\COMMIT_EDITMSG.lock 2>nul
echo KILLED >> git_result.txt
git add server.js src/pages/onboarding/Onboarding.tsx vercel.json >> git_result.txt 2>&1
echo ADDED >> git_result.txt
git commit -m "fix: corrige dashboard chart, live chat e upload de documentos" >> git_result.txt 2>&1
echo COMMITTED >> git_result.txt
git push origin main >> git_result.txt 2>&1
echo PUSHED >> git_result.txt
