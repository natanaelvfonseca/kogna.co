const { Client } = require('pg');

// SQL para adicionar as colunas se elas não existirem
const sql = `
ALTER TABLE leads ADD COLUMN IF NOT EXISTS score INTEGER DEFAULT 0;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS temperature TEXT DEFAULT 'Frio';
`;

// String de conexão para o banco de PRODUÇÃO (conforme seu histórico)
const connectionString = "postgresql://postgres:e347b46720637d00cfcb96d2d5d0753f@62.171.145.215:5432/kogna_prod";

async function fixProductionDB() {
    const client = new Client({ connectionString });
    try {
        console.log("Conectando ao banco de produção...");
        await client.connect();
        console.log("Conectado! Aplicando atualização de esquema...");
        await client.query(sql);
        console.log("Sucesso! Colunas 'score' e 'temperature' adicionadas.");
    } catch (err) {
        console.error("Erro ao atualizar banco:", err.message);
    } finally {
        await client.end();
    }
}

fixProductionDB();
