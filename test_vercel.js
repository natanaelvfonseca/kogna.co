const fs = require('fs');
fetch('https://kognadevelop.vercel.app/api/health')
    .then(async (res) => {
        const text = await res.text();
        fs.writeFileSync('fetch_res.txt', `${res.status} | ${text}`);
    })
    .catch(err => {
        fs.writeFileSync('fetch_res.txt', 'ERR: ' + err.message);
    });
