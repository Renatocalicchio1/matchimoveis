#!/bin/bash
TARGET="$HOME/Downloads/matchimoveis /cerebro"

echo "🧠 Instalando módulos finais do cérebro..."

# ── aprendizado.js ────────────────────────────────────────────────────────────
cat > "$TARGET/aprendizado.js" << 'JSEOF'
'use strict';
const fs   = require('fs');
const path = require('path');

const ARQUIVO = path.join(__dirname, '..', 'assistente-nao-entendidos.json');
const THRESHOLD_VIRAR_OFICIAL = 3;

function carregar() {
  if (!fs.existsSync(ARQUIVO)) return { nao_entendidos:[], sugestoes:[] };
  try { return JSON.parse(fs.readFileSync(ARQUIVO,'utf8')); } catch(_) { return { nao_entendidos:[], sugestoes:[] }; }
}

function salvar(dados) {
  fs.writeFileSync(ARQUIVO, JSON.stringify(dados, null, 2));
}

// Similaridade simples entre duas perguntas
function similar(a, b) {
  const ta = new Set(a.toLowerCase().split(/\s+/).filter(t=>t.length>2));
  const tb = new Set(b.toLowerCase().split(/\s+/).filter(t=>t.length>2));
  const inter = [...ta].filter(t=>tb.has(t)).length;
  const uniao = new Set([...ta,...tb]).size;
  return uniao===0 ? 0 : inter/uniao;
}

// Registrar pergunta não entendida
function registrar(uid, pergunta) {
  const dados = carregar();
  dados.nao_entendidos = dados.nao_entendidos || [];

  // Verificar se já existe grupo similar
  let grupoExistente = null;
  for (const item of dados.nao_entendidos) {
    if (similar(pergunta, item.exemplo) >= 0.5) {
      grupoExistente = item;
      break;
    }
  }

  if (grupoExistente) {
    grupoExistente.count = (grupoExistente.count||1) + 1;
    grupoExistente.usuarios = [...new Set([...(grupoExistente.usuarios||[]), uid])];
    grupoExistente.ultima = new Date().toISOString();
    // Virou oficial?
    if (grupoExistente.count >= THRESHOLD_VIRAR_OFICIAL && !grupoExistente.sugerido) {
      grupoExistente.sugerido = true;
      dados.sugestoes = dados.sugestoes || [];
      dados.sugestoes.push({
        pergunta: grupoExistente.exemplo,
        count: grupoExistente.count,
        sugestao_intencao: `nova_intencao_${Date.now()}`,
        status: 'pendente'
      });
    }
  } else {
    dados.nao_entendidos.push({
      exemplo: pergunta,
      count: 1,
      usuarios: [uid],
      primeira: new Date().toISOString(),
      ultima: new Date().toISOString(),
      sugerido: false
    });
  }

  // Limitar a 500 registros
  if (dados.nao_entendidos.length > 500)
    dados.nao_entendidos = dados.nao_entendidos.sort((a,b)=>b.count-a.count).slice(0,500);

  salvar(dados);
}

// Top perguntas não entendidas
function topNaoEntendidas(n=10) {
  const dados = carregar();
  return (dados.nao_entendidos||[]).sort((a,b)=>b.count-a.count).slice(0,n);
}

// Sugestões de novas intenções
function sugestoesPendentes() {
  const dados = carregar();
  return (dados.sugestoes||[]).filter(s=>s.status==='pendente');
}

module.exports = { registrar, topNaoEntendidas, sugestoesPendentes };
JSEOF

# ── notificacoes.js ───────────────────────────────────────────────────────────
cat > "$TARGET/notificacoes.js" << 'JSEOF'
'use strict';

/**
 * NOTIFICAÇÕES PROATIVAS
 * Analisa dados e gera alertas relevantes para o usuário.
 * Chamado na saudação e quando o usuário pergunta sobre notificações.
 */

