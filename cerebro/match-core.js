// match-core.js — Cérebro central da Match
// Toda inteligência passa por aqui. O WhatsApp é apenas canal.

const fs   = require('fs');
const path = require('path');

class MatchCore {

  // ============================================================
  // PONTO DE ENTRADA ÚNICO
  // Qualquer canal (WhatsApp, Dashboard, App) chama processar()
  // ============================================================
  async processar({ lead, mensagem, canal, userId, leadsPath }) {
    console.log('[MATCH CORE] processando lead:', lead.nome || lead.contato, '| canal:', canal);

    try {
      // 1. Atualiza Timeline
      lead = this.atualizarTimeline(lead, { tipo: 'mensagem', canal, texto: mensagem, timestamp: new Date().toISOString() });

      // 2. Salva mensagem
      lead = this.salvarMensagem(lead, { de: 'cliente', canal, texto: mensagem, timestamp: new Date().toISOString() });

      // 3. Atualiza Memória IA
      const perfil = this.atualizarMemoriaIA(lead, mensagem);

      // 4. Recalcula Score
      lead = this.recalcularScore(lead, perfil);

      // 5. Detecta Intenção
      lead = this.detectarIntencao(lead, perfil);

      // 6. Roda Match Engine
      lead = this.rodarMatchEngine(lead, perfil);

      // 7. Registra Evento
      lead = this.registrarEvento(lead, { tipo: 'mensagem_recebida', canal, timestamp: new Date().toISOString() });

      // 8. Verifica Follow-up
      lead = this.verificarFollowUp(lead);

      // 9. Salva lead atualizado
      if (leadsPath) this.salvarLead(lead, leadsPath);

      console.log('[MATCH CORE] lead processada | score:', lead.score, '| temperatura:', lead.temperatura);
      return lead;

    } catch(e) {
      console.error('[MATCH CORE] erro:', e.message);
      return lead;
    }
  }

  // ============================================================
  // 1. TIMELINE ENGINE
  // ============================================================
  atualizarTimeline(lead, evento) {
    if (!lead.timeline) lead.timeline = [];
    lead.timeline.push(evento);
    return lead;
  }

  // ============================================================
  // 2. MENSAGENS
  // ============================================================
  salvarMensagem(lead, msg) {
    if (!lead.mensagens) lead.mensagens = [];
    lead.mensagens.push({ id: Date.now().toString(), ...msg, lida: false });
    lead.ultimaMensagem = msg.texto;
    lead.ultimaMensagemEm = msg.timestamp;
    return lead;
  }

  // ============================================================
  // 3. MEMORY ENGINE — Memória IA
  // ============================================================
  atualizarMemoriaIA(lead, mensagem) {
    try {
      const { extrairPerfil } = require('./extrator-perfil');
      const novoPerfil = extrairPerfil([{ de: 'cliente', texto: mensagem }]);

      // Merge inteligente — acumula, não sobrescreve
      const perfilAtual = lead.perfilIA || {};
      const perfilMerged = { ...perfilAtual };
      for (const [k, v] of Object.entries(novoPerfil)) {
        if (v !== undefined && v !== null) perfilMerged[k] = v;
      }

      lead.perfilIA = perfilMerged;
      lead.temperatura = perfilMerged.temperatura || lead.temperatura;
      lead.faseFunil = perfilMerged.faseFunil || lead.faseFunil;

      // Atualiza resumo da memória operacional
      if (!lead.memoriaOperacional) lead.memoriaOperacional = {};
      lead.memoriaOperacional.atualizadoEm = new Date().toISOString();
      lead.memoriaOperacional.resumo = this.gerarResumo(perfilMerged, lead);

      console.log('[MATCH CORE] memoria IA atualizada | temperatura:', lead.temperatura);
      return perfilMerged;

    } catch(e) {
      console.error('[MATCH CORE] erro memoria:', e.message);
      return lead.perfilIA || {};
    }
  }

  gerarResumo(perfil, lead) {
    const partes = [];
    if (perfil.intencao) partes.push(`Quer ${perfil.intencao}`);
    if (perfil.tipo) partes.push(perfil.tipo);
    if (perfil.quartos) partes.push(`${perfil.quartos} quartos`);
    if (perfil.bairro) partes.push(`em ${perfil.bairro}`);
    if (perfil.valorMax) partes.push(`até R$${Number(perfil.valorMax).toLocaleString('pt-BR')}`);
    if (perfil.urgencia === 'alta') partes.push('urgente');
    const msgs = (lead.mensagens || []).filter(m => m.de === 'cliente').length;
    if (msgs > 0) partes.push(`${msgs} mensagem(ns)`);
    return partes.join(', ') || 'Lead sem perfil definido';
  }

