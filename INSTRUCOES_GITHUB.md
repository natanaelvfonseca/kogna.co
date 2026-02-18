# INSTRUÇÕES PARA SUBIR NO GITHUB 🚀

Você não precisa mover arquivos! A pasta atual já é o repositório correto.

1. Abra o terminal nesta pasta (`Kogna.co`).
2. Remova a pasta duplicada se ainda existir: `rm -rf kogna.co`
3. Configure o repositório remoto:
   ```bash
   git remote remove origin
   git remote add origin https://github.com/natanaelvfonseca/kogna.co.git
   ```
4. Garanta a branch principal:
   ```bash
   git branch -M main
   ```
5. Envie os arquivos:
   ```bash
   git push -u origin main
   ```

Se pedir senha, use o token de acesso pessoal do GitHub ou suas credenciais.
