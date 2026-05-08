#!/bin/bash
TARGET="$HOME/Downloads/matchimoveis /cerebro"
mkdir -p "$TARGET"

# ── nlp.js ────────────────────────────────────────────────────────────────────
cat > "$TARGET/nlp.js" << 'EOF'
'use strict';

const STOP = new Set([
  'de','da','do','em','um','uma','que','para','com','por','se','eu','me',
  'meu','minha','meus','minhas','nao','sim','ok','tem','ter','isso','esse',
  'essa','voce','vc','ai','ja','ate','mais','mas','o','a','os','as','e',
  'ele','ela','eles','elas','nos','lhe','so','bem','muito','todo','toda'
]);

const SINONIMOS = {
  'imovei':'imovel','imovéis':'imovel','imoveis':'imovel','imóvel':'imovel',
  'imóveis':'imovel','apto':'imovel','apartamentos':'imovel','casas':'imovel',
  'vizita':'visita','vizitas':'visita',
  'lids':'lead','lid':'lead','leades':'lead','clientes':'lead',
  'interessados':'lead','compradores':'lead',
  'matsh':'match','mach':'match','compativel':'match',
  'conis':'coins','moedas':'coins','pontos':'coins',
  'subir':'importar','enviar':'importar','upload':'importar','carregar':'importar',
  'carteira':'imovel',
  'quantos':'total','quantas':'total','quanto':'total',
  'mostre':'ver','mostra':'ver','exibir':'ver','listar':'ver','mostrar':'ver',
  'cadastrar':'cadastro','adicionar':'cadastro',
  'apagar':'excluir','deletar':'excluir','remover':'excluir',
  'desativar':'inativar','ocultar':'inativar',
  'reagendar':'remarcar','adiar':'remarcar','mudar data':'remarcar',
  'aceitar':'confirmar','aprovar':'confirmar',
  'cancelar':'recusar','negar':'recusar','rejeitar':'recusar',
  'bom dia':'saudacao','boa tarde':'saudacao','boa noite':'saudacao',
  'oi':'saudacao','ola':'saudacao','hello':'saudacao','olá':'saudacao',
  'tudo bem':'saudacao','como vai':'saudacao','eai':'saudacao','ei':'saudacao',
  'portal':'portais','feed':'portais','xml':'portais',
  'vivareal':'portais','zap':'portais','olx':'portais',
  'notificacao':'notificacoes','notificações':'notificacoes','aviso':'notificacoes',
  'ajuda':'help','socorro':'help','duvida':'help',
  'resumo':'dashboard','relatorio':'dashboard','geral':'dashboard',
  'tudo':'dashboard','panorama':'dashboard'
};

function tokenizar(texto) {
  return texto
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(t => t.length > 1 && !STOP.has(t));
}

function normalizar(texto) {
  let t = texto.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const entradas = Object.entries(SINONIMOS).sort((a,b) => b[0].length - a[0].length);
  for (const [e, c] of entradas) {
    try { t = t.replace(new RegExp('\\b' + e.replace(/[.*+?^${}()|[\]\\]/g,'\\$&') + '\\b','gi'), c); } catch(_) {}
  }
  return t;
}

function levenshtein(a, b) {
  const m = a.length, n = b.length;
  const dp = Array.from({length:m+1}, (_,i) => Array.from({length:n+1}, (_,j) => i===0?j:j===0?i:0));
  for (let i=1;i<=m;i++) for (let j=1;j<=n;j++)
    dp[i][j] = a[i-1]===b[j-1] ? dp[i-1][j-1] : 1+Math.min(dp[i-1][j],dp[i][j-1],dp[i-1][j-1]);
  return dp[m][n];
}

function bigramas(tokens) {
  const bg = new Set();
  tokens.forEach(t => { for (let i=0;i<t.length-1;i++) bg.add(t[i]+t[i+1]); });
  return bg;
}

function similaridade(a, b) {
  const ta = new Set(tokenizar(a));
  const tb = new Set(tokenizar(b));
  const inter = [...ta].filter(t=>tb.has(t)).length;
  const uniao = new Set([...ta,...tb]).size;
  const jTok = uniao===0 ? 0 : inter/uniao;
  const ba = bigramas([...ta]), bb = bigramas([...tb]);
  const bInter = [...ba].filter(b=>bb.has(b)).length;
  const bUniao = new Set([...ba,...bb]).size;
  const jBi = bUniao===0 ? 0 : bInter/bUniao;
  return jTok*0.6 + jBi*0.4;
}

