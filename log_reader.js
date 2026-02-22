const fs = require('fs');

function tryRead(file) {
    const encodings = ['utf16le', 'utf8', 'latin1'];
    for (const enc of encodings) {
        try {
            const content = fs.readFileSync(file, enc);
            if (content.length > 10) {
                console.log(`--- Content in ${enc} ---`);
                console.log(content.substring(0, 1000));
                fs.writeFileSync('log_readable.txt', content);
                return true;
            }
        } catch (e) { }
    }
    return false;
}

if (!tryRead('full_schema.sql')) {
    console.log('Could not read log file.');
}
