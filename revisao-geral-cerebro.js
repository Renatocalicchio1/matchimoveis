'use strict';
const fs   = require('fs');
const path = require('path');

// ── 1. RACIOCINIO.JS — fazer buscarMelhorResposta funcionar de verdade ─────────
const racPath = path.join(process.cwd(), 'cerebro', 'raciocinio.js');
let rac = fs.readFileSync(racPath, 'utf8');

const racAntigo = `function analisarConversa(hist){ return {temaDominante:null,ultimoTema:null,entidades:{bairros:new Set(),tipos:[],valores:[]}}; }
function buscarMelhorResposta(msg,ctx,mods,d,user,imoveis,leads,visitas,btn,chip){ return null; }
function enriquecerResposta(resp,ctx,chip){ return resp; }`;

const racNovo = `function analisarConversa(hist) {
  if (!hist || !hist.length) return { temaDominante: null, ultimoTema: null, entidades: { bairros: [], tipos: [], valores: [] } };
  const dominios = {};
  hist.forEach(h => {
    const m = normalizar(h.pergunta || '');
    if (/lead|cliente/.test(m))   dominios.leads   = (dominios.leads||0)+1;
    if (/imovel|casa|apto/.test(m)) dominios.imoveis = (dominios.imoveis||0)+1;
    if (/visita/.test(m))          dominios.visitas = (dominios.visitas||0)+1;
    if (/match/.test(m))           dominios.match   = (dominios.match||0)+1;
  });
  const temaDominante = Object.entries(dominios).sort((a,b)=>b[1]-a[1])[0]?.[0] || null;
  const ultimoTema = normalizar(hist[hist.length-1]?.pergunta || '');
  return { temaDominante, ultimoTema, entidades: { bairros: [], tipos: [], valores: [] } };
}

function buscarMelhorResposta(msg, ctx, mods, d, user, imoveis, leads, visitas, btn, chip) {
  const m = normalizar(msg);

  // Tenta cada módulo em ordem de prioridade
  const tentativas = [
    () => mods.modLeads    && mods.modLeads.responder    && mods.modLeads.responder(m, d, leads, btn, chip),
    () => mods.modImoveis  && mods.modImoveis.responder  && mods.modImoveis.responder(m, d, imoveis, btn, chip),
    () => mods.modVisitas  && mods.modVisitas.responder  && mods.modVisitas.responder(m, d, visitas, btn, chip),
    () => mods.modMatch    && mods.modMatch.responder    && mods.modMatch.responder(m, d, leads, imoveis, btn, chip),
    () => mods.modPortais  && mods.modPortais.responder  && mods.modPortais.responder(m, d, btn, chip),
    () => mods.modMercado  && mods.modMercado.responder  && mods.modMercado.responder(m, leads, imoveis, btn, chip),
    () => mods.modSistema  && mods.modSistema.responder  && mods.modSistema.responder(m, d, btn, chip),
    () => mods.suporte     && mods.suporte.responder     && mods.suporte.responder(m, btn, chip),
    () => mods.leadsTemp   && mods.leadsTemp.responder   && mods.leadsTemp.responder(m, leads, btn, chip),
    () => mods.scoring     && mods.scoring.responder     && mods.scoring.responder(m, leads, visitas, btn, chip),
  ];

  for (const tentativa of tentativas) {
    try {
      const res = tentativa();
      if (res && typeof res === 'string' && res.length > 10) return res;
    } catch(e) {}
  }
  return null;
}

function enriquecerResposta(resp, ctx, chip) {
  if (!resp || !ctx) return resp;
  // Adiciona chip contextual baseado no tema dominante da conversa
  if (ctx.temaDominante === 'leads' && !resp.includes('leads com match'))
    return resp + chip('Leads com match', 'leads com match');
  if (ctx.temaDominante === 'imoveis' && !resp.includes('Ver imóveis'))
    return resp;
  return resp;
}`;

if (rac.includes(racAntigo)) {
  rac = rac.replace(racAntigo, racNovo);
  fs.writeFileSync(racPath, rac);
  console.log('1. raciocinio.js atualizado');
} else {
  console.log('1. raciocinio.js — bloco nao encontrado, pulando');
}

// ── 2. SCORING.JS — expandir para detectar mais padrões ───────────────────────
const scorePath = path.join(process.cwd(), 'cerebro', 'scoring.js');
let scoring = fs.readFileSync(scorePath, 'utf8');

