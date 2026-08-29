const { enviarEmail } = require('./email');
const { query } = require('./db');

async function enviarEmailReengajamento() {
  try {
    const sete_dias_atras = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();
    const { rows } = await query(`
      SELECT codigo_usuario, nome, email, ultimo_acesso
      FROM usuarios
      WHERE email IS NOT NULL AND email != ''
      AND ultimo_acesso < $1
      AND ativo = true
      AND COALESCE((dados->>'emailOptOut')::boolean, false) = false
      -- Afiliado restrito só recebe email do programa de afiliados (ago/2026)
      AND COALESCE((dados->>'afiliadoRestrito')::boolean, false) = false
    `, [sete_dias_atras]);

    console.log('[REENGAJAMENTO] usuarios inativos:', rows.length);

    for (const u of rows) {
      try {
        const diasSemAcesso = Math.floor((Date.now() - new Date(u.ultimo_acesso)) / (24*3600*1000));
        await enviarEmail({
          para: u.email,
          assunto: '🏠 Seus leads estão esperando por você!',
          html: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:32px">
            <h2 style="color:#FF385C">Olá, ${u.nome}! 👋</h2>
            <p>Faz <strong>${diasSemAcesso} dias</strong> que você não acessa o MatchImóveis.</p>
            <p>Seus leads podem estar esperando por uma vitrine de imóveis — e você pode estar perdendo oportunidades de negócio!</p>
            <h3>O que pode ter acontecido enquanto você estava fora:</h3>
            <ul>
              <li>🔔 Novos leads chegaram pelo ImovelWeb</li>
              <li>🏠 Matches automáticos foram gerados</li>
              <li>📅 Solicitações de visita pendentes</li>
            </ul>
            <a href="https://matchimoveis.ia.br" style="display:inline-block;margin-top:24px;padding:12px 24px;background:#FF385C;color:#fff;text-decoration:none;border-radius:8px;font-weight:bold">Voltar ao sistema →</a>
            <p style="margin-top:32px;color:#888;font-size:12px">MatchImóveis • matchimoveis.ia.br</p>
            <p style="margin-top:8px;color:#9ca3af;font-size:11px;line-height:1.6">Não quer mais receber estes e-mails? <a href="https://matchimoveis.ia.br/email/cancelar?u=${u.codigo_usuario}" style="color:#9ca3af">Cancelar recebimento</a> · <a href="https://matchimoveis.ia.br/conta/excluir?u=${u.codigo_usuario}" style="color:#9ca3af">Excluir minha conta</a></p>
          </div>`,
          texto: `Olá ${u.nome}! Faz ${diasSemAcesso} dias que você não acessa o MatchImóveis. Volte agora: https://matchimoveis.ia.br`,
          tipo: 'reengajamento_inativo',
          botaoTexto: 'Voltar ao sistema →',
          userId: u.codigo_usuario
        });
        console.log('[REENGAJAMENTO] email enviado:', u.email);
        await new Promise(r => setTimeout(r, 1000)); // 1s entre emails
      } catch(e) { console.error('[REENGAJAMENTO] erro:', u.email, e.message); }
    }
  } catch(e) { console.error('[REENGAJAMENTO] erro geral:', e.message); }
}

module.exports = { enviarEmailReengajamento };
