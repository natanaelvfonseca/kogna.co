const fs = require('fs');
const path = require('path');

const logPath = path.join(__dirname, 'diagnosis_result.txt');
const log = (msg) => {
    try {
        fs.appendFileSync(logPath, msg + '\n', 'utf8');
        console.log(msg);
    } catch (e) {
        console.error('Failed to write log:', e);
    }
};

// Clear previous log
try { fs.writeFileSync(logPath, '=== DIAGNOSIS START ===\n', 'utf8'); } catch (e) { }

try {
    log('Loading dotenv...');
    require('dotenv').config();
    log('DOTENV loaded.');

    if (!process.env.DATABASE_URL) {
        log('❌ DATABASE_URL is MISSING from process.env!');
    } else {
        log('✅ DATABASE_URL is present.');
    }

    log('Loading pg...');
    const { Pool } = require('pg');
    log('pg loaded.');

    const pool = new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: { rejectUnauthorized: false }
    });

    (async () => {
        try {
            log('Connecting to DB...');
            const client = await pool.connect();
            log('✅ Connected to DB!');
            client.release();

            const email = 'natanael@kogna.co';
            log(`Querying for user: ${email}`);

            const userRes = await pool.query('SELECT id, organization_id, email FROM users WHERE email = $1', [email]);
            if (userRes.rows.length === 0) {
                log('❌ User not found.');
            } else {
                const user = userRes.rows[0];
                log(`✅ User found: ID=${user.id}, OrgID=${user.organization_id}`);

                // Instances
                const instRes = await pool.query('SELECT id, instance_name, status, organization_id FROM whatsapp_instances WHERE user_id = $1', [user.id]);
                log(`\nInstances found (${instRes.rows.length}):`);
                instRes.rows.forEach(i => {
                    log(` - Name: ${i.instance_name}`);
                    log(`   Status: ${i.status}`);
                    log(`   OrgID: ${i.organization_id}`);
                    log('-------------------');
                });
            }

        } catch (dbErr) {
            log('❌ DB Error: ' + dbErr.stack);
        } finally {
            await pool.end();
            log('=== END ===');
        }
    })();

} catch (err) {
    log('❌ Script Error: ' + err.stack);
}
