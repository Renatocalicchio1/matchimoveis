const fs = require('fs');

let f = fs.readFileSync('./services/extractor.js','utf8');

// garante import correto
if (!f.includes("require('./services/locationEngine')")) {
  f = "const { resolveLocation } = require('./services/locationEngine');\n" + f;
}

// remove imports errados antigos
f = f.replace(/require\('\\.\/locationEngine'\)/g, "require('./services/locationEngine')");

fs.writeFileSync('./services/extractor.js', f);

console.log('EXTRACTOR FIX OK');
