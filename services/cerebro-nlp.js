const fs = require('fs');
const path = require('path');

// ── TOKENIZER ─────────────────────────────────────────────────────────────────
function tokenizar(texto) {
  return texto
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // remove acentos
    .replace(/[^a-z0-9\s]/g, ' ')                     // remove pontuação
    .split(/\s+/)
    .filter(t => t.length > 1)
    .filter(t => !['de','da','do','em','um','uma','que','para','com','por','se','eu','me','meu','minha','meus','minhas','não','sim','ok','tem','ter','isso','esse','essa','voce','você'].includes(t));
}

// ── NORMALIZAR ────────────────────────────────────────────────────────────────
function normalizar(texto) {
  const sinonimos = {
    'imovei':'imovel','imovéis':'imovel','imoveis':'imovel',
    'vizita':'visita','vizitas':'visita',
    'lids':'lead','lid':'lead','leades':'lead',
    'matsh':'match','mach':'match',
    'conis':'coins','moedas':'coins',
    'subir':'importar','enviar':'importar','upload':'importar',
    'clientes':'leads','interessados':'leads','compradores':'leads',
    'carteira':'imoveis','apartamentos':'imovel','casas':'imovel',
    'quantos':'total','quantas':'total','quanto':'total',
    'mostre':'ver','mostra':'ver','quero ver':'ver','me mostra':'ver',
    'cadastrar':'cadastro','adicionar':'cadastro',
    'apagar':'excluir','deletar':'excluir',
    'desativar':'inativar','ocultar':'inativar',
    'aceitar':'confirmar','aprovar':'confirmar',
    'cancelar':'recusar','negar':'recusar',
    'reagendar':'remarcar','mudar data':'remarcar',
    'bom dia':'saudacao','boa tarde':'saudacao','boa noite':'saudacao',
    'oi':'saudacao','ola':'saudacao','hello':'saudacao','eai':'saudacao',
    'tudo bem':'saudacao','como vai':'saudacao'
  };
  let t = texto.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
  Object.entries(sinonimos).forEach(([e,c]) => {
    t = t.replace(new RegExp('\\b'+e+'\\b','gi'), c);
  });
  return t;
}

// ── SIMILARIDADE ENTRE TEXTOS (Jaccard) ──────────────────────────────────────
function similaridade(a, b) {
  const ta = new Set(tokenizar(a));
  const tb = new Set(tokenizar(b));
  const intersecao = [...ta].filter(t => tb.has(t)).length;
  const uniao = new Set([...ta,...tb]).size;
  return uniao === 0 ? 0 : intersecao / uniao;
}

// ── DETECTAR INTENÇÃO ─────────────────────────────────────────────────────────
function detectarIntencao(mensagem, cerebro) {
  const mNorm = normalizar(mensagem);
  const tokens = tokenizar(mNorm);

  // 1. Verificar intenções compostas (2+ tokens batem)
  if (cerebro.intencoes_compostas) {
    for (const ic of cerebro.intencoes_compostas) {
      const bate = ic.condicoes.every(c =>
        tokens.some(t => t.includes(c) || c.includes(t))
      );
      if (bate) return { tipo:'composta', intencao: ic, score: 1.0 };
    }
  }

  // 2. Verificar intenções simples por similaridade
  let melhor = null;
  let melhorScore = 0;

  if (cerebro.intencoes) {
    for (const intencao of cerebro.intencoes) {
      for (const kw of intencao.keywords) {
        const score = similaridade(mNorm, kw);
        const match = tokens.some(t => t.includes(kw) || kw.includes(t));
        const s = match ? Math.max(score, 0.3) : score;
        if (s > melhorScore) { melhorScore = s; melhor = intencao; }
      }
    }
  }

  if (melhorScore >= 0.15) return { tipo:'simples', intencao: melhor, score: melhorScore };

  // 3. Verificar base de conhecimento
  if (cerebro.base_conhecimento) {
    let melhorBase = null;
    let melhorBaseScore = 0;
    for (const item of cerebro.base_conhecimento) {
      const s = similaridade(mNorm, item.p);
      if (s > melhorBaseScore) { melhorBaseScore = s; melhorBase = item; }
    }
    if (melhorBaseScore >= 0.2) return { tipo:'conhecimento', item: melhorBase, score: melhorBaseScore };
  }

  // 4. Verificar explicações do sistema
  if (cerebro.explicacoes_sistema) {
    for (const exp of cerebro.explicacoes_sistema) {
      for (const kw of exp.keywords) {
        if (similaridade(mNorm, kw) >= 0.25) {
          return { tipo:'explicacao', explicacao: exp, score: 0.25 };
        }
      }
    }
  }

  return { tipo:'desconhecido', score: 0 };
}

// ── CONTEXTO DA CONVERSA ──────────────────────────────────────────────────────
function analisarContexto(historico) {
  if (!historico || historico.length === 0) return {};
  const ultimas = historico.slice(-3);
  return {
    ultimoTema: detectarTema(ultimas[ultimas.length-1]?.pergunta || ''),
    perguntasRecentes: ultimas.map(h => h.pergunta)
  };
}

function detectarTema(texto) {
  const t = normalizar(texto);
  if (/lead/.test(t)) return 'leads';
  if (/imovel/.test(t)) return 'imoveis';
  if (/visita/.test(t)) return 'visitas';
  if (/match/.test(t)) return 'match';
  if (/portal|xml/.test(t)) return 'portais';
  return null;
}

// ── GERAR RESPOSTA CONTEXTUAL ─────────────────────────────────────────────────
function gerarResposta(intencaoDetectada, dados, user, contexto) {
  const nome = user.nome || user.name || 'corretor';
  const btn = (label, href) =>
    `<a href="${href}" style="display:inline-block;background:#ff385c;color:white;padding:8px 16px;border-radius:8px;text-decoration:none;font-weight:700;margin:4px">${label} →</a>`;
  const opcao = (label, msg) =>
    `<button onclick="enviarMsg('${msg}')" style="background:#f3f4f6;border:none;border-radius:20px;padding:8px 14px;margin:4px;cursor:pointer;font-weight:600;font-size:13px">${label}</button>`;

  if (!intencaoDetectada || intencaoDetectada.tipo === 'desconhecido') {
    // Usar contexto para sugerir
    const sugestoes = contexto.ultimoTema === 'leads'
      ? [opcao('👥 Ver leads', 'minhas leads'), opcao('🎯 Com match', 'leads com match'), opcao('📋 Importar', 'importar leads')]
      : [opcao('👥 Leads', 'minhas leads'), opcao('🏠 Imóveis', 'meus imoveis'), opcao('📅 Visitas', 'minhas visitas'), opcao('❓ Ajuda', 'ajuda')];
    
    const frases = [
      `Hmm, não entendi muito bem 🤔 Pode reformular de outro jeito?`,
      `Desculpe ${nome}, não captei essa. Pode tentar de outra forma?`,
      `Ainda estou aprendendo! Tente ser mais específico.`
    ];
    return frases[Math.floor(Math.random()*frases.length)] + '<br><br>' + sugestoes.join('');
  }

  if (intencaoDetectada.tipo === 'explicacao') {
    const exp = intencaoDetectada.explicacao;
    return `💡 <strong>${exp.id.replace(/_/g,' ')}</strong><br><br>${exp.texto}<br><br>` +
      opcao('Ver mais', 'ajuda');
  }

  return null; // deixar rota principal responder
}

module.exports = { tokenizar, normalizar, similaridade, detectarIntencao, analisarContexto, gerarResposta };