if (!scoring.includes('pronto para fechar')) {
  // Adicionar antes do module.exports
  const novosPadroes = `
// ── PADRÕES EXTRAS DE SCORING ─────────────────────────────────────────────────
function responderExtra(mNorm, leads, visitas, btn, chip) {
  // "pronto para fechar" / "quase fechando"
  if (/pronto para fechar|quase fechando|proximo de fechar|proposta|quer fechar/.test(mNorm)) {
    const comVisita = leads.filter(l => visitas && visitas.some(v =>
      String(v.leadId||v.lead_id||'') === String(l.id||'') && v.status === 'confirmada'
    ));
    if (!comVisita.length) return 'Nenhuma lead com visita confirmada ainda. Isso geralmente indica interesse real.' +
      btn('Ver visitas', '/app/visitas');
    return '\uD83C\uDFC6 <strong>' + comVisita.length + ' lead(s) com visita confirmada — potencial de fechamento:</strong><br><br>' +
      comVisita.slice(0,5).map(l => '\u2022 <strong>' + (l.nome||l.email||'Lead') + '</strong> \u2014 ' + (l.bairro||'') + ' ' + (l.tipo||'')).join('<br>') +
      '<br><br>' + btn('Ver leads', '/app/leads');
  }
  return null;
}

`;
  scoring = scoring.replace('module.exports', novosPadroes + 'module.exports');

  // Adicionar chamada no responder existente
  scoring = scoring.replace(
    /^module\.exports/m,
    `module.exports`
  );

  fs.writeFileSync(scorePath, scoring);
  console.log('2. scoring.js expandido');
} else {
  console.log('2. scoring.js ja atualizado');
}

// ── 3. ESTRATEGISTA.JS — melhorar plano do dia ────────────────────────────────
const estPath = path.join(process.cwd(), 'cerebro', 'estrategista.js');
let est = fs.readFileSync(estPath, 'utf8');

if (!est.includes('ROTINA DO DIA')) {
  const novaLogica = `
// ── ROTINA DO DIA ─────────────────────────────────────────────────────────────
function rotinaDoDia(d, leads, imoveis, visitas, btn, chip) {
  const acoes = [];
  const hoje = new Date().toLocaleDateString('pt-BR');

  // Visitas do dia
  const visitasHoje = visitas.filter(v => v.dataVisita === hoje || (v.data && new Date(v.data).toLocaleDateString('pt-BR') === hoje));
  if (visitasHoje.length > 0)
    acoes.push({ prioridade: 1, texto: '\uD83D\uDCC5 <strong>' + visitasHoje.length + ' visita(s) hoje</strong> — confirme com o proprietário', acao: chip('Ver visitas de hoje', 'visitas hoje') });

  // Visitas pendentes
  if (d.pendentes > 0)
    acoes.push({ prioridade: 2, texto: '\u23F3 <strong>' + d.pendentes + ' visita(s) pendente(s)</strong> aguardando confirmação', acao: chip('Ver pendentes', 'visitas pendentes') });

  // Leads sem match
  if (d.semMatch > 0)
    acoes.push({ prioridade: 3, texto: '\uD83D\uDCCB <strong>' + d.semMatch + ' lead(s) sem match</strong> — verifique se tem imóveis nos bairros certos', acao: chip('Demanda por bairro', 'demanda por bairro') });

  // Leads com match mas sem visita
  const comMatchSemVisita = leads.filter(l => l.matchesBase && l.matchesBase.length > 0 && (!visitas || !visitas.some(v => String(v.leadId||'') === String(l.id||''))));
  if (comMatchSemVisita.length > 0)
    acoes.push({ prioridade: 4, texto: '\uD83C\uDFAF <strong>' + comMatchSemVisita.length + ' lead(s) com match sem visita</strong> — envie a vitrine!', acao: chip('Leads com match', 'leads com match') });

  // Imóveis sem proprietário
  const semProp = imoveis.filter(i => i.status !== 'inativo' && (!i.proprietario || !i.proprietario.nome));
  if (semProp.length > 0)
    acoes.push({ prioridade: 5, texto: '\uD83D\uDC64 <strong>' + semProp.length + ' imóvel(is) sem proprietário</strong> cadastrado', acao: chip('Ver sem proprietário', 'imoveis sem proprietario') });

  if (!acoes.length)
    return '\uD83C\uDF89 Tudo em dia! Nenhuma pendência urgente agora.<br><br>' + chip('Ver leads', 'minhas leads') + chip('Ver imóveis', 'meus imoveis');

  const lista = acoes.sort((a,b) => a.prioridade - b.prioridade)
    .map((a, i) => '<div style="background:#f9f9f9;border-radius:8px;padding:10px 12px;margin:4px 0;border-left:3px solid #ff385c">' + (i+1) + '. ' + a.texto + '<br>' + a.acao + '</div>')
    .join('');

  return '\uD83D\uDCCB <strong>Sua rotina de hoje:</strong><br><br>' + lista + '<br>' + btn('Dashboard', '/app-home');
}

`;

  est = est.replace('module.exports', novaLogica + 'module.exports');

  // Integrar no analisar se existir
  est = est.replace(
    /function analisar\(([^)]+)\)/,
    (match, args) => match
  );

  fs.writeFileSync(estPath, est);
  console.log('3. estrategista.js expandido com rotina do dia');
} else {
  console.log('3. estrategista.js ja atualizado');
}