function detectarDominio(mNorm) {
  if (/saudacao|oi\b|ola\b|hello|bom dia|boa tarde|boa noite/.test(mNorm)) return 'saudacao';
  if (/dashboard|resumo|relatorio|geral|panorama/.test(mNorm))             return 'dashboard';
  if (/lead/.test(mNorm))            return 'leads';
  if (/imovel|carteira/.test(mNorm)) return 'imoveis';
  if (/visita/.test(mNorm))          return 'visitas';
  if (/match|combinar/.test(mNorm))  return 'match';
  if (/portal|xml|vivareal|zap|olx/.test(mNorm)) return 'portais';
  if (/coin|moeda|saldo/.test(mNorm)) return 'coins';
  if (/notifica/.test(mNorm))        return 'notificacoes';
  if (/help|ajuda|como|o que/.test(mNorm)) return 'sistema';
  if (/mercado|demanda|tendencia/.test(mNorm)) return 'mercado';
  return null;
}

module.exports = { tokenizar, normalizar, levenshtein, similaridade, detectarDominio, SINONIMOS };
EOF

# ── leads.js ──────────────────────────────────────────────────────────────────
cat > "$TARGET/leads.js" << 'EOF'
'use strict';

function responder(mNorm, d, btn, chip) {
  if (/importar|planilha|csv|upload/.test(mNorm))
    return `📋 Envie um CSV ou Excel do portal.<br><br>${btn('Importar leads','/app-importar-leads')}`;
  if (/sem match/.test(mNorm)) {
    if (d.semMatch===0) return `✅ Todas as suas leads têm match!`;
    return `❌ <strong>${d.semMatch} leads sem match</strong><br>Falta imóvel no bairro/tipo que buscam.<br><br>${btn('Ver leads','/app/leads?filtro=sem_match')}${chip('📊 Demanda por bairro','demanda por bairro')}`;
  }
  if (/com match/.test(mNorm)) {
    const taxa = d.leads>0 ? Math.round(d.comMatch/d.leads*100) : 0;
    return `🎯 <strong>${d.comMatch} leads com match</strong> (${taxa}%)<br><br>${btn('Ver leads','/app/leads?filtro=com_match')}`;
  }
  if (d.leads===0) return `Nenhuma lead ainda. 👥<br><br>${btn('Importar leads','/app-importar-leads')}`;
  const taxa = d.leads>0 ? Math.round(d.comMatch/d.leads*100) : 0;
  return `👥 <strong>Leads:</strong><br>Total: ${d.leads} · Orgânicas: ${d.organicas} · Importadas: ${d.importadas}<br>🎯 Com match: ${d.comMatch} (${taxa}%) · Sem match: ${d.semMatch}<br><br>${btn('Ver leads','/app/leads')}${btn('Importar','/app-importar-leads')}`;
}

module.exports = { responder };
EOF

# ── imoveis.js ────────────────────────────────────────────────────────────────
cat > "$TARGET/imoveis.js" << 'EOF'
'use strict';

