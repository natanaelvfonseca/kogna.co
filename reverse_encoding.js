import fs from 'fs';
const content = fs.readFileSync('server.js', 'utf8');
const buf = Buffer.from(content, 'utf16le');
fs.writeFileSync('server.js', buf);
console.log('Successfully reversed server.js encoding');
