const http = require('http');
const fs = require('fs');

const options = {
    hostname: 'localhost',
    port: 3000,
    path: '/api/debug-connection',
    method: 'GET'
};

const req = http.request(options, (res) => {
    let data = '';
    res.on('data', (chunk) => data += chunk);
    res.on('end', () => {
        fs.writeFileSync('debug_3000_result.json', data, 'utf8');
        console.log('Response saved.');
    });
});

req.on('error', (error) => {
    console.error(error);
    fs.writeFileSync('debug_3000_result.json', JSON.stringify({ error: error.message }), 'utf8');
});

req.end();
