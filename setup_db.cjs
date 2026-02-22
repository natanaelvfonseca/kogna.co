const { Client } = require('pg');

const connectionString = "postgresql://postgres:e347b46720637d00cfcb96d2d5d0753f@62.171.145.215:5432/postgres";

async function run() {
    const client = new Client({
        connectionString: connectionString,
        connectionTimeoutMillis: 10000,
    });
    try {
        console.log('Connecting to postgres...');
        await client.connect();

        console.log('Checking for kogna_prod...');
        const res = await client.query("SELECT 1 FROM pg_database WHERE datname = 'kogna_prod'");
        if (res.rowCount === 0) {
            console.log('Creating database kogna_prod...');
            await client.query('CREATE DATABASE kogna_prod');
            console.log('Database created successfully.');
        } else {
            console.log('Database already exists.');
        }

        await client.end();
        console.log('DONE');
    } catch (err) {
        console.error('FAIL:', err.message);
        process.exit(1);
    }
}

run();
