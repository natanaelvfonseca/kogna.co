import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const fs = require('fs');
require('dotenv').config();

const connectionString = process.env.DATABASE_URL;

const pool = new Pool({
    connectionString,
    ssl: (process.env.DATABASE_URL && !process.env.DATABASE_URL.includes('localhost') && !process.env.DATABASE_URL.includes('sslmode=disable')) ? { rejectUnauthorized: false } : false,
    connectionTimeoutMillis: 5000
});

async function reset() {
    let output = '';
    try {
        const email = 'natanael@kogna.co';
        const newPassword = '123456';
        const msg = `Resetting password for ${email}...`;
        console.log(msg);
        output += msg + '\n';

        const hashedPassword = await bcrypt.hash(newPassword, 10);

        const res = await pool.query(
            'UPDATE users SET password = $1 WHERE email = $2 RETURNING id, email',
            [hashedPassword, email]
        );

        if (res.rowCount === 0) {
            const msg2 = 'User not found.';
            console.log(msg2);
            output += msg2 + '\n';
        } else {
            const msg3 = 'Password updated successfully for: ' + JSON.stringify(res.rows[0]);
            console.log(msg3);
            output += msg3 + '\n';
        }
    } catch (err) {
        console.error('Error:', err);
        output += 'Error: ' + err.toString() + '\n';
    } finally {
        fs.writeFileSync('reset_password_output.txt', output);
        // Force exit in case pool hangs
        process.exit(0);
    }
}

reset();
