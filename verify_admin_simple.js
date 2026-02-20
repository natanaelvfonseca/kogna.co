import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { Pool } = require('pg');
import fetch from 'node-fetch';
import fs from 'fs';

const connectionString = process.env.DATABASE_URL || "postgresql://postgres:Louiseemel%40%23%262020@localhost:5432/kogna";

const pool = new Pool({
    connectionString,
    ssl: (connectionString && !connectionString.includes('localhost')) ? { rejectUnauthorized: false } : false
});

async function run() {
    let client;
    try {
        client = await pool.connect();
        const adminEmail = 'admin_test@kogna.co';

        let adminId;
        const userRes = await client.query("SELECT id FROM users WHERE email = $1", [adminEmail]);
        if (userRes.rows.length === 0) {
            console.log("Admin user not found, creating...");
            const newAdmin = await client.query(
                "INSERT INTO users (name, email, role, created_at) VALUES ('Admin Test', $1, 'admin', NOW()) RETURNING id",
                [adminEmail]
            );
            adminId = newAdmin.rows[0].id;
        } else {
            adminId = userRes.rows[0].id;
        }

        console.log(`Fetching Stats for Admin: ${adminId}`);
        const res = await fetch('http://localhost:3000/api/admin/stats', {
            headers: { 'Authorization': `Bearer mock-jwt-token-for-${adminId}` }
        });


        console.log(`Status: ${res.status}`);
        const text = await res.text();
        fs.writeFileSync('simple_output_utf8.txt', `Status: ${res.status}\nBody: ${text}`, 'utf8');
        console.log('Output written to simple_output_utf8.txt');

    } catch (err) {
        console.error('Error:', err);
        fs.writeFileSync('simple_output_utf8.txt', `Error: ${err.message}`, 'utf8');

    } finally {
        if (client) client.release();
        await pool.end();
    }
}

run();