function gerarAlertas(d, leads, imoveis, visitas) {
  const alertas = [];
  const agora = new Date();
  const hoje = agora.toLocaleDateString('pt-BR');

  // CRÍTICOS
  if (d.hoje > 0)
    alertas.push({ nivel:'critico', emoji:'🔴', titulo:`${d.hoje} visita(s) hoje`, detalhe:'Não perca o horário!', rota:'/app/visitas' });

  if (d.pendentes > 0)
    alertas.push({ nivel:'critico', emoji:'🟡', titulo:`${d.pendentes} visita(s) pendentes`, detalhe:'Aguardando sua confirmação.', rota:'/app/visitas' });

  // Leads com match sem vitrine enviada
  const comMatchSemVisita = leads.filter(l =>
    l.matchesBase && l.matchesBase.length > 0 &&
    !visitas.some(v => v.leadId === (l.id||l._id))
  ).length;
  if (comMatchSemVisita > 5)
    alertas.push({ nivel:'atencao', emoji:'🎯', titulo:`${comMatchSemVisita} leads com match sem visita`, detalhe:'Envie a vitrine para converter!', rota:'/app/leads?filtro=com_match' });

  // Imóveis sem proprietário
  const semProp = imoveis.filter(i=>i.status!=='inativo'&&!i.proprietario&&!i.nomeProprietario).length;
  if (semProp > 10)
    alertas.push({ nivel:'atencao', emoji:'👤', titulo:`${semProp} imóveis sem proprietário`, detalhe:'Importe o Excel para vincular.', rota:'/app/imoveis' });

  // Taxa de match baixa
  const taxa = d.leads > 0 ? Math.round(d.comMatch/d.leads*100) : 0;
  if (taxa < 30 && d.leads > 10)
    alertas.push({ nivel:'atencao', emoji:'📉', titulo:`Taxa de match em ${taxa}%`, detalhe:'Importe mais imóveis nos bairros mais buscados.', rota:'/app/imoveis' });

  // Conta vazia
  if (d.ativos === 0)
    alertas.push({ nivel:'info', emoji:'🏠', titulo:'Nenhum imóvel cadastrado', detalhe:'Importe um XML para começar.', rota:'/app/imoveis' });
  if (d.leads === 0)
    alertas.push({ nivel:'info', emoji:'👥', titulo:'Nenhuma lead cadastrada', detalhe:'Importe uma planilha para fazer o match.', rota:'/app-importar-leads' });

  return alertas;
}

function renderAlertas(alertas, btn) {
  if (alertas.length === 0)
    return `🔔 Nenhuma notificação no momento. Tudo em dia! ✅`;

  const criticos  = alertas.filter(a=>a.nivel==='critico');
  const atencao   = alertas.filter(a=>a.nivel==='atencao');
  const info      = alertas.filter(a=>a.nivel==='info');

  let html = `🔔 <strong>${alertas.length} notificação(ões):</strong><br><br>`;

  if (criticos.length) {
    html += `<strong>⚠️ Urgente:</strong><br>`;
    criticos.forEach(a => {
      html += `${a.emoji} <strong>${a.titulo}</strong> — ${a.detalhe} ${btn('Ver',a.rota)}<br>`;
    });
    html += '<br>';
  }
  if (atencao.length) {
    html += `<strong>📋 Atenção:</strong><br>`;
    atencao.forEach(a => {
      html += `${a.emoji} <strong>${a.titulo}</strong> — ${a.detalhe} ${btn('Ver',a.rota)}<br>`;
    });
    html += '<br>';
  }
  if (info.length) {
    html += `<strong>💡 Info:</strong><br>`;
    info.forEach(a => {
      html += `${a.emoji} ${a.titulo} — ${a.detalhe}<br>`;
    });
  }

  return html;
}

module.exports = { gerarAlertas, renderAlertas };
JSEOF

# ── onboarding.js ─────────────────────────────────────────────────────────────
cat > "$TARGET/onboarding.js" << 'JSEOF'
'use strict';

const PASSOS = [
  { id:1, titulo:'Importar imóveis',   concluido: d => d.ativos > 0,    acao:'importar xml',        rota:'/app/imoveis',          emoji:'🏠', dica:'Importe o XML do seu CRM (Tecimob, Rankim, etc).' },
  { id:2, titulo:'Importar leads',     concluido: d => d.leads > 0,     acao:'importar leads',      rota:'/app-importar-leads',   emoji:'👥', dica:'Importe planilhas dos portais (ImovelWeb, ZAP, OLX).' },
  { id:3, titulo:'Fazer o match',      concluido: d => d.comMatch > 0,  acao:'fazer match agora',   rota:'/app/leads',            emoji:'🎯', dica:'Cruze suas leads com seus imóveis automaticamente.' },
  { id:4, titulo:'Enviar vitrine',     concluido: d => d.visitas > 0,   acao:'ver leads com match', rota:'/app/leads?filtro=com_match', emoji:'✨', dica:'Envie a vitrine para leads com match e aguarde a visita.' },
];

function verificar(d) {
  const concluidos = PASSOS.filter(p => p.concluido(d));
  const pendentes  = PASSOS.filter(p => !p.concluido(d));
  const progresso  = Math.round(concluidos.length / PASSOS.length * 100);
  return { concluidos, pendentes, progresso, total: PASSOS.length };
}

