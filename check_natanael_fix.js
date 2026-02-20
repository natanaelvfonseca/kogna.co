const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

async function fixNatanael() {
    try {
        const email = 'natanael@kogna.co';

        // 1. Get User and Org
        const userRes = await pool.query('SELECT id, organization_id FROM users WHERE email = $1', [email]);
        if (userRes.rows.length === 0) return console.log('User not found');

        const user = userRes.rows[0];
        const orgId = user.organization_id;

        if (!orgId) return console.log('User has no Org ID');

        console.log(`User: ${user.id}, Org: ${orgId}`);

        // 2. Find instances for this user that are missing organization_id
        const res = await pool.query(
            'UPDATE whatsapp_instances SET organization_id = $1 WHERE user_id = $2 AND (organization_id IS NULL OR organization_id != $1) RETURNING *',
            [orgId, user.id]
        );

        if (res.rows.length > 0) {
            console.log(`✅ Fixed ${res.rows.length} instances!`);
            res.rows.forEach(i => console.log(`   - ${i.instance_name} now has OrgID ${i.organization_id}`));
        } else {
            console.log('No instances needed fixing.');
        }

    } catch (err) {
        console.error('ERROR:', err);
    } finally {
        pool.end();
    }
}

fixNatanael();