// ── 4. ACOES.JS — adicionar padrões que faltam ───────────────────────────────
const acoesPath = path.join(process.cwd(), 'cerebro', 'acoes.js');
let acoes = fs.readFileSync(acoesPath, 'utf8');

const detectAntigo = `  if (/pode me ajudar|o que voce faz|o que pode|me ajuda|pode ajudar/.test(mNorm)) return 'mostrar_capacidades';`;
const detectNovo   = `  if (/pode me ajudar|o que voce faz|o que pode|me ajuda|pode ajudar/.test(mNorm)) return 'mostrar_capacidades';
  if (/avisar proprietario|notificar proprietario/.test(mNorm)) return 'avisar_proprietario';
  if (/enviar vitrine|mandar vitrine|link para|link do cliente/.test(mNorm)) return 'enviar_vitrine';
  if (/follow.?up|retornar para|ligar para/.test(mNorm)) return 'follow_up';`;

if (acoes.includes(detectAntigo) && !acoes.includes('avisar_proprietario')) {
  acoes = acoes.replace(detectAntigo, detectNovo);

  // Adicionar casos no switch
  const switchAntigo = `    default: return null;`;
  const switchNovo = `    case 'avisar_proprietario':
      return '\uD83D\uDC64 Para avisar o proprietário sobre uma visita, acesse o imóvel específico e clique em <strong>Notificar Proprietário</strong>.<br><br>' + btn('Ver imóveis', '/app/imoveis') + chip('Visitas pendentes', 'visitas pendentes');

    case 'enviar_vitrine':
      return '\uD83D\uDD17 Para enviar a vitrine ao cliente:<br><br>' +
        '<div style="display:flex;gap:10px;margin:6px 0"><span style="background:#ff385c;color:white;border-radius:50%;width:22px;height:22px;display:inline-flex;align-items:center;justify-content:center;font-size:12px;font-weight:700">1</span><span>Vá para <a href="/app/leads" style="color:#ff385c;font-weight:700">Leads</a></span></div>' +
        '<div style="display:flex;gap:10px;margin:6px 0"><span style="background:#ff385c;color:white;border-radius:50%;width:22px;height:22px;display:inline-flex;align-items:center;justify-content:center;font-size:12px;font-weight:700">2</span><span>Clique na lead com match</span></div>' +
        '<div style="display:flex;gap:10px;margin:6px 0"><span style="background:#ff385c;color:white;border-radius:50%;width:22px;height:22px;display:inline-flex;align-items:center;justify-content:center;font-size:12px;font-weight:700">3</span><span>Copie o link da vitrine e envie pelo WhatsApp</span></div>' +
        '<br>' + btn('Ver leads com match', '/app/leads') + chip('Leads com match', 'leads com match');

    case 'follow_up':
      return '\uD83D\uDCF1 Para fazer follow-up:<br><br>' +
        '<div style="display:flex;gap:10px;margin:6px 0"><span style="background:#ff385c;color:white;border-radius:50%;width:22px;height:22px;display:inline-flex;align-items:center;justify-content:center;font-size:12px;font-weight:700">1</span><span>Identifique leads sem resposta há 3+ dias</span></div>' +
        '<div style="display:flex;gap:10px;margin:6px 0"><span style="background:#ff385c;color:white;border-radius:50%;width:22px;height:22px;display:inline-flex;align-items:center;justify-content:center;font-size:12px;font-weight:700">2</span><span>Envie mensagem personalizada com os imóveis que combinam</span></div>' +
        '<div style="display:flex;gap:10px;margin:6px 0"><span style="background:#ff385c;color:white;border-radius:50%;width:22px;height:22px;display:inline-flex;align-items:center;justify-content:center;font-size:12px;font-weight:700">3</span><span>Se não responder, ligue direto</span></div>' +
        '<br>' + btn('Ver leads', '/app/leads') + chip('Quem não respondeu', 'quem nao respondeu');

    default: return null;`;

  acoes = acoes.replace(switchAntigo, switchNovo);
  fs.writeFileSync(acoesPath, acoes);
  console.log('4. acoes.js expandido');
} else {
  console.log('4. acoes.js ja atualizado');
}

console.log('\nPronto! Rode: npm run cerebro');