function responder(mNorm, d, imoveis, btn, chip) {
  if (/xml|importar|tecimob|rankim/.test(mNorm))
    return `📥 Envie o XML do Tecimob ou Rankim.<br><br>${btn('Importar XML','/app/imoveis')}`;
  if (/inativo/.test(mNorm)) {
    if (d.inativos===0) return `✅ Nenhum imóvel inativo.`;
    return `❌ <strong>${d.inativos} imóveis inativos</strong><br><br>${btn('Ver inativos','/app/imoveis?status=inativo')}`;
  }
  if (/proprietario|dono/.test(mNorm)) {
    const semProp = imoveis.filter(i=>!i.proprietario&&!i.nomeProprietario).length;
    if (semProp===0) return `✅ Todos têm proprietário vinculado!`;
    return `🏠 <strong>${semProp} imóveis sem proprietário</strong><br><br>${btn('Vincular','/app/imoveis')}`;
  }
  const temBairro = d.bairros.find(b => mNorm.includes(b.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'')));
  const temTipo = ['apartamento','casa','cobertura','sala','terreno'].find(t => mNorm.includes(t));
  if (temBairro||temTipo) {
    let r = imoveis.filter(i=>i.status!=='inativo');
    if (temBairro) r = r.filter(i=>i.bairro&&i.bairro.toLowerCase().includes(temBairro.toLowerCase()));
    if (temTipo)   r = r.filter(i=>i.tipo&&i.tipo.toLowerCase().includes(temTipo));
    if (r.length===0) return `Não encontrei imóveis${temTipo?' do tipo '+temTipo:''}${temBairro?' em '+temBairro:''}.`;
    return `🔍 <strong>${r.length} imóvel(is)</strong>${temBairro?' em '+temBairro:''}:<br>`+
      r.slice(0,5).map(i=>`• ${i.tipo||'Imóvel'} ${i.quartos?i.quartos+'q':''} — ${i.bairro||''}`).join('<br>')+
      `<br><br>${btn('Ver todos','/app/imoveis')}`;
  }
  if (d.ativos===0) return `Nenhum imóvel ainda. 🏠<br><br>${btn('Importar XML','/app/imoveis')}`;
  return `🏠 <strong>Imóveis:</strong><br>✅ Ativos: ${d.ativos} · ❌ Inativos: ${d.inativos}<br>📍 Bairros: ${d.bairros.slice(0,5).join(', ')||'—'}<br>🏷️ Tipos: ${d.tipos.slice(0,4).join(', ')||'—'}<br><br>${btn('Ver imóveis','/app/imoveis')}${chip('📥 Importar XML','importar xml')}`;
}

module.exports = { responder };
EOF

# ── visitas.js ────────────────────────────────────────────────────────────────
cat > "$TARGET/visitas.js" << 'EOF'
'use strict';

function responder(mNorm, d, btn, chip) {
  if (/hoje/.test(mNorm)) {
    if (d.hoje===0) return `📅 Nenhuma visita hoje. Fique tranquilo!`;
    return `📅 <strong>${d.hoje} visita(s) hoje!</strong> ⚠️<br><br>${btn('Ver hoje','/app/visitas?filtro=hoje')}`;
  }
  if (/pendente|sem resposta|aguardando/.test(mNorm)) {
    if (d.pendentes===0) return `✅ Nenhuma visita pendente. Tudo em dia!`;
    return `⏳ <strong>${d.pendentes} visita(s) pendente(s)</strong><br><br>${btn('Ver pendentes','/app/visitas?filtro=pendentes')}`;
  }
  if (/confirmada/.test(mNorm))
    return `✅ <strong>${d.confirmadas} visita(s) confirmada(s)</strong><br><br>${btn('Ver visitas','/app/visitas')}`;
  if (d.visitas===0) return `Nenhuma visita agendada ainda. 📅<br><br>${chip('👥 Ver leads','minhas leads')}`;
  return `📅 <strong>Visitas:</strong><br>Total: ${d.visitas} · ✅ Confirmadas: ${d.confirmadas} · ⏳ Pendentes: ${d.pendentes}<br>📆 Hoje: ${d.hoje}<br><br>${btn('Ver visitas','/app/visitas')}`;
}

module.exports = { responder };
EOF

# ── match.js ──────────────────────────────────────────────────────────────────
cat > "$TARGET/match.js" << 'EOF'
'use strict';

function responder(mNorm, d, btn, chip) {
  if (/como|explicar|o que|funciona/.test(mNorm))
    return `🎯 <strong>Como funciona o Match:</strong><br>Cruza <strong>bairro + tipo + quartos</strong> automaticamente.<br>Score: valor abaixo do máx +50pts · área maior +30pts · quartos extras +20pts<br><br>${btn('Ver leads com match','/app/leads?filtro=com_match')}`;
  if (/sem match|por que|melhorar/.test(mNorm)) {
    if (d.semMatch===0) return `✅ Todas as leads têm match! Excelente!`;
    return `❌ <strong>${d.semMatch} leads sem match</strong><br>• Bairros que as leads buscam não estão na carteira<br>• Tipo ou quartos incompatível<br>• Imóveis inativos<br><br>${btn('Analisar leads','/app/leads')}${chip('📊 Demanda por bairro','demanda por bairro')}`;
  }
  const taxa = d.leads>0 ? Math.round(d.comMatch/d.leads*100) : 0;
  return `🎯 <strong>Match:</strong><br>✅ Com match: ${d.comMatch} · ❌ Sem match: ${d.semMatch}<br>📊 Taxa: <strong>${taxa}%</strong><br><br>${btn('Ver leads','/app/leads')}${chip('❓ Como funciona?','como funciona o match')}`;
}

