
const pg = require('pg');
require('dotenv').config();

const pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

async function check() {
    try {
        console.log("Checking billing history...");
        const res = await pool.query('SELECT * FROM billing_history ORDER BY created_at DESC LIMIT 5');
        console.log("LAST 5 BILLING RECORDS:");
        console.log(JSON.stringify(res.rows, null, 2));

        const users = await pool.query('SELECT id, email, koins_balance FROM users ORDER BY updated_at DESC LIMIT 5');
        console.log("\nLAST 5 UPDATED USERS:");
        console.log(JSON.stringify(users.rows, null, 2));

        process.exit(0);
    } catch (err) {
        console.error("DATABASE ERROR:", err);
        process.exit(1);
    }
}

check();
