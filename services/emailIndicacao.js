const { enviarEmail } = require('./email');
const { query } = require('./db');

const BASE_URL = 'https://www.matchimoveis.ia.br';

// 5 variações de assunto/headline/corpo/botão (ago/2026) — giram por
// usuário (hash do código, determinístico, mesmo padrão de
// services/emailPortalGlobal.js) pra dar pra comparar no /admin/campanha
// qual assunto abre mais e qual botão converte mais clique.
//
// Antes só existia 1 texto fixo, focado em "indique corretor, ganhe 10%"
// (percentual que nem é mais o real — o programa de afiliados substituiu o
// bônus fixo por comissão em cascata por nível, ver _COMISSAO_AFILIADO em
// server.js). Reescrito pra: (1) não prometer um número fixo que varia por
// nível/recorrência — manda pra /app/afiliados que já mostra a tabela real
// de cada um; (2) deixar claro que dá pra resgatar em dinheiro ou reverter
// em crédito (mesma escolha que já existe em /app/afiliados/resgate); (3)
// principal pedido do Renato: não é só corretor/imobiliária que ganha —
// qualquer pessoa pode ganhar ajudando a divulgar o app, mesmo sem ser do
// ramo imobiliário, porque quem entra pelo link também pode indicar outros
// (estrutura em rede, não só indicação direta).
const VARIANTES = [
  {
    assunto: '💰 Indique um corretor e ganhe comissão em cada recarga dele',
    headline: 'Ganhe comissão toda vez que seu indicado recarregar',
    corpo: `Você tem um link de indicação só seu. Todo corretor ou imobiliária que se cadastrar por ele e comprar créditos gera comissão pra você — na primeira compra e em todas as recargas seguintes, sem prazo pra acabar.

Você escolhe como receber: em dinheiro ou direto em créditos na sua própria conta.

E não para na indicação direta: quem entra pela sua rede também pode indicar outras pessoas, e você ganha uma parte disso também.`,
    botao: 'Ver meu link e minhas comissões'
  },
  {
    assunto: 'Você não precisa ser corretor pra ganhar com a MatchImóveis',
    headline: 'Não precisa ter CRECI pra ganhar dinheiro aqui',
    corpo: `Tem gente achando que só corretor ou imobiliária ganha com a MatchImóveis. Não é bem assim.

Você também ganha ajudando a divulgar o app — mostrando pra quem você conhece (corretor, imobiliária, ou até outra pessoa que queira fazer o mesmo que você) que existe uma plataforma de match automático de imóveis. Cada um que entra pelo seu link e usa a plataforma gera comissão pra você, em dinheiro ou em créditos, sua escolha.

Quanto mais gente você leva, maior fica sua rede — e você ganha também do que a sua rede indicar.`,
    botao: 'Quero começar a indicar'
  },
  {
    assunto: 'Sua rede de indicações pode trabalhar por você',
    headline: 'Monte sua rede e ganhe até de quem ela indicar',
    corpo: `Você já tem um link de indicação ativo. Mas o programa vai além de indicar 1 corretor: quem entra pelo seu link também pode indicar outras pessoas — e uma parte do que a sua rede gerar cai na sua conta também.

Não precisa ser corretor, imobiliária ou trabalhar com imóveis: basta espalhar o link e organizar sua própria rede de indicações. Você acompanha tudo numa tela só — quem já entrou, quanto já rendeu — e escolhe resgatar em dinheiro ou converter direto em créditos.`,
    botao: 'Ver minha rede de indicações'
  },
  {
    assunto: 'Sua imobiliária conhece muita gente do mercado — isso vale dinheiro',
    headline: 'Cada corretor ou imobiliária que você conhece pode virar renda',
    corpo: `Se você trabalha com imóveis, provavelmente conhece dezenas de outros corretores e imobiliárias. Cada um deles que se cadastrar na MatchImóveis pelo seu link e comprar créditos gera comissão contínua pra você — não é só na primeira compra, é em toda recarga que ele fizer depois.

E o programa não para na indicação direta: quem entra pela sua rede também pode indicar, e você ganha uma parte disso também, sem precisar fazer nada a mais.

Escolha como receber: em dinheiro ou direto em créditos na sua conta.`,
    botao: 'Ativar meu link de indicação'
  },
  {
    assunto: 'Manda esse link e pode virar dinheiro no seu bolso',
    headline: 'Um link. Muitas formas de ganhar.',
    corpo: `Não precisa ser corretor pra ganhar aqui — precisa só espalhar um link.

Toda vez que alguém se cadastra pelo seu link (corretor, imobiliária, ou até outra pessoa disposta a fazer o mesmo que você) e usa créditos na plataforma, uma parte disso vira comissão sua — em dinheiro ou em créditos, você escolhe.

Manda pra quem você conhece do mercado imobiliário, ou pra quem só quer ganhar uma renda extra ajudando a divulgar o app.`,
    botao: 'Pegar meu link agora'
  }
];

function _variantePara(codigo) {
  let h = 0;
  const s = String(codigo);
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return { indice: h % VARIANTES.length, v: VARIANTES[h % VARIANTES.length] };
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
    <p style="margin-top:32px;color:#888;font-size:12px">MatchImóveis • matchimoveis.online</p>
    <p style="margin-top:8px;color:#9ca3af;font-size:11px;line-height:1.6">Não quer mais receber estes e-mails? <a href="${BASE_URL}/email/cancelar?u=${codigo}" style="color:#9ca3af">Cancelar recebimento</a> · <a href="${BASE_URL}/conta/excluir?u=${codigo}" style="color:#9ca3af">Excluir minha conta</a></p>
  </div>`;
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
        const { indice, v } = _variantePara(u.codigo_usuario);
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

module.exports = { enviarEmailIndicacao };
