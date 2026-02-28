const { Client } = require('pg');

const pass = 'e347b46720637d00cfcb96d2d5d0753f';
const host = '62.171.145.215';
const connectionString = `postgresql://postgres:${pass}@${host}:5432/postgres`;

async function listDBs() {
    const client = new Client({ connectionString });
    try {
        await client.connect();
        const res = await client.query("SELECT datname FROM pg_database WHERE datistemplate = false;");
        console.log("Databases on host:");
        console.table(res.rows);
    } catch (err) {
        console.error("Error:", err.message);
    } finally {
        await client.end();
    }
}

listDBs();
