const fs = require('fs');
let ctx = fs.readFileSync('cerebro/contexto.js', 'utf8');

// 1. CADASTRAR_LEAD — regex mais abrangente
ctx = ctx.replace(
  /CADASTRAR_LEAD:.*\/,/,
  `CADASTRAR_LEAD: /cadastra(r)?(\\s+um?)?\\s+(lead|cliente)|novo\\s+(lead|cliente|interessado)|adiciona(r)?(\\s+um?)?\\s+(lead|cliente)|criar\\s+(lead|cliente)|anota(r)?\\s+(lead|cliente)|salva(r)?\\s+(lead|cliente)|novo atendimento|pode(\\s+me)?\\s+cadastrar|quer(o)?\\s+cadastrar|preciso\\s+cadastrar/i,`
);

// 2. EXPORTAR_XML — regex mais abrangente  
ctx = ctx.replace(
  /EXPORTAR_XML:.*\/,/,
  `EXPORTAR_XML: /exporta(r)?\\s+xml|gera(r)?\\s+(um\\s+)?xml|xml\\s+(do|para|no|em)\\s+|xml\\s+no\\s+padr.o|(vivareal|zap|olx|imovelweb|chaves|123i).*xml|xml.*(vivareal|zap|olx|imovelweb|chaves|123i)|publicar|enviar\\s+xml/i,`
);

fs.writeFileSync('cerebro/contexto.js', ctx);
console.log('ok');
