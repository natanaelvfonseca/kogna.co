const fs = require('fs');
const path = 'output.txt';
const content = fs.readFileSync(path);
// Try to detect if it's UTF-16LE
let utf8Content;
if (content[0] === 0xff && content[1] === 0xfe) {
    utf8Content = content.toString('utf16le');
} else {
    utf8Content = content.toString('utf8');
}
fs.writeFileSync('output_fixed.txt', utf8Content, { encoding: 'utf8' });
console.log('File converted.');
