import fs from 'fs';
let content = fs.readFileSync('server.js', 'utf8');

console.log('Original length:', content.length);

// 1. Replace isAdmin as middleware
content = content.replace(/isAdmin,/g, 'verifyAdmin,');

// 2. Replace getUserId(req) and getAuthenticatedUserId(req)
// Case 1: const userId = await getUserId(req);
content = content.replace(/await getUserId\(req\)/g, 'req.userId');
content = content.replace(/await getAuthenticatedUserId\(req\)/g, 'req.userId');

// Case 2: getUserId(req) as function call
content = content.replace(/getUserId\(req\)/g, 'req.userId');
content = content.replace(/getAuthenticatedUserId\(req\)/g, 'req.userId');

// 3. Fix the specific requesterId line
content = content.replace(/const requesterId = req\.userId;/g, 'const requesterId = req.userId;'); // Already done but safe

// 4. Ensure no remaining isAdmin definitions (should be gone but just in case)
// We already removed the definition.

fs.writeFileSync('server.js', content);
console.log('Fixed length:', content.length);
console.log('Refactor complete.');
