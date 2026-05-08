#!/bin/bash
cd "$HOME/Downloads/matchimoveis "

# Copiar auto-expansor
cp ~/Downloads/auto-expansor.js ./auto-expansor.js

# Atualizar package.json com novos scripts
node -e "
const fs = require('fs');
const pkg = JSON.parse(fs.readFileSync('package.json','utf8'));
pkg.scripts['expandir']  = 'node auto-expansor.js';
pkg.scripts['cerebro']   = 'node cerebro.js && node auto-expansor.js';
pkg.scripts['atualizar'] = 'node cerebro.js && node auto-expansor.js && echo done';
fs.writeFileSync('package.json', JSON.stringify(pkg, null, 2));
console.log('✅ package.json atualizado!');
"

echo ""
echo "Scripts disponíveis:"
cat package.json | grep -A10 '"scripts"'
echo ""
echo "Testando expansor..."
npm run expandir