function renderOnboarding(d, btn, chip) {
  const status = verificar(d);

  if (status.progresso === 100) {
    return `🎉 <strong>Conta 100% configurada!</strong><br>Você já tem imóveis, leads, match e visitas. Parabéns!<br><br>${chip('📊 Ver resumo','resumo geral')}${chip('🧠 Plano do dia','o que devo fazer hoje')}`;
  }

  const barraProgresso = Math.round(status.progresso / 10);
  const barra = '█'.repeat(barraProgresso) + '░'.repeat(10 - barraProgresso);

  let html = `🚀 <strong>Configure sua conta:</strong><br>`;
  html += `<code style="font-size:12px">${barra}</code> ${status.progresso}%<br><br>`;

  PASSOS.forEach((p, i) => {
    const feito = p.concluido(d);
    html += `<div style="display:flex;gap:10px;margin:6px 0;align-items:flex-start">`;
    html += `<span style="background:${feito?'#22c55e':'#ff385c'};color:white;border-radius:50%;width:22px;height:22px;display:inline-flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;flex-shrink:0">${feito?'✓':i+1}</span>`;
    html += `<span>${feito?'<s>':''}<strong>${p.emoji} ${p.titulo}</strong>${feito?'</s>':''} — ${p.dica} ${feito?'':btn('Fazer agora',p.rota)}</span>`;
    html += `</div>`;
  });

  return html;
}

module.exports = { verificar, renderOnboarding, PASSOS };
JSEOF

# ── relatorio.js ──────────────────────────────────────────────────────────────
cat > "$TARGET/relatorio.js" << 'JSEOF'
'use strict';

function gerarSemanal(d, leads, imoveis, visitas, btn) {
  const taxa = d.leads > 0 ? Math.round(d.comMatch/d.leads*100) : 0;

  // Top bairros demandados
  const bairrosLeads = {};
  leads.forEach(l => { if (l.bairro) bairrosLeads[l.bairro]=(bairrosLeads[l.bairro]||0)+1; });
  const topBairros = Object.entries(bairrosLeads).sort((a,b)=>b[1]-a[1]).slice(0,3).map(([b,n])=>`${b} (${n})`).join(', ');

  // Top tipos demandados
  const tipos = {};
  leads.forEach(l => { if (l.tipo) tipos[l.tipo]=(tipos[l.tipo]||0)+1; });
  const topTipos = Object.entries(tipos).sort((a,b)=>b[1]-a[1]).slice(0,3).map(([t,n])=>`${t} (${n})`).join(', ');

  // Imóveis parados (sem match com nenhuma lead)
  const idsComMatch = new Set(leads.flatMap(l=>(l.matchesBase||[]).map(m=>m.id||m._id)));
  const parados = imoveis.filter(i=>i.status!=='inativo'&&!idsComMatch.has(i.id||i._id)).length;

  const data = new Date().toLocaleDateString('pt-BR', {day:'2-digit',month:'2-digit',year:'numeric'});

  return `📊 <strong>Relatório — ${data}</strong><br><br>`+
    `<strong>🏠 Carteira:</strong><br>`+
    `• Ativos: ${d.ativos} · Inativos: ${d.inativos}<br>`+
    `• Imóveis sem match: ${parados}<br><br>`+
    `<strong>👥 Leads:</strong><br>`+
    `• Total: ${d.leads} · Com match: ${d.comMatch} (${taxa}%)<br>`+
    `• Bairros mais buscados: ${topBairros||'—'}<br>`+
    `• Tipos mais buscados: ${topTipos||'—'}<br><br>`+
    `<strong>📅 Visitas:</strong><br>`+
    `• Total: ${d.visitas} · Confirmadas: ${d.confirmadas} · Pendentes: ${d.pendentes}<br><br>`+
    `<strong>💡 Oportunidade:</strong><br>`+
    (parados > 0 ? `• ${parados} imóveis sem nenhuma lead compatível — revise bairros ou tipo.<br>` : `• Excelente! Toda a carteira tem compatibilidade com leads.<br>`)+
    (taxa < 40 && d.leads > 5 ? `• Taxa de match abaixo de 40% — importe mais imóveis nos bairros mais buscados.<br>` : '')+
    `<br>${btn('Ver leads','/app/leads')}${btn('Ver imóveis','/app/imoveis')}`;
}

module.exports = { gerarSemanal };
JSEOF

