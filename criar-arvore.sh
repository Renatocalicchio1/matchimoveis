#!/bin/bash
TARGET="$HOME/Downloads/matchimoveis /cerebro"

cat > "$TARGET/arvore.js" << 'JSEOF'
'use strict';
/**
 * ÁRVORE DE DECISÃO VIVA v1.0
 * Cada nó sabe onde buscar, pensa no contexto e se alimenta do uso real.
 * A árvore cresce a cada interação.
 */

const nlp        = require('./nlp');
const memoria    = require('./memoria');
const aprendizado = require('./aprendizado');

// ── NÓ DA ÁRVORE ──────────────────────────────────────────────────────────────
class No {
  constructor(id, testar, resolver) {
    this.id      = id;
    this.testar  = testar;   // (ctx) => boolean — esse nó é responsável?
    this.resolver = resolver; // (ctx) => string  — gera a resposta
    this.filhos  = [];
    this.peso    = 0;        // cresce quando esse nó resolve com sucesso
  }

  adicionar(no) {
    this.filhos.push(no);
    // Filhos ordenados por peso (os mais usados ficam primeiro)
    this.filhos.sort((a,b) => b.peso - a.peso);
    return this;
  }

  // Percorre a árvore em profundidade
  percorrer(ctx) {
    if (!this.testar(ctx)) return null;

    // Tentar filhos primeiro (mais específicos)
    for (const filho of this.filhos) {
      const resultado = filho.percorrer(ctx);
      if (resultado) {
        this.peso += 0.1; // galho usado → ganha peso
        return resultado;
      }
    }

    // Nó atual resolve
    if (this.resolver) {
      const resposta = this.resolver(ctx);
      if (resposta) {
        this.peso += 1; // resolveu → ganha mais peso
        ctx.noResolveu = this.id;
        return resposta;
      }
    }

    return null;
  }
}

// ── CONTEXTO RICO ─────────────────────────────────────────────────────────────
function montarContexto(mensagem, d, user, imoveis, leads, visitas, historicoUsuario, perfil) {
  const mNorm   = nlp.normalizar(mensagem);
  const tokens  = nlp.tokenizar(mNorm);
  const dominio = nlp.detectarDominio(mNorm);

  // Contexto da conversa (último tema)
  const ultimoTema = historicoUsuario.length > 0
    ? nlp.detectarDominio(nlp.normalizar(historicoUsuario[historicoUsuario.length-1].pergunta))
    : null;

  // Slots extraídos (tipo, bairro, quartos, valor)
  const slots = extrairSlotsContexto(mNorm, d.bairros);

  // Intenção de ação
  const temAcao = /importar|gerar|confirmar|recusar|inativar|fazer match|exportar|vincular/.test(mNorm);

  // Intenção de busca
  const temBusca = Object.keys(slots).length > 0;

  // Intenção estratégica
  const temEstrategia = /o que devo|plano|hoje|me orienta|por onde|resumo do dia/.test(mNorm);

  // Intenção de saudação
  const temSaudacao = /saudacao|oi\b|ola\b|bom dia|boa tarde|boa noite|hello/.test(mNorm);

  // Intenção de explicação
  const temExplicacao = /o que e|como funciona|explicar|me explica|o que significa/.test(mNorm);

  // Intenção de relatório
  const temRelatorio = /relatorio|desempenho|performance|resultado/.test(mNorm);

  // Estado da conta
  const contaVazia    = d.ativos === 0 && d.leads === 0;
  const precisaMatch  = d.leads > 0 && d.comMatch === 0;
  const temUrgencia   = d.hoje > 0 || d.pendentes > 0;
  const taxaMatch     = d.leads > 0 ? Math.round(d.comMatch/d.leads*100) : 0;

  // Análise de mercado rápida
  const bairrosLeads = {};
  leads.forEach(l => { if (l.bairro) bairrosLeads[l.bairro]=(bairrosLeads[l.bairro]||0)+1; });
  const bairrosSemCob = Object.keys(bairrosLeads).filter(b =>
    !imoveis.some(i=>i.status!=='inativo'&&i.bairro&&i.bairro.toLowerCase()===b.toLowerCase())
  );

  return {
    // Texto
    mensagem, mNorm, tokens, dominio,
    // Intenções detectadas
    temAcao, temBusca, temEstrategia, temSaudacao, temExplicacao, temRelatorio,
    // Slots
    slots,
    // Dados reais
    d, user, imoveis, leads, visitas,
    // Contexto conversa
    ultimoTema, historicoUsuario, perfil,
    // Estado da conta
    contaVazia, precisaMatch, temUrgencia, taxaMatch,
    // Mercado
    bairrosLeads, bairrosSemCob,
    // Resultado
    noResolveu: null
  };
}