module.exports = { responder };
EOF

# ── portais.js ────────────────────────────────────────────────────────────────
cat > "$TARGET/portais.js" << 'EOF'
'use strict';

const PORTAIS = ['VivaReal','ZAP','OLX','Chaves','ImovelWeb','123i'];

function responder(mNorm, d, btn, chip) {
  if (/gerar|criar|publicar/.test(mNorm)) {
    const portal = PORTAIS.find(p => mNorm.includes(p.toLowerCase().replace(' ','')));
    if (portal) return `🔗 Selecione os imóveis e clique em "${portal}".<br><br>${btn('Ir para imóveis','/app/imoveis')}`;
    return `🔗 Para qual portal?<br><br>`+PORTAIS.map(p=>`<button onclick="enviarMsg('gerar xml ${p.toLowerCase()}')" style="background:#f3f4f6;border:none;border-radius:20px;padding:8px 14px;margin:4px;cursor:pointer;font-weight:600;font-size:13px">${p}</button>`).join('');
  }
  return `🔗 <strong>Portais:</strong> ${PORTAIS.join(' · ')}<br>Selecione imóveis e gere o XML de cada portal.<br><br>${btn('Ver portais','/app/portais')}${btn('Imóveis','/app/imoveis')}`;
}

module.exports = { responder, PORTAIS };
EOF

# ── sistema.js ────────────────────────────────────────────────────────────────
cat > "$TARGET/sistema.js" << 'EOF'
'use strict';

const EXPLICACOES = {
  match:   'Match é quando um imóvel da sua carteira combina com o que um lead procura. O sistema cruza bairro + tipo + quartos automaticamente.',
  vitrine: 'Vitrine é uma página exclusiva enviada ao lead com os imóveis em match. O lead escolhe e solicita visita — tudo automático!',
  score:   'Score define a ordem na vitrine: valor abaixo do máximo +50pts, área maior +30pts, quartos extras +20pts, suítes +15pts, vagas +15pts.',
  lead:    'Lead é um cliente interessado em comprar ou alugar. Você importa planilhas dos portais e o sistema faz o match automático.',
  xml:     'XML é o arquivo que envia seus imóveis para portais (VivaReal, ZAP, OLX). Gere aqui e cadastre o link no portal.',
  coins:   'Match Coins são pontos ganhos a cada match realizado. Futuramente usados para recursos premium.',
  visita:  'Fluxo: Lead recebe vitrine → escolhe imóvel → solicita visita → proprietário confirma/recusa → lead notificado. Tudo automático!'
};

const AJUDA = [
  {emoji:'👥',label:'Leads',      msg:'minhas leads'},
  {emoji:'🏠',label:'Imóveis',    msg:'meus imoveis'},
  {emoji:'📅',label:'Visitas',    msg:'minhas visitas'},
  {emoji:'🎯',label:'Match',      msg:'ver match'},
  {emoji:'🔗',label:'Portais',    msg:'ver portais'},
  {emoji:'🪙',label:'Coins',      msg:'meus coins'},
  {emoji:'🔔',label:'Notificações',msg:'notificacoes'},
  {emoji:'📊',label:'Resumo',     msg:'resumo geral'},
];

function responder(mNorm, d, btn, chip) {
  for (const [key, texto] of Object.entries(EXPLICACOES)) {
    if (mNorm.includes(key))
      return `💡 <strong>${key.charAt(0).toUpperCase()+key.slice(1)}</strong><br><br>${texto}<br><br>${chip('❓ Mais ajuda','ajuda')}`;
  }
  return `🤖 <strong>Sou o Match, seu assistente.</strong> Posso te ajudar com:<br><br>`+
    AJUDA.map(i=>`<button onclick="enviarMsg('${i.msg}')" style="background:#f3f4f6;border:none;border-radius:20px;padding:8px 14px;margin:4px;cursor:pointer;font-weight:600;font-size:13px">${i.emoji} ${i.label}</button>`).join('');
}

module.exports = { EXPLICACOES, responder };
EOF

