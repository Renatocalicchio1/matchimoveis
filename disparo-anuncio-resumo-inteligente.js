// Disparo único (set/2026, pedido do Renato): anuncia a funcionalidade nova
// "Resumo Inteligente" (/app/resumo) pra todos os corretores ativos.
// Mesmo padrão de services/emailReengajamento.js — SELECT direto, respeita
// emailOptOut/afiliadoRestrito, 1s entre envios, link de descadastro.
//
// Rodar no Render Shell: node disparo-anuncio-resumo-inteligente.js
// (não roda sozinho — script standalone, sem agendamento, dispara 1x e sai)

const { enviarEmail } = require('./services/email');
const { query } = require('./services/db');

async function disparar() {
  const { rows } = await query(`
    SELECT codigo_usuario, nome, email
    FROM usuarios
    WHERE email IS NOT NULL AND email != ''
    AND ativo = true
    AND COALESCE((dados->>'emailOptOut')::boolean, false) = false
    AND COALESCE((dados->>'afiliadoRestrito')::boolean, false) = false
  `);

  console.log('[ANUNCIO RESUMO] corretores elegíveis:', rows.length);

  let enviados = 0;
  for (const u of rows) {
    try {
      const primeiroNome = (u.nome || '').split(' ')[0] || 'tudo bem';
      await enviarEmail({
        para: u.email,
        assunto: '🎉 Novidade: seu resumo do dia, direto na tela',
        html: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:32px">
          <h2 style="color:#FF385C">Oi, ${primeiroNome}! 👋</h2>
          <p>Acabamos de liberar o <strong>Resumo Inteligente</strong> — uma tela nova, feita pra você abrir no celular e ver em segundos o que precisa de atenção agora.</p>
          <ul style="line-height:1.9">
            <li>🔥 Quem está pronto pra fechar agora</li>
            <li>❤️ Quem curtiu um imóvel</li>
            <li>📅 Pedido de visita chegando</li>
            <li>🆕 Lead nova entrando</li>
            <li>🎙️ E dá pra falar com o sistema por voz — "busca fulano", "quantas leads eu tenho"</li>
          </ul>
          <p>Tudo num carrossel rápido, sempre atualizado, sem precisar navegar por menu nenhum.</p>
          <a href="https://www.matchimoveis.ia.br/app/resumo" style="display:inline-block;margin-top:24px;padding:12px 24px;background:#FF385C;color:#fff;text-decoration:none;border-radius:8px;font-weight:bold">🚀 Ver meu Resumo Inteligente</a>
          <p style="margin-top:32px;color:#888;font-size:12px">MatchImóveis • matchimoveis.ia.br</p>
          <p style="margin-top:8px;color:#9ca3af;font-size:11px;line-height:1.6">Não quer mais receber estes e-mails? <a href="https://matchimoveis.ia.br/email/cancelar?u=${u.codigo_usuario}" style="color:#9ca3af">Cancelar recebimento</a></p>
        </div>`,
        texto: `Oi ${primeiroNome}! Liberamos o Resumo Inteligente — acesse: https://www.matchimoveis.ia.br/app/resumo`,
        tipo: 'anuncio_resumo_inteligente',
        botaoTexto: '🚀 Ver meu Resumo Inteligente',
        userId: u.codigo_usuario
      });
      enviados++;
      console.log('[ANUNCIO RESUMO] enviado:', u.email, '(' + enviados + '/' + rows.length + ')');
    } catch (e) {
      console.error('[ANUNCIO RESUMO] erro:', u.email, e.message);
    }
    await new Promise(r => setTimeout(r, 1000)); // 1s entre envios
  }

  console.log('[ANUNCIO RESUMO] concluído. Total enviados:', enviados, '/', rows.length);
  process.exit(0);
}

disparar().catch(e => {
  console.error('[ANUNCIO RESUMO] erro geral:', e.message);
  process.exit(1);
});
