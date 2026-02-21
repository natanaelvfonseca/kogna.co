import fs from 'fs';
const buf = fs.readFileSync('server.js');
const content = buf.toString('utf16le');
fs.writeFileSync('server.js', content, 'utf8');
console.log('Successfully converted server.js to UTF-8');
