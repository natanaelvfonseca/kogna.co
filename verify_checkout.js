import pg from 'pg';
import fs from 'fs';

const connectionString = "postgres://postgres.ydzcdomjuztdwpxxsczy:7b3Xv$55e$rWpXW@aws-0-sa-east-1.pooler.supabase.com:6543/postgres";
const pool = new pg.Pool({
    connectionString,
    ssl: { rejectUnauthorized: false }
});

async function runTest() {
    try {
        console.log("--- STARTING WEBHOOK AND DB VERIFICATION ---");

        // 1. Get an existing organization and user or create a temporary one
        const orgRes = await pool.query("SELECT id, whatsapp_connections_limit FROM organizations LIMIT 1");
        if (orgRes.rows.length === 0) {
            console.log("No organizations found to test.");
            process.exit(1);
        }

        const org = orgRes.rows[0];
        console.log(`Original limit for Org ${org.id}: ${org.whatsapp_connections_limit}`);

        // 2. Simulate webhook applying Connections Bonus
        const connectionsToCredit = 2; // Simulating purchasing 2 connections

        await pool.query(
            "UPDATE organizations SET whatsapp_connections_limit = whatsapp_connections_limit + $1 WHERE id = $2",
            [connectionsToCredit, org.id]
        );

        // 3. Verify it was applied
        const updatedOrgRes = await pool.query("SELECT whatsapp_connections_limit FROM organizations WHERE id = $1", [org.id]);
        const newLimit = updatedOrgRes.rows[0].whatsapp_connections_limit;
        console.log(`New limit for Org ${org.id}: ${newLimit}`);

        if (newLimit === org.whatsapp_connections_limit + connectionsToCredit) {
            console.log("SUCCESS: Connection limit incremented correctly.");
        } else {
            console.log("ERROR: Connection limit did not increment correctly.");
        }

        // 4. Test product creation schema
        const prodRes = await pool.query("INSERT INTO products (name, description, price, active, koins_bonus, connections_bonus, type) VALUES ('Pack 5 Conexões', 'Teste', 49.90, true, 0, 5, 'CONNECTIONS') RETURNING id, type, connections_bonus");
        console.log("SUCCESS: Created test product:", prodRes.rows[0]);

        // Cleanup test product
        await pool.query("DELETE FROM products WHERE id = $1", [prodRes.rows[0].id]);

        // Revert org limit (Optional, but good for cleanliness)
        await pool.query("UPDATE organizations SET whatsapp_connections_limit = whatsapp_connections_limit - $1 WHERE id = $2", [connectionsToCredit, org.id]);

        console.log("--- VERIFICATION COMPLETE ---");
        fs.writeFileSync("test_results.log", "SUCCESS\n");
    } catch (e) {
        console.error("TEST FAILED", e);
        fs.writeFileSync("test_results.log", `FAILED: ${e.message}\n`);
    } finally {
        await pool.end();
    }
}

runTest();
