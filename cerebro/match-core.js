// match-core.js v2.0 — Cérebro central da Match
// 10 camadas completas + envio automático WhatsApp

const fs   = require('fs');
const path = require('path');

const EVOLUTION_URL = process.env.EVOLUTION_API_URL || 'https://match-evolution-api.onrender.com';
const EVOLUTION_KEY = process.env.EVOLUTION_API_KEY || 'match2025evolution';

async function enviarWhatsApp(instancia, numero, texto) {
  try {
    const fetch = (...a) => import('node-fetch').then(({default: f}) => f(...a));
    const r = await fetch(`${EVOLUTION_URL}/message/sendText/${instancia}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'apikey': EVOLUTION_KEY },
      body: JSON.stringify({ number: numero, text: texto })
    });
    const d = await r.json();
    console.log('[MATCH CORE] WhatsApp enviado →', numero, '| id:', d.key?.id || 'ok');
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

class MatchCore {

  async processar({ lead, mensagem, canal, userId, leadsPath, instancia }) {
    console.log('[MATCH CORE] ► lead:', lead.nome || lead.contato, '| canal:', canal);
    try {
      lead = this._timeline(lead, canal, mensagem);
      lead = this._salvarMensagem(lead, canal, mensagem);
      const perfil = this._atualizarMemoria(lead, mensagem);
      lead = this._score(lead, perfil);
      lead = this._intencao(lead, perfil);
      lead = this._match(lead, perfil, userId);
      lead = this._evento(lead, canal, mensagem);
      lead = this._followUp(lead);
      if (leadsPath) this._salvarLead(lead, leadsPath);
      const resposta = await this._responderEEnviar(lead, mensagem, canal, instancia);
      console.log(`[MATCH CORE] ✓ score:${lead.score} temp:${lead.temperatura} matches:${(lead.matchesAuto||[]).length}`);
      return { lead, resposta };
    } catch(e) {
      console.error('[MATCH CORE] erro geral:', e.message);
      return { lead, resposta: null };
    }
  }

  _timeline(lead, canal, mensagem) {
    if (!lead.timeline) lead.timeline = [];
    lead.timeline.push({ tipo: 'mensagem_recebida', canal, texto: mensagem, timestamp: new Date().toISOString() });
    if (lead.timeline.length > 200) lead.timeline = lead.timeline.slice(-200);
    return lead;
  }

  _salvarMensagem(lead, canal, texto) {
    if (!lead.mensagens) lead.mensagens = [];
    lead.mensagens.push({ id: Date.now().toString(), de: 'cliente', canal, texto, timestamp: new Date().toISOString(), lida: false });
    lead.ultimaMensagem   = texto;
    lead.ultimaMensagemEm = new Date().toISOString();
    if (lead.mensagens.length > 100) lead.mensagens = lead.mensagens.slice(-100);
    return lead;
  }

  _atualizarMemoria(lead, mensagem) {
    try {
      const { extrairPerfil } = require('./extrator-perfil');
      const todasMsgs = (lead.mensagens || []).filter(m => m.de === 'cliente');
      const novoPerfil = extrairPerfil(todasMsgs);
      const perfilAtual = lead.perfilIA || {};
      const merged = { ...perfilAtual };
      for (const [k, v] of Object.entries(novoPerfil)) {
        if (v !== undefined && v !== null && v !== '') merged[k] = v;
      }
      lead.perfilIA    = merged;
      lead.temperatura = merged.temperatura || lead.temperatura || 'frio';
      lead.faseFunil   = merged.faseFunil   || lead.faseFunil   || 'novo';
      if (!lead.memoriaOperacional) lead.memoriaOperacional = {};
      lead.memoriaOperacional.atualizadoEm = new Date().toISOString();
      lead.memoriaOperacional.resumo       = this._resumo(merged, lead);
      lead.memoriaOperacional.totalMsgs    = todasMsgs.length;
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
    if (perfil.suites)    p.push(`${perfil.suites}s`);
    if (perfil.vagas)     p.push(`${perfil.vagas}vg`);
    if (perfil.bairro)    p.push(`em ${perfil.bairro}`);
    if (perfil.valorMax)  p.push(`até R$${Number(perfil.valorMax).toLocaleString('pt-BR')}`);
    if (perfil.area)      p.push(`${perfil.area}m²`);
    if (perfil.urgencia === 'alta') p.push('urgente');
    const msgs = (lead.mensagens || []).filter(m => m.de === 'cliente').length;
    p.push(`${msgs} msg(s)`);
    return p.join(' · ') || 'Sem perfil definido';
  }

  _score(lead, perfil) {
    // ── SCORE DA JORNADA (0-100) ──────────────────────────────
    // Reflete onde a lead está no funil, não só o perfil
    let s = 0;

    // 1. Entrou no sistema
    s += 5;

    // 2. Perfil sendo construído
    if (perfil.tipo)     s += 5;
    if (perfil.quartos)  s += 4;
    if (perfil.bairro)   s += 4;
    if (perfil.valorMax) s += 4;
    if (perfil.intencao) s += 3;

    // 3. Engajamento — mensagens trocadas
    const msgs = (lead.mensagens || []).filter(m => m.de === 'cliente').length;
    s += Math.min(msgs * 2, 10);

    // 4. Match encontrado
    const totalMatches = (lead.matches||[]).length + (lead.matchesAuto||[]).length;
    if (totalMatches > 0)  s += 10;
    if (totalMatches >= 3) s += 5;

    // 5. Vitrine enviada
    if (lead.vitrineEnviada)      s += 10;

    // 6. Vitrine visualizada pelo cliente
    if (lead.vitrineVisualizada)  s += 8;

    // 7. Visita solicitada
    if (lead.visitaSolicitada)    s += 12;

    // 8. Visita confirmada
    if (lead.visitaConfirmada)    s += 8;

    // 9. Visita realizada
    if (lead.visitaRealizada)     s += 10;

    // 10. Proposta feita
    if (lead.propostaFeita)       s += 12;

    // Bônus urgência
    if (perfil.urgencia === 'alta') s += 5;
    if (perfil.faseFunil === 'decidido') s += 3;

    lead.score             = Math.max(0, Math.min(s, 100));
    lead.scoreAtualizadoEm = new Date().toISOString();

    // ── SCORE LABEL — nome da etapa atual ────────────────────
    lead.scoreEtapa =
      lead.propostaFeita      ? 'Proposta'      :
      lead.visitaRealizada    ? 'Pós-visita'    :
      lead.visitaConfirmada   ? 'Visita conf.'  :
      lead.visitaSolicitada   ? 'Visita solic.' :
      lead.vitrineVisualizada ? 'Vitrine vista' :
      lead.vitrineEnviada     ? 'Vitrine env.'  :
      totalMatches > 0        ? 'Match feito'   :
      msgs > 0                ? 'Conversando'   :
      'Novo';

    return lead;
  }

  _intencao(lead, perfil) {
    if (perfil.intencao)   lead.intencao   = perfil.intencao;
    if (perfil.faseFunil)  lead.faseFunil  = perfil.faseFunil;
    if (perfil.urgencia)   lead.urgencia   = perfil.urgencia;
    if (perfil.sentimento) lead.sentimento = perfil.sentimento;
    return lead;
  }

  _perfilCompleto(perfil) {
    return !!(perfil.tipo && perfil.quartos && (perfil.bairro || perfil.valorMax));
  }

  _match(lead, perfil, userId) {
    try {
      if (!this._perfilCompleto(perfil)) {
        console.log('[MATCH CORE] perfil incompleto — aguardando dados');
        return lead;
      }
      const { buscarMatchesBaseInterna } = require('../matchBaseInterna');
      const filePath = resolverCaminhoImoveis(userId);
      if (!filePath) { console.warn('[MATCH CORE] imoveis.json não encontrado'); return lead; }
      const imoveis = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      const imoveisDoUser = userId
        ? imoveis.filter(i => i.codigoUsuario === userId || i.userId === userId)
        : imoveis;
      const leadFake = {
        tipo:     perfil.tipo     || lead.tipo     || '',
        bairro:   perfil.bairro   || lead.bairro   || lead.bairroDesejado || '',
        quartos:  perfil.quartos  || lead.quartos  || 0,
        valorMax: perfil.valorMax || lead.valorMax || 0,
        valorMin: perfil.valorMin || lead.valorMin || 0,
        area:     perfil.area     || lead.area     || 0,
        suites:   perfil.suites   || lead.suites   || 0,
        vagas:    perfil.vagas    || lead.vagas     || 0
      };
      const matches = buscarMatchesBaseInterna(leadFake, imoveisDoUser);
      lead.matchesAuto = (matches || []).slice(0, 8).map((m, i) => ({ ...m, rank: i + 1, score: Number(m.score || m.bestScore || 0) }));
      lead.matchAutoEm = new Date().toISOString();
      lead = this._timeline(lead, 'sistema', `Match automático: ${lead.matchesAuto.length} imóveis`);
      console.log('[MATCH CORE] matches encontrados:', lead.matchesAuto.length);
    } catch(e) {
      console.error('[MATCH CORE] erro match:', e.message);
    }
    return lead;
  }

  _evento(lead, canal, texto) {
    if (!lead.eventos) lead.eventos = [];
    lead.eventos.push({ tipo: 'mensagem_recebida', canal, resumo: (texto||'').slice(0,80), timestamp: new Date().toISOString() });
    if (lead.eventos.length > 100) lead.eventos = lead.eventos.slice(-100);
    return lead;
  }

  _followUp(lead) {
    if (!lead.followUps) lead.followUps = [];
    const agora = Date.now();
    const add = (tipo, prazoHoras) => {
      const jaExiste = lead.followUps.some(f => f.tipo === tipo && f.status === 'pendente');
      if (!jaExiste) {
        lead.followUps.push({ id: agora.toString(), tipo, status: 'pendente', criadoEm: new Date(agora).toISOString(), prazo: new Date(agora + prazoHoras * 3600000).toISOString() });
        console.log('[MATCH CORE] follow-up criado:', tipo);
      }
    };
    const temp = lead.temperatura;
    const fase = lead.faseFunil;
    const msgs = (lead.mensagens || []).filter(m => m.de === 'cliente').length;
    if (temp === 'quente' && fase === 'interessado')          add('agendar_visita', 24);
    if (temp === 'quente' && fase === 'decidido')             add('proposta_negocio', 12);
    if (temp === 'morno'  && msgs >= 3)                       add('enviar_vitrine', 48);
    if (msgs === 1 && temp === 'frio')                        add('qualificar_lead', 72);
    if ((lead.matchesAuto||[]).length > 0 && fase !== 'decidido') add('enviar_matches', 48);
    return lead;
  }

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

  async _responderEEnviar(lead, mensagem, canal, instancia) {
    try {
      const { gerarResposta } = require('./resposta-auto');
      const texto = gerarResposta(lead, mensagem, lead.matchesAuto || []);
      if (!texto) return null;
      if (!lead.mensagens) lead.mensagens = [];
      lead.mensagens.push({ id: (Date.now()+1).toString(), de: 'assistente', canal, texto, timestamp: new Date().toISOString(), lida: true });
      if (canal === 'whatsapp' && instancia && lead.contato) {
        setImmediate(() => enviarWhatsApp(instancia, lead.contato, texto));
      }
      return texto;
    } catch(e) {
      console.error('[MATCH CORE] erro resposta:', e.message);
      return null;
    }
  }

  gerarResposta(lead, mensagem) {
    try {
      const { gerarResposta } = require('./resposta-auto');
      return gerarResposta(lead, mensagem, lead.matchesAuto || []);
    } catch(e) { return null; }
  }
}

module.exports = new MatchCore();
