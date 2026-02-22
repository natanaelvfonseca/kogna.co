const { Client } = require('pg');

const connectionString = "postgresql://postgres:e347b46720637d00cfcb96d2d5d0753f@62.171.145.215:5432/postgres";

const client = new Client({
    connectionString: connectionString,
    connectionTimeoutMillis: 10000,
});

async function run() {
    try {
        console.log('Connecting to postgres database...');
        await client.connect();

        console.log('--- DB LIST ---');
        const dbs = await client.query('SELECT datname FROM pg_database WHERE datistemplate = false');
        dbs.rows.forEach(r => console.log('DB:', r.datname));

        console.log('--- USER INFO ---');
        const user = await client.query('SELECT rolname, rolsuper, rolinherit, rolcreaterole, rolcreatedb, rolcanlogin FROM pg_roles WHERE rolname = current_user');
        console.log(JSON.stringify(user.rows[0], null, 2));

        await client.end();
    } catch (err) {
        console.error('FAIL:', err.message);
        process.exit(1);
    }
}

run();
