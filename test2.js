import express from 'express';
import fs from 'fs';

const tests = [
    '/chat/*path',
    '/chat/{*path}',
    '/chat/:path*',
    '/chat(.*)',
    '/chat*',
    '/chat/:path(.*)',
    '/*' // To see if root wildcard is allowed
];

let out = '';
const app = express();

for (const t of tests) {
    try {
        app.all(t, (req, res) => { });
        out += `OK: ${t}\n`;
    } catch (e) {
        out += `ERR: ${t} -> ${e.message}\n`;
    }
}

fs.writeFileSync('out4.txt', out, 'utf8');
console.log('Done test2.js');
