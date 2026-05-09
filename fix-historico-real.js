const fs   = require('fs');
const path = require('path');
const BASE = __dirname;

// Fix suporte.js — adicionar as top não entendidas
let sup = fs.readFileSync(path.join(BASE,'cerebro','suporte.js'),'utf8');

const novas = [
  {
    k:'enviar vitrine para cliente|mandar vitrine para cliente|como envio vitrine|como mando vitrine',
    r:'📱 <strong>Enviar vitrine para o cliente:</strong><br><br>1. Acesse <a href="/app/leads" style="color:#ff385c;font-weight:700">Leads →</a><br>2. Encontre a lead com match<br>3. Clique em <strong>Enviar Vitrine</strong><br>4. O WhatsApp abre com a mensagem pronta:<br><em>"Olá! Separamos algumas oportunidades. Veja: [link]"</em>'
  },
  {
    k:'como adicionar foto|como coloco foto|como subo foto|adicionar foto imovel|fotos do imovel como',
    r:'📸 <strong>Adicionar fotos ao imóvel:</strong><br><br>1. Acesse <a href="/app/imoveis" style="color:#ff385c;font-weight:700">Imóveis →</a><br>2. Clique no imóvel<br>3. Clique em <strong>Editar</strong><br>4. Role até <strong>Fotos</strong><br>5. Clique em <strong>Adicionar Fotos</strong><br><br>Formatos: JPG, PNG. Mínimo recomendado: 5 fotos.'
  },
];

novas.forEach(faq => {
  const key = faq.k.split('|')[0];
  if (!sup.includes(key)) {
    sup = sup.replace(
      'module.exports',
      `FAQ.push({chave:/${faq.k}/, resposta:'${faq.r.replace(/'/g,"\\'")}' });\nmodule.exports`
    );
    console.log('ok suporte:', key);
  }
});
fs.writeFileSync(path.join(BASE,'cerebro','suporte.js'), sup);

// Fix nlp.js — ver portias e ver portais
let nlp = fs.readFileSync(path.join(BASE,'cerebro','nlp.js'),'utf8');
if (!nlp.includes('portias')) {
  nlp = nlp.replace(
    "if (/ver portal|ver portais|portais|vivareal",
    "if (/ver portal|ver portais|ver portias|portias|portais|vivareal"
  );
  fs.writeFileSync(path.join(BASE,'cerebro','nlp.js'), nlp);
  console.log('ok nlp.js portias');
}

// Fix sinônimos — todas as variações das não entendidas
const sPath = path.join(BASE,'cerebro','sinonimos-aprendidos.json');
const s = JSON.parse(fs.readFileSync(sPath,'utf8'));

const novos = {
  'ver portias':                        'ver portais',
  'portias':                            'portais',
  'meu relatorrio':                     'relatorio semanal',
  'relatorrio':                         'relatorio',
  'quais campos a planilha precisa':    'campos planilha',
  'campos a planilha precisa':          'campos planilha',
  'manda follow-up':                    'follow up',
  'manda followup':                     'follow up',
  'fazer followup':                     'follow up',
  'enviar vitrine para cliente':        'enviar vitrine',
  'mandar vitrine para cliente':        'enviar vitrine',
  'como envio vitrine':                 'enviar vitrine',
  'como mando vitrine':                 'enviar vitrine',
  'link do cliente':                    'vitrine do cliente',
  'ver portais':                        'ver portais',
  'xml nao saiu':                       'xml nao atualizou',
  'xml nao saiu no vivareal':           'xml nao atualizou',
  'subir xml':                          'gerar xml',
  'tipo mais buscado':                  'tipo mais buscado',
  'quartos mais pedidos':               'quartos mais pedido',
  'a extracao falhou':                  'extracao falhou',
  'extracao falhou':                    'extracao falhou',
  'como adicionar fotos':               'como adicionar foto',
  'como coloco fotos':                  'como adicionar foto',
  'como subo fotos':                    'como adicionar foto',
};

let add = 0;
for (const [k,v] of Object.entries(novos)) {
  if (!s[k]) { s[k]=v; add++; }
}
fs.writeFileSync(sPath, JSON.stringify(s,null,2));
console.log('ok sinonimos +'+add+' (total:'+Object.keys(s).length+')');

// Limpar não entendidas que agora têm resposta
const naoEntP = path.join(BASE,'assistente-nao-entendidos.json');
const naoEnt = JSON.parse(fs.readFileSync(naoEntP,'utf8'));
const resolvidas = ['quais campos a planilha precisa','manda follow-up','ver portias','link do cliente',
  'ver portais','meu relatorrio','tipo mais buscado','quartos mais pedidos',
  'xml nao saiu no vivareal','subir xml','enviar vitrine para cliente',
  'como adicionar fotos','a extracao falhou'];

const antes = naoEnt.nao_entendidos.length;
naoEnt.nao_entendidos = naoEnt.nao_entendidos.filter(n => {
  return !resolvidas.some(r => n.exemplo && n.exemplo.toLowerCase().includes(r.split(' ')[0]));
});
fs.writeFileSync(naoEntP, JSON.stringify(naoEnt,null,2));
console.log('ok limpeza: removidas', antes - naoEnt.nao_entendidos.length, 'resolvidas');

// Rodar treino
const {execSync} = require('child_process');
execSync('node treino-cerebro.js --silent', {cwd:BASE});
const rel = JSON.parse(fs.readFileSync(path.join(BASE,'cerebro','treino-relatorio.json'),'utf8'));
console.log('\nTreino:', rel.cobertura+'%', '| Nao entendeu:', rel.naoEntendeu);
if (rel.naoEntendidas.length) rel.naoEntendidas.forEach(n=>console.log(' -',n.pergunta));