function extrairSlotsContexto(mNorm, bairros) {
  const slots = {};
  const tipos = ['apartamento','casa','cobertura','sala','terreno','sobrado','studio','loft'];
  for (const t of tipos) { if (mNorm.includes(t)) { slots.tipo = t; break; } }
  const bairro = (bairros||[]).find(b => mNorm.includes(b.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'')));
  if (bairro) slots.bairro = bairro;
  const q = mNorm.match(/(\d+)\s*(?:quarto|dorm)/);
  if (q) slots.quartos = parseInt(q[1]);
  const v = mNorm.match(/(?:ate|max|menos de)\s*(?:r\$)?\s*(\d+(?:[.,]\d+)?)\s*(mil|k)?/);
  if (v) { let val = parseFloat(v[1].replace(',','.')); if (v[2]) val*=1000; slots.valorMax = val; }
  return slots;
}

// ── CONSTRUIR A ÁRVORE ────────────────────────────────────────────────────────
function construirArvore(modulos) {
  const { btn, chip, modLeads, modImoveis, modVisitas, modMatch,
          modPortais, modSistema, modMercado, acoes, estrategista,
          rag, notifs, onboarding, relatorio } = modulos;

  // RAIZ — sempre verdadeiro
  const raiz = new No('raiz', () => true, null);

  // ── GALHO 1: URGÊNCIA (visitas hoje / pendentes) ──────────────────────────
  const galhoUrgencia = new No('urgencia',
    ctx => ctx.temUrgencia && ctx.temSaudacao,
    ctx => {
      const hora = new Date().getHours();
      const s = hora<12?'Bom dia':hora<18?'Boa tarde':'Boa noite';
      const nome = ctx.user.nome||ctx.user.name||'corretor';
      const alertas = notifs.gerarAlertas(ctx.d, ctx.leads, ctx.imoveis, ctx.visitas);
      const criticos = alertas.filter(a=>a.nivel==='critico');
      return `${s}, ${nome}! 👋<br><br>${notifs.renderAlertas(criticos, btn)}<br>${chip('📊 Resumo','resumo geral')}${chip('🧠 Plano do dia','o que devo fazer hoje')}`;
    }
  );

  // ── GALHO 2: CONTA VAZIA → ONBOARDING ────────────────────────────────────
  const galhoOnboarding = new No('onboarding',
    ctx => ctx.contaVazia || /onboarding|comecar|primeiros passos|configurar conta/.test(ctx.mNorm),
    ctx => onboarding.renderOnboarding(ctx.d, btn, chip)
  );

  // ── GALHO 3: SAUDAÇÃO NORMAL ──────────────────────────────────────────────
  const galhoSaudacao = new No('saudacao',
    ctx => ctx.temSaudacao,
    ctx => {
      const hora = new Date().getHours();
      const s = hora<12?'Bom dia':hora<18?'Boa tarde':'Boa noite';
      const nome = ctx.user.nome||ctx.user.name||'corretor';
      const dica = ctx.perfil?.bairrosMaisUsados?.length
        ? `<br>📍 Foco: <strong>${ctx.perfil.bairrosMaisUsados.slice(0,2).join(', ')}</strong>` : '';
      const plano = estrategista.analisar(ctx.d, ctx.leads, ctx.imoveis, ctx.visitas, btn, chip);
      return `${s}, ${nome}! 👋${dica}<br>🏠 ${ctx.d.ativos} imóveis · 👥 ${ctx.d.leads} leads · 🎯 ${ctx.d.comMatch} matchs<br><br>${plano}`;
    }
  );

  // ── GALHO 4: BUSCA RAG (tem slots) ───────────────────────────────────────
  const galhoBuscaImoveis = new No('busca_imoveis',
    ctx => ctx.temBusca && (ctx.dominio==='imoveis' || ctx.slots.tipo || ctx.slots.bairro),
    ctx => {
      const busca = rag.buscarImoveis(ctx.mNorm, ctx.imoveis, ctx.d.bairros);
      return busca ? rag.formatarBuscaImoveis(busca, btn) : null;
    }
  );

  const galhoBuscaLeads = new No('busca_leads',
    ctx => ctx.temBusca && ctx.dominio==='leads',
    ctx => {
      const busca = rag.buscarLeads(ctx.mNorm, ctx.leads, ctx.d.bairros);
      if (!busca||!busca.resultado.length) return null;
      return `👥 <strong>${busca.resultado.length} leads encontradas</strong>${busca.slots.bairro?' em '+busca.slots.bairro:''}${busca.slots.tipo?' · '+busca.slots.tipo:''}:<br>`+
        busca.resultado.slice(0,5).map(l=>`• ${l.nome||'Lead'} — ${l.bairro||''} ${l.tipo||''}`).join('<br>')+
        `<br><br>${btn('Ver leads','/app/leads')}`;
    }
  );

  const galhoRAG = new No('rag', ctx => ctx.temBusca, null);
  galhoRAG.adicionar(galhoBuscaImoveis).adicionar(galhoBuscaLeads);

  // ── GALHO 5: ESTRATÉGIA ───────────────────────────────────────────────────
  const galhoEstrategia = new No('estrategia',
    ctx => ctx.temEstrategia || /o que devo fazer|plano do dia|o que fazer hoje/.test(ctx.mNorm),
    ctx => estrategista.analisar(ctx.d, ctx.leads, ctx.imoveis, ctx.visitas, btn, chip)
  );

  // ── GALHO 6: RELATÓRIO ────────────────────────────────────────────────────
  const galhoRelatorio = new No('relatorio',
    ctx => ctx.temRelatorio,
    ctx => relatorio.gerarSemanal(ctx.d, ctx.leads, ctx.imoveis, ctx.visitas, btn)
  );

  // ── GALHO 7: AÇÕES ────────────────────────────────────────────────────────
  const galhoAcoes = new No('acoes',
    ctx => ctx.temAcao,
    ctx => {
      const acao = acoes.detectarAcao(ctx.mNorm);
      if (!acao) return null;
      return acoes.executarAcao(acao, ctx.mensagem, ctx.mNorm, ctx.d, btn, chip);
    }
  );

  // ── GALHO 8: DOMÍNIOS ESPECÍFICOS ────────────────────────────────────────
  const galhoLeads    = new No('leads',    ctx => ctx.dominio==='leads',       ctx => modLeads.responder(ctx.mNorm, ctx.d, ctx.leads, btn, chip));
  const galhoImoveis  = new No('imoveis',  ctx => ctx.dominio==='imoveis',     ctx => modImoveis.responder(ctx.mNorm, ctx.d, ctx.imoveis, btn, chip));
  const galhoVisitas  = new No('visitas',  ctx => ctx.dominio==='visitas',     ctx => modVisitas.responder(ctx.mNorm, ctx.d, ctx.visitas, btn, chip));
  const galhoMatch    = new No('match',    ctx => ctx.dominio==='match',       ctx => modMatch.responder(ctx.mNorm, ctx.d, ctx.leads, ctx.imoveis, btn, chip));
  const galhoPortais  = new No('portais',  ctx => ctx.dominio==='portais',     ctx => modPortais.responder(ctx.mNorm, ctx.d, btn, chip));
  const galhoMercado  = new No('mercado',  ctx => ctx.dominio==='mercado',     ctx => modMercado.responder(ctx.mNorm, ctx.leads, ctx.imoveis, btn, chip));
  const galhoSistema  = new No('sistema',  ctx => ctx.dominio==='sistema',     ctx => modSistema.responder(ctx.mNorm, ctx.d, btn, chip));
  const galhoCoins    = new No('coins',    ctx => ctx.dominio==='coins',       () => `🪙 Match Coins — seu sistema de recompensas.<br><br>${btn('Ver coins','/app/coins')}`);
  const galhoNotifs   = new No('notificacoes', ctx => ctx.dominio==='notificacoes', ctx => notifs.renderAlertas(notifs.gerarAlertas(ctx.d, ctx.leads, ctx.imoveis, ctx.visitas), btn));
  const galhoDashboard = new No('dashboard', ctx => ctx.dominio==='dashboard', ctx => {
    const taxa = ctx.d.leads>0?Math.round(ctx.d.comMatch/ctx.d.leads*100):0;
    return `📊 <strong>Resumo:</strong><br>🏠 ${ctx.d.ativos} ativos · 👥 ${ctx.d.leads} leads · 🎯 ${ctx.d.comMatch} (${taxa}%) · 📅 ${ctx.d.visitas} visitas<br><br>`+
      estrategista.analisar(ctx.d, ctx.leads, ctx.imoveis, ctx.visitas, btn, chip);
  });

  // GALHO CONTEXTO — usa o último tema da conversa
  const galhoContexto = new No('contexto_conversa',
    ctx => !!ctx.ultimoTema && !ctx.dominio,
    ctx => {
      // Reutiliza o domínio anterior
      const dominioAnterior = ctx.ultimoTema;
      ctx.dominio = dominioAnterior;
      if (dominioAnterior==='leads')    return modLeads.responder(ctx.mNorm, ctx.d, ctx.leads, btn, chip);
      if (dominioAnterior==='imoveis')  return modImoveis.responder(ctx.mNorm, ctx.d, ctx.imoveis, btn, chip);
      if (dominioAnterior==='visitas')  return modVisitas.responder(ctx.mNorm, ctx.d, ctx.visitas, btn, chip);
      if (dominioAnterior==='match')    return modMatch.responder(ctx.mNorm, ctx.d, ctx.leads, ctx.imoveis, btn, chip);
      return null;
    }
  );

  const galhoDominios = new No('dominios', ctx => !!ctx.dominio || !!ctx.ultimoTema, null);
  galhoDominios
    .adicionar(galhoLeads).adicionar(galhoImoveis).adicionar(galhoVisitas)
    .adicionar(galhoMatch).adicionar(galhoPortais).adicionar(galhoMercado)
    .adicionar(galhoSistema).adicionar(galhoCoins).adicionar(galhoNotifs)
    .adicionar(galhoDashboard).adicionar(galhoContexto);

  // ── GALHO 9: PRECISAATCH → SUGERIR ───────────────────────────────────────
  const galhoPrecisaMatch = new No('precisa_match',
    ctx => ctx.precisaMatch,
    ctx => `🎯 Você tem <strong>${ctx.d.leads}</strong> leads mas nenhuma tem match ainda!<br><br>`+
      `${btn('Fazer match agora','/app/leads')}${chip('❓ Como funciona','como funciona o match')}`
  );

  // ── GALHO 10: NÃO ENTENDEU → APRENDE ─────────────────────────────────────
  const galhoNaoEntendeu = new No('nao_entendeu',
    () => true, // fallback — sempre aceita
    ctx => {
      // Registrar para aprendizado
      const uid = ctx.user.id||ctx.user.userId||'anon';
      aprendizado.registrar(uid, ctx.mensagem);

      const frases = [
        'Hmm, não entendi 🤔 Pode reformular?',
        'Desculpe, não captei. Tente de outro jeito.',
        'Tente: leads, imóveis, visitas, match ou "o que devo fazer hoje".'
      ];
      // Sugestões baseadas no contexto
      const chipsPerfil = ctx.perfil?.bairrosMaisUsados?.length
        ? ctx.perfil.bairrosMaisUsados.slice(0,2).map(b=>chip(`🏠 ${b}`,`imoveis em ${b}`))
        : [];
      const chipsBase = ctx.ultimoTema==='leads'
        ? [chip('👥 Leads','minhas leads'),chip('🎯 Match','leads com match')]
        : [chip('👥 Leads','minhas leads'),chip('🏠 Imóveis','meus imoveis'),chip('📅 Visitas','minhas visitas'),chip('🧠 Plano','o que devo fazer hoje')];
      return frases[Math.floor(Math.random()*frases.length)]+'<br><br>'+[...chipsBase,...chipsPerfil].join('');
    }
  );

  // ── MONTAR ÁRVORE COMPLETA (ordem = prioridade) ───────────────────────────
  raiz
    .adicionar(galhoUrgencia)    // 1. urgência (visita hoje + saudação)
    .adicionar(galhoOnboarding)  // 2. conta vazia → onboarding
    .adicionar(galhoRAG)         // 3. busca real nos dados (slots)
    .adicionar(galhoEstrategia)  // 4. plano do dia
    .adicionar(galhoRelatorio)   // 5. relatório
    .adicionar(galhoAcoes)       // 6. ações/wizards
    .adicionar(galhoPrecisaMatch)// 7. precisa fazer match
    .adicionar(galhoDominios)    // 8. domínios específicos
    .adicionar(galhoSaudacao)    // 9. saudação normal
    .adicionar(galhoNaoEntendeu); // 10. fallback

  return raiz;
}

// ── EXPORTAR FUNÇÃO PRINCIPAL ─────────────────────────────────────────────────
function criarArvore(modulos) {
  const arvore = construirArvore(modulos);

  return {
    // Percorre a árvore e retorna resposta
    responder(mensagem, d, user, imoveis, leads, visitas, historicoUsuario, perfil) {
      const ctx = montarContexto(mensagem, d, user, imoveis, leads, visitas, historicoUsuario, perfil);
      const resposta = arvore.percorrer(ctx);
      return {
        resposta: resposta || 'Não consegui processar. Tente novamente.',
        noResolveu: ctx.noResolveu,
        dominio: ctx.dominio,
        slots: ctx.slots
      };
    },
    // Retorna os pesos dos galhos (aprendizado)
    pesos() {
      const p = {};
      function coletar(no) {
        p[no.id] = no.peso;
        no.filhos.forEach(coletar);
      }
      coletar(arvore);
      return p;
    }
  };
}

module.exports = { criarArvore, montarContexto };
JSEOF

echo "✅ arvore.js criado!"
