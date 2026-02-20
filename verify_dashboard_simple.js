import fs from 'fs';
console.log('Starting simple verification...');
try {
    fs.writeFileSync('simple_output.txt', 'Node execution successful!', 'utf8');
    console.log('File written.');
} catch (e) {
    console.error('Error writing file:', e);
}
