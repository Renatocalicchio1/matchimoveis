// Convite automático pro portal global (/portal) pra toda lead nova que
// entrar com email cadastrado — cliente comprador ou vendedor, mesmo convite
// pros dois. Só alcança leads que entraram a partir de quando a coluna
// portal_email_enviado foi criada (ver _migrarColunaPortalEmail em
// services/salvarLead.js) — histórico antigo fica de fora de propósito.
const { enviarEmail } = require('./email');
const { query } = require('./db');

const BASE_URL = 'https://www.matchimoveis.ia.br';

// 10 variações de assunto/copy/botão — giram por lead (hash do id, determinístico)
// pra depois dar pra comparar no /admin/emails qual assunto abre mais e qual
// botão converte mais clique.
const VARIANTES = [
  { assunto: '🏠 Milhares de imóveis esperando por você', headline: 'Um portal cheio de opções esperando por você', corpo: 'Reunimos os imóveis de centenas de corretores e imobiliárias parceiras num só lugar. Dá uma olhada.', botao: 'Ver imóveis agora' },
  { assunto: 'Psiu... separamos imóveis que combinam com você 👀', headline: 'Separamos imóveis que combinam com você', corpo: 'Sem enrolação: é só filtrar por cidade, bairro e faixa de preço e ver o que aparece.', botao: 'Quero ver' },
  { assunto: 'Seu próximo imóvel pode estar aqui 🔑', headline: 'Seu próximo imóvel pode estar aqui', corpo: 'Compare opções de vários corretores ao mesmo tempo, de graça, sem compromisso.', botao: 'Encontrar meu imóvel' },
  { assunto: '🎯 Compare centenas de imóveis em um só lugar', headline: 'Compare centenas de imóveis em um só lugar', corpo: 'Chega de abrir dez abas diferentes pra procurar imóvel. Aqui está tudo junto.', botao: 'Comparar imóveis' },
  { assunto: 'Cansado de procurar imóvel espalhado em vários sites?', headline: 'Cansado de procurar imóvel espalhado?', corpo: 'Criamos um portal só com imóveis verificados da nossa rede de corretores parceiros.', botao: 'Ver tudo num só lugar' },
  { assunto: '📍 Todos os imóveis do Brasil, num só clique', headline: 'Todos os imóveis, num só clique', corpo: 'Filtre por cidade e bairro e ache o que procura em segundos.', botao: 'Explorar o portal' },
  { assunto: 'Ainda não conhece o nosso portal? Você tá perdendo tempo', headline: 'Você ainda não conhece o nosso portal?', corpo: 'Enquanto você procura espalhado por aí, aqui já está tudo organizado esperando por você.', botao: 'Conhecer agora' },
  { assunto: '🔥 Imóveis novos entrando toda semana', headline: 'Imóveis novos entrando toda semana', corpo: 'Dá uma espiada no que chegou de novo na nossa rede de corretores parceiros.', botao: 'Ver novidades' },
  { assunto: 'Comprar ou vender fica mais fácil por aqui 👇', headline: 'Comprar ou vender fica mais fácil por aqui', corpo: 'Encontre um imóvel pra você ou veja como anunciar o seu com a gente.', botao: 'Acessar o portal' },
  { assunto: 'Bora achar sua próxima casa? 🏡', headline: 'Bora achar sua próxima casa?', corpo: 'Um portal, todos os imóveis da rede, sem compromisso nenhum.', botao: 'Bora lá' }
];

function _variantePara(leadId) {
  let h = 0;
  const s = String(leadId);
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return { indice: h % VARIANTES.length, v: VARIANTES[h % VARIANTES.length] };
}

function _montarHtml(nome, v) {
  return `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:32px">
    <h2 style="color:#FF385C">${v.headline}</h2>
    <p>Olá${nome ? ', ' + nome : ''}!</p>
    <p style="font-size:15px;line-height:1.7;color:#333">${v.corpo}</p>
    <a href="${BASE_URL}/portal" style="display:inline-block;margin-top:20px;padding:14px 28px;background:#FF385C;color:#fff;text-decoration:none;border-radius:8px;font-weight:bold;font-size:15px">${v.botao} →</a>
  </div>`;
}

async function _marcarEnviada(leadId) {
  await query('UPDATE leads SET portal_email_enviado = true, portal_email_enviado_em = NOW() WHERE id = $1', [leadId]).catch(() => {});
}

// Chamado a cada 5 min (ver server.js) — processa um lote pequeno por vez,
// espaçando os envios individuais (mesmo intervalo usado em outros jobs de
// email, ~1.1s) pra não estourar o rate limit do SES nem parecer disparo em
// massa de uma vez só.
async function enviarConvitesPortal(limite = 50) {
  try {
    const { rows } = await query(
      `SELECT id, nome, email, user_id, codigo_usuario FROM leads
       WHERE email IS NOT NULL AND email != '' AND COALESCE(portal_email_enviado, false) = false
       ORDER BY criado_em ASC LIMIT $1`,
      [limite]
    );
    if (!rows.length) return { enviados: 0 };

    let enviados = 0;
    for (const lead of rows) {
      try {
        const { indice, v } = _variantePara(lead.id);
        await enviarEmail({
          para: lead.email,
          assunto: v.assunto,
          html: _montarHtml(lead.nome, v),
          texto: `${v.headline}. ${v.corpo} Acesse: ${BASE_URL}/portal`,
          tipo: 'convite_portal_global',
          variante: String(indice),
          botaoTexto: v.botao + ' →',
          leadId: lead.id,
          userId: lead.user_id || lead.codigo_usuario || null
        });
        await _marcarEnviada(lead.id);
        enviados++;
        console.log('[PORTAL EMAIL] enviado:', lead.email, '| variante:', indice);
      } catch (e) {
        console.error('[PORTAL EMAIL] erro ao enviar pra', lead.email, ':', e.message);
      }
      await new Promise(r => setTimeout(r, 1100));
    }
    return { enviados };
  } catch (e) {
    console.error('[PORTAL EMAIL] erro geral:', e.message);
    return { enviados: 0, erro: e.message };
  }
}

module.exports = { enviarConvitesPortal };