# ── index.js FINAL com todos os módulos ──────────────────────────────────────
cat > "$TARGET/index.js" << 'JSEOF'
'use strict';
/**
 * CÉREBRO MATCHIMOVEIS v15.0 — COMPLETO
 * Todos os módulos integrados.
 */
const nlp          = require('./nlp');
const modLeads     = require('./leads');
const modImoveis   = require('./imoveis');
const modVisitas   = require('./visitas');
const modMatch     = require('./match');
const modPortais   = require('./portais');
const modSistema   = require('./sistema');
const modMercado   = require('./mercado');
const acoes        = require('./acoes');
const estrategista = require('./estrategista');
const rag          = require('./rag');
const memoria      = require('./memoria');
const aprendizado  = require('./aprendizado');
const notifs       = require('./notificacoes');
const onboarding   = require('./onboarding');
const relatorio    = require('./relatorio');

const btn  = (label, href) => `<a href="${href}" style="display:inline-block;background:#ff385c;color:white;padding:8px 16px;border-radius:8px;text-decoration:none;font-weight:700;margin:4px">${label} →</a>`;
const chip = (label, msg)  => `<button onclick="enviarMsg('${msg}')" style="background:#f3f4f6;border:none;border-radius:20px;padding:8px 14px;margin:4px;cursor:pointer;font-weight:600;font-size:13px">${label}</button>`;

function saudacao(d, nome, leads, imoveis, visitas, perfil) {
  const hora = new Date().getHours();
  const s = hora<12?'Bom dia':hora<18?'Boa tarde':'Boa noite';
  const alertas = notifs.gerarAlertas(d, leads, imoveis, visitas);
  const criticos = alertas.filter(a=>a.nivel==='critico');
  const dica = perfil?.bairrosMaisUsados?.length ? `<br>📍 Foco: <strong>${perfil.bairrosMaisUsados.slice(0,2).join(', ')}</strong>` : '';

  // Conta nova → onboarding
  if (d.ativos===0 || d.leads===0)
    return `${s}, ${nome}! 👋${dica}<br><br>${onboarding.renderOnboarding(d, btn, chip)}`;

  // Alertas críticos primeiro
  if (criticos.length)
    return `${s}, ${nome}! 👋${dica}<br><br>${notifs.renderAlertas(criticos, btn)}<br><br>${chip('📊 Resumo','resumo geral')}${chip('🧠 Plano do dia','o que devo fazer hoje')}`;

  // Saudação normal com plano
  return `${s}, ${nome}! 👋${dica}<br>🏠 ${d.ativos} imóveis · 👥 ${d.leads} leads · 🎯 ${d.comMatch} matchs · ⏳ ${d.pendentes} pendentes<br><br>${estrategista.analisar(d, leads, imoveis, visitas, btn, chip)}`;
}

function dashboard(d, leads, imoveis, visitas) {
  const taxa = d.leads>0 ? Math.round(d.comMatch/d.leads*100) : 0;
  return `📊 <strong>Resumo da sua conta:</strong><br><br>`+
    `🏠 Imóveis: <strong>${d.ativos}</strong> ativos · ${d.inativos} inativos<br>`+
    `👥 Leads: <strong>${d.leads}</strong> · ${d.organicas} orgânicas · ${d.importadas} importadas<br>`+
    `🎯 Match: <strong>${d.comMatch}</strong> (${taxa}%) · ${d.semMatch} sem match<br>`+
    `📅 Visitas: <strong>${d.visitas}</strong> · ${d.hoje} hoje · ${d.pendentes} pendentes<br><br>`+
    estrategista.analisar(d, leads, imoveis, visitas, btn, chip);
}

function naoEntendeu(uid, mensagem, contexto, perfil) {
  // Registrar para aprendizado
  aprendizado.registrar(uid, mensagem);
  const frases = ['Hmm, não entendi 🤔 Pode reformular?','Desculpe, não captei. Tente de outro jeito.','Tente: leads, imóveis, visitas, match ou "o que devo fazer hoje".'];
  const chipsDefault = [chip('👥 Leads','minhas leads'),chip('🏠 Imóveis','meus imoveis'),chip('📅 Visitas','minhas visitas'),chip('🧠 Plano do dia','o que devo fazer hoje')];
  const chipsPerfil = perfil?.bairrosMaisUsados?.length
    ? perfil.bairrosMaisUsados.slice(0,2).map(b=>chip(`🏠 ${b}`,`imoveis em ${b}`))
    : [];
  return frases[Math.floor(Math.random()*frases.length)]+'<br><br>'+[...chipsDefault,...chipsPerfil].join('');
}

