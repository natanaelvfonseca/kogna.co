const fs = require('fs');
try {
    const data = fs.readFileSync('migration_final.log');
    fs.writeFileSync('migration_simple.txt', data.toString());
} catch (e) {
    fs.writeFileSync('migration_simple.txt', 'Error reading log: ' + e.message);
}
