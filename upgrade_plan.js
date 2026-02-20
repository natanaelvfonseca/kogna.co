const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

async function upgradeUserPlan(email) {
    try {
        console.log(`Checking user: ${email}`);
        const userRes = await pool.query('SELECT id, organization_id FROM users WHERE email = $1', [email]);

        if (userRes.rows.length === 0) {
            console.log('User not found.');
            return;
        }

        const user = userRes.rows[0];
        if (!user.organization_id) {
            console.log('User has no organization.');
            // Ideally we'd create one, but for this specific request, let's assume existence or just log it.
            return;
        }

        console.log(`Upgrading Organization ${user.organization_id} to PRO...`);
        await pool.query('UPDATE organizations SET plan_type = $1 WHERE id = $2', ['pro', user.organization_id]);
        console.log('✅ Upgrade successful! Connection limit increased.');

    } catch (e) {
        console.error('Error:', e);
    } finally {
        pool.end();
    }
}

upgradeUserPlan('natanael@kogna.co');
