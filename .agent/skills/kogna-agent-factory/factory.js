const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

// Configuration
const connectionString = process.env.DATABASE_URL;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

if (!connectionString) {
    console.error("Error: DATABASE_URL is not set.");
    process.exit(1);
}

const pool = new Pool({
    connectionString,
    ssl: false // Adjust based on env
});

// Paths
const TEMPLATES_DIR = path.join(__dirname, 'templates');
const RAG_DIR = path.join(__dirname, 'rag');
const REGISTRY_DIR = path.join(__dirname, 'agent_registry');

/**
 * Main Factory Function
 */
async function createAgent(companyId, agentType, onboardingData, files = [], promptCustom = "") {
    console.log(`[Factory] Starting Agent Creation for Company: ${companyId}`);

    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        // 1. Verify Company/Namespace
        console.log(`[Factory] Step 1: verifying namespace for ${companyId}`);
        const orgRes = await client.query('SELECT id FROM organizations WHERE id = $1', [companyId]);
        if (orgRes.rows.length === 0) {
            throw new Error(`Organization ${companyId} not found.`);
        }

        // 2. Process RAG (Mocking ingestion for now, real imp would use Vector Store)
        console.log(`[Factory] Step 2: Processing ${files.length} RAG files...`);
        // In a real implementation:
        // - Load files
        // - Chunk and Embed (using OPENAI_API_KEY)
        // - Upsert to VectorDB (isolated by namespace/companyId)
        const ragConfig = {
            vectorStore: 'pinecone', // or pgvector
            namespace: companyId,
            index: 'kogna-main',
            files_ingested: files
        };

        // 3. Build Prompt from Template
        console.log(`[Factory] Step 3: Building Prompt for type ${agentType}`);
        const templatePath = path.join(TEMPLATES_DIR, `${agentType}.md`);
        let baseTemplate = "";

        if (fs.existsSync(templatePath)) {
            baseTemplate = fs.readFileSync(templatePath, 'utf8');
        } else {
            console.warn(`[Factory] Template ${agentType} not found. Using generic fallback.`);
            baseTemplate = "You are a helpful AI assistant for {{company_name}}.";
        }

        // Merge Data
        let systemPrompt = baseTemplate
            .replace('{{company_name}}', onboardingData.companyName || "Unknown Company")
            .replace('{{product}}', onboardingData.product || "our products")
            .replace('{{objective}}', onboardingData.objective || "help users");

        if (promptCustom) {
            systemPrompt += `\n\nAdditional Rules:\n${promptCustom}`;
        }

        // 4. Configure Tools
        console.log(`[Factory] Step 4: Configuring Tools`);
        const toolsConfig = {
            crm_access: true,
            calendar_access: true, // Check onboardingData for preferences
            rag_enabled: files.length > 0
        };

        // 5. Register Agent
        console.log(`[Factory] Step 5: Registering Agent`);
        const agentId = `agent_${companyId.substring(0, 8)}_${Date.now()}`;

        // Save to DB (mocking schema for 'agents' table if it doesn't exist, using ia_configs as proxy or creating new)
        // Checks if 'agents' table exists, if not, use ia_configs or just log
        // For this implementation, we'll assume we update 'ia_configs' or insert into a new 'agents' table.
        // Let's stick to updating 'ia_configs' as per current project structure, OR print the JSON for the registry.

        const agentRecord = {
            id: agentId,
            company_id: companyId,
            type: agentType,
            system_prompt: systemPrompt,
            tools: toolsConfig,
            rag_config: ragConfig,
            created_at: new Date()
        };

        // Write to local registry file as backup/log
        if (!fs.existsSync(REGISTRY_DIR)) fs.mkdirSync(REGISTRY_DIR, { recursive: true });
        fs.writeFileSync(path.join(REGISTRY_DIR, `${agentId}.json`), JSON.stringify(agentRecord, null, 2));

        await client.query('COMMIT');
        console.log(`[Factory] SUCCESS: Agent Created. ID: ${agentId}`);
        return agentRecord;

    } catch (e) {
        await client.query('ROLLBACK');
        console.error(`[Factory] FAILED: ${e.message}`);
        throw e;
    } finally {
        client.release();
    }
}

// CLI Entry Point
if (require.main === module) {
    const args = process.argv.slice(2);
    // Naive arg parsing
    const companyId = args[args.indexOf('--companyId') + 1];
    const type = args[args.indexOf('--type') + 1] || 'custom';
    // ... parse others

    if (!companyId) {
        console.log("Usage: node factory.js --companyId <ID> --type <TYPE>");
        // process.exit(1); 
        // Allow dry run or testing logic here
    }

    // Test Run
    // createAgent(...)
}

module.exports = { createAgent };
