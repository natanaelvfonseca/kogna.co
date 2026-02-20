
(async () => {
    try {
        console.log('Testing imports...');
        const { createRequire } = await import('module');
        const require = createRequire(import.meta.url);
        console.log('require created');

        await import('express');
        console.log('express imported');

        await import('pg');
        console.log('pg imported');

        await import('openai');
        console.log('openai imported');

        require('dotenv').config();
        console.log('dotenv loaded');

        console.log('ALL IMPORTS OK');
    } catch (e) {
        console.error('IMPORT ERROR:', e);
        process.exit(1);
    }
})();
