const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

async function checkUserPlan(email) {
    try {
        const userRes = await pool.query('SELECT o.plan_type FROM users u JOIN organizations o ON o.id = u.organization_id WHERE u.email = $1', [email]);
        if (userRes.rows.length > 0) {
            console.log(`Plan for ${email}: ${userRes.rows[0].plan_type}`);
        } else {
            console.log('User or Org not found');
        }
    } catch (e) {
        console.error(e);
    } finally {
        pool.end();
    }
}

checkUserPlan('natanael@kogna.co');
