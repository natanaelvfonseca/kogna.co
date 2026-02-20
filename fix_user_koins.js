import { createRequire } from 'module';
const require = createRequire(import.meta.url);
require('dotenv').config();
const { Pool } = require('pg');

const connectionString = process.env.DATABASE_URL || "postgresql://postgres:Louiseemel%40%23%262020@localhost:5432/kogna";

const pool = new Pool({
    connectionString,
    ssl: (process.env.DATABASE_URL && !process.env.DATABASE_URL.includes('localhost')) ? { rejectUnauthorized: false } : false
});

const fs = require('fs');

function log(msg) {
    console.log(msg);
    fs.appendFileSync('fix_koins.log', msg + '\n');
}

async function fixUser() {
    try {
        const email = 'test@kogna.co';
        log(`Checking user: ${email}`);

        const res = await pool.query('SELECT id, koins_balance, onboarding_completed FROM users WHERE email = $1', [email]);
        const user = res.rows[0];

        if (!user) {
            log('User not found!');
            process.exit(1);
        }

        log(`Current State: Koins=${user.koins_balance}, Onboarding=${user.onboarding_completed}`);

        if (Number(user.koins_balance) === 0) {
            log('User has 0 Koins. Fixing...');
            await pool.query('UPDATE users SET koins_balance = 100, onboarding_completed = true WHERE id = $1', [user.id]);
            log('Updated: Set Koins to 100 and Onboarding to TRUE.');
        } else {
            log('User already has Koins. No action taken.');
        }

    } catch (e) {
        log(e.toString());
    } finally {
        await pool.end();
    }
}

fixUser();
