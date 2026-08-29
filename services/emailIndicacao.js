const { enviarEmail, statsEmailEnvios } = require('./email');
const { query } = require('./db');

const BASE_URL = 'https://www.matchimoveis.ia.br';

// 8 variações de assunto/headline/corpo/botão (ago/2026, reescritas —
// Renato relatou muita abertura e pouco clique: assunto tava funcionando,
// corpo/CTA não tava convertendo). Reescrito com o mesmo padrão de aversão
// à perda + CTA único e concreto já usado em pagina/demanda/afiliado
// (services/campanha.js): corpo mais curto, sem enrolar antes do link,
// botão sempre nomeando a ação exata em vez de genérico ("Ver meu link
// agora" em vez de "Saiba mais").
//
// Antes só existia 1 texto fixo, focado em "indique corretor, ganhe 10%"
// (percentual que nem é mais o real — o programa de afiliados substituiu o
// bônus fixo por comissão em cascata por nível, ver _COMISSAO_AFILIADO em
// server.js). Reescrito pra: (1) não prometer um número fixo que varia por
// nível/recorrência — manda pra /app/afiliados que já mostra a tabela real
// de cada um; (2) deixar claro que dá pra resgatar em dinheiro ou reverter
// em crédito (mesma escolha que já existe em /app/afiliados/resgate); (3)
// pedido do Renato: não é só corretor/imobiliária que ganha — qualquer
// pessoa pode ganhar ajudando a divulgar o app, mesmo sem ser do ramo
// imobiliário, porque quem entra pelo link também pode indicar outros
// (estrutura em rede, não só indicação direta); (4) pedido do Renato
// (ago/2026): a comissão é por PESSOA indicada pra plataforma, nunca por
// venda/aluguel de imóvel — nenhuma variação mistura os dois.
const VARIANTES = [
  {
    assunto: '💰 Seu link de indicação já existe — só ninguém tá usando',
    headline: 'Seu link já está pronto. O que falta é 1 clique.',
    corpo: `Você tem um link de indicação só seu, ativo agora. Cada corretor ou imobiliária que se cadastra por ele e compra créditos vira comissão contínua pra você — na primeira compra e em todas as recargas seguintes.

Enquanto ele fica parado, essa renda simplesmente não existe. Não precisa vender nada — só mandar o link pra quem você já conhece do mercado.

Você escolhe como receber: em dinheiro ou direto em créditos na sua conta.`,
    botao: 'Ver meu link agora'
  },
  {
    assunto: 'Você não precisa ser corretor pra ganhar com a MatchImóveis',
    headline: 'Não precisa ter CRECI pra ganhar dinheiro aqui',
    corpo: `Tem gente achando que só corretor ou imobiliária ganha com a MatchImóveis. Não é bem assim: você ganha ajudando a divulgar o app pra quem conhece — corretor, imobiliária, ou qualquer pessoa disposta a fazer o mesmo.

Cada um que entra pelo seu link e usa créditos gera comissão pra você, em dinheiro ou em créditos, sua escolha. E quem entra pela sua rede também pode indicar outros — você ganha uma parte disso também.`,
    botao: 'Quero começar a indicar'
  },
  {
    assunto: 'Cada dia sem mandar seu link é comissão que não volta',
    headline: 'O que você não indica hoje, não vira renda amanhã',
    corpo: `Seu link de indicação já existe, mas só gera comissão pra indicação que você realmente manda. Cada corretor ou imobiliária que você conhece e ainda não indicou é uma renda que continua não existindo.

Não é sobre vender nada — é sobre mandar um link pra quem você já ia falar de qualquer jeito. Em dinheiro ou em crédito, você escolhe como receber.`,
    botao: 'Ativar meu link agora'
  },
  {
    assunto: 'Sua rede de indicações pode trabalhar por você',
    headline: 'Monte sua rede e ganhe até de quem ela indicar',
    corpo: `Você já tem um link de indicação ativo. O programa vai além de indicar 1 pessoa: quem entra pelo seu link também pode indicar outras — e uma parte do que a sua rede gerar cai na sua conta também.

Não precisa ser corretor, imobiliária ou trabalhar com imóveis: basta espalhar o link. Você acompanha tudo numa tela só, e escolhe resgatar em dinheiro ou converter em créditos.`,
    botao: 'Ver minha rede agora'
  },
  {
    assunto: 'Sua imobiliária conhece muita gente do mercado — isso vale dinheiro',
    headline: 'Cada corretor ou imobiliária que você conhece pode virar renda',
    corpo: `Você provavelmente conhece dezenas de corretores e imobiliárias. Cada um que se cadastrar pelo seu link e comprar créditos gera comissão contínua pra você — não só na primeira compra, em toda recarga depois.

E não para na indicação direta: quem entra pela sua rede também pode indicar, e você ganha uma parte disso também, sem fazer nada a mais.`,
    botao: 'Ativar meu link de indicação'
  },
  {
    assunto: 'Manda esse link e pode virar dinheiro no seu bolso',
    headline: 'Um link. Muitas formas de ganhar.',
    corpo: `Não precisa ser corretor pra ganhar aqui — precisa só espalhar um link. Toda vez que alguém se cadastra pelo seu link e usa créditos na plataforma, uma parte disso vira comissão sua — em dinheiro ou em créditos.

Manda pra quem você conhece do mercado imobiliário, ou pra quem só quer uma renda extra ajudando a divulgar o app.`,
    botao: 'Pegar meu link agora'
  },
  {
    assunto: 'Alguém que você conhece já podia estar rendendo pra você',
    headline: 'Quem você não indicou ainda é dinheiro que não existe',
    corpo: `Pensa em alguém do mercado imobiliário que você fala hoje. Se ele entrar na MatchImóveis pelo seu link e comprar créditos, essa comissão é sua — todo mês que ele continuar usando, não só na primeira vez.

Não precisa convencer ninguém de nada: é só mandar o link junto da próxima conversa que você já ia ter de qualquer jeito.`,
    botao: 'Ver quanto eu já poderia estar ganhando'
  },
  {
    assunto: 'Isso aqui não exige que você venda nada',
    headline: 'Indicar não é vender — é só apresentar',
    corpo: `Diferente de vender imóvel, indicar a MatchImóveis não exige argumento de venda: é só mostrar o link pra quem você já conhece. Quem se cadastra e usa créditos gera comissão contínua pra você, em dinheiro ou em crédito.

Seu link já está ativo agora — só falta você mandar ele pra alguém.`,
    botao: 'Ver meu link de indicação'
  }
];

