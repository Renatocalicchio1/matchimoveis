const fs   = require('fs');
const path = require('path');
const BASE = __dirname;

// Fix suporte.js — adicionar todas as perguntas não entendidas
let sup = fs.readFileSync(path.join(BASE,'cerebro','suporte.js'),'utf8');

const novasFAQ = [
  {
    k: 'campos planilha precisa|campos da planilha|quais campos|campos obrigatorios',
    r: '📋 <strong>Campos obrigatórios na planilha:</strong><br><br>• Nome · Celular/Telefone · E-mail<br>• ID do anúncio · URL do anúncio<br>• Estado · Cidade · Bairro<br>• Quartos · Suítes · Banheiros · Vagas · Área · Valor<br><br><strong>Mais importantes:</strong> ID do anúncio, nome, celular e URL do portal.'
  },
  {
    k: 'follow.?up|manda follow|fazer follow|followup|lembrar cliente|lembrete cliente',
    r: '📱 <strong>Follow-up</strong> ainda é manual. Dica: filtre leads sem visita há 7+ dias e entre em contato pelo WhatsApp.<br><br>Em breve teremos automação de follow-up direto pelo MatchImóveis.'
  },
  {
    k: 'link do cliente|link da vitrine|link vitrine|url vitrine|url do cliente',
    r: '✨ O <strong>link da vitrine</strong> é gerado automaticamente para cada lead com match.<br><br>Acesse a lead em <a href="/app/leads" style="color:#ff385c;font-weight:700">Leads →</a> e clique em <strong>Enviar Vitrine</strong>. O WhatsApp abre com o link pronto.'
  },
  {
    k: 'xml nao saiu|xml nao foi|xml nao apareceu|subir xml|enviar xml para portal',
    r: '🔧 <strong>XML não saiu no portal?</strong><br><br>1. Acesse <a href="/app/imoveis" style="color:#ff385c;font-weight:700">Imóveis →</a><br>2. Selecione os imóveis<br>3. Clique no portal desejado para gerar o XML<br>4. Copie o link em <a href="/app/portais" style="color:#ff385c;font-weight:700">Portais →</a><br>5. Cole nas configurações do portal<br><br>Se já tem o link mas não atualizou, aguarde até 24h ou regere o XML.'
  },
];

novasFAQ.forEach(faq => {
  const key = faq.k.split('|')[0];
  if (!sup.includes(key)) {
    sup = sup.replace(
      'module.exports',
      `FAQ.push({chave:/${faq.k}/, resposta:'${faq.r.replace(/'/g,"\\'")}' });\nmodule.exports`
    );
    console.log('ok suporte: ' + key);
  }
});
fs.writeFileSync(path.join(BASE,'cerebro','suporte.js'), sup);

// Fix nlp.js — adicionar sinônimos diretos para os mais repetidos
let nlp = fs.readFileSync(path.join(BASE,'cerebro','nlp.js'),'utf8');
nlp = nlp.replace(
  "if (/ver portal|ver portais|portais|vivareal",
  "if (/ver portal|ver portais|ver portias|portias|portais|vivareal"
);
fs.writeFileSync(path.join(BASE,'cerebro','nlp.js'), nlp);
console.log('ok nlp.js');

// Fix mercado.js — adicionar tipo mais buscado e quartos mais pedidos
let mer = fs.readFileSync(path.join(BASE,'cerebro','mercado.js'),'utf8');
if (!mer.includes('tipo mais buscado')) {
  const ins = `
  if (/tipo mais buscado|tipo mais pedido|tipo mais procurado|qual tipo mais/.test(mNorm)) {
    if (!leads||!leads.length) return 'Sem leads ainda para analisar.' + btn('Importar leads','/app-importar-leads');
    const contagem={};
    leads.forEach(l=>{const t=(l.tipo||l.origin?.tipo||'').toLowerCase();if(t)contagem[t]=(contagem[t]||0)+1;});
    const sorted=Object.entries(contagem).sort((a,b)=>b[1]-a[1]);
    if(!sorted.length) return 'Sem dados de tipo nas leads ainda.';
    return '📊 <strong>Tipos mais buscados pelas leads:</strong><br><br>'+sorted.slice(0,5).map((e,i)=>(i===0?'🥇':i===1?'🥈':'🥉')+' '+e[0]+': <strong>'+e[1]+'</strong> leads').join('<br>')+sugestaoMercado(btn,chip);
  }
  if (/quarto mais pedido|quartos mais pedido|quartos mais buscado|quantos quartos mais/.test(mNorm)) {
    if (!leads||!leads.length) return 'Sem leads ainda para analisar.';
    const contagem={};
    leads.forEach(l=>{const q=l.quartos||l.origin?.quartos||0;if(q)contagem[q]=(contagem[q]||0)+1;});
    const sorted=Object.entries(contagem).sort((a,b)=>b[1]-a[1]);
    if(!sorted.length) return 'Sem dados de quartos nas leads ainda.';
    return '📊 <strong>Quartos mais pedidos:</strong><br><br>'+sorted.slice(0,5).map((e,i)=>(i===0?'🥇':i===1?'🥈':'🥉')+' '+e[0]+' quartos: <strong>'+e[1]+'</strong> leads').join('<br>')+sugestaoMercado(btn,chip);
  }
`;
  // Adicionar função auxiliar e inserção
  mer = mer.replace(
    'function responder(mNorm, leads, imoveis, btn, chip) {',
    `function sugestaoMercado(btn,chip){ return '<br><br>'+chip('Bairros mais pedidos','demanda por bairro')+chip('Faixa de valor','faixa de valor'); }

function responder(mNorm, leads, imoveis, btn, chip) {${ins}`
  );
  fs.writeFileSync(path.join(BASE,'cerebro','mercado.js'), mer);
  console.log('ok mercado.js');
}

// Atualizar sinônimos
const sPath = path.join(BASE,'cerebro','sinonimos-aprendidos.json');
const s = JSON.parse(fs.readFileSync(sPath,'utf8'));
s['ver portias']                  = 'ver portais';
s['portias']                      = 'portais';
s['meu relatorrio']               = 'relatorio semanal';
s['relatorrio']                   = 'relatorio';
s['xml nao saiu']                 = 'xml nao saiu no vivareal';
s['subir xml']                    = 'gerar xml';
s['campos planilha precisa']      = 'campos planilha';
s['quais campos a planilha precisa'] = 'campos planilha';
s['link do cliente']              = 'vitrine do cliente';
s['manda follow-up']              = 'follow up';
s['tipo mais buscado']            = 'tipo mais buscado';
s['quartos mais pedidos']         = 'quartos mais pedido';
fs.writeFileSync(sPath, JSON.stringify(s,null,2));
console.log('ok sinonimos — total:', Object.keys(s).length);

// Rodar treino para validar
const {execSync} = require('child_process');
execSync('node treino-cerebro.js --silent', {cwd:BASE});
const rel = JSON.parse(fs.readFileSync(path.join(BASE,'cerebro','treino-relatorio.json'),'utf8'));
console.log('\nTreino:', rel.cobertura+'%', '| Nao entendeu:', rel.naoEntendeu);
if (rel.naoEntendidas.length) rel.naoEntendidas.forEach(n=>console.log(' -',n.pergunta));
