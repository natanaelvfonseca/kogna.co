const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

async function debugNatanael() {
    try {
        const email = 'natanael@kogna.co';
        console.log(`\n=== DEBUGGING DATA FOR: ${email} ===`);

        // 1. User
        const userRes = await pool.query('SELECT id, name, email, organization_id, plan_type FROM users WHERE email = $1', [email]);
        if (userRes.rows.length === 0) {
            console.log('❌ User not found!');
            return;
        }
        const user = userRes.rows[0];
        console.log('✅ User Found:', user);

        // 2. Organization
        if (user.organization_id) {
            const orgRes = await pool.query('SELECT * FROM organizations WHERE id = $1', [user.organization_id]);
            console.log('✅ Organization:', orgRes.rows[0]);
        } else {
            console.log('❌ User has NO Organization ID!');
        }

        // 3. WhatsApp Instances (By User ID)
        const instancesByUser = await pool.query('SELECT * FROM whatsapp_instances WHERE user_id = $1', [user.id]);
        console.log(`\n🔍 Instances found by USER_ID (${instancesByUser.rows.length}):`);
        instancesByUser.rows.forEach(i => console.log(`   - Name: ${i.instance_name}, Status: ${i.status}, OrgID: ${i.organization_id}`));

        // 4. WhatsApp Instances (By Org ID)
        if (user.organization_id) {
            const instancesByOrg = await pool.query('SELECT * FROM whatsapp_instances WHERE organization_id = $1', [user.organization_id]);
            console.log(`\n🔍 Instances found by ORG_ID (${instancesByOrg.rows.length}):`);
            instancesByOrg.rows.forEach(i => console.log(`   - Name: ${i.instance_name}, Status: ${i.status}, UserID: ${i.user_id}`));
        }

    } catch (err) {
        console.error('ERROR:', err);
    } finally {
        pool.end();
    }
}

debugNatanael();
