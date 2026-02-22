const { Client } = require('pg');

const connectionString = "postgresql://postgres:e347b46720637d00cfcb96d2d5d0753f@62.171.145.215:5432/kogna_prod";

const client = new Client({
    connectionString: connectionString,
    connectionTimeoutMillis: 10000,
});

console.log('Connecting to remote DB...');
client.connect()
    .then(() => {
        console.log('✅ SUCCESS: Connected and Authenticated!');
        return client.query('SELECT current_database(), current_user, NOW()');
    })
    .then(res => {
        console.log('Result:', res.rows[0]);
        return client.end();
    })
    .catch(err => {
        console.error('❌ FAIL:', err.message);
        process.exit(1);
    });
