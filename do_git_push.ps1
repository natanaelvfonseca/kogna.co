$ErrorActionPreference = 'Continue'
$logFile = "d:\Kogna.co\git_push_log.txt"

"=== GIT PUSH LOG $(Get-Date) ===" | Out-File $logFile

Set-Location "d:\Kogna.co"

# Kill any stuck git processes
Write-Host "Killing stuck git processes..."
"Killing stuck git..." | Out-File $logFile -Append
Stop-Process -Name "git" -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 2

# Remove lock files
Remove-Item ".git\index.lock" -Force -ErrorAction SilentlyContinue
Remove-Item ".git\COMMIT_EDITMSG.lock" -Force -ErrorAction SilentlyContinue
"Lock files removed" | Out-File $logFile -Append

# Git status
$status = git status 2>&1
"STATUS: $status" | Out-File $logFile -Append

# Git add
$add = git add "server.js" "src/pages/onboarding/Onboarding.tsx" "vercel.json" 2>&1
"ADD: $add" | Out-File $logFile -Append

# Commit
$commit = git commit -m "fix: corrige dashboard chart, live chat e upload de documentos" 2>&1
"COMMIT: $commit" | Out-File $logFile -Append

# Push
$push = git push origin main 2>&1
"PUSH: $push" | Out-File $logFile -Append

"=== DONE ===" | Out-File $logFile -Append
Get-Content $logFile
