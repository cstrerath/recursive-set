const fs = require('fs');
const path = require('path');

const cjsPath = path.join(__dirname, '..', 'dist', 'cjs', 'package.json');

fs.writeFileSync(cjsPath, JSON.stringify({ type: "commonjs" }, null, 2));

console.log('CommonJS marker created.');