// ── FUNÇÃO PRINCIPAL ──────────────────────────────────────────────────────────
function responder(mensagem, d, user, imoveis, leads, visitas, contexto) {
  const uid   = user.id || user.userId;
  const nome  = user.nome||user.name||'corretor';
  const mNorm = nlp.normalizar(mensagem);

  // Atualizar perfil semântico
  const perfil = memoria.atualizarPerfil(uid, { d, user, imoveis, leads });

  // 1. RAG — busca nos dados reais
  const buscaIm = rag.buscarImoveis(mNorm, imoveis, d.bairros);
  if (buscaIm) return rag.formatarBuscaImoveis(buscaIm, btn);

  // 2. PLANO DO DIA
  if (/o que devo fazer|plano do dia|me orienta|por onde comecar|o que fazer hoje|resumo do dia/.test(mNorm))
    return estrategista.analisar(d, leads, imoveis, visitas, btn, chip);

  // 3. ONBOARDING
  if (/configurar conta|onboarding|comecar|primeiros passos|como comecar/.test(mNorm))
    return onboarding.renderOnboarding(d, btn, chip);

  // 4. RELATÓRIO
  if (/relatorio|relatorio semanal|relatorio mensal|meu desempenho|minha performance/.test(mNorm))
    return relatorio.gerarSemanal(d, leads, imoveis, visitas, btn);

  // 5. NOTIFICAÇÕES
  if (/notifica|alerta|aviso|sino/.test(mNorm)) {
    const alertas = notifs.gerarAlertas(d, leads, imoveis, visitas);
    return notifs.renderAlertas(alertas, btn);
  }

  // 6. AÇÕES
  const acao = acoes.detectarAcao(mNorm);
  if (acao) {
    const resultado = acoes.executarAcao(acao, mensagem, mNorm, d, btn, chip);
    if (resultado) return resultado;
  }

  // 7. ROTEAMENTO POR DOMÍNIO
  const dominio = nlp.detectarDominio(mNorm);
  switch(dominio) {
    case 'saudacao':     return saudacao(d, nome, leads, imoveis, visitas, perfil);
    case 'dashboard':    return dashboard(d, leads, imoveis, visitas);
    case 'leads':        return modLeads.responder(mNorm, d, btn, chip);
    case 'imoveis':      return modImoveis.responder(mNorm, d, imoveis, btn, chip);
    case 'visitas':      return modVisitas.responder(mNorm, d, btn, chip);
    case 'match':        return modMatch.responder(mNorm, d, btn, chip);
    case 'portais':      return modPortais.responder(mNorm, d, btn, chip);
    case 'sistema':      return modSistema.responder(mNorm, d, btn, chip);
    case 'mercado':      return modMercado.responder(mNorm, leads, imoveis, btn, chip);
    case 'coins':        return `🪙 Match Coins — seu sistema de recompensas.<br><br>${btn('Ver coins','/app/coins')}`;
    case 'notificacoes': {
      const alertas = notifs.gerarAlertas(d, leads, imoveis, visitas);
      return notifs.renderAlertas(alertas, btn);
    }
    default: return naoEntendeu(uid, mensagem, contexto, perfil);
  }
}

function detectarTema(mensagem) {
  return nlp.detectarDominio(nlp.normalizar(mensagem));
}

module.exports = { responder, detectarTema, nlp, memoria };
JSEOF

echo ""
echo "✅ Cérebro v15.0 COMPLETO instalado!"
echo ""
echo "Módulos:"
ls "$TARGET"
echo ""
echo "Estrutura final:"
echo "  cerebro/"
echo "  ├── index.js          ← orquestrador v15.0"
echo "  ├── nlp.js            ← tokenizar, similaridade, Levenshtein"
echo "  ├── rag.js            ← busca semântica + slots"
echo "  ├── acoes.js          ← wizards e ações"
echo "  ├── estrategista.js   ← plano do dia"
echo "  ├── memoria.js        ← perfil semântico por usuário"
echo "  ├── aprendizado.js    ← feedback loop"
echo "  ├── notificacoes.js   ← alertas proativos"
echo "  ├── onboarding.js     ← guia conta nova"
echo "  ├── relatorio.js      ← relatório semanal/mensal"
echo "  ├── leads.js"
echo "  ├── imoveis.js"
echo "  ├── visitas.js"
echo "  ├── match.js"
echo "  ├── portais.js"
echo "  ├── sistema.js"
echo "  └── mercado.js"
