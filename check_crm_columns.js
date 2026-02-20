const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

async function checkAndFixColumns() {
    try {
        // Get the most recent user
        const userRes = await pool.query('SELECT * FROM users ORDER BY created_at DESC LIMIT 1');
        if (userRes.rows.length === 0) {
            console.log('No users found.');
            return;
        }

        const user = userRes.rows[0];
        console.log(`Checking user: ${user.email} (Org: ${user.organization_id})`);

        if (!user.organization_id) {
            console.log('User has no organization ID. Creating one...');
            const orgRes = await pool.query("INSERT INTO organizations (name) VALUES ($1) RETURNING id", [`Org for ${user.email}`]);
            const orgId = orgRes.rows[0].id;
            await pool.query("UPDATE users SET organization_id = $1 WHERE id = $2", [orgId, user.id]);
            user.organization_id = orgId;
            console.log(`Created Org: ${orgId}`);
        }

        const columnsRes = await pool.query('SELECT * FROM lead_columns WHERE organization_id = $1', [user.organization_id]);
        console.log(`Found ${columnsRes.rows.length} columns.`);

        if (columnsRes.rows.length === 0) {
            console.log('Creating default columns...');
            const defaultColumns = [
                { title: 'Novos Leads', color: '#3b82f6', order_index: 0, is_system: true },
                { title: 'Em Contato', color: '#f59e0b', order_index: 1, is_system: false },
                { title: 'Qualificado', color: '#8b5cf6', order_index: 2, is_system: false },
                { title: 'Proposta Enviada', color: '#06b6d4', order_index: 3, is_system: false },
                { title: 'Agendamento Feito', color: '#10b981', order_index: 4, is_system: true },
            ];
            for (const col of defaultColumns) {
                await pool.query(
                    'INSERT INTO lead_columns (organization_id, title, color, order_index, is_system) VALUES ($1, $2, $3, $4, $5)',
                    [user.organization_id, col.title, col.color, col.order_index, col.is_system]
                );
            }
            console.log('Default columns created!');
        } else {
            console.log('Columns already exist.');
            columnsRes.rows.forEach(c => console.log(` - ${c.title}`));
        }

    } catch (err) {
        console.error('Error:', err);
    } finally {
        pool.end();
    }
}

checkAndFixColumns();