// Seleção por desempenho real (mesmo princípio já aplicado em
// services/campanha.js/_sortearVariante — "não foca esforço na que não tá
// dando resultado, prioriza a que tá clicando, mas nunca zera"): sem isso,
// as 8 variações rodavam por hash fixo do código do usuário — uma variação
// fraca continuava saindo pro mesmo tanto de gente pra sempre, mesmo
// convertendo pior. Só pesa quem já tem amostra (≥20 envios); abaixo disso
// fica neutro, pra dar tempo de qualquer variação nova coletar dado. Nunca
// zera peso (floor 0.15) — a pior ainda sai de vez em quando, tanto porque
// desempenho pode mudar quanto porque mandar sempre as mesmas 1-2 é sinal
// de spam pro provedor de e-mail.
const _AMOSTRA_MINIMA_PESO = 20;
const _CACHE_STATS_TTL_MS = 60000;
let _cacheStatsIndicacao = null;
async function _statsPorAssunto() {
  if (_cacheStatsIndicacao && (Date.now() - _cacheStatsIndicacao.em) < _CACHE_STATS_TTL_MS) return _cacheStatsIndicacao.valor;
  const todas = await statsEmailEnvios().catch(() => []);
  const porAssunto = {};
  todas.filter(r => r.tipo === 'convite_indicacao').forEach(r => { porAssunto[r.assunto] = r; });
  _cacheStatsIndicacao = { valor: porAssunto, em: Date.now() };
  return porAssunto;
}
function _taxaEngajamento(stat) {
  // clique vale 3x mais que abertura simples — sinal mais forte de
  // interesse real (leu, decidiu, agiu); abertura sozinha só mostra que o
  // assunto funcionou, que é justamente o problema relatado aqui.
  return (stat.clicados * 3 + stat.abertos) / stat.enviados;
}
async function _sortearVariante() {
  const statsPorAssunto = await _statsPorAssunto().catch(() => ({}));
  const comAmostra = VARIANTES.map(v => statsPorAssunto[v.assunto]).filter(s => s && s.enviados >= _AMOSTRA_MINIMA_PESO);
  if (!comAmostra.length) return VARIANTES[Math.floor(Math.random() * VARIANTES.length)]; // ninguém com amostra suficiente ainda — puro acaso
  const mediaGeral = comAmostra.reduce((soma, s) => soma + _taxaEngajamento(s), 0) / comAmostra.length;
  const pesos = VARIANTES.map(v => {
    const stat = statsPorAssunto[v.assunto];
    if (!stat || stat.enviados < _AMOSTRA_MINIMA_PESO || !mediaGeral) return 1;
    return Math.max(0.15, Math.min(3, _taxaEngajamento(stat) / mediaGeral));
  });
  const total = pesos.reduce((a, b) => a + b, 0);
  let r = Math.random() * total;
  for (let i = 0; i < VARIANTES.length; i++) {
    r -= pesos[i];
    if (r <= 0) return VARIANTES[i];
  }
  return VARIANTES[VARIANTES.length - 1];
}