  // ============================================================
  // 4. SCORE ENGINE
  // ============================================================
  recalcularScore(lead, perfil) {
    let score = 0;
    if (perfil.tipo) score += 20;
    if (perfil.quartos) score += 15;
    if (perfil.valorMax) score += 20;
    if (perfil.bairro) score += 15;
    if (perfil.urgencia === 'alta') score += 20;
    if (perfil.intencao === 'comprar') score += 10;
    if (perfil.faseFunil === 'decidido') score += 30;
    if (perfil.faseFunil === 'interessado') score += 20;
    if (perfil.faseFunil === 'qualificado') score += 10;
    const msgs = (lead.mensagens || []).filter(m => m.de === 'cliente').length;
    score += Math.min(msgs * 2, 20);

    lead.score = Math.min(score, 100);
    lead.scoreAtualizadoEm = new Date().toISOString();

    console.log('[MATCH CORE] score recalculado:', lead.score);
    return lead;
  }

  // ============================================================
  // 5. INTENÇÃO
  // ============================================================
  detectarIntencao(lead, perfil) {
    if (perfil.intencao) lead.intencao = perfil.intencao;
    if (perfil.faseFunil) lead.faseFunil = perfil.faseFunil;
    if (perfil.urgencia) lead.urgencia = perfil.urgencia;
    return lead;
  }

  // ============================================================
  // VERIFICADOR: perfil completo para match
  // ============================================================
  perfilCompleto(perfil) {
    const temTipo = !!perfil.tipo;
    const temQuartos = !!perfil.quartos;
    const temLocalizacao = !!(perfil.bairro || perfil.cidade);
    const temValor = !!(perfil.valorMax || perfil.valorMin);
    return temTipo && temQuartos && (temLocalizacao || temValor);
  }

  // ============================================================
  // 6. MATCH ENGINE
  // ============================================================
  rodarMatchEngine(lead, perfil) {
    try {
      if (!this.perfilCompleto(perfil)) {
        console.log('[MATCH CORE] perfil incompleto — aguardando mais dados');
        return lead;
      }
      console.log('[MATCH CORE] perfil completo — rodando match automatico');

      const { buscarMatchesBaseInterna } = require('../matchBaseInterna');
      const caminhos = [
        '/opt/render/project/src/data/imoveis.json',
        path.join(__dirname, '..', 'imoveis.json')
      ];
      const filePath = caminhos.find(c => fs.existsSync(c));
      if (!filePath) return lead;

      const imoveis = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      const leadFake = {
        tipo: perfil.tipo || lead.tipo || '',
        bairro: perfil.bairro || lead.bairro || lead.bairroDesejado || '',
        quartos: perfil.quartos || lead.quartos || 0,
        valorMax: perfil.valorMax || lead.valorMax || 0,
        valorMin: perfil.valorMin || lead.valorMin || 0,
        area: perfil.area || lead.area || 0
      };
      const matches = buscarMatchesBaseInterna(leadFake, imoveis);
      lead.matchesAuto = (matches || []).slice(0, 8).map((m, i) => ({
        ...m, rank: i + 1, score: Number(m.score || m.bestScore || 0)
      }));
      lead.matchAutoEm = new Date().toISOString();

      console.log('[MATCH CORE] matches encontrados:', lead.matchesAuto.length);
    } catch(e) {
      console.error('[MATCH CORE] erro match:', e.message);
    }
    return lead;
  }

  // ============================================================
  // 7. EVENTOS
  // ============================================================
  registrarEvento(lead, evento) {
    if (!lead.eventos) lead.eventos = [];
    lead.eventos.push(evento);
    return lead;
  }

  // ============================================================
  // 8. FOLLOW-UP ENGINE
  // ============================================================
  verificarFollowUp(lead) {
    if (!lead.followUps) lead.followUps = [];

    // Se lead quente e sem visita agendada → sugere follow-up
    if (lead.temperatura === 'quente' && lead.faseFunil === 'interessado') {
      const jaTemFollowUp = lead.followUps.some(f => f.tipo === 'agendar_visita' && f.status === 'pendente');
      if (!jaTemFollowUp) {
        lead.followUps.push({
          id: Date.now().toString(),
          tipo: 'agendar_visita',
          status: 'pendente',
          criadoEm: new Date().toISOString(),
          prazo: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() // 24h
        });
        console.log('[MATCH CORE] follow-up criado: agendar_visita');
      }
    }

    return lead;
  }

  // ============================================================
  // PERSISTÊNCIA
  // ============================================================
  salvarLead(lead, leadsPath) {
    try {
      const leads = JSON.parse(fs.readFileSync(leadsPath, 'utf8'));
      const idx = leads.findIndex(l => String(l.id) === String(lead.id));
      if (idx >= 0) {
        leads[idx] = lead;
        fs.writeFileSync(leadsPath, JSON.stringify(leads, null, 2));
        console.log('[MATCH CORE] lead salva:', lead.nome || lead.contato);
      }
    } catch(e) {
      console.error('[MATCH CORE] erro salvar:', e.message);
    }
  }

  // ============================================================
  // GERADOR DE RESPOSTA — AI Engine
  // ============================================================
  gerarResposta(lead, mensagem) {
    try {
      const { gerarResposta } = require('./resposta-auto');
      return gerarResposta(lead, mensagem, lead.matchesAuto || []);
    } catch(e) {
      console.error('[MATCH CORE] erro resposta:', e.message);
      return null;
    }
  }
}

module.exports = new MatchCore();
