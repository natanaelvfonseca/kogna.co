const http = require('http');
const fs = require('fs');

const options = {
    hostname: 'localhost',
    port: 5000,
    path: '/api/debug-connection',
    method: 'GET'
};

const req = http.request(options, (res) => {
    let data = '';

    res.on('data', (chunk) => {
        data += chunk;
    });

    res.on('end', () => {
        fs.writeFileSync('debug_api_result.txt', data, 'utf8');
        console.log('Response saved to debug_api_result.txt');
    });
});

req.on('error', (error) => {
    console.error(error);
    fs.writeFileSync('debug_api_result.txt', 'Error: ' + error.message, 'utf8');
});

req.end();
