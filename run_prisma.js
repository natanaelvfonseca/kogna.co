const { execSync } = require('child_process');
const fs = require('fs');

console.log('Running Prisma DB Push...');
try {
    const output = execSync('npx prisma db push --schema=prisma/schema.prisma --accept-data-loss', { encoding: 'utf8', stdio: 'pipe' });
    fs.writeFileSync('prisma_output.txt', 'SUCCESS:\n' + output);
    console.log('Success!');
} catch (error) {
    fs.writeFileSync('prisma_output.txt', 'ERROR:\nSTDOUT:\n' + error.stdout + '\nSTDERR:\n' + error.stderr);
    console.log('Error captured in prisma_output.txt');
}
