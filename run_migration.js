import pg from 'pg';
const { Pool } = pg;

const connectionString = process.env.DATABASE_URL || "postgresql://postgres:Louiseemel%40%23%262020@localhost:5432/kogna";

const pool = new Pool({
    connectionString,
    ssl: (connectionString && !connectionString.includes('localhost') && !connectionString.includes('127.0.0.1')) ? { rejectUnauthorized: false } : false
});

async function runMigration() {
    try {
        console.log('Migrating organizations table...');
        await pool.query('ALTER TABLE organizations ADD COLUMN IF NOT EXISTS whatsapp_connections_limit INT DEFAULT 1');
        console.log('Organizations table migrated.');

        console.log('Migrating products table...');
        await pool.query("ALTER TABLE products ADD COLUMN IF NOT EXISTS connections_bonus INT DEFAULT 0, ADD COLUMN IF NOT EXISTS type VARCHAR(50) DEFAULT 'KOINS'");
        console.log('Products table migrated.');

    } catch (err) {
        console.error('Migration failed:', err);
        process.exit(1);
    } finally {
        pool.end();
    }
}

runMigration();
