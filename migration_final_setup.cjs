const { Client } = require('pg');
const { execSync } = require('child_process');
const fs = require('fs');

const pass = 'e347b46720637d00cfcb96d2d5d0753f';
const host = '62.171.145.215';
const dbName = 'kogna_prod';
const connStr = `postgresql://postgres:${pass}@${host}:5432/${dbName}`;
const rootStr = `postgresql://postgres:${pass}@${host}:5432/postgres`;

async function main() {
    const logFile = 'migration_final.log';
    const log = (msg) => {
        const line = `[${new Date().toISOString()}] ${msg}\n`;
        fs.appendFileSync(logFile, line);
        console.log(msg);
    };

    fs.writeFileSync(logFile, '--- MIGRATION FINAL LOG ---\n');

    try {
        log('1. Checking connection to root (postgres db)...');
        const rootClient = new Client({ connectionString: rootStr });
        await rootClient.connect();
        log('   Connected to root.');

        log('2. Ensuring pgcrypto extension is available globally...');
        await rootClient.query('CREATE EXTENSION IF NOT EXISTS "pgcrypto"');
        log('   pgcrypto checked.');

        log('3. Checking for database ' + dbName + '...');
        const dbRes = await rootClient.query("SELECT 1 FROM pg_database WHERE datname = $1", [dbName]);
        if (dbRes.rowCount === 0) {
            log('   Database ' + dbName + ' not found. Creating it...');
            await rootClient.query(`CREATE DATABASE ${dbName}`);
            log('   Database created.');
        } else {
            log('   Database exists.');
        }
        await rootClient.end();

        log('4. Connecting to ' + dbName + ' directly...');
        const prodClient = new Client({ connectionString: connStr });
        await prodClient.connect();
        log('   Connected to ' + dbName + '.');
        await prodClient.query('CREATE EXTENSION IF NOT EXISTS "pgcrypto"');
        log('   pgcrypto enabled on ' + dbName + '.');
        await prodClient.end();

        log('5. Running npx prisma db push...');
        // We use process.env to ensure Prisma picks it up
        process.env.DATABASE_URL = connStr;
        try {
            const pushOut = execSync('npx prisma db push --schema=prisma/schema.prisma --accept-data-loss', { encoding: 'utf8', env: process.env });
            log('   Prisma Push Success: ' + pushOut);
        } catch (e) {
            log('   Prisma Push FAIL: ' + e.message);
            log('   Stdout: ' + e.stdout);
            log('   Stderr: ' + e.stderr);
        }

        log('6. Final table count check...');
        const verifyClient = new Client({ connectionString: connStr });
        await verifyClient.connect();
        const tablesRes = await verifyClient.query("SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public'");
        log('   Final Table Count: ' + tablesRes.rows[0].count);
        await verifyClient.end();

        log('--- MIGRATION COMPLETE ---');
    } catch (err) {
        log('!!! CRITICAL ERROR: ' + err.message);
        process.exit(1);
    }
}

main();
