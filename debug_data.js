const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

async function debugUserData(email) {
    try {
        console.log(`\n=== DEBUGGING DATA FOR: ${email} ===`);

        // 1. User
        const userRes = await pool.query('SELECT id, name, email, organization_id, koins_balance FROM users WHERE email = $1', [email]);
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

        // 3. WhatsApp Instances
        const instancesRes = await pool.query('SELECT * FROM whatsapp_instances WHERE user_id = $1', [user.id]);
        console.log(`\n🔍 WhatsApp Instances (${instancesRes.rows.length}):`);
        instancesRes.rows.forEach(i => console.log(`   - Name: ${i.instance_name}, Status: ${i.status}, Token: ${i.instance_token}`));

        // 4. Agents
        const agentsRes = await pool.query('SELECT * FROM agents WHERE organization_id = $1', [user.organization_id]);
        console.log(`\n🔍 Agents (${agentsRes.rows.length}):`);
        agentsRes.rows.forEach(a => console.log(`   - Name: ${a.name}, Type: ${a.type}, Status: ${a.status}, InstanceID: ${a.whatsapp_instance_id}`));

        // 5. Kanban Columns
        const columnsRes = await pool.query('SELECT * FROM lead_columns WHERE organization_id = $1 ORDER BY order_index', [user.organization_id]);
        console.log(`\n🔍 Kanban Columns (${columnsRes.rows.length}):`);
        columnsRes.rows.forEach(c => console.log(`   - ${c.title} (Index: ${c.order_index})`));

        // 6. Leads
        const leadsRes = await pool.query('SELECT * FROM leads WHERE organization_id = $1', [user.organization_id]);
        console.log(`\n🔍 Leads (${leadsRes.rows.length}):`);
        leadsRes.rows.forEach(l => console.log(`   - ${l.name} (Status: ${l.status})`));

    } catch (err) {
        console.error('ERROR:', err);
    } finally {
        pool.end();
    }
}

// Replace with the user's email if known, or list recent users
async function listRecentUsers() {
    try {
        const res = await pool.query('SELECT email, created_at FROM users ORDER BY created_at DESC LIMIT 5');
        console.log('\nCannot find specific user? Here are the 5 most recent users:');
        res.rows.forEach(u => console.log(` - ${u.email} (${u.created_at})`));

        if (res.rows.length > 0) {
            await debugUserData(res.rows[0].email);
        }
    } catch (e) {
        console.error(e);
    } finally {
        // pool.end() handled in debugUserData if called, otherwise here
    }
}

listRecentUsers();
