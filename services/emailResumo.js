const { enviarEmail } = require('./email');
const { query } = require('./db');
const { lerImoveis } = require('./salvarImovel');
const { lerLeads } = require('./salvarLead');
const { lerVisitas } = require('./salvarVisita');

const BASE_URL = 'https://matchimoveis.ia.br';

async function enviarEmailResumo() {
  try {
    const { rows: usuarios } = await query(
      `SELECT codigo_usuario, nome, email, whatsapp_status, whatsapp_instance
       FROM usuarios WHERE email IS NOT NULL AND email != '' AND ativo = true
       AND COALESCE((dados->>'emailOptOut')::boolean, false) = false
       -- Conta de afiliado restrito não cadastra imóvel/lead/WhatsApp — esse
       -- resumo periódico não tem nada pra mostrar pra ela, só ruído
       -- (pedido do Renato, ago/2026: afiliado só recebe email do próprio
       -- programa de afiliados).
       AND COALESCE((dados->>'afiliadoRestrito')::boolean, false) = false`
    );

    console.log('[RESUMO EMAIL] usuarios:', usuarios.length);

    for (const u of usuarios) {
      try {
        const uid = u.codigo_usuario;
        const quinzeDiasAtras = Date.now() - 15 * 24 * 60 * 60 * 1000;

        // Imóveis — mesmo fallback de dono (user_id/usuario_id/codigo_usuario/corretor_id)
        // usado em todo o resto da plataforma (lerImoveis), não só user_id
        const imoveisDoUsuario = await lerImoveis(uid);
        const ativos = imoveisDoUsuario.filter(i => i.status === 'ativo').length;
        const inativos = imoveisDoUsuario.length - ativos; // qualquer status != ativo (inativo, nao_publicado, etc)

        // Leads — mesma regra do /app-home e /app/leads: lead oculta de WhatsApp sem
        // match ainda não conta (ainda não foi revelada pro corretor no sistema)
        const leadsDoUsuario = await lerLeads(uid);
        const leadsVisiveis = leadsDoUsuario.filter(l => !(l.leadOculta === true && !((l.matches||[]).length || (l.matchesBase||[]).length)));
        const leads = leadsVisiveis.filter(l => new Date(l.criadoEm || l.data_cadastro || 0).getTime() >= quinzeDiasAtras).length;

        // Matches — mesma definição do /app-home (matches + matchesBase), não matches_auto
        const matches = leadsVisiveis.filter(l => {
          const temMatch = (l.matches && l.matches.length > 0) || (l.matchesBase && l.matchesBase.length > 0);
          return temMatch && new Date(l.criadoEm || l.data_cadastro || 0).getTime() >= quinzeDiasAtras;
        }).length;

        // Visitas — mesmo fallback de dono usado em lerVisitas (user_id/owner_user_id/corretor_id)
        const visitasDoUsuario = await lerVisitas(uid);
        const visitas = visitasDoUsuario.filter(v => new Date(v.data || v.createdAt || 0).getTime() >= quinzeDiasAtras).length;

        const waStatus = u.whatsapp_status === 'open' ? '✅ Conectado' : '❌ Desconectado';
        const waAlerta = u.whatsapp_status !== 'open' ? `<p style="background:#fef2f2;border:1px solid #fca5a5;border-radius:8px;padding:12px;color:#dc2626">⚠️ Seu WhatsApp está desconectado! <a href="${BASE_URL}/app/perfil" style="color:#dc2626;font-weight:bold">Reconectar →</a></p>` : '';

        const html = `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:32px">
          <h2 style="color:#FF385C">📊 Resumo da sua conta — MatchImóveis</h2>
          <p>Olá, <strong>${u.nome}</strong>! Aqui está o resumo dos últimos 15 dias:</p>
          ${waAlerta}
          <table style="width:100%;border-collapse:collapse;margin:16px 0">
            <tr style="background:#f9fafb">
              <td style="padding:12px;border:1px solid #e5e7eb">📱 WhatsApp</td>
              <td style="padding:12px;border:1px solid #e5e7eb;font-weight:bold">${waStatus}</td>
            </tr>
            <tr>
              <td style="padding:12px;border:1px solid #e5e7eb">🏠 Imóveis ativos</td>
              <td style="padding:12px;border:1px solid #e5e7eb;font-weight:bold">${ativos}</td>
            </tr>
            <tr style="background:#f9fafb">
              <td style="padding:12px;border:1px solid #e5e7eb">📦 Imóveis inativos</td>
              <td style="padding:12px;border:1px solid #e5e7eb;font-weight:bold">${inativos}</td>
            </tr>
            <tr>
              <td style="padding:12px;border:1px solid #e5e7eb">👥 Leads recebidas</td>
              <td style="padding:12px;border:1px solid #e5e7eb;font-weight:bold">${leads}</td>
            </tr>
            <tr style="background:#f9fafb">
              <td style="padding:12px;border:1px solid #e5e7eb">🎯 Matches gerados</td>
              <td style="padding:12px;border:1px solid #e5e7eb;font-weight:bold">${matches}</td>
            </tr>
            <tr>
              <td style="padding:12px;border:1px solid #e5e7eb">📅 Visitas agendadas</td>
              <td style="padding:12px;border:1px solid #e5e7eb;font-weight:bold">${visitas}</td>
            </tr>
          </table>
          <a href="${BASE_URL}/app/leads" style="display:inline-block;margin-top:16px;padding:12px 24px;background:#FF385C;color:#fff;text-decoration:none;border-radius:8px;font-weight:bold">Acessar o sistema →</a>
          <p style="margin-top:32px;color:#888;font-size:12px">MatchImóveis • matchimoveis.ia.br</p>
          <p style="margin-top:8px;color:#9ca3af;font-size:11px;line-height:1.6">Não quer mais receber estes e-mails? <a href="${BASE_URL}/email/cancelar?u=${uid}" style="color:#9ca3af">Cancelar recebimento</a> · <a href="${BASE_URL}/conta/excluir?u=${uid}" style="color:#9ca3af">Excluir minha conta</a></p>
        </div>`;

        await enviarEmail({ para: u.email, assunto: '📊 Resumo da sua conta MatchImóveis', html, texto: `Olá ${u.nome}! Acesse seu resumo em ${BASE_URL}`, tipo: 'resumo_conta_periodico', botaoTexto: 'Acessar o sistema →', userId: uid });
        console.log('[RESUMO EMAIL] enviado:', u.email);
        await new Promise(r => setTimeout(r, 1000));
      } catch(e) { console.error('[RESUMO EMAIL] erro:', u.email, e.message); }
    }
  } catch(e) { console.error('[RESUMO EMAIL] erro geral:', e.message); }
}

module.exports = { enviarEmailResumo };
