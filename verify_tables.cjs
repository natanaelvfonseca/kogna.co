const { Client } = require('pg');

const connectionString = "postgresql://postgres:e347b46720637d00cfcb96d2d5d0753f@62.171.145.215:5432/kogna_prod";

async function run() {
    const client = new Client({
        connectionString: connectionString,
        connectionTimeoutMillis: 10000,
    });
    try {
        await client.connect();
        console.log('--- TABLES IN KOGNA_PROD ---');
        const res = await client.query("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'");
        if (res.rowCount > 0) {
            console.log('Found ' + res.rowCount + ' tables.');
            res.rows.forEach(r => console.log('TABLE:', r.table_name));
        } else {
            console.log('No tables found.');
        }
        await client.end();
        console.log('DONE');
    } catch (err) {
        console.error('FAIL:', err.message);
        process.exit(1);
    }
}

run();
