import { createRequire } from 'module';
const require = createRequire(import.meta.url);
require('dotenv').config();
const { Pool } = require('pg');

const connectionString = process.env.DATABASE_URL || "postgresql://postgres:Louiseemel%40%23%262020@localhost:5432/kogna";

const pool = new Pool({
    connectionString,
    ssl: (process.env.DATABASE_URL && !process.env.DATABASE_URL.includes('localhost')) ? { rejectUnauthorized: false } : false
});

async function checkConfigs() {
    try {
        const email = 'matheru@gmail.com';
        console.log(`Checking configs for: ${email}`);

        const userRes = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
        const user = userRes.rows[0];

        if (!user) {
            console.log('User not found!');
            process.exit(1);
        }

        const configRes = await pool.query('SELECT * FROM ia_configs WHERE user_id = $1', [user.id]);
        console.log(`Found ${configRes.rows.length} config entries.`);
        if (configRes.rows.length > 0) {
            console.log('Latest Config:', configRes.rows[0]);
        }

    } catch (e) {
        console.error(e);
    } finally {
        await pool.end();
    }
}

checkConfigs();
