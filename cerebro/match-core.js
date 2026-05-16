// match-core.js v3.0 — Motor central da Match
// CASO 1: Lead com imóvel de interesse definido (clique em anúncio)
// CASO 2: Lead com perfil de busca (WhatsApp, importação, manual)

const fs   = require('fs');
const path = require('path');

const EVOLUTION_URL = process.env.EVOLUTION_API_URL || process.env.EVOLUTION_URL || 'https://match-evolution-api.onrender.com';
const EVOLUTION_KEY = process.env.EVOLUTION_API_KEY || process.env.EVOLUTION_KEY || 'match2025evolution';

async function enviarWhatsApp(instancia, numero, texto) {
  try {
    const fetch = (...a) => import('node-fetch').then(({default: f}) => f(...a));
    const r = await fetch(`${EVOLUTION_URL}/message/sendText/${instancia}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'apikey': EVOLUTION_KEY },
      body: JSON.stringify({ number: numero, text: texto })
    });
    const d = await r.json();
    console.log('[MATCH CORE] WhatsApp enviado →', numero);
    return true;
  } catch(e) {
    console.error('[MATCH CORE] erro envio WhatsApp:', e.message);
    return false;
  }
}

function resolverCaminhoImoveis(userId) {
  const candidatos = [
    path.join(__dirname, '..', 'data', `imoveis-${userId}.json`),
    '/opt/render/project/src/data/imoveis.json',
    path.join(__dirname, '..', 'imoveis.json')
  ];
  return candidatos.find(c => fs.existsSync(c)) || null;
}

function lerLeadsSeguro(leadsPath) {
  try { return JSON.parse(fs.readFileSync(leadsPath, 'utf8')); } catch(e) { return []; }
}

function detectarCaso(lead) {
  // Caso 1: tem imóvel de interesse específico
  if (lead.imovel_interesse || lead.imovelId || lead.idAnuncio || lead.id_anuncio) {
    return 'caso1';
  }
  // Caso 2: tem perfil de busca
  return 'caso2';
}

class MatchCore {

  // ============================================================
  // PONTO DE ENTRADA ÚNICO
  // ============================================================
  async processar({ lead, mensagem, canal, userId, leadsPath, instancia }) {
    console.log(`[MATCH CORE] ► ${lead.nome||lead.contato} | canal:${canal} | caso:${detectarCaso(lead)}`);

    try {
      // 1. Timeline
      lead = this._timeline(lead, canal, mensagem);

      // 2. Salva mensagem
      lead = this._salvarMensagem(lead, canal, mensagem);

      // 3. Memória IA — acumula perfil
      const perfil = this._atualizarMemoria(lead, mensagem);

      // 4. Score da jornada
      lead = this._score(lead, perfil);

      // 5. Intenção
      lead = this._intencao(lead, perfil);

      // 6. Match — detecta caso e roda engine certa
      const matchesAntes = (lead.matchesAuto || lead.matches || []).length;
      lead = detectarCaso(lead) === 'caso1'
        ? this._matchCaso1(lead, userId)
        : this._matchCaso2(lead, perfil, userId);
      const matchesDepois = (lead.matchesAuto || lead.matches || []).length;

      // Se match melhorou → notifica corretor
      if (matchesDepois > matchesAntes) {
        lead = this._timeline(lead, 'sistema', `Match: ${matchesDepois} imóveis encontrados`);
        console.log(`[MATCH CORE] match melhorou: ${matchesAntes} → ${matchesDepois}`);
      }

      // 7. Eventos
      lead = this._evento(lead, canal, mensagem);

      // 8. Follow-up
      lead = this._followUp(lead);

      // 9. Salva
      if (leadsPath) this._salvarLead(lead, leadsPath);

      // 10. Resposta + envio WhatsApp
      const resposta = await this._responderEEnviar(lead, mensagem, canal, instancia);

      console.log(`[MATCH CORE] ✓ score:${lead.score} temp:${lead.temperatura} etapa:${lead.scoreEtapa} matches:${matchesDepois}`);
      return { lead, resposta };

    } catch(e) {
      console.error('[MATCH CORE] erro:', e.message);
      return { lead, resposta: null };
    }
  }

  // ============================================================
  // 1. TIMELINE
  // ============================================================
  _timeline(lead, canal, mensagem) {
    if (!lead.timeline) lead.timeline = [];
    lead.timeline.push({ tipo:'mensagem_recebida', canal, texto:(mensagem||'').slice(0,100), timestamp: new Date().toISOString() });
    if (lead.timeline.length > 200) lead.timeline = lead.timeline.slice(-200);
    return lead;
  }

  // ============================================================
  // 2. MENSAGENS
  // ============================================================
  _salvarMensagem(lead, canal, texto) {
    if (!lead.mensagens) lead.mensagens = [];
    lead.mensagens.push({ id: Date.now().toString(), de:'cliente', canal, texto, timestamp: new Date().toISOString(), lida:false });
    lead.ultimaMensagem   = texto;
    lead.ultimaMensagemEm = new Date().toISOString();
    if (lead.mensagens.length > 100) lead.mensagens = lead.mensagens.slice(-100);
    return lead;
  }

  // ============================================================
  // 3. MEMORY ENGINE — acumula sem sobrescrever
  // ============================================================
  _atualizarMemoria(lead, mensagem) {
    try {
      const { extrairPerfil } = require('./extrator-perfil');
      const todasMsgs = (lead.mensagens || []).filter(m => m.de === 'cliente');
      const novoPerfil = extrairPerfil(todasMsgs);

      // Merge inteligente — nunca perde dado já capturado
      const perfilAtual = lead.perfilIA || {};
      const merged = { ...perfilAtual };
      for (const [k, v] of Object.entries(novoPerfil)) {
        if (v !== undefined && v !== null && v !== '') merged[k] = v;
      }

      // Caso 1: complementa com dados do imóvel de interesse
      if (detectarCaso(lead) === 'caso1') {
        const imovelId = lead.imovel_interesse || lead.imovelId;
        if (imovelId && !merged.tipo && lead.tipo) merged.tipo = lead.tipo;
        if (imovelId && !merged.bairro && lead.bairro) merged.bairro = lead.bairro;
        if (imovelId && !merged.quartos && lead.quartos) merged.quartos = lead.quartos;
        if (imovelId && !merged.valorMax && lead.valor_imovel) merged.valorMax = lead.valor_imovel * 1.2;
      }

      lead.perfilIA    = merged;
      lead.temperatura = merged.temperatura || lead.temperatura || 'frio';
      lead.faseFunil   = merged.faseFunil   || lead.faseFunil   || 'novo';

      if (!lead.memoriaOperacional) lead.memoriaOperacional = {};
      lead.memoriaOperacional.atualizadoEm = new Date().toISOString();
      lead.memoriaOperacional.resumo       = this._resumo(merged, lead);
      lead.memoriaOperacional.totalMsgs    = todasMsgs.length;
      lead.memoriaOperacional.caso         = detectarCaso(lead);

      return merged;
    } catch(e) {
      console.error('[MATCH CORE] erro memória:', e.message);
      return lead.perfilIA || {};
    }
  }

  _resumo(perfil, lead) {
    const p = [];
    if (perfil.intencao)  p.push(`quer ${perfil.intencao}`);
    if (perfil.tipo)      p.push(perfil.tipo);
    if (perfil.quartos)   p.push(`${perfil.quartos}q`);
    if (perfil.bairro)    p.push(`em ${perfil.bairro}`);
    if (perfil.valorMax)  p.push(`até R$${Math.round(Number(perfil.valorMax)/1000)}k`);
    if (perfil.urgencia === 'alta') p.push('urgente');
    const msgs = (lead.mensagens||[]).filter(m=>m.de==='cliente').length;
    p.push(`${msgs} msg(s)`);
    p.push(`[${detectarCaso(lead)}]`);
    return p.join(' · ') || 'Sem perfil';
  }

  // ============================================================
  // 4. SCORE DA JORNADA
  // ============================================================
  _score(lead, perfil) {
    let s = 5; // base — entrou no sistema

    // Perfil
    if (perfil.tipo)     s += 5;
    if (perfil.quartos)  s += 4;
    if (perfil.bairro)   s += 4;
    if (perfil.valorMax) s += 4;
    if (perfil.intencao) s += 3;

    // Engajamento
    const msgs = (lead.mensagens||[]).filter(m=>m.de==='cliente').length;
    s += Math.min(msgs * 2, 10);

    // Matches
    const totalMatches = (lead.matches||[]).length + (lead.matchesAuto||[]).length;
    if (totalMatches > 0)  s += 10;
    if (totalMatches >= 3) s += 5;

    // Jornada
    if (lead.vitrineEnviada)      s += 10;
    if (lead.vitrineVisualizada)  s += 8;
    if (lead.visitaSolicitada)    s += 12;
    if (lead.visitaConfirmada)    s += 8;
    if (lead.visitaRealizada)     s += 10;
    if (lead.propostaFeita)       s += 12;

    // Bônus
    if (perfil.urgencia === 'alta')      s += 5;
    if (perfil.faseFunil === 'decidido') s += 3;

    // Caso 1 já começa mais quente
    if (detectarCaso(lead) === 'caso1')  s += 10;

    lead.score = Math.max(0, Math.min(s, 100));
    lead.scoreAtualizadoEm = new Date().toISOString();

    // Etapa da jornada
    lead.scoreEtapa =
      lead.propostaFeita      ? 'Proposta'      :
      lead.visitaRealizada    ? 'Pós-visita'    :
      lead.visitaConfirmada   ? 'Visita conf.'  :
      lead.visitaSolicitada   ? 'Visita solic.' :
      lead.vitrineVisualizada ? 'Vitrine vista' :
      lead.vitrineEnviada     ? 'Vitrine env.'  :
      totalMatches > 0        ? 'Match feito'   :
      msgs > 0                ? 'Conversando'   : 'Novo';

    return lead;
  }

  // ============================================================
  // 5. INTENÇÃO
  // ============================================================
  _intencao(lead, perfil) {
    if (perfil.intencao)   lead.intencao   = perfil.intencao;
    if (perfil.faseFunil)  lead.faseFunil  = perfil.faseFunil;
    if (perfil.urgencia)   lead.urgencia   = perfil.urgencia;
    if (perfil.sentimento) lead.sentimento = perfil.sentimento;
    return lead;
  }

  // ============================================================
  // 6a. MATCH CASO 1 — Lead com imóvel de interesse
  // Busca imóveis SIMILARES ao que a lead clicou
  // ============================================================
  _matchCaso1(lead, userId) {
    try {
      const { buscarMatchesBaseInterna } = require('../matchBaseInterna');
      const filePath = resolverCaminhoImoveis(userId);
      if (!filePath) return lead;

      const imoveis = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      const imoveisDoUser = imoveis.filter(i =>
        (i.codigoUsuario === userId || i.userId === userId) && i.status === 'ativo'
      );

      // Pega o imóvel de interesse como âncora
      const imovelId = lead.imovel_interesse || lead.imovelId || lead.idAnuncio;
      const imovelAncora = imoveisDoUser.find(i =>
        String(i.id) === String(imovelId) ||
        String(i.idExterno) === String(imovelId) ||
        String(i.codigoImovel) === String(imovelId)
      );

      // Monta leadFake baseado no imóvel de interesse
      const leadFake = {
        tipo:     imovelAncora?.tipo    || lead.tipo     || '',
        bairro:   imovelAncora?.bairro  || lead.bairro   || '',
        cidade:   imovelAncora?.cidade  || lead.cidade   || 'São Paulo',
        estado:   imovelAncora?.estado  || lead.estado   || 'SP',
        quartos:  imovelAncora?.quartos || lead.quartos  || 0,
        valorMax: imovelAncora ? (imovelAncora.valor_imovel || imovelAncora.valor) * 1.25 : (lead.valorMax || 0),
        valorMin: imovelAncora ? (imovelAncora.valor_imovel || imovelAncora.valor) * 0.75 : (lead.valorMin || 0),
        area:     imovelAncora?.area_m2 || lead.area     || 0,
        suites:   imovelAncora?.suites  || lead.suites   || 0,
        vagas:    imovelAncora?.vagas   || lead.vagas    || 0
      };

      console.log(`[MATCH CORE] caso1 | âncora:${imovelId} | tipo:${leadFake.tipo} bairro:${leadFake.bairro}`);

      const matches = buscarMatchesBaseInterna(leadFake, imoveisDoUser);

      // Exclui o próprio imóvel de interesse dos resultados
      const matchesFiltrados = (matches || [])
        .filter(m => String(m.id||m.idExterno) !== String(imovelId))
        .slice(0, 8)
        .map((m, i) => ({ ...m, rank: i+1, score: Number(m.score||m.bestScore||0) }));

      // Inclui sempre o imóvel de interesse como primeiro resultado
      if (imovelAncora) {
        matchesFiltrados.unshift({ ...imovelAncora, rank: 0, score: 100, destaque: true, imovelInteresse: true });
      }

      lead.matches     = matchesFiltrados;
      lead.matchesAuto = matchesFiltrados;
      lead.matchAutoEm = new Date().toISOString();

      // Atualiza temperatura — caso 1 já é mais quente
      if (matchesFiltrados.length > 0 && lead.temperatura === 'frio') {
        lead.temperatura = 'morno';
      }

      console.log(`[MATCH CORE] caso1 matches: ${matchesFiltrados.length}`);
    } catch(e) {
      console.error('[MATCH CORE] erro caso1:', e.message);
    }
    return lead;
  }

  // ============================================================
  // 6b. MATCH CASO 2 — Lead com perfil de busca
  // Só roda quando perfil está suficientemente completo
  // E compara com resultado anterior para ver se melhorou
  // ============================================================
  _perfilSuficiente(perfil) {
    // Mínimo: tipo + quartos + (bairro OU valor)
    return !!(perfil.tipo && perfil.quartos && (perfil.bairro || perfil.valorMax));
  }

  _matchCaso2(lead, perfil, userId) {
    try {
      if (!this._perfilSuficiente(perfil)) {
        const faltando = [];
        if (!perfil.tipo) faltando.push('tipo');
        if (!perfil.quartos) faltando.push('quartos');
        if (!perfil.bairro && !perfil.valorMax) faltando.push('bairro ou valor');
        console.log(`[MATCH CORE] caso2 | perfil insuficiente | faltando: ${faltando.join(', ')}`);
        return lead;
      }

      const { buscarMatchesBaseInterna } = require('../matchBaseInterna');
      const filePath = resolverCaminhoImoveis(userId);
      if (!filePath) return lead;

      const imoveis = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      const imoveisDoUser = imoveis.filter(i =>
        (i.codigoUsuario === userId || i.userId === userId) && i.status === 'ativo'
      );

      const leadFake = {
        tipo:     perfil.tipo     || lead.tipo     || '',
        bairro:   perfil.bairro   || lead.bairro   || lead.bairroDesejado || '',
        cidade:   perfil.cidade   || lead.cidade   || 'São Paulo',
        estado:   perfil.estado   || lead.estado   || 'SP',
        quartos:  perfil.quartos  || lead.quartos  || 0,
        valorMax: perfil.valorMax || lead.valorMax || 0,
        valorMin: perfil.valorMin || lead.valorMin || 0,
        area:     perfil.area     || lead.area     || 0,
        suites:   perfil.suites   || lead.suites   || 0,
        vagas:    perfil.vagas    || lead.vagas    || 0
      };

      console.log(`[MATCH CORE] caso2 | tipo:${leadFake.tipo} bairro:${leadFake.bairro} quartos:${leadFake.quartos} valorMax:${leadFake.valorMax}`);

      const matches = buscarMatchesBaseInterna(leadFake, imoveisDoUser);
      const matchesNovos = (matches || []).slice(0, 8).map((m, i) => ({
        ...m, rank: i+1, score: Number(m.score||m.bestScore||0)
      }));

      // Compara com antes — só atualiza se melhorou
      const matchesAntes = lead.matchesAuto || lead.matches || [];
      if (matchesNovos.length >= matchesAntes.length) {
        lead.matchesAuto = matchesNovos;
        lead.matches     = matchesNovos;
        lead.matchAutoEm = new Date().toISOString();
      }

      console.log(`[MATCH CORE] caso2 matches: ${matchesNovos.length}`);
    } catch(e) {
      console.error('[MATCH CORE] erro caso2:', e.message);
    }
    return lead;
  }

  // ============================================================
  // 7. EVENTOS
  // ============================================================
  _evento(lead, canal, texto) {
    if (!lead.eventos) lead.eventos = [];
    lead.eventos.push({ tipo:'mensagem_recebida', canal, resumo:(texto||'').slice(0,80), timestamp: new Date().toISOString() });
    if (lead.eventos.length > 100) lead.eventos = lead.eventos.slice(-100);
    return lead;
  }

  // ============================================================
  // 8. FOLLOW-UP
  // ============================================================
  _followUp(lead) {
    if (!lead.followUps) lead.followUps = [];
    const agora = Date.now();
    const add = (tipo, prazoHoras) => {
      if (!lead.followUps.some(f => f.tipo===tipo && f.status==='pendente')) {
        lead.followUps.push({ id: agora.toString(), tipo, status:'pendente', criadoEm: new Date(agora).toISOString(), prazo: new Date(agora+prazoHoras*3600000).toISOString() });
      }
    };
    const temp  = lead.temperatura;
    const fase  = lead.faseFunil;
    const msgs  = (lead.mensagens||[]).filter(m=>m.de==='cliente').length;
    const total = (lead.matches||[]).length + (lead.matchesAuto||[]).length;

    if (temp==='quente' && fase==='interessado')          add('agendar_visita', 24);
    if (temp==='quente' && fase==='decidido')             add('proposta_negocio', 12);
    if (temp==='morno'  && msgs>=3)                       add('enviar_vitrine', 48);
    if (msgs===1 && temp==='frio')                        add('qualificar_lead', 72);
    if (total>0 && !lead.vitrineEnviada)                  add('enviar_vitrine', 24);
    if (lead.vitrineEnviada && !lead.visitaSolicitada)    add('followup_vitrine', 72);
    return lead;
  }

  // ============================================================
  // 9. PERSISTÊNCIA
  // ============================================================
  _salvarLead(lead, leadsPath) {
    try {
      const leads = lerLeadsSeguro(leadsPath);
      const idx = leads.findIndex(l => String(l.id) === String(lead.id));
      if (idx >= 0) { leads[idx] = lead; } else { leads.push(lead); }
      fs.writeFileSync(leadsPath, JSON.stringify(leads, null, 2));
    } catch(e) {
      console.error('[MATCH CORE] erro salvar:', e.message);
    }
  }

  // ============================================================
  // 10. RESPOSTA + ENVIO WHATSAPP
  // ============================================================
  async _responderEEnviar(lead, mensagem, canal, instancia) {
    try {
      const { gerarResposta } = require('./resposta-auto');
      const matches = lead.matchesAuto || lead.matches || [];
      const texto = gerarResposta(lead, mensagem, matches);
      if (!texto) return null;

      if (!lead.mensagens) lead.mensagens = [];
      lead.mensagens.push({ id:(Date.now()+1).toString(), de:'assistente', canal, texto, timestamp: new Date().toISOString(), lida:true });

      if (canal==='whatsapp' && instancia && lead.contato) {
        setImmediate(() => enviarWhatsApp(instancia, lead.contato, texto));
      }
      return texto;
    } catch(e) {
      console.error('[MATCH CORE] erro resposta:', e.message);
      return null;
    }
  }

  // Método público para copiloto
  gerarResposta(lead, mensagem) {
    try {
      const { gerarResposta } = require('./resposta-auto');
      return gerarResposta(lead, mensagem, lead.matchesAuto || lead.matches || []);
    } catch(e) { return null; }
  }
}

module.exports = new MatchCore();
