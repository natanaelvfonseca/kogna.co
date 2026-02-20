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

async function listUsers() {
    try {
        const res = await pool.query('SELECT id, name, email, koins_balance, onboarding_completed, created_at FROM users ORDER BY created_at DESC LIMIT 20');
        let output = '';
        res.rows.forEach(r => {
            output += JSON.stringify(r) + '\n';
        });
        console.log(output);
        fs.writeFileSync('list_users.log', output);
    } catch (e) {
        console.error(e);
        fs.writeFileSync('list_users.log', e.toString());
    } finally {
        await pool.end();
    }
}

listUsers();
