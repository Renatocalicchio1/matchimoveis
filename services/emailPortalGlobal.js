// Convite periódico pro portal global (/portal) — pra toda lead do sistema
// com email cadastrado (cliente comprador ou vendedor, mesmo convite pros
// dois), reenviado a cada 7 dias enquanto ela não descadastrar. Rodava só
// pra leads novas (histórico marcado como "já enviado" na criação da coluna,
// ver _migrarColunaPortalEmail em services/salvarLead.js) — liberado pra base
// toda (ago/2026, pedido do Renato) trocando o corte de "boolean já mandei
// uma vez" pra "faz mais de 7 dias desde o último envio" (usa a coluna
// portal_email_enviado_em, que fica NULL nas leads antigas — reentram no
// pool a partir daqui). Consentimento: lead deu contato pro corretor
// buscando/vendendo imóvel, plataforma respeita isso com link de
// descadastro visível em todo email (/email/cancelar-portal).
const { enviarEmail } = require('./email');
const { query } = require('./db');

const BASE_URL = 'https://www.matchimoveis.ia.br';
const CICLO_DIAS = 7;

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

function _montarHtml(nome, v, leadId) {
  const linkCancelar = `${BASE_URL}/email/cancelar-portal?id=${encodeURIComponent(leadId)}`;
  return `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:32px">
    <h2 style="color:#FF385C">${v.headline}</h2>
    <p>Olá${nome ? ', ' + nome : ''}!</p>
    <p style="font-size:15px;line-height:1.7;color:#333">${v.corpo}</p>
    <a href="${BASE_URL}/portal" style="display:inline-block;margin-top:20px;padding:14px 28px;background:#FF385C;color:#fff;text-decoration:none;border-radius:8px;font-weight:bold;font-size:15px">${v.botao} →</a>
    <p style="margin-top:32px;color:#9ca3af;font-size:11px;line-height:1.6">Não quer mais receber este e-mail? <a href="${linkCancelar}" style="color:#9ca3af">Cancelar recebimento</a></p>
  </div>`;
}

async function _marcarEnviada(leadId) {
  await query('UPDATE leads SET portal_email_enviado = true, portal_email_enviado_em = NOW() WHERE id = $1', [leadId]).catch(() => {});
}

// Envia pra UMA lead elegível por chamada — mesmo padrão de
// _agendarProximoEnvioCampanhaGeral (server.js): reagendado externamente com
// intervalo aleatório de 10s a 2min entre envios, nunca em lote de uma vez.
async function enviarUmConvitePortal() {
  try {
    const { rows } = await query(
      `SELECT id, nome, email, user_id, codigo_usuario FROM leads
       WHERE email IS NOT NULL AND email != ''
         AND (portal_email_enviado_em IS NULL OR portal_email_enviado_em < NOW() - INTERVAL '${CICLO_DIAS} days')
         AND COALESCE((dados->>'portalEmailOptOut')::boolean, false) = false
       ORDER BY portal_email_enviado_em ASC NULLS FIRST LIMIT 1`
    );
    if (!rows.length) return { enviado: false };
    const lead = rows[0];
    const { indice, v } = _variantePara(lead.id);
    await enviarEmail({
      para: lead.email,
      assunto: v.assunto,
      html: _montarHtml(lead.nome, v, lead.id),
      texto: `${v.headline}. ${v.corpo} Acesse: ${BASE_URL}/portal`,
      tipo: 'convite_portal_global',
      variante: String(indice),
      botaoTexto: v.botao + ' →',
      leadId: lead.id,
      userId: lead.user_id || lead.codigo_usuario || null
    });
    await _marcarEnviada(lead.id);
    console.log('[PORTAL EMAIL] enviado:', lead.email, '| variante:', indice);
    return { enviado: true };
  } catch (e) {
    console.error('[PORTAL EMAIL] erro geral:', e.message);
    return { enviado: false, erro: e.message };
  }
}

module.exports = { enviarUmConvitePortal };
