import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { Pool } = require('pg');
const fs = require('fs');
require('dotenv').config();

const connectionString = process.env.DATABASE_URL || "postgresql://postgres:Louiseemel%40%23%262020@localhost:5432/kogna";

const pool = new Pool({
    connectionString,
    ssl: (process.env.DATABASE_URL && !process.env.DATABASE_URL.includes('localhost')) ? { rejectUnauthorized: false } : false,
    connectionTimeoutMillis: 5000,
});

async function check() {
    let output = '';
    try {
        const msg = 'Checking user natanael@kogna.co...';
        console.log(msg);
        output += msg + '\n';

        const res = await pool.query('SELECT id, email, name, password, organization_id, koins_balance FROM users WHERE email = $1', ['natanael@kogna.co']);

        if (res.rows.length === 0) {
            const msg2 = 'User NOT FOUND.';
            console.log(msg2);
            output += msg2 + '\n';
        } else {
            console.log('User FOUND:', res.rows[0]);
            output += 'User FOUND: ' + JSON.stringify(res.rows[0]) + '\n';
            if (res.rows[0].password) {
                const msg3 = 'Password hash present (length ' + res.rows[0].password.length + ')';
                console.log(msg3);
                output += msg3 + '\n';
            } else {
                const msg3 = 'NO PASSWORD SET.';
                console.log(msg3);
                output += msg3 + '\n';
            }
        }
    } catch (err) {
        console.error('Error:', err);
        output += 'Error: ' + err.toString() + '\n';
    } finally {
        fs.writeFileSync('check_user_output.txt', output);
        await pool.end();
    }
}

check();
