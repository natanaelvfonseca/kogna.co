@echo off
cd /d "d:\Kogna.co"
git add src/pages/recovery/FollowupManager.tsx
git commit -m "feat: mensagem-sucesso-ao-salvar-sequencia-recovery"
git push origin main
echo DONE