# ── mercado.js ────────────────────────────────────────────────────────────────
cat > "$TARGET/mercado.js" << 'EOF'
'use strict';

function responder(mNorm, leads, imoveis, btn, chip) {
  if (/bairro|demanda/.test(mNorm)) {
    const bairrosLeads = {};
    leads.forEach(l => { if (l.bairro) bairrosLeads[l.bairro]=(bairrosLeads[l.bairro]||0)+1; });
    const ranking = Object.entries(bairrosLeads).sort((a,b)=>b[1]-a[1]).slice(0,6);
    if (!ranking.length) return `Sem dados de bairro nas leads ainda.<br><br>${btn('Importar leads','/app-importar-leads')}`;
    return `📍 <strong>Bairros mais buscados:</strong><br>`+ranking.map(([b,n],i)=>`${i+1}. ${b} — ${n} lead${n>1?'s':''}`).join('<br>')+`<br><br>${chip('🏠 Imóveis por bairro','imoveis por bairro')}`;
  }
  if (/tipo/.test(mNorm)) {
    const tipos = {};
    leads.forEach(l => { if (l.tipo) tipos[l.tipo]=(tipos[l.tipo]||0)+1; });
    const ranking = Object.entries(tipos).sort((a,b)=>b[1]-a[1]).slice(0,5);
    if (!ranking.length) return `Sem dados de tipo nas leads ainda.`;
    return `🏷️ <strong>Tipos mais buscados:</strong><br>`+ranking.map(([t,n])=>`• ${t}: ${n} lead${n>1?'s':''}`).join('<br>');
  }
  if (/valor|preco|faixa/.test(mNorm)) {
    const vals = leads.filter(l=>l.valorMax&&l.valorMax>0).map(l=>l.valorMax);
    if (!vals.length) return `Sem dados de valor nas leads ainda.`;
    const med = Math.round(vals.reduce((a,b)=>a+b,0)/vals.length);
    return `💰 <strong>Faixa de valor:</strong><br>Mínimo: R$ ${Math.min(...vals).toLocaleString('pt-BR')}<br>Médio: R$ ${med.toLocaleString('pt-BR')}<br>Máximo: R$ ${Math.max(...vals).toLocaleString('pt-BR')}`;
  }
  // oferta vs demanda
  const bairrosLeads = {};
  leads.forEach(l => { if (l.bairro) bairrosLeads[l.bairro]=(bairrosLeads[l.bairro]||0)+1; });
  const bairrosIm = {};
  imoveis.filter(i=>i.status!=='inativo').forEach(i => { if (i.bairro) bairrosIm[i.bairro]=(bairrosIm[i.bairro]||0)+1; });
  const top = Object.entries(bairrosLeads).sort((a,b)=>b[1]-a[1]).slice(0,5);
  if (!top.length) return `Sem dados de mercado ainda.<br><br>${btn('Importar leads','/app-importar-leads')}`;
  return `📊 <strong>Oferta vs Demanda:</strong><br>`+
    top.map(([b,dem])=>{const of=bairrosIm[b]||0;const st=of===0?'🔴 sem imóvel':of<dem?'🟡 pouca oferta':'🟢 ok';return `• ${b}: ${dem} leads · ${of} imóveis ${st}`;}).join('<br>')+
    `<br><br>${chip('🏠 Imóveis','meus imoveis')}`;
}

module.exports = { responder };
EOF

# ── index.js ──────────────────────────────────────────────────────────────────
cat > "$TARGET/index.js" << 'EOF'
'use strict';
const nlp      = require('./nlp');
const modLeads   = require('./leads');
const modImoveis = require('./imoveis');
const modVisitas = require('./visitas');
const modMatch   = require('./match');
const modPortais = require('./portais');
const modSistema = require('./sistema');
const modMercado = require('./mercado');

const btn  = (label, href) => `<a href="${href}" style="display:inline-block;background:#ff385c;color:white;padding:8px 16px;border-radius:8px;text-decoration:none;font-weight:700;margin:4px">${label} →</a>`;
const chip = (label, msg)  => `<button onclick="enviarMsg('${msg}')" style="background:#f3f4f6;border:none;border-radius:20px;padding:8px 14px;margin:4px;cursor:pointer;font-weight:600;font-size:13px">${label}</button>`;

