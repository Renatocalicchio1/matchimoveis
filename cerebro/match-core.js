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

async function lerImoveisDoUsuario(userId) {
  try {
    const { query, dbOk } = require('../services/db');
    if (await dbOk()) {
      const res = await query("SELECT * FROM imoveis WHERE user_id=$1 AND status='ativo'", [userId]);
      const { lerImoveis: _lerIm } = require('../services/salvarImovel');
      return res.rows.map(r => ({
        ...r,
        idExterno: r.id_externo,
        idInterno: r.id_interno,
        userId: r.user_id,
        valor_imovel: r.valor_imovel,
        area_m2: r.area_m2,
        quartos: r.quartos,
        suites: r.suites,
        banheiros: r.banheiros,
        vagas: r.vagas,
        bairro: r.bairro,
        cidade: r.cidade,
        estado: r.estado,
        tipo: r.tipo,
        transacao: r.transacao,
        fotos: r.fotos || [],
        diferenciais: r.diferenciais || []
      }));
    }
  } catch(e) { console.error('[match-core lerImoveis]', e.message); }
  return [];
}

async function lerLeadsSeguro() {
  try { const { lerLeads } = require('../services/salvarLead'); return await lerLeads(); } catch(e) { return []; }
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
      // Detecta novo ciclo de busca (cliente voltou com interesse diferente)
      lead = await this._detectarNovoCiclo(lead, mensagem, userId);
      const perfil = this._atualizarMemoria(lead, mensagem);
      // Motor de intenção dinâmico — acumula em paralelo
      try {
        const { analisarMensagem } = require('./analisador-intencao');
        const mapaAtual = lead.mapaIntencao || null;
        // Detecta se é mensagem de venda — não atualiza perfil de busca
        const _ehVenda = this._detectarVenda(mensagem || '');
        if (_ehVenda) {
          if (!lead.tipoLead || lead.tipoLead === 'cliente') {
            // Só buscando até agora → passa a ser cliente_vendedor
            lead.tipoLead = 'cliente_vendedor';
          } else if (lead.tipoLead === 'vendedor') {
            // Já era vendedor — mantém
          }
          // Se já é cliente_vendedor — mantém
          lead.tipoLeadAtualizadoEm = new Date().toISOString();
          console.log('[MATCH CORE] lead tem imovel para vender | tipoLead:', lead.tipoLead);
        }
        // Só atualiza mapaIntencao se há mensagem real — evita distorcer dados do portal
        if (mensagem && mensagem.trim()) {
          lead.mapaIntencao = analisarMensagem(mapaAtual, mensagem, canal);
        } else if (!lead.mapaIntencao) {
          lead.mapaIntencao = mapaAtual || {};
        }
        lead.faseFunil    = lead.mapaIntencao.fase || lead.faseFunil;
        lead.temperatura  = lead.mapaIntencao.temperatura || lead.temperatura;
        console.log('[INTENCAO] fase:', lead.mapaIntencao.fase, '| temp:', lead.mapaIntencao.temperatura, '| sinais:', lead.mapaIntencao.tipo_imovel.length > 0 ? lead.mapaIntencao.tipo_imovel[0]?.valor : 'nenhum');
      } catch(e) { console.error('[INTENCAO] erro:', e.message); }

      // 4. Score da jornada
      lead = this._score(lead, perfil);

      // 5. Intenção
      lead = this._intencao(lead, perfil);

      // 6. Match — detecta caso e roda engine certa
      const matchesAntes = (lead.matchesAuto || lead.matches || []).length;
      lead = detectarCaso(lead) === 'caso1'
        ? await this._matchCaso1(lead, userId)
        : await this._matchCaso2(lead, perfil, userId);
      const matchesDepois = (lead.matchesAuto || lead.matches || []).length;

      // Se match melhorou → notifica corretor
      if (matchesDepois > matchesAntes) {
        lead.faseFunil = 'match';
        lead.temperatura = lead.temperatura === 'quente' ? 'quente' : 'morno';
        lead = this._timeline(lead, 'sistema', `Match: ${matchesDepois} imóveis encontrados`);
        console.log(`[MATCH CORE] match melhorou: ${matchesAntes} → ${matchesDepois}`);
        // vitrine automática — envia se não enviou OU se mapa mudou (bairro/valor/tipo mudaram)
        const _mapaHash = JSON.stringify([
          lead.mapaIntencao?.tipo_imovel?.[0]?.valor,
          lead.mapaIntencao?.bairro?.[0]?.valor,
          lead.mapaIntencao?.cidade?.[0]?.valor,
          lead.mapaIntencao?.valor?.[0]?.valor,
          lead.mapaIntencao?.quartos?.[0]?.valor,
          lead.mapaIntencao?.transacao?.[0]?.valor
        ]);
        const _mapaHashAnterior = lead._ultimoMapaHash || '';
        const _mapaAtualizado = _mapaHash !== _mapaHashAnterior;
        lead._ultimoMapaHash = _mapaHash;

        if ((!lead.vitrineEnviada || _mapaAtualizado) && instancia && lead.contato) {
          const BASE_URL = process.env.RENDER
            ? 'https://matchimoveis.onrender.com'
            : (process.env.BASE_URL || 'http://localhost:3000');
          const linkVitrine = BASE_URL + '/cliente/oferta/' + lead.id + '?userId=' + userId;
          const nomeCorretor = lead.corretorNome || 'Seu corretor';
          const total = matchesDepois;
          const msgVitrine = 'Olá ' + (lead.nome || '') + '! Encontramos '
            + total + ' imóve' + (total === 1 ? 'l' : 'is')
            + ' que combinam com o seu perfil.\n\nAcesse sua seleção personalizada:\n'
            + linkVitrine
            + '\n\n' + nomeCorretor + ' - MatchImóveis';
          setImmediate(() => enviarWhatsApp(instancia, lead.contato, msgVitrine));
          lead.vitrineEnviada = true;
          lead.vitrineEnviadaEm = new Date().toISOString();
          lead.vitrineLink = linkVitrine;
          console.log('[MATCH CORE] vitrine enviada para', lead.contato, linkVitrine);
        }
      }

      // 7. Eventos
      lead = this._evento(lead, canal, mensagem);

      // 8. Follow-up
      lead = this._followUp(lead);

      // 9. Salva
      await this._salvarLead(lead);

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
  // NOVO CICLO — detecta se cliente voltou com interesse diferente
  // ============================================================
  async _detectarNovoCiclo(lead, mensagem, userId) {
    try {
      const { extrairPerfil } = require('./extrator-perfil');
      const novoPerfil = extrairPerfil([{ texto: mensagem, de: 'cliente' }]);
      const perfilAtual = lead.perfilIA || {};

      // Só analisa se novo perfil tem tipo ou bairro
      if (!novoPerfil.tipo && !novoPerfil.bairro) return lead;

      // Se lead ainda não teve matches nem viu vitrine → está qualificando
      // Nesse caso acumula cenários no perfil em vez de resetar
      const jaTevMatches = (lead.matchesAuto || lead.matches || []).length > 0;
      const jaViuVitrine = !!lead.vitrineEnviada;

      if (!jaTevMatches && !jaViuVitrine) {
        // Modo refinamento: acumula bairros e tipos sem resetar
        if (novoPerfil.bairro && novoPerfil.bairro !== perfilAtual.bairro) {
          const bairrosAtuais = perfilAtual.bairros || (perfilAtual.bairro ? [perfilAtual.bairro] : []);
          if (!bairrosAtuais.includes(novoPerfil.bairro)) {
            bairrosAtuais.push(novoPerfil.bairro);
            lead.perfilIA = { ...perfilAtual, bairro: bairrosAtuais[0], bairros: bairrosAtuais };
            console.log('[MATCH CORE] refinamento — bairros acumulados:', bairrosAtuais);
          }
        }
        if (novoPerfil.tipo && novoPerfil.tipo !== perfilAtual.tipo) {
          const tiposAtuais = perfilAtual.tipos || (perfilAtual.tipo ? [perfilAtual.tipo] : []);
          if (!tiposAtuais.includes(novoPerfil.tipo)) {
            tiposAtuais.push(novoPerfil.tipo);
            lead.perfilIA = { ...(lead.perfilIA || perfilAtual), tipo: tiposAtuais[0], tipos: tiposAtuais };
            console.log('[MATCH CORE] refinamento — tipos acumulados:', tiposAtuais);
          }
        }
        return lead;
      }

      // Lead já teve matches ou viu vitrine → verifica se é ciclo novo de verdade
      const tipoMudou = novoPerfil.tipo && perfilAtual.tipo && novoPerfil.tipo !== perfilAtual.tipo;
      const bairroMudou = novoPerfil.bairro && perfilAtual.bairro && novoPerfil.bairro !== perfilAtual.bairro;
      const valorMudou = novoPerfil.valorMax && perfilAtual.valorMax &&
        Math.abs(novoPerfil.valorMax - perfilAtual.valorMax) / perfilAtual.valorMax > 0.5;
      const perfilDiferente = tipoMudou || (bairroMudou && valorMudou);
      if (!perfilDiferente) return lead;

      // Novo ciclo real — arquiva perfil anterior e reseta
      console.log("[MATCH CORE] novo ciclo de busca:", lead.nome || lead.telefone);
      if (!lead.ciclosBusca) lead.ciclosBusca = [];
      lead.ciclosBusca.push({ em: new Date().toISOString(), perfil: { ...perfilAtual }, motivo: tipoMudou ? "tipo_mudou" : "bairro_mudou" });
      lead.perfilIA = { ...perfilAtual, ...novoPerfil, bairros: undefined, tipos: undefined };
      lead.status = "novo";
      lead.faseFunil = "novo";
      lead.temperatura = "frio";
      lead.score = 0;
      lead.matchesAuto = [];
      lead.matchesBase = [];
      console.log("[MATCH CORE] ciclos arquivados:", lead.ciclosBusca.length);
      return lead;
    } catch(e) {
      console.error('[MATCH CORE] erro detectarNovoCiclo:', e.message);
      return lead;
    }
  }

  // ============================================================
  // 3. MEMORY ENGINE — acumula sem sobrescrever
  // ============================================================
  _atualizarMemoria(lead, mensagem) {
    try {
      const { extrairPerfil } = require('./extrator-perfil');
      const todasMsgs = (lead.mensagens || []).filter(m => m.de === 'cliente');
      // Garante que a mensagem atual está incluída mesmo se ainda não persistida
      const msgAtualIncluida = mensagem && !todasMsgs.find(m => m.texto === mensagem);
      const msgsParaExtrar = msgAtualIncluida ? [...todasMsgs, { de: 'cliente', texto: mensagem }] : todasMsgs;
      const novoPerfil = extrairPerfil(msgsParaExtrar);

      // Merge inteligente — nunca perde dado já capturado
      const perfilAtual = lead.perfilIA || {};
      const merged = { ...perfilAtual };
      const _ehPortal = (lead.origemEntrada||'').includes('webhook_') || ['ImovelWeb','ZAP Imóveis','VivaReal','Grupo OLX','123i','Chaves na Mão'].includes(lead.origem||'');
      for (const [k, v] of Object.entries(novoPerfil)) {
        if (v !== undefined && v !== null && v !== '') {
          // Se é portal e já tem dado do imóvel, não sobrescrever campos de localização/tipo
          if (_ehPortal && perfilAtual[k] && ['bairro','cidade','estado','tipo','quartos','suites','vagas','banheiros','area','valorMax','valorMin'].includes(k)) continue;
          merged[k] = v;
        }
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

    // Temperatura baseada no estágio do kanban
    lead.temperatura =
      lead.propostaFeita                         ? 'fogo'         :
      lead.visitaRealizada                       ? 'super_quente' :
      lead.visitaConfirmada                      ? 'quente_plus'  :
      lead.visitaSolicitada                      ? 'quente'       :
      lead.vitrineEnviada                        ? 'morno_plus'   :
      totalMatches > 0                           ? 'morno'        :
      (perfil.tipo || perfil.bairro || perfil.cidade || perfil.quartos || perfil.valorMax) ? 'frio_plus' :
      'frio';

    return lead;
  }

  // ============================================================
  // 5. INTENÇÃO
  // ============================================================
  _intencao(lead, perfil) {
    // SYNC_PERFIL_LEAD — copia todos os campos do perfil para o lead raiz
    if (perfil.intencao)   lead.intencao   = perfil.intencao;
    if (perfil.faseFunil)  lead.faseFunil  = perfil.faseFunil;
    if (perfil.urgencia)   lead.urgencia   = perfil.urgencia;
    if (perfil.sentimento) lead.sentimento = perfil.sentimento;
    if (perfil.tipo)       lead.tipo       = perfil.tipo;
    if (perfil.quartos)    lead.quartos    = perfil.quartos;
    if (perfil.suites)     lead.suites     = perfil.suites;
    if (perfil.banheiros)  lead.banheiros  = perfil.banheiros;
    if (perfil.vagas)      lead.vagas      = perfil.vagas;
    if (perfil.area)       lead.area       = perfil.area;
    if (perfil.bairro)     lead.bairro     = perfil.bairro;
    if (perfil.cidade)     lead.cidade     = perfil.cidade;
    if (perfil.estado)     lead.estado     = perfil.estado;
    if (perfil.valorMax)   lead.valorMax   = perfil.valorMax;
    // Nunca sobrescrever valorMin com cálculo automático — só salvar se vier explícito do usuário
    // if (perfil.valorMin)   lead.valorMin   = perfil.valorMin;
    if (perfil.motivacao)  lead.motivacao  = perfil.motivacao;
    if (perfil.familia)    lead.familia    = perfil.familia;
    if (perfil.diferenciais) lead.diferenciais = perfil.diferenciais;
    if (perfil.temperatura) lead.temperatura = perfil.temperatura;
    return lead;
  }

  // ============================================================
  // 6a. MATCH CASO 1 — Lead com imóvel de interesse
  // Busca imóveis SIMILARES ao que a lead clicou
  // ============================================================
  async _matchCaso1(lead, userId) {
    try {
      const { query: _queryMatch } = require('../services/db');
      const { matchPorMapa } = require('./motor-intencao');
      const norm = s => String(s||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim();

      // Busca o imóvel âncora pelo id
      const imovelId = lead.imovel_interesse || lead.imovelId || lead.idAnuncio;
      const _resAncora = await _queryMatch(
        "SELECT * FROM imoveis WHERE id=$1 OR id_externo=$1 OR id_interno=$1 OR codigo_imovel=$1 LIMIT 1",
        [String(imovelId)]
      );
      const ancora = _resAncora.rows[0];
      console.log(`[MATCH CORE] caso1 | âncora:${imovelId} | encontrada:${!!ancora}`);

      // Busca imóveis do corretor + parceiros do mesmo estado
      const estadoAncora = norm(ancora?.estado || lead.estado || '');
      let _resImoveis;
      if (estadoAncora) {
        _resImoveis = await _queryMatch(
          "SELECT * FROM imoveis WHERE status='ativo' AND (user_id=$1 OR estado ILIKE $2 OR estado ILIKE $3)",
          [userId, '%' + estadoAncora + '%', '%' + (estadoAncora) + '%']
        );
      } else {
        _resImoveis = await _queryMatch("SELECT * FROM imoveis WHERE user_id=$1 AND status='ativo'", [userId]);
      }
      const imoveis = _resImoveis.rows;
      console.log('[MATCH CORE] caso1 | imóveis pool:', imoveis.length);

      if (!ancora) {
        console.log('[MATCH CORE] caso1 | âncora não encontrada, sem match');
        return lead;
      }

      // Constrói mapaIntencao temporário baseado no imóvel âncora
      const precoAncora = Number(ancora.valor_imovel || ancora.valor || 0);
      const mapaTemp = {
        tipo_imovel: [{ valor: norm(ancora.tipo||''), score: 100, confianca: 100, scoreEfetivo: 100 }],
        transacao:   [{ valor: norm(ancora.transacao||'venda'), score: 100, confianca: 100, scoreEfetivo: 100 }],
        cidade:      ancora.cidade ? [{ valor: norm(ancora.cidade), score: 100, confianca: 100, scoreEfetivo: 100 }] : [],
        bairro:      ancora.bairro ? [{ valor: norm(ancora.bairro), score: 90, confianca: 90, scoreEfetivo: 90 }] : [],
        quartos:     ancora.quartos ? [{ valor: Number(ancora.quartos), score: 90, confianca: 90, scoreEfetivo: 90 }] : [],
        suites:      ancora.suites  ? [{ valor: Number(ancora.suites),  score: 80, confianca: 80, scoreEfetivo: 80 }] : [],
        vagas:       ancora.vagas   ? [{ valor: Number(ancora.vagas),   score: 80, confianca: 80, scoreEfetivo: 80 }] : [],
        area:        (() => { const _a = Number(ancora.area_m2||ancora.area_total||0); return _a ? [{ valor: { min: _a*0.80, max: _a*1.20 }, score: 70, confianca: 70, scoreEfetivo: 70 }] : []; })(),
        valor:       precoAncora    ? [{ valor: { min: precoAncora*0.70, max: precoAncora*1.20 }, score: 90, confianca: 90, scoreEfetivo: 90 }] : [],
        urgencia: 0, fase: 'interesse', temperatura: 'morno'
      };

      // Salva mapaTemp no lead para exibir no perfil de busca
      if (!lead.mapaIntencao || (lead.mapaIntencao.tipo_imovel||[]).length === 0) {
        lead.mapaIntencao = mapaTemp;
      }
      const leadTemp = { ...lead, mapaIntencao: mapaTemp };

      // Match ponderado usando motor de intenção
      // Filtrar rede se usuario preferir apenas proprios
      const _uRow1 = await _queryMatch('SELECT dados FROM usuarios WHERE codigo_usuario=$1 OR id=$1 LIMIT 1',[String(userId)]);
      const _uDados1 = _uRow1?.rows?.[0]?.dados || {};
      const _apenasPropr1 = _uDados1.vitrineApenasPropriosImoveis === true;
      const imoveisFiltrados1 = _apenasPropr1 ? imoveis.filter(i=>String(i.user_id)===String(userId)) : imoveis;
      const resultados = matchPorMapa(leadTemp, imoveisFiltrados1);

      // Exclui o próprio imóvel âncora
      const matchesFiltrados = resultados
        .filter(r => String(r.imovel.id) !== String(ancora.id))
        .sort((a,b)=>{
          const pA=String(a.imovel.user_id)===String(userId)?1:0;
          const pB=String(b.imovel.user_id)===String(userId)?1:0;
          if(pB!==pA)return pB-pA;
          return b.scoreMatch-a.scoreMatch;
        })
        .slice(0, 50)
        .map((r, i) => ({ ...r.imovel, rank: i+1, score: r.scoreMatch, motivos: r.motivos, origemMatch: 'caso1' }));

      // Imóvel âncora sempre no topo com score 100
      matchesFiltrados.unshift({ ...ancora, rank: 0, score: 100, destaque: true, imovelInteresse: true });

      lead.matches     = matchesFiltrados;
      lead.matchesAuto = matchesFiltrados;
      lead.matchAutoEm = new Date().toISOString();
      if (lead.temperatura === 'frio') lead.temperatura = 'morno';

      console.log(`[MATCH CORE] caso1 matches: ${matchesFiltrados.length} | top score: ${matchesFiltrados[1]?.score||0}`);
    } catch(e) {
      console.error('[MATCH CORE] erro caso1:', e.message, e.stack);
    }
    return lead;
  }

  // ============================================================
  // 6b. MATCH CASO 2 — Lead com perfil de busca
  // Só roda quando perfil está suficientemente completo
  // E compara com resultado anterior para ver se melhorou
  // ============================================================
  _detectarVenda(mensagem) {
    const norm = (mensagem||'').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'');
    const palavrasVenda = ['tenho imovel','tenho um imovel','tenho apartamento','tenho uma casa','meu imovel','meu apartamento','minha casa','estou vendendo','quero vender','vou vender','para vender','a venda','coloca a venda','anunciar','anuncio'];
    return palavrasVenda.some(p => norm.includes(p));
  }

  _perfilSuficiente(perfil, lead) {
    // Ideal: transacao + tipo + cidade + bairro + valor
    // Mínimo para rodar: tipo + (cidade OU bairro) — quanto mais campos, melhor o match
    const mapa = lead?.mapaIntencao || {};
    const temTipo      = !!(perfil.tipo      || (mapa.tipo_imovel||[]).length > 0);
    const temCidade    = !!(perfil.cidade    || (mapa.cidade||[]).length > 0);
    const temBairro    = !!(perfil.bairro    || (mapa.bairro||[]).length > 0);
    const temValor     = !!(perfil.valorMax  || (mapa.valor||[]).length > 0);
    const temTransacao = !!(perfil.intencao  || (mapa.transacao||[]).length > 0);
    const temQuartos   = !!(perfil.quartos   || (mapa.quartos||[]).length > 0);
    const temArea      = !!(perfil.area      || (mapa.area||[]).length > 0);

    // Tipos comerciais e terrenos — quartos não obrigatório, área obrigatória
    const _tipoStr = (perfil.tipo || (mapa.tipo_imovel||[])[0]?.valor || '').toLowerCase();
    const _ehTerreno   = ['terreno','lote','area rural','chacara','sitio','fazenda'].some(t => _tipoStr.includes(t));
    const _ehComercial = !_ehTerreno && ['sala','loja','galpao','galpão','predio','prédio','comercial','escritorio','escritório','conjunto','hotel','pousada','consultorio','restaurante'].some(t => _tipoStr.includes(t));
    const _maxQual = 6;
    const qualidade = [temTipo,temCidade,temBairro,temValor,temTransacao,...(_ehComercial||_ehTerreno ? [temArea] : [temQuartos])].filter(Boolean).length;
    const suficiente = temTipo && temTransacao && temCidade && temBairro && temValor && (_ehTerreno ? temArea : _ehComercial ? temArea : temQuartos);
    if (!suficiente) {
      const faltando = [];
      if (!temTipo)      faltando.push('tipo');
      if (!temTransacao) faltando.push('transacao');
      if (!temCidade)    faltando.push('cidade');
      if (!temBairro)    faltando.push('bairro');
      if (!temValor)     faltando.push('valor');
      if (_ehTerreno && !temArea)                    faltando.push('area');
      if (_ehComercial && !temArea)                   faltando.push('area');
      if (!_ehComercial && !_ehTerreno && !temQuartos) faltando.push('quartos');
      console.log('[MATCH CORE] perfil insuficiente | qualidade:', qualidade, '| faltando:', faltando.join(', '));
    } else {
      console.log('[MATCH CORE] perfil qualidade:', qualidade, '/', _maxQual, '|', [
        temTransacao?'transacao':'', temTipo?'tipo':'', temCidade?'cidade':'',
        temBairro?'bairro':'', temValor?'valor':'', (!_ehComercial&&temQuartos)?'quartos':''
      ].filter(Boolean).join('+'));
    }
    return suficiente;
  }

  async _matchCaso2(lead, perfil, userId) {
    try {
      if (!this._perfilSuficiente(perfil, lead)) {
        return lead;
      }

      const { matchPorMapa, inferirOcultos } = require('./motor-intencao');
      const { query: _queryMatch2 } = require('../services/db');
      const norm = s => String(s||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim();

      // Garante que mapaIntencao tem estado normalizado
      const mapa = lead.mapaIntencao || {};
      const estadoLead = norm(mapa.estado?.[0]?.valor || mapa.cidade?.[0]?.estado || perfil.estado || lead.estado || '');

      // Busca imóveis do corretor + parceiros do mesmo estado
      let _resMatch2;
      // mapeia abreviação para nome completo
      const _estadoMap = {
        'sp':'São Paulo','rj':'Rio de Janeiro','mg':'Minas Gerais','sc':'Santa Catarina',
        'rs':'Rio Grande do Sul','pr':'Paraná','ba':'Bahia','go':'Goiás','df':'Distrito Federal',
        'es':'Espírito Santo','pe':'Pernambuco','ce':'Ceará','am':'Amazonas','pa':'Pará'
      };
      const _estadoNomeInverso = {
        'sao paulo':'SP','rio de janeiro':'RJ','minas gerais':'MG','santa catarina':'SC',
        'rio grande do sul':'RS','parana':'PR','bahia':'BA','goias':'GO','distrito federal':'DF',
        'espirito santo':'ES','pernambuco':'PE','ceara':'CE','amazonas':'AM','para':'PA'
      };
      const _estadoNome = _estadoMap[estadoLead] || estadoLead;
      const _estadoSigla = _estadoNomeInverso[estadoLead] || estadoLead.toUpperCase();
      const _estadoAcento = {
        'sao paulo':'São Paulo','rio de janeiro':'Rio de Janeiro','minas gerais':'Minas Gerais',
        'santa catarina':'Santa Catarina','rio grande do sul':'Rio Grande do Sul','parana':'Paraná',
        'bahia':'Bahia','goias':'Goiás','distrito federal':'Distrito Federal',
        'espirito santo':'Espírito Santo','pernambuco':'Pernambuco','ceara':'Ceará',
        'amazonas':'Amazonas','para':'Pará'
      };
      const _estadoComAcento = _estadoAcento[estadoLead] || _estadoNome;
      if (estadoLead) {
        _resMatch2 = await _queryMatch2(
          "SELECT * FROM imoveis WHERE status='ativo' AND (user_id=$1 OR estado ILIKE $2 OR estado ILIKE $3 OR estado=$4)",
          [userId, '%'+estadoLead+'%', '%'+_estadoComAcento+'%', _estadoSigla]
        );
      } else {
        _resMatch2 = await _queryMatch2(
          "SELECT * FROM imoveis WHERE status='ativo' AND (user_id=$1 OR TRUE)",
          [userId]
        );
      }
      const imoveisDoUser = _resMatch2.rows;
      console.log('[MATCH CORE] caso2 | imóveis pool:', imoveisDoUser.length, '| estado:', estadoLead);



      // Se mapaIntencao não tem estado, tenta inferir do perfilIA
      if (!(mapa.estado||[]).length && estadoLead) {
        if (!mapa.estado) mapa.estado = [];
        mapa.estado = [{ valor: estadoLead, score: 80, confianca: 80, scoreEfetivo: 80 }];
      }

      // Sempre usa matchPorMapa — mesma regra para todos os casos
      let matchesNovos = [];
      // Filtrar rede se usuario preferir apenas proprios
      const _uRow2 = await _queryMatch2('SELECT dados FROM usuarios WHERE codigo_usuario=$1 OR id=$1 LIMIT 1',[String(userId)]);
      const _uDados2 = _uRow2?.rows?.[0]?.dados || {};
      const _apenasPropr2 = _uDados2.vitrineApenasPropriosImoveis === true;
      const imoveisDoUserFiltrado = _apenasPropr2 ? imoveisDoUser.filter(i=>String(i.user_id)===String(userId)) : imoveisDoUser;
      const resultadosMapa = matchPorMapa(lead, imoveisDoUserFiltrado);
      resultadosMapa.sort((a,b)=>{
        const pA=String(a.imovel.user_id)===String(userId)?1:0;
        const pB=String(b.imovel.user_id)===String(userId)?1:0;
        if(pB!==pA)return pB-pA;
        return b.scoreMatch-a.scoreMatch;
      });
      // Deduplica por id_externo
      const _idsVistos2 = new Set();
      for (const r of resultadosMapa) {
        const rid = String(r.imovel.id_externo || r.imovel.id);
        if (_idsVistos2.has(rid)) continue;
        _idsVistos2.add(rid);
        matchesNovos.push({ ...r.imovel, rank: matchesNovos.length+1, score: r.scoreMatch, motivos: r.motivos, origemMatch: 'motor_intencao' });
        if (matchesNovos.length >= 50) break;
      }
      lead.intencoesOcultas = inferirOcultos(lead);
      const oc = Object.entries(lead.intencoesOcultas||{}).filter(([,v])=>v.score>0).map(([k,v])=>k+':'+v.score).join(' ');
      console.log(`[MATCH CORE] caso2 | matches: ${matchesNovos.length} | ocultos: ${oc||'nenhum'}`);

      const matchesAntes = lead.matchesAuto || lead.matches || [];
      if (matchesNovos.length >= matchesAntes.length) {
        lead.matchesAuto = matchesNovos;
        lead.matches     = matchesNovos;
        lead.matchesBase = matchesNovos;
        lead.matchAutoEm = new Date().toISOString();
        // Debita match_encontrado
        if (matchesNovos.length > 0 && matchesNovos.length > matchesAntes.length) {
          try { const { consumir: _cMatch } = require('../services/creditos'); _cMatch(lead.userId || lead.codigoUsuario || '', 'match_encontrado').catch(()=>{}); } catch(e) {}
        }
      }
      console.log(`[MATCH CORE] caso2 matches final: ${matchesNovos.length}`);
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
    // if (temp==='quente' && fase==='decidido')             add('proposta_negocio', 12); // DESATIVADO
    if (temp==='morno'  && msgs>=3)                       add('enviar_vitrine', 0.017);
    if (msgs===1 && temp==='frio')                        add('qualificar_lead', 0.083);
    if (total>0 && !lead.vitrineEnviada)                  add('enviar_vitrine', 0.017);
    if (lead.vitrineEnviada && !lead.visitaSolicitada)    add('followup_vitrine', 12);
    return lead;
  }

  // ============================================================
  // 9. PERSISTÊNCIA
  // ============================================================
  async _salvarLead(lead) {
    try {
      const { salvarLead } = require('../services/salvarLead');
      console.log('[MATCH CORE] _salvarLead chamado | perfilIA:', JSON.stringify(lead.perfilIA || {}));
      await salvarLead(lead);
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
