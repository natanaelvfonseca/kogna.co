import fs from 'fs';
const log = (msg) => {
    fs.appendFileSync('diagnose.log', msg + '\n');
};

log('Starting diagnosis at ' + new Date().toISOString());

try {
    const modules = [
        ['express', (m) => m.default],
        ['node-fetch', (m) => m.default],
        ['cors', (m) => m.default],
        ['multer', (m) => m.default],
        ['openai', (m) => m.default],
        ['mercadopago', (m) => m.MercadoPagoConfig],
        ['pdf-parse', (m) => m.default],
        ['bcryptjs', (m) => m.default],
        ['cookie-parser', (m) => m.default],
        ['jsonwebtoken', (m) => m.default],
        ['helmet', (m) => m.default],
        ['express-rate-limit', (m) => m.default],
        ['dotenv', (m) => m.default],
        ['pg', (m) => m.default]
    ];

    for (const [name, check] of modules) {
        try {
            log('Importing ' + name + '...');
            const m = await import(name);
            log(name + ' imported successfully');
            if (check(m)) {
                log(name + ' check passed');
            } else {
                log(name + ' check FAILED (missing export)');
            }
        } catch (e) {
            log(name + ' IMPORT FAILED: ' + e.message);
        }
    }
    log('Diagnosis complete');
} catch (e) {
    log('CRITICAL DIAGNOSIS ERROR: ' + e.message);
}
