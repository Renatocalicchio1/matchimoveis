// Convite periódico pra atualizar o perfil (nome, CRECI, área de atuação,
// telefone) — pra TODO corretor ativo com email cadastrado, reenviado a
// cada 30 dias enquanto não descadastrar. Cadastro novo entra na primeira
// passada (perfil_email_enviado_em fica NULL até o primeiro envio, então
// já é elegível na hora). Mesmo padrão do convite de portal global
// (services/emailPortalGlobal.js): 1 envio por chamada, cadência de
// 10s-2min agendada de fora (server.js), janela 8h-21h Brasília.
const { enviarEmail } = require('./email');
const { query } = require('./db');

const BASE_URL = 'https://www.matchimoveis.ia.br';
const CICLO_DIAS = 30;

function _dentroHorarioPermitido() {
  const horaSP = Number(new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo', hour: '2-digit', hour12: false }));
  return horaSP >= 8 && horaSP < 21;
}

async function _marcarEnviado(codigoUsuario) {
  await query(
    `UPDATE usuarios SET dados = jsonb_set(COALESCE(dados,'{}'::jsonb), '{perfilEmailEnviadoEm}', to_jsonb(NOW()::text)) WHERE codigo_usuario=$1`,
    [codigoUsuario]
  ).catch(() => {});
}

// Envia pra UM corretor elegível por chamada — reagendado externamente
// (server.js) com intervalo aleatório de 10s a 2min entre envios.
async function enviarUmEmailAtualizarPerfil() {
  if (!_dentroHorarioPermitido()) return { enviado: false, motivo: 'fora_do_horario' };
  try {
    const { rows } = await query(
      `SELECT codigo_usuario, nome, email FROM usuarios
       WHERE email IS NOT NULL AND email != ''
         AND ativo = true
         AND COALESCE((dados->>'emailOptOut')::boolean, false) = false
         AND COALESCE((dados->>'afiliadoRestrito')::boolean, false) = false
         AND (dados->>'perfilEmailEnviadoEm' IS NULL OR (dados->>'perfilEmailEnviadoEm')::timestamptz < NOW() - INTERVAL '${CICLO_DIAS} days')
       ORDER BY (dados->>'perfilEmailEnviadoEm')::timestamptz ASC NULLS FIRST LIMIT 1`
    );
    if (!rows.length) return { enviado: false };
    const u = rows[0];
    const primeiroNome = (u.nome || '').trim().split(/\s+/)[0] || 'tudo bem?';
    await enviarEmail({
      para: u.email,
      assunto: '📋 Atualize seu perfil na MatchImóveis',
      html: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:32px">
        <h2 style="color:#FF385C">Olá, ${primeiroNome}! 👋</h2>
        <p>Passando pra pedir um favor rápido: dá uma olhada no seu <strong>perfil na MatchImóveis</strong> e confere se seus dados estão em dia — nome, CRECI, área de atuação e telefone.</p>
        <p>Perfil completo e atualizado significa mais precisão nos leads que chegam até você e no match automático da plataforma.</p>
        <a href="${BASE_URL}/entrar" style="display:inline-block;margin-top:24px;padding:12px 24px;background:#FF385C;color:#fff;text-decoration:none;border-radius:8px;font-weight:bold">Entrar e atualizar meu perfil →</a>
      </div>`,
      texto: `Olá ${primeiroNome}! Dá uma olhada no seu perfil na MatchImóveis e confere se seus dados estão em dia (nome, CRECI, área de atuação, telefone). Entre aqui: ${BASE_URL}/entrar`,
      tipo: 'pedido_atualizar_perfil',
      botaoTexto: 'Entrar e atualizar meu perfil →',
      userId: u.codigo_usuario
    });
    await _marcarEnviado(u.codigo_usuario);
    console.log('[ATUALIZAR-PERFIL EMAIL] enviado:', u.email);
    return { enviado: true };
  } catch (e) {
    console.error('[ATUALIZAR-PERFIL EMAIL] erro geral:', e.message);
    return { enviado: false, erro: e.message };
  }
}

module.exports = { enviarUmEmailAtualizarPerfil };
