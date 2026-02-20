import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { Pool } = require('pg');
import fs from 'fs';
import fetch from 'node-fetch';

const connectionString = process.env.DATABASE_URL || "postgresql://postgres:Louiseemel%40%23%262020@localhost:5432/kogna";

const pool = new Pool({
    connectionString,
    ssl: (connectionString && !connectionString.includes('localhost')) ? { rejectUnauthorized: false } : false
});

async function run() {
    let client;
    try {
        client = await pool.connect();

        // 1. Create or Get Admin User
        console.log('Ensuring admin user exists...');
        const adminEmail = 'admin_test@kogna.co';
        let adminId;

        const userRes = await client.query("SELECT id FROM users WHERE email = $1", [adminEmail]);
        if (userRes.rows.length > 0) {
            adminId = userRes.rows[0].id;
            // Ensure role is admin
            await client.query("UPDATE users SET role = 'admin' WHERE id = $1", [adminId]);
        } else {
            const newAdmin = await client.query(
                "INSERT INTO users (name, email, role, created_at) VALUES ('Admin Test', $1, 'admin', NOW()) RETURNING id",
                [adminEmail]
            );
            adminId = newAdmin.rows[0].id;
        }
        console.log(`Using Admin ID: ${adminId}`);

        // 2. Test Endpoints
        const headings = ['Stats', 'Users', 'Consumption'];
        const endpoints = [
            'http://localhost:3000/api/admin/stats',
            'http://localhost:3000/api/admin/users',
            'http://localhost:3000/api/admin/consumption'
        ];

        let outputLog = '';

        for (let i = 0; i < endpoints.length; i++) {
            console.log(`Testing ${headings[i]}...`);
            const res = await fetch(endpoints[i], {
                headers: { 'Authorization': `Bearer mock-jwt-token-for-${adminId}` }
            });

            const status = res.status;
            const data = await res.text();

            outputLog += `\n--- ${headings[i]} (${status}) ---\n${data.substring(0, 500)}...\n`;

            if (status !== 200) {
                console.error(`Failed ${headings[i]}: ${status}`);
            }
        }

        // 3. Test Action (Add User)
        console.log('Testing Create User...');
        const newEmail = `test_user_${Date.now()}@example.com`;
        const createRes = await fetch('http://localhost:3000/api/admin/users', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer mock-jwt-token-for-${adminId}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ name: 'Test User Created', email: newEmail, role: 'user' })
        });
        outputLog += `\n--- Create User (${createRes.status}) ---\n${await createRes.text()}\n`;

        fs.writeFileSync('admin_verification.txt', outputLog);
        console.log('Verification finished.');

    } catch (err) {
        console.error('Error:', err);
        fs.writeFileSync('admin_verification.txt', `Error: ${err.message}\nStack: ${err.stack}`);
    } finally {
        if (client) client.release();
        await pool.end();
    }
}

run();
