import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { Pool } = require('pg');
import fs from 'fs';
import fetch from 'node-fetch';

// Hardcoded fallback connection string from server.js
const connectionString = process.env.DATABASE_URL || "postgresql://postgres:Louiseemel%40%23%262020@localhost:5432/kogna";

const pool = new Pool({
    connectionString,
    ssl: (connectionString && !connectionString.includes('localhost')) ? { rejectUnauthorized: false } : false
});

async function run() {
    try {
        console.log('Connecting to DB...');
        // Find user
        const res = await pool.query("SELECT id FROM users WHERE email = 'natanael@kogna.co' LIMIT 1");

        let userId;
        if (res.rows.length > 0) {
            userId = res.rows[0].id;
            console.log(`Found user ID: ${userId}`);
        } else {
            // Fallback to any user
            console.log('User natanael@kogna.co not found, trying any user...');
            const anyUser = await pool.query("SELECT id FROM users LIMIT 1");
            if (anyUser.rows.length > 0) {
                userId = anyUser.rows[0].id;
                console.log(`Found fallback user ID: ${userId}`);
            } else {
                throw new Error('No users found in DB');
            }
        }

        // Test Endpoint
        console.log(`Testing /api/dashboard/metrics for user ${userId}...`);

        const response = await fetch('http://localhost:3000/api/dashboard/metrics', {
            headers: {
                'Authorization': `Bearer mock-jwt-token-for-${userId}`
            }
        });

        const status = response.status;
        const text = await response.text();

        console.log(`Response Status: ${status}`);
        console.log(`Response Body: ${text}`);

        fs.writeFileSync('dashboard_verification.txt', `
Status: ${status}
Body: ${text}
        `.trim());

    } catch (err) {
        console.error('Error:', err);
        fs.writeFileSync('dashboard_verification.txt', `Error: ${err.message}\nStack: ${err.stack}`);
    } finally {
        await pool.end();
    }
}

run();
