const { Client } = require('pg');

const pass = 'e347b46720637d00cfcb96d2d5d0753f';
const host = '62.171.145.215';

async function scanDatabases() {
    const dbs = ['postgres', 'kogna_prod', 'kogna_develop', 'evolution'];
    for (const db of dbs) {
        const client = new Client({ connectionString: `postgresql://postgres:${pass}@${host}:5432/${db}` });
        try {
            await client.connect();
            const res = await client.query("SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'leads'");
            if (res.rows[0].count > 0) {
                const count = await client.query("SELECT count(*) FROM leads");
                console.log(`Database [${db}] tem leads: ${count.rows[0].count}`);
            } else {
                console.log(`Database [${db}] não tem tabela leads.`);
            }
        } catch (e) {
            console.log(`Erro em [${db}]: ${e.message}`);
        } finally {
            await client.end();
        }
    }
}

scanDatabases();