function _montarHtml(nome, v, link, linkWa, codigo) {
  const corpoHtml = v.corpo.split(/\n\n+/).map(p =>
    '<p style="margin:0 0 16px 0;font-size:15px;line-height:1.7;color:#222">' + p.replace(/\n/g, '<br>') + '</p>'
  ).join('');
  return `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:32px">
    <h2 style="color:#FF385C;margin-top:0">${v.headline}</h2>
    <p>Olá, <strong>${nome}</strong>!</p>
    ${corpoHtml}
    <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:10px;padding:14px;margin:20px 0;font-family:monospace;font-size:13px;color:#374151;word-break:break-all">${link}</div>
    <a href="${BASE_URL}/app/afiliados" style="display:inline-block;padding:12px 24px;background:#FF385C;color:#fff;text-decoration:none;border-radius:8px;font-weight:bold;font-size:15px">${v.botao} →</a>
    <p style="margin-top:16px"><a href="${linkWa}" style="color:#25D366;font-weight:bold;text-decoration:none">💬 Convidar pelo WhatsApp</a></p>
    <p style="margin-top:32px;color:#888;font-size:12px">MatchImóveis • matchimoveis.ia.br</p>
    <p style="margin-top:8px;color:#9ca3af;font-size:11px;line-height:1.6">Não quer mais receber estes e-mails? <a href="${BASE_URL}/email/cancelar?u=${codigo}" style="color:#9ca3af">Cancelar recebimento</a> · <a href="${BASE_URL}/conta/excluir?u=${codigo}" style="color:#9ca3af">Excluir minha conta</a></p>
  </div>`;
}

// Preview sob demanda pra /admin/emails (mesmo padrão de
// gerarPreviewPorAssunto em services/campanha.js) — dado de exemplo no
// lugar do usuário/link reais.
function gerarPreviewPorAssunto(assunto) {
  const v = VARIANTES.find(x => x.assunto === assunto);
  if (!v) return null;
  const linkExemplo = `${BASE_URL}/?ref=EXEMPLO`;
  const linkWaExemplo = 'https://wa.me/?text=' + encodeURIComponent('Você é meu convidado para conhecer a MatchImóveis! 🏠\n\n' + linkExemplo);
  const html = _montarHtml('Roberto', v, linkExemplo, linkWaExemplo, 'EXEMPLO');
  return { assunto: v.assunto, html };
}

async function enviarEmailIndicacao() {
  try {
    const { rows: usuarios } = await query(
      `SELECT codigo_usuario, nome, email FROM usuarios WHERE email IS NOT NULL AND email != '' AND ativo = true
       AND COALESCE((dados->>'emailOptOut')::boolean, false) = false`
    );

    console.log('[EMAIL INDICACAO] usuarios:', usuarios.length);

    for (const u of usuarios) {
      try {
        const link = `${BASE_URL}/?ref=${u.codigo_usuario}`;
        const msgWa = `Você é meu convidado para conhecer a MatchImóveis! 🏠\n\n${link}`;
        const linkWa = 'https://wa.me/?text=' + encodeURIComponent(msgWa);
        const v = await _sortearVariante();
        const indice = VARIANTES.indexOf(v);
        const html = _montarHtml(u.nome, v, link, linkWa, u.codigo_usuario);

        await enviarEmail({
          para: u.email,
          assunto: v.assunto,
          html,
          texto: `Olá ${u.nome}! ${v.headline}. Seu link de indicação: ${link}`,
          tipo: 'convite_indicacao',
          variante: String(indice),
          botaoTexto: v.botao,
          userId: u.codigo_usuario
        });
        console.log('[EMAIL INDICACAO] enviado:', u.email, '| variante:', indice);
        await new Promise(r => setTimeout(r, 1000));
      } catch(e) { console.error('[EMAIL INDICACAO] erro:', u.email, e.message); }
    }
  } catch(e) { console.error('[EMAIL INDICACAO] erro geral:', e.message); }
}

module.exports = { enviarEmailIndicacao, gerarPreviewPorAssunto };
