const { Client } = require('pg');

const connectionString = "postgresql://postgres:e347b46720637d00cfcb96d2d5d0753f@62.171.145.215:5432/kogna_develop";

async function checkDevelop() {
    const client = new Client({ connectionString });
    try {
        await client.connect();
        const res = await client.query("SELECT COUNT(*) FROM leads");
        console.log("Total de leads em kogna_develop:", res.rows[0].count);
    } catch (err) {
        console.error("Error:", err.message);
    } finally {
        await client.end();
    }
}

checkDevelop();