function saudacao(d, nome) {
  const hora = new Date().getHours();
  const s = hora<12?'Bom dia':hora<18?'Boa tarde':'Boa noite';
  if (d.hoje>0)
    return `${s}, ${nome}! 👋 ⚠️ <strong>${d.hoje} visita(s) hoje!</strong><br>🏠 ${d.ativos} imóveis · 👥 ${d.leads} leads · 🎯 ${d.comMatch} matchs<br><br>${btn('Ver visitas de hoje','/app/visitas')}`;
  if (d.leads===0&&d.ativos===0)
    return `${s}, ${nome}! 👋 Sua conta está vazia.<br><br>${btn('Importar imóveis','/app/imoveis')}${btn('Importar leads','/app-importar-leads')}`;
  return `${s}, ${nome}! 👋<br>🏠 ${d.ativos} imóveis · 👥 ${d.leads} leads · 🎯 ${d.comMatch} matchs · ⏳ ${d.pendentes} pendentes<br><br>${chip('🏠 Imóveis','meus imoveis')}${chip('👥 Leads','minhas leads')}${chip('📅 Visitas','minhas visitas')}${chip('📊 Resumo','resumo geral')}`;
}

function dashboard(d) {
  const taxa = d.leads>0 ? Math.round(d.comMatch/d.leads*100) : 0;
  return `📊 <strong>Resumo da sua conta:</strong><br><br>`+
    `🏠 Imóveis: <strong>${d.ativos}</strong> ativos · ${d.inativos} inativos<br>`+
    `👥 Leads: <strong>${d.leads}</strong> · ${d.organicas} orgânicas · ${d.importadas} importadas<br>`+
    `🎯 Match: <strong>${d.comMatch}</strong> (${taxa}%) · ${d.semMatch} sem match<br>`+
    `📅 Visitas: <strong>${d.visitas}</strong> · ${d.hoje} hoje · ${d.pendentes} pendentes<br><br>`+
    `${btn('Imóveis','/app/imoveis')}${btn('Leads','/app/leads')}${btn('Visitas','/app/visitas')}`;
}

function naoEntendeu(contexto) {
  const frases = ['Hmm, não entendi 🤔 Pode reformular?','Desculpe, não captei. Pode tentar de outro jeito?','Tente: leads, imóveis, visitas ou match.'];
  const chips = contexto?.ultimoTema==='leads'
    ? [chip('👥 Leads','minhas leads'),chip('🎯 Match','leads com match'),chip('📋 Importar','importar leads')]
    : [chip('👥 Leads','minhas leads'),chip('🏠 Imóveis','meus imoveis'),chip('📅 Visitas','minhas visitas'),chip('❓ Ajuda','ajuda')];
  return frases[Math.floor(Math.random()*frases.length)]+'<br><br>'+chips.join('');
}

function responder(mensagem, d, user, imoveis, leads, contexto) {
  const nome   = user.nome||user.name||'corretor';
  const mNorm  = nlp.normalizar(mensagem);
  const dominio = nlp.detectarDominio(mNorm);
  switch(dominio) {
    case 'saudacao':     return saudacao(d, nome);
    case 'dashboard':    return dashboard(d);
    case 'leads':        return modLeads.responder(mNorm, d, btn, chip);
    case 'imoveis':      return modImoveis.responder(mNorm, d, imoveis, btn, chip);
    case 'visitas':      return modVisitas.responder(mNorm, d, btn, chip);
    case 'match':        return modMatch.responder(mNorm, d, btn, chip);
    case 'portais':      return modPortais.responder(mNorm, d, btn, chip);
    case 'sistema':      return modSistema.responder(mNorm, d, btn, chip);
    case 'mercado':      return modMercado.responder(mNorm, leads, imoveis, btn, chip);
    case 'coins':        return `🪙 Match Coins — seu sistema de recompensas.<br><br>${btn('Ver coins','/app/coins')}`;
    case 'notificacoes': return `🔔 Central de notificações.<br><br>${btn('Ver notificações','/app/notificacoes')}`;
    default:             return naoEntendeu(contexto);
  }
}

function detectarTema(mensagem) {
  return nlp.detectarDominio(nlp.normalizar(mensagem));
}

module.exports = { responder, detectarTema, nlp };
EOF

echo "✅ Cérebro instalado em $TARGET"
ls "$TARGET"
