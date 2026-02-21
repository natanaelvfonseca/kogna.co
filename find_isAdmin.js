import fs from 'fs';
const content = fs.readFileSync('server.js', 'utf8');
const lines = content.split('\n');
lines.forEach((line, i) => {
    if (line.includes('isAdmin')) {
        console.log(`LINE ${i + 1}: ${line.trim()}`);
    }
});
