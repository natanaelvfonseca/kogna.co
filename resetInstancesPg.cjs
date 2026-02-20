const { Pool } = require('pg');
require('dotenv').config();

const connectionString = process.env.DATABASE_URL || "postgresql://postgres:Louiseemel%40%23%262020@localhost:5432/kogna";

const pool = new Pool({
    connectionString,
    ssl: (connectionString && !connectionString.includes('localhost')) ? { rejectUnauthorized: false } : false
});

async function main() {
    const email = 'natanael@kogna.co';

    try {
        const client = await pool.connect();

        // Find User
        const userRes = await client.query('SELECT id, name FROM users WHERE email = $1', [email]);
        const user = userRes.rows[0];

        if (!user) {
            console.log(`Usuário ${email} não encontrado.`);
            client.release();
            return;
        }

        console.log(`Usuário encontrado: ${user.name} (${user.id})`);

        // Check instances
        const instanceRes = await client.query('SELECT COUNT(*) FROM whatsapp_instances WHERE user_id = $1', [user.id]);
        const count = parseInt(instanceRes.rows[0].count);

        console.log(`Instâncias atuais: ${count}`);

        if (count > 0) {
            const deleteRes = await client.query('DELETE FROM whatsapp_instances WHERE user_id = $1', [user.id]);
            console.log(`Sucesso! ${deleteRes.rowCount} instâncias foram removidas.`);
        } else {
            console.log('O usuário já não possui instâncias conectadas.');
        }

        client.release();
    } catch (err) {
        console.error('Erro:', err.message);
    } finally {
        await pool.end();
    }
}

main();
