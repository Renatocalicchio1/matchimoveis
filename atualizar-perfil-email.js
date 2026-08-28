// Email avulso pra TODOS os corretores ativos da plataforma, pedindo pra
// atualizar as informações do perfil (nome, CRECI, área de atuação etc) e
// com o link pra entrar no sistema. Não é recorrente/agendado — script
// avulso, rodar manualmente uma vez quando pedido (ago/2026).
//
// Como rodar (Render Shell, dentro de /opt/render/project/src/):
//   node atualizar-perfil-email.js
//
// Mesmo padrão de rate-limit e filtro de public.usuarios que
// services/emailReengajamento.js já usa (email presente, conta ativa, sem
// opt-out, sem afiliado restrito — esse só recebe email do programa de
// afiliados). Usa enviarEmail() (services/email.js), que já cuida de
// opt-out, rastreio de abertura/clique e rodapé de descadastro sozinho.

const { enviarEmail } = require('./services/email');
const { query } = require('./services/db');

async function main() {
  const { rows } = await query(`
    SELECT codigo_usuario, nome, email
    FROM usuarios
    WHERE email IS NOT NULL AND email != ''
    AND ativo = true
    AND COALESCE((dados->>'emailOptOut')::boolean, false) = false
    AND COALESCE((dados->>'afiliadoRestrito')::boolean, false) = false
  `);

  console.log('[ATUALIZAR-PERFIL] corretores a notificar:', rows.length);

  let enviados = 0, erros = 0;
  for (const u of rows) {
    try {
      const primeiroNome = (u.nome || '').trim().split(/\s+/)[0] || 'tudo bem?';
      await enviarEmail({
        para: u.email,
        assunto: '📋 Atualize seu perfil na MatchImóveis',
        html: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:32px">
          <h2 style="color:#FF385C">Olá, ${primeiroNome}! 👋</h2>
          <p>Passando pra pedir um favor rápido: dá uma olhada no seu <strong>perfil na MatchImóveis</strong> e confere se seus dados estão em dia — nome, CRECI, área de atuação e telefone.</p>
          <p>Perfil completo e atualizado significa mais precisão nos leads que chegam até você e no match automático da plataforma.</p>
          <a href="https://www.matchimoveis.ia.br/entrar" style="display:inline-block;margin-top:24px;padding:12px 24px;background:#FF385C;color:#fff;text-decoration:none;border-radius:8px;font-weight:bold">Entrar e atualizar meu perfil →</a>
        </div>`,
        texto: `Olá ${primeiroNome}! Dá uma olhada no seu perfil na MatchImóveis e confere se seus dados estão em dia (nome, CRECI, área de atuação, telefone). Entre aqui: https://www.matchimoveis.ia.br/entrar`,
        tipo: 'pedido_atualizar_perfil',
        botaoTexto: 'Entrar e atualizar meu perfil →',
        userId: u.codigo_usuario
      });
      console.log('[ATUALIZAR-PERFIL] enviado:', u.email);
      enviados++;
    } catch (e) {
      console.error('[ATUALIZAR-PERFIL] erro:', u.email, e.message);
      erros++;
    }
    await new Promise(r => setTimeout(r, 1100)); // mesmo intervalo do resto do sistema (rate limit SES)
  }

  console.log('[ATUALIZAR-PERFIL] concluído — enviados:', enviados, '| erros:', erros);
  process.exit(0);
}

main().catch(e => { console.error('[ATUALIZAR-PERFIL] erro geral:', e.message); process.exit(1); });
