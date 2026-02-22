import pkg from 'pg';
const { Client } = pkg;
import fs from 'fs';

const connectionString = "postgresql://postgres:Louiseemel%40%23%262020@62.171.145.215:5432/kogna_prod";

async function diag() {
    const log = (msg) => {
        console.log(msg);
        fs.appendFileSync('db_diag.log', msg + '\n');
    };

    log('--- START DIAGNOSTICS ---');
    log('Target: 62.171.145.215:5432');

    const client = new Client({
        connectionString: connectionString,
        connectionTimeoutMillis: 10000,
    });

    try {
        log('Attempting to connect...');
        await client.connect();
        log('✅ Connected successfully!');
        const res = await client.query('SELECT NOW()');
        log('Server Time: ' + res.rows[0].now);
        await client.end();
    } catch (err) {
        log('❌ FAILED');
        log('Error Name: ' + err.name);
        log('Error Message: ' + err.message);
        log('Error Code: ' + err.code);
    }
    log('--- END DIAGNOSTICS ---');
}

diag();
