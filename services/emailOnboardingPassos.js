const { enviarEmail } = require('./email');
const { query } = require('./db');

const BASE_URL = 'https://matchimoveis.ia.br';

// Mesmos 6 passos e mesmos critérios do GET /api/onboarding/status (server.js)
const PASSOS = [
  { chave: 'xml', numero: 1, nome: 'Importar XML de imóveis', flag: 'onboarding_email_xml', link: '/app/imoveis' },
  { chave: 'whatsapp', numero: 2, nome: 'Conectar WhatsApp', flag: 'onboarding_email_whatsapp', link: '/app/perfil#secao-whatsapp' },
  { chave: 'instagram', numero: 3, nome: 'Conectar Instagram', flag: 'onboarding_email_instagram', link: '/app/perfil#secao-instagram' },
  { chave: 'leadManual', numero: 4, nome: 'Cadastrar uma lead manual', flag: 'onboarding_email_lead_manual', link: '/app/leads' },
  { chave: 'assistente', numero: 5, nome: 'Tirar uma dúvida com o assistente', flag: 'onboarding_email_assistente', link: '/app/assistente' },
  { chave: 'perfil', numero: 6, nome: 'Conhecer sua área de perfil', flag: 'onboarding_email_perfil', link: '/app/perfil' },
];

function _listaHtml(dadosAtualizados) {
  return PASSOS.map(p => {
    const feito = !!dadosAtualizados[p.flag];
    return `<li style="margin-bottom:6px">${feito ? '✅' : '⬜'} ${p.nome}${feito ? '' : ` — <a href="${BASE_URL}${p.link}" style="color:#FF385C;font-weight:bold">fazer agora →</a>`}</li>`;
  }).join('');
}

function _emailPasso(u, passo, pendentes) {
  return {
    assunto: `🎉 Passo concluído — ${passo.nome}`,
    html: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:32px">
      <h2 style="color:#FF385C">🎉 Mais um passo concluído!</h2>
      <p>Olá, ${u.nome}! Você acabou de completar: <strong>${passo.nome}</strong>.</p>
      <p>Faltam ${pendentes.length} de 6 passos pra você aproveitar o MatchImóveis por completo:</p>
      <ul style="padding-left:4px;list-style:none">${_listaHtml(u._dadosParaLista)}</ul>
      <a href="${BASE_URL}${pendentes[0].link}" style="display:inline-block;margin-top:16px;padding:12px 24px;background:#FF385C;color:#fff;text-decoration:none;border-radius:8px;font-weight:bold">Continuar agora →</a>
      <p style="margin-top:32px;color:#888;font-size:12px">MatchImóveis • matchimoveis.online</p>
    </div>`,
    texto: `Passo concluído: ${passo.nome}. Ainda faltam: ${pendentes.map(p=>p.nome).join(', ')}. Acesse: ${BASE_URL}`
  };
}

function _emailCompleto(u) {
  return {
    assunto: '🚀 Você completou os 6 passos do MatchImóveis!',
    html: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:32px">
      <h2 style="color:#FF385C">🚀 Parabéns, ${u.nome}!</h2>
      <p>Você completou os 6 passos iniciais — XML importado, WhatsApp e Instagram conectados, lead manual cadastrada, assistente testado e perfil configurado.</p>
      <p>Agora é só deixar o MatchImóveis trabalhar: matches e vitrines automáticas já estão rodando pra você.</p>
      <a href="${BASE_URL}/app-home" style="display:inline-block;margin-top:16px;padding:12px 24px;background:#FF385C;color:#fff;text-decoration:none;border-radius:8px;font-weight:bold">Acessar meu painel →</a>
      <p style="margin-top:32px;color:#888;font-size:12px">MatchImóveis • matchimoveis.online</p>
    </div>`,
    texto: `Parabéns, ${u.nome}! Você completou os 6 passos do MatchImóveis. Acesse: ${BASE_URL}/app-home`
  };
}

async function verificarOnboardingPassos() {
  try {
    const { rows: usuarios } = await query(
      `SELECT id, codigo_usuario, nome, email, xml_url, whatsapp_status, historico_assistente, dados
       FROM usuarios WHERE email IS NOT NULL AND email != '' AND ativo = true`
    );
    console.log('[ONBOARDING EMAIL] verificando', usuarios.length, 'usuarios');

    for (const u of usuarios) {
      try {
        const uid = u.codigo_usuario || u.id;
        const dados = u.dados || {};

        const { rows: [{ n: nLeadManual }] } = await query(
          `SELECT COUNT(*)::int as n FROM leads WHERE (user_id=$1 OR codigo_usuario=$1) AND (origem='manual' OR dados->>'origemEntrada'='manual')`, [uid]
        );

        const atual = {
          xml: !!u.xml_url,
          whatsapp: u.whatsapp_status === 'open',
          instagram: !!dados.instagramContaId,
          leadManual: nLeadManual > 0,
          assistente: Array.isArray(u.historico_assistente) && u.historico_assistente.length > 0,
          perfil: !!dados.onboardingPerfilVisto,
        };

        // Primeira vez que vemos esse usuário: só grava a base (não manda email de coisa que já estava pronta antes do job existir)
        if (!dados.onboarding_email_baseline) {
          const camposBase = { onboarding_email_baseline: true };
          PASSOS.forEach(p => { if (atual[p.chave]) camposBase[p.flag] = true; });
          await query(`UPDATE usuarios SET dados = dados || $1::jsonb WHERE id=$2`, [JSON.stringify(camposBase), u.id]);
          continue;
        }

        const novosCompletos = PASSOS.filter(p => atual[p.chave] && !dados[p.flag]);
        if (!novosCompletos.length) continue;

        const todosCompletosAgora = PASSOS.every(p => atual[p.chave]);

        if (todosCompletosAgora) {
          const { assunto, html, texto } = _emailCompleto(u);
          await enviarEmail({ para: u.email, assunto, html, texto, tipo: 'onboarding_completo', userId: uid });
          const marcar = {}; PASSOS.forEach(p => { marcar[p.flag] = true; });
          await query(`UPDATE usuarios SET dados = dados || $1::jsonb WHERE id=$2`, [JSON.stringify(marcar), u.id]);
          console.log('[ONBOARDING EMAIL] onboarding completo:', u.email);
          await new Promise(r => setTimeout(r, 1000));
          continue;
        }

        for (const passo of novosCompletos) {
          dados[passo.flag] = true; // marca localmente pra listar certo o que ainda falta neste email
          const pendentes = PASSOS.filter(p => !dados[p.flag]);
          const { assunto, html, texto } = _emailPasso({ ...u, _dadosParaLista: dados }, passo, pendentes);
          await enviarEmail({ para: u.email, assunto, html, texto, tipo: 'onboarding_passo', variante: passo.flag, userId: uid });
          await query(`UPDATE usuarios SET dados = dados || $1::jsonb WHERE id=$2`, [JSON.stringify({ [passo.flag]: true }), u.id]);
          console.log('[ONBOARDING EMAIL] passo', passo.numero, 'enviado:', u.email);
          await new Promise(r => setTimeout(r, 1000));
        }
      } catch(e) { console.error('[ONBOARDING EMAIL] erro usuario:', u.email, e.message); }
    }
  } catch(e) { console.error('[ONBOARDING EMAIL] erro geral:', e.message); }
}

module.exports = { verificarOnboardingPassos };
