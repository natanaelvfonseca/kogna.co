const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

async function verify() {
    const fs = require('fs');
    const log = (msg) => {
        console.log(msg);
        fs.appendFileSync('connection_debug.txt', msg + '\n');
    };

    try {
        fs.writeFileSync('connection_debug.txt', '=== DEBUG START ===\n');

        const email = 'natanael@kogna.co';
        log(`Checking email: ${email}`);

        // 1. User
        const userRes = await pool.query('SELECT id, organization_id, email FROM users WHERE email = $1', [email]);
        if (userRes.rows.length === 0) {
            log('❌ User not found');
            return;
        }
        const user = userRes.rows[0];
        log(`✅ User Found: ID=${user.id}, OrgID=${user.organization_id}`);

        if (!user.organization_id) {
            log('❌ User missing Organization ID!');
        }

        // 2. Instances by User
        const instUser = await pool.query('SELECT id, instance_name, status, organization_id FROM whatsapp_instances WHERE user_id = $1', [user.id]);
        log(`\nInstances by UserID (${instUser.rows.length}):`);
        instUser.rows.forEach(i => log(` - [${i.instance_name}] Status=${i.status}, OrgID=${i.organization_id}`));

        // 3. Instances by Org
        if (user.organization_id) {
            const instOrg = await pool.query('SELECT id, instance_name, status, user_id FROM whatsapp_instances WHERE organization_id = $1', [user.organization_id]);
            log(`\nInstances by OrgID (${instOrg.rows.length}):`);
            instOrg.rows.forEach(i => log(` - [${i.instance_name}] Status=${i.status}, UserID=${i.user_id}`));
        }

    } catch (e) {
        log('Error: ' + e.message);
    } finally {
        pool.end();
    }
}

verify();
