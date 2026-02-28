const { Client } = require('pg');

const connectionString = "postgresql://postgres:e347b46720637d00cfcb96d2d5d0753f@62.171.145.215:5432/kogna_prod";

async function checkUsers() {
    const client = new Client({ connectionString });
    try {
        await client.connect();
        const res = await client.query("SELECT id, name, email, organization_id, role FROM users");
        console.log("Usuários em kogna_prod:");
        console.table(res.rows);
    } catch (err) {
        console.error("Error:", err.message);
    } finally {
        await client.end();
    }
}

checkUsers();
