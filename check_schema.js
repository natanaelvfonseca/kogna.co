const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

async function checkSchema() {
    try {
        const res = await pool.query(`
            SELECT column_name, data_type 
            FROM information_schema.columns 
            WHERE table_name = 'whatsapp_instances'
        `);
        console.log('Columns in whatsapp_instances:');
        res.rows.forEach(r => console.log(` - ${r.column_name} (${r.data_type})`));
    } catch (e) {
        console.error(e);
    } finally {
        pool.end();
    }
}

checkSchema();
