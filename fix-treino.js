const fs   = require('fs');
const path = require('path');
const BASE = __dirname;

// ── Adicionar no suporte.js ───────────────────────────────────────────────────
let sup = fs.readFileSync(path.join(BASE,'cerebro','suporte.js'),'utf8');

const novas = [
  { k:'extracao falhou|extracao nao funcionou|nao extraiu',
    r:'🔧 <strong>Extração falhou?</strong><br><br>Causas:<br>• Planilha fora do padrão do portal<br>• Campos obrigatórios vazios (bairro, tipo, quartos)<br>• Arquivo corrompido<br><br>Exporte novamente do portal e reimporte.' },
  { k:'quais campos planilha|campos obrigatorios|o que precisa na planilha',
    r:'📋 <strong>Campos obrigatórios na planilha:</strong><br>• Nome · Telefone ou e-mail · Bairro · Tipo · Quartos · Valor máximo<br><br>Sem bairro + tipo + quartos o match não funciona.' },
  { k:'link do cliente|vitrine do cliente|link da vitrine|enviar link',
    r:'✨ A <strong>vitrine</strong> é a página enviada ao lead com imóveis em match. Acesse <a href="/app/leads" style="color:#ff385c;font-weight:700">Leads →</a> e clique em <strong>Enviar Vitrine</strong>.' },
  { k:'follow.?up|lembrar cliente|mandar lembrete',
    r:'📱 Follow-up ainda é manual. Em breve teremos automação direto pelo MatchImóveis.<br><br>Dica: filtre leads sem visita há 7+ dias e entre em contato.' },
  { k:'como comeco|por onde comecar|primeiro passo|nao sei comecar',
    r:'🚀 <strong>Por onde começar:</strong><br>1. Importe XML dos imóveis<br>2. Importe planilha de leads<br>3. Faça o match<br>4. Envie vitrine<br>5. Aguarde visitas' },
];

novas.forEach(faq => {
  const key = faq.k.split('|')[0];
  if (!sup.includes(key)) {
    sup = sup.replace(
      'module.exports',
      `FAQ.push({chave:/${faq.k}/, resposta:'${faq.r.replace(/'/g,"\\'")}'});\nmodule.exports`
    );
    console.log(`✅ adicionado: ${key}`);
  } else {
    console.log(`⏭️  já existe: ${key}`);
  }
});

fs.writeFileSync(path.join(BASE,'cerebro','suporte.js'), sup);

// ── Adicionar sinonimos ───────────────────────────────────────────────────────
const sPath = path.join(BASE,'cerebro','sinonimos-aprendidos.json');
const s = fs.existsSync(sPath) ? JSON.parse(fs.readFileSync(sPath,'utf8')) : {};
s['ver portias']    = 'portais';
s['portias']        = 'portais';
s['relatorrio']     = 'relatorio';
s['meu relatorrio'] = 'relatorio';
s['como comeco']    = 'primeiros passos';
s['follow-up']      = 'follow up';
s['followup']       = 'follow up';
fs.writeFileSync(sPath, JSON.stringify(s,null,2));
console.log('✅ sinonimos atualizados');

// ── Rodar treino ──────────────────────────────────────────────────────────────
console.log('\n🧪 Rodando treino...');
const {execSync} = require('child_process');
const r = execSync('node treino-cerebro.js --silent', {cwd:BASE}).toString();
const linhas = r.split('\n').filter(l=>/cobertura|rodada|naoEntendeu|nao_entendeu|ok|falhou/i.test(l));
console.log(linhas.slice(0,10).join('\n'));
