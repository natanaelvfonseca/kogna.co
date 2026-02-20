const { spawn } = require('child_process');
const fs = require('fs');

const log = fs.createWriteStream('startup_error.log');

const child = spawn('node', ['server.js'], {
    stdio: ['ignore', 'pipe', 'pipe']
});

child.stdout.on('data', (data) => {
    process.stdout.write(data);
    log.write('[STDOUT] ' + data);
});

child.stderr.on('data', (data) => {
    process.stderr.write(data);
    log.write('[STDERR] ' + data);
});

child.on('close', (code) => {
    log.write(`[EXIT] Process exited with code ${code}`);
    console.log(`Child exited with code ${code}`);
});

// Run for 5 seconds then kill
setTimeout(() => {
    child.kill();
    console.log('Killed child process');
}, 5000);
