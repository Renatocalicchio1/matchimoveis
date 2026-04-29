const fs = require('fs');

let file = fs.readFileSync('./services/locationEngine.js','utf8');

const newDetect = `
function detectBairro(text='') {
  const t = normalize(text);

  const known = [
    'bela vista','vila mariana','moema','pinheiros',
    'jardim paulista','morumbi','brooklin','ipiranga',
    'vila olimpia','perdizes','jabaquara','santana',
    'tatuape','lapa','barra funda'
  ];

  for (const b of known) {
    if (t.includes(b)) {
      return { tipo: 'bairro', valor: b, fonte: 'texto' };
    }
  }

  const m = text.match(/([A-Z][a-z]+\\s?[A-Z]?[a-z]+)\\s*(em|na|no)/);
  if (m) {
    return { tipo: 'bairro', valor: m[1].toLowerCase(), fonte: 'regex' };
  }

  return null;
}
`;

file = file.replace(/function detectBairro\([\s\S]*?return null;\s*\}/g, newDetect);

fs.writeFileSync('./services/locationEngine.js', file);

console.log('LOCATION ENGINE FIXADO');
