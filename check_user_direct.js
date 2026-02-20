const { Pool } = require('pg');
const fs = require('fs');
require('dotenv').config();

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

(async () => {
    try {
        console.log('Querying DB...');
        const email = 'natanael@kogna.co';
        const userRes = await pool.query('SELECT id, email, organization_id FROM users WHERE email = $1', [email]);

        if (userRes.rows.length === 0) {
            fs.writeFileSync('db_dump.txt', 'User not found');
            return;
        }

        const user = userRes.rows[0];
        const instancesRes = await pool.query('SELECT * FROM whatsapp_instances WHERE user_id = $1', [user.id]);

        const output = {
            user,
            instances: instancesRes.rows
        };

        fs.writeFileSync('db_dump.txt', JSON.stringify(output, null, 2));
        console.log('Dump written to db_dump.txt');
    } catch (e) {
        fs.writeFileSync('db_dump.txt', 'Error: ' + e.message);
        console.error(e);
    } finally {
        pool.end();
    }
})();
