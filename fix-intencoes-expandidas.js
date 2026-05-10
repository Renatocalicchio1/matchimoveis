const fs = require('fs');
let ctx = fs.readFileSync('cerebro/contexto.js', 'utf8');

// SAUDAÇÃO
ctx = ctx.replace(
  /SAUDACAO:.*\/i,/,
  `SAUDACAO: /^(o+i+|ol[aá]+|hey+|opa+|salve|e a[ií]+|eae|eai|oi+|hello|hi+|bom dia|boa tarde|boa noite|good morning|boa|tudo bem|tudo bom|tudo certo|tudo ok|como vai|como voce ta|como vc ta|oi sumido|ola sumido|voltei|estou aqui|to aqui|to de volta|vim aqui|preciso de ajuda|me ajuda|me ajude|pode me ajudar|ola tudo|oi tudo)[\\s!?.,]*$/i,`
);

// CADASTRAR LEAD
ctx = ctx.replace(
  /CADASTRAR_LEAD:.*\/i,/,
  `CADASTRAR_LEAD: /cadastra(r)?(\\s+um?)?\\s+(lead|cliente|contato|interessado)|novo\\s+(lead|cliente|contato|interessado|atendimento)|adiciona(r)?(\\s+um?)?\\s+(lead|cliente|contato)|criar\\s+(lead|cliente|contato)|anota(r)?\\s+(lead|cliente|contato|esse|o)|salva(r)?\\s+(lead|cliente|contato|esse|o)|novo atendimento|pode(\\s+me)?\\s+cadastrar|quer(o)?\\s+cadastrar|preciso\\s+cadastrar|registra(r)?\\s+(lead|cliente|contato)|inclui(r)?\\s+(lead|cliente)|lanca(r)?\\s+(lead|cliente)|bota(r)?\\s+(lead|cliente)|coloca(r)?\\s+(lead|cliente)|tenho\\s+(um\\s+)?(novo\\s+)?(lead|cliente|interessado|contato)|captei\\s+(um\\s+)?(cliente|lead)|peguei\\s+(um\\s+)?(cliente|lead)|tem\\s+(um\\s+)?(cliente|lead)\\s+(novo|aqui|interessado)/i,`
);

// IMPORTAR XML
ctx = ctx.replace(
  /IMPORTAR_XML:.*\/,/,
  `IMPORTAR_XML: /importa(r)?(\\s+o|\\s+um|\\s+os|\\s+meus)?\\s+(xml|imoveis?|feed|carteira)|trazer\\s+(imoveis?|carteira|feed)|subir\\s+(xml|imoveis?|feed)|url\\s+(do\\s+)?(feed|xml)|puxar\\s+(imoveis?|feed|xml)|sincronizar\\s+imoveis?|atualizar\\s+(imoveis?|xml|feed)|trazer\\s+do\\s+(crm|tecimob|rankim|vista|jetimob|kenlo|vistasoft|vistasoftware)|como\\s+(importo|importar|faço\\s+para\\s+importar)|quero\\s+importar|preciso\\s+importar|tenho\\s+(um\\s+)?(xml|feed)|meu\\s+(xml|feed|crm)|cole\\s+a\\s+url|link\\s+do\\s+(xml|feed)|conectar\\s+(crm|sistema)|integrar\\s+(com\\s+)?(crm|tecimob|rankim|vista)/i,`
);

// EXPORTAR XML
ctx = ctx.replace(
  /EXPORTAR_XML:.*\/i,/,
  `EXPORTAR_XML: /exporta(r)?(\\s+o)?\\s+xml|gera(r)?(\\s+um|\\s+o)?\\s+xml|xml\\s+(do|para|no|em|pro)\\s+|xml\\s+no\\s+padr[aã]o|(vivareal|viva\\s*real|zap|zap\\s*imoveis|olx|imovelweb|imovel\\s*web|chaves|chaves\\s*na\\s*mao|123i).*xml|xml.*(vivareal|zap|olx|imovelweb|chaves|123i)|publicar(\\s+imoveis?)?\\s*(no|em|para|pro)\\s+(portal|vivareal|zap|olx|imovelweb|chaves|123i)|enviar\\s+(xml|imoveis?)\\s*(para|pro)\\s+portal|subir\\s*(no|em|para|pro)\\s+(vivareal|zap|olx|imovelweb|chaves|123i|portal)|quero\\s+publicar|preciso\\s+publicar|integrar\\s+(com\\s+)?(vivareal|zap|olx)|feed\\s+(para|pro|do)\\s+(vivareal|zap|olx|imovelweb|chaves|123i)/i,`
);

fs.writeFileSync('cerebro/contexto.js', ctx);
console.log('intencoes expandidas');

// Expandir sinonimos no NLP
let nlp = fs.readFileSync('cerebro/nlp.js', 'utf8');
console.log('nlp ok');

// Expandir no cerebro.js via npm run cerebro
console.log('rodando cerebro...');
require('child_process').execSync('npm run cerebro', {stdio:'inherit'});
console.log('✅ DONE');
