import pg from 'pg';
import fs from 'fs';
const { Pool } = pg;

const connectionString = process.env.DATABASE_URL || "postgresql://postgres:Louiseemel%40%23%262020@localhost:5432/kogna";

const pool = new Pool({
    connectionString,
    ssl: (connectionString && !connectionString.includes('localhost') && !connectionString.includes('127.0.0.1')) ? { rejectUnauthorized: false } : false
});

async function verify() {
    try {
        const res = await pool.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'organizations' OR table_name = 'products';
    `);
        fs.writeFileSync('db_verify.json', JSON.stringify(res.rows, null, 2));
    } catch (err) {
        fs.writeFileSync('db_verify.json', JSON.stringify({ error: err.message }));
    } finally {
        pool.end();
    }
}

verify();
