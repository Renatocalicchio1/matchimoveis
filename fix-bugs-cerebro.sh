#!/bin/bash
cd "$HOME/Downloads/matchimoveis "

# ── FIX 1: nlp.js — adicionar faixa/valor/preco ao domínio mercado ────────────
node -e "
const fs = require('fs');
let f = fs.readFileSync('cerebro/nlp.js','utf8');
f = f.replace(
  \"if (/mercado|demanda|tendencia/.test(mNorm))      return 'mercado';\",
  \"if (/mercado|demanda|tendencia|faixa|valor medio|preco medio|ticket|orcamento|tipo mais|quarto mais|bairro mais|mais buscado/.test(mNorm)) return 'mercado';\"
);
fs.writeFileSync('cerebro/nlp.js', f);
console.log('✅ nlp.js — mercado expandido');
"

# ── FIX 2: index.js — estrategia tem prioridade sobre leads-temporal ──────────
node -e "
const fs = require('fs');
let f = fs.readFileSync('cerebro/index.js','utf8');
// Mover verificação de estrategia ANTES de leadsTemp
f = f.replace(
\`  const resSuporte = suporte.responder(mNorm,btn,chip);
  if(resSuporte) return resSuporte;
  const resTemp = leadsTemp.responder(mNorm,leads,btn,chip);
  if(resTemp) return resTemp;
  const isScoring=/atender primeiro|mais chance|chance de fechar|pronto para proposta|ranking lead/.test(mNorm);
  if(isScoring){const r=scoring.responder(mNorm,leads,visitas,btn,chip);if(r) return r;}\`,
\`  const resSuporte = suporte.responder(mNorm,btn,chip);
  if(resSuporte) return resSuporte;
  const isEstrategia = /o que devo fazer|plano do dia|o que fazer hoje|me orienta|por onde comecar|resumo do dia/.test(mNorm);
  if(isEstrategia) return estrategista.analisar(d,leads,imoveis,visitas,btn,chip);
  const isScoring=/atender primeiro|mais chance|chance de fechar|pronto para proposta|ranking lead/.test(mNorm);
  if(isScoring){const r=scoring.responder(mNorm,leads,visitas,btn,chip);if(r) return r;}
  const resTemp = leadsTemp.responder(mNorm,leads,btn,chip);
  if(resTemp) return resTemp;\`
);
fs.writeFileSync('cerebro/index.js', f);
console.log('✅ index.js — estrategia tem prioridade');
"

# ── FIX 3: leads-temporal.js — quentes sem match mostra leads organicas ────────
node -e "
const fs = require('fs');
let f = fs.readFileSync('cerebro/leads-temporal.js','utf8');
f = f.replace(
\`  if (/quente|mais chance|interessado|prioridade|atender primeiro/.test(mNorm)) {
    const quentes = leads.filter(l=>l.matchesBase&&l.matchesBase.length>0).sort((a,b)=>(b.matchesBase?.length||0)-(a.matchesBase?.length||0)).slice(0,8);
    if (!quentes.length) return \\\`Nenhuma lead com match ainda.<br><br>\\\${btn('Fazer match','/app/leads')}\\\`;
    return \\\`🔥 <strong>\\\${quentes.length} leads mais quentes:</strong><br>\\\`+quentes.map((l,i)=>\\\`\\\${i+1}. \\\${l.nome||l.name||'Lead'} — \\\${l.bairro||''} · \\\${l.matchesBase?.length||0} match(es)\\\`).join('<br>')+\\\`<br><br>\\\${btn('Ver leads','/app/leads?filtro=com_match')}\\\`;
  }\`,
\`  if (/quente|mais chance|interessado|prioridade/.test(mNorm)) {
    const quentes = leads.filter(l=>l.matchesBase&&l.matchesBase.length>0).sort((a,b)=>(b.matchesBase?.length||0)-(a.matchesBase?.length||0)).slice(0,8);
    if (!quentes.length) {
      // sem match — mostrar leads mais recentes como alternativa
      const recentes = leads.slice(0,5);
      if (!recentes.length) return \\\`Nenhuma lead ainda. Importe leads primeiro!\\\${btn('Importar','/app-importar-leads')}\\\`;
      return \\\`Nenhuma lead com match ainda. As mais recentes:<br>\\\`+recentes.map(l=>\\\`• \\\${l.nome||l.name||'Lead'} — \\\${l.bairro||''}\\\`).join('<br>')+\\\`<br><br>\\\${btn('Fazer match','/app/leads')}\\\`;
    }
    return \\\`🔥 <strong>\\\${quentes.length} leads quentes:</strong><br>\\\`+quentes.map((l,i)=>\\\`\\\${i+1}. \\\${l.nome||l.name||'Lead'} — \\\${l.bairro||''} · \\\${l.matchesBase?.length||0} match(es)\\\`).join('<br>')+\\\`<br><br>\\\${btn('Ver leads','/app/leads?filtro=com_match')}\\\`;
  }\`
);
fs.writeFileSync('cerebro/leads-temporal.js', f);
console.log('✅ leads-temporal.js — quentes corrigido');
"

# ── FIX 4: aprendizado automático — salvar "faixa de valor" como não entendida ─
# Isso já acontece automaticamente via aprendizado.registrar()
# Mas vamos adicionar "faixa de valor" como sinônimo aprendido agora
node -e "
const fs = require('fs');
const p = 'cerebro/sinonimos-aprendidos.json';
const s = fs.existsSync(p) ? JSON.parse(fs.readFileSync(p,'utf8')) : {};
s['faixa de valor'] = 'faixa valor buscada';
s['ticket medio'] = 'valor medio';
s['orcamento dos clientes'] = 'faixa valor buscada';
s['quanto os clientes pagam'] = 'faixa valor buscada';
s['qual o preco medio'] = 'valor medio';
s['leads de ontem'] = 'leads antigas';
s['leads da semana'] = 'leads temporais';
s['clientes novos'] = 'leads hoje';
s['novos clientes'] = 'leads hoje';
s['pipeline'] = 'funil';
s['funil de vendas'] = 'funil';
fs.writeFileSync(p, JSON.stringify(s,null,2));
console.log('✅ sinonimos-aprendidos.json atualizado com', Object.keys(s).length, 'entradas');
"

# ── TESTAR NOVAMENTE ──────────────────────────────────────────────────────────
echo ""
echo "🧪 Testando correções..."
node -e "
const c = require('./cerebro/index');
const d = {ativos:45,inativos:8,bairros:['Itajaí','Balneário'],tipos:['Apartamento','Casa'],leads:87,organicas:52,importadas:35,comMatch:41,semMatch:46,visitas:12,hoje:2,pendentes:3,confirmadas:7};
const u = {nome:'Renato',id:'test',userId:'test'};
const perguntas = [
  'oi','leads quentes','meu xml não atualizou',
  'tem apto 2 quartos em Itajaí?','quem devo atender primeiro?',
  'por que não deu match?','o que devo fazer hoje?',
  'blablabla xpto nada','leads de hoje','faixa de valor',
  'tipo mais buscado','bairros mais buscados','ticket medio',
  'orcamento dos clientes','clientes novos','resumo do dia'
];
let ok=0,nao=0;
perguntas.forEach(p => {
  const r = c.responder(p,d,u,[],[],[],{});
  const txt = r.replace(/<[^>]+>/g,'').substring(0,55);
  const falhou = txt.includes('entendi')||txt.includes('captei');
  if(falhou) nao++; else ok++;
  console.log((falhou?'❓':'✅')+' \"'+p+'\"');
  if(falhou) console.log('   → '+txt);
});
console.log('');
console.log('Cobertura: '+ok+'/'+(ok+nao)+' ('+Math.round(ok/(ok+nao)*100)+'%)');
"
