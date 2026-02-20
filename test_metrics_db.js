require('dotenv').config();
const { Pool } = require('pg');

const connectionString = process.env.DATABASE_URL || "postgresql://postgres:Louiseemel%40%23%262020@localhost:5432/kogna";
const pool = new Pool({
    connectionString,
    ssl: (connectionString && !connectionString.includes('localhost')) ? { rejectUnauthorized: false } : false
});

async function run() {
    try {
        const res = await pool.query('SELECT id, email FROM users LIMIT 1');
        if (res.rows.length > 0) {
            const fs = require('fs');
            fs.writeFileSync('test_metrics_output.txt', `USER_ID:${res.rows[0].id}\nEMAIL:${res.rows[0].email}`);
        } else {
            const fs = require('fs');
            fs.writeFileSync('test_metrics_output.txt', 'No users found.');
        }
    } catch (err) {
        console.error('DB Error:', err);
    } finally {
        await pool.end();
    }
}

run();
