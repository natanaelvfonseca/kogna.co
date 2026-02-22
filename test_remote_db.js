import pkg from 'pg';
const { Client } = pkg;

const connectionString = "postgresql://postgres:Louiseemel%40%23%262020@62.171.145.215:5432/kogna_prod";

async function testConnection() {
    console.log('--- Database Connection Test ---');
    console.log('Target: 62.171.145.215:5432 (kogna_prod)');

    const client = new Client({
        connectionString: connectionString,
        connectionTimeoutMillis: 5000,
    });

    try {
        await client.connect();
        console.log('✅ Connection successful!');

        const res = await client.query('SELECT current_database(), current_user, version()');
        console.log('Database Details:');
        console.log('- Database:', res.rows[0].current_database);
        console.log('- User:', res.rows[0].current_user);
        console.log('- Version:', res.rows[0].version);

        await client.end();
        process.exit(0);
    } catch (err) {
        console.error('❌ Connection failed!');
        console.error('Error:', err.message);
        process.exit(1);
    }
}

testConnection();
