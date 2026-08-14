const { enviarEmail } = require('./email');
const { query } = require('./db');

const BASE_URL = 'https://www.matchimoveis.ia.br';

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

        const html = `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:32px">
          <h2 style="color:#FF385C">🔗 Indique e ganhe créditos — MatchImóveis</h2>
          <p>Olá, <strong>${u.nome}</strong>!</p>
          <p>Você tem um link de indicação só seu. Toda vez que um corretor se cadastrar por ele e recarregar créditos, você ganha <strong>10% em bônus</strong> — direto na sua conta.</p>
          <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:10px;padding:14px;margin:20px 0;font-family:monospace;font-size:13px;color:#374151;word-break:break-all">${link}</div>
          <a href="${linkWa}" style="display:inline-block;padding:12px 24px;background:#25D366;color:#fff;text-decoration:none;border-radius:8px;font-weight:bold">💬 Convidar pelo WhatsApp</a>
          <p style="margin-top:24px"><a href="${BASE_URL}/app/indicacoes" style="color:#FF385C;font-weight:bold">Ver meus indicados e bônus →</a></p>
          <p style="margin-top:32px;color:#888;font-size:12px">MatchImóveis • matchimoveis.online</p>
          <p style="margin-top:8px;color:#9ca3af;font-size:11px;line-height:1.6">Não quer mais receber estes e-mails? <a href="${BASE_URL}/email/cancelar?u=${u.codigo_usuario}" style="color:#9ca3af">Cancelar recebimento</a> · <a href="${BASE_URL}/conta/excluir?u=${u.codigo_usuario}" style="color:#9ca3af">Excluir minha conta</a></p>
        </div>`;

        await enviarEmail({
          para: u.email,
          assunto: '🔗 Indique corretores e ganhe créditos — MatchImóveis',
          html,
          texto: `Olá ${u.nome}! Seu link de indicação: ${link} — a cada corretor indicado que recarregar créditos, você ganha 10% de bônus.`,
          tipo: 'convite_indicacao',
          botaoTexto: 'Convidar pelo WhatsApp',
          userId: u.codigo_usuario
        });
        console.log('[EMAIL INDICACAO] enviado:', u.email);
        await new Promise(r => setTimeout(r, 1000));
      } catch(e) { console.error('[EMAIL INDICACAO] erro:', u.email, e.message); }
    }
  } catch(e) { console.error('[EMAIL INDICACAO] erro geral:', e.message); }
}

module.exports = { enviarEmailIndicacao };
