import pkg from 'pg';
const { Client } = pkg;
import fs from 'fs';

const connectionString = "postgresql://postgres:e347b46720637d00cfcb96d2d5d0753f@62.171.145.215:5432/kogna_prod";

async function diag() {
    const log = (msg) => {
        console.log(msg);
        fs.appendFileSync('db_diag_v2.log', msg + '\n');
    };

    log('--- START DIAGNOSTICS V2 ---');
    log('Target: 62.171.145.215:5432 (kogna_prod)');

    const client = new Client({
        connectionString: connectionString,
        connectionTimeoutMillis: 10000,
    });

    try {
        log('Attempting to connect with new password...');
        await client.connect();
        log('✅ Connection and Authentication successful!');
        const res = await client.query('SELECT current_database(), current_user, NOW()');
        log('Database: ' + res.rows[0].current_database);
        log('User: ' + res.rows[0].current_user);
        log('Server Time: ' + res.rows[0].now);
        await client.end();
    } catch (err) {
        log('❌ FAILED');
        log('Error Name: ' + err.name);
        log('Error Message: ' + err.message);
        log('Error Code: ' + err.code);
    }
    log('--- END DIAGNOSTICS V2 ---');
}

diag();
