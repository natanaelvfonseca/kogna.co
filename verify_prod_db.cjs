const { Client } = require('pg');

const connectionString = "postgresql://postgres:e347b46720637d00cfcb96d2d5d0753f@62.171.145.215:5432/kogna_prod";

async function verifyProdDB() {
    console.log("Iniciando verificação...");
    const client = new Client({ connectionString });
    try {
        console.log("Conectando ao banco de produção...");
        await client.connect();
        console.log("Conectado! Verificando colunas...");
        const res = await client.query(`
            SELECT column_name, data_type 
            FROM information_schema.columns 
            WHERE table_name = 'leads' 
            AND (column_name = 'score' OR column_name = 'temperature');
        `);
        console.log("Colunas encontradas:", JSON.stringify(res.rows));

        console.log("Contando leads...");
        const countRes = await client.query("SELECT COUNT(*) FROM leads");
        console.log("Total de leads no banco:", countRes.rows[0].count);
    } catch (err) {
        console.error("Erro ao verificar banco:", err.message);
    } finally {
        await client.end();
        console.log("Conexão encerrada.");
    }
}

verifyProdDB();
