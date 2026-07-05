const { enviarEmail } = require('./email');
const { query } = require('./db');

const BASE_URL = 'https://matchimoveis.ia.br';

async function enviarEmailResumo() {
  try {
    const { rows: usuarios } = await query(
      `SELECT codigo_usuario, nome, email, whatsapp_status, whatsapp_instance 
       FROM usuarios WHERE email IS NOT NULL AND email != '' AND ativo = true`
    );

    console.log('[RESUMO EMAIL] usuarios:', usuarios.length);

    for (const u of usuarios) {
      try {
        const uid = u.codigo_usuario;

        // Imóveis
        const { rows: imoveis } = await query(
          `SELECT status, COUNT(*) as total FROM imoveis WHERE user_id=$1 GROUP BY status`, [uid]
        );
        const ativos = parseInt((imoveis.find(i=>i.status==='ativo')||{}).total||0);
        const inativos = parseInt((imoveis.find(i=>i.status==='inativo')||{}).total||0);

        // Leads últimos 3 dias
        const { rows: leadsR } = await query(
          `SELECT COUNT(*) as total FROM leads WHERE user_id=$1 AND criado_em > NOW() - INTERVAL '3 days'`, [uid]
        );
        const leads = parseInt(leadsR[0]?.total||0);

        // Matches últimos 3 dias
        const { rows: matchesR } = await query(
          `SELECT COUNT(*) as total FROM leads WHERE user_id=$1 AND matches_auto IS NOT NULL AND array_length(matches_auto::json::text::varchar[], 1) > 0 AND atualizado_em > NOW() - INTERVAL '3 days'`, [uid]
        ).catch(()=>({rows:[{total:0}]}));
        const matches = parseInt(matchesR[0]?.total||0);

        // Visitas últimos 3 dias
        const { rows: visitasR } = await query(
          `SELECT COUNT(*) as total FROM visitas WHERE user_id=$1 AND criado_em > NOW() - INTERVAL '3 days'`, [uid]
        );
        const visitas = parseInt(visitasR[0]?.total||0);

        const waStatus = u.whatsapp_status === 'open' ? '✅ Conectado' : '❌ Desconectado';
        const waAlerta = u.whatsapp_status !== 'open' ? `<p style="background:#fef2f2;border:1px solid #fca5a5;border-radius:8px;padding:12px;color:#dc2626">⚠️ Seu WhatsApp está desconectado! <a href="${BASE_URL}/app/perfil" style="color:#dc2626;font-weight:bold">Reconectar →</a></p>` : '';

        const html = `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:32px">
          <h2 style="color:#FF385C">📊 Resumo da sua conta — MatchImóveis</h2>
          <p>Olá, <strong>${u.nome}</strong>! Aqui está o resumo dos últimos 3 dias:</p>
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
          <p style="margin-top:32px;color:#888;font-size:12px">MatchImóveis • matchimoveis.online</p>
        </div>`;

        await enviarEmail({ para: u.email, assunto: '📊 Resumo da sua conta MatchImóveis', html, texto: `Olá ${u.nome}! Acesse seu resumo em ${BASE_URL}` });
        console.log('[RESUMO EMAIL] enviado:', u.email);
        await new Promise(r => setTimeout(r, 1000));
      } catch(e) { console.error('[RESUMO EMAIL] erro:', u.email, e.message); }
    }
  } catch(e) { console.error('[RESUMO EMAIL] erro geral:', e.message); }
}

module.exports = { enviarEmailResumo };
