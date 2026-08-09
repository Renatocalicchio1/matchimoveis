// Roda o motor de match (cerebro/match-core.js) pra leads que ainda não
// geraram nenhum match. Usado pelo job diário (server.js, 6h — restrito aos
// últimos 2 dias pra não pesar no servidor todo dia) e pelo script manual
// rodarMatchLeadsSemMatch.js / preencherQuartosPendentes.js (Render Shell —
// sem restrição de data, processam tudo que estiver pendente). Não passa
// `instancia` pro match-core, então a vitrine automática fica só salva, sem
// disparar WhatsApp em massa pros contatos.
const mc = require('../cerebro/match-core');
const { query } = require('./db');
const { rowToLead } = require('./salvarLead');

function ehLeadCaptacao(l) {
  return l.tipoLead === 'cliente_vendedor' || l.tipo_lead === 'cliente_vendedor' || l.origem === 'captacao_link' || (l.dados && l.dados.temImovelParaCaptar === true);
}

// `userId` — restringe a uma conta específica (bate contra user_id OU
// codigo_usuario, mesmo fallback duplo usado no resto do projeto).
// `semVitrine` — além de sem match, exige vitrine_enviada = false/null
// (usado quando o objetivo é achar quem nunca recebeu nada ainda, não só
// reprocessar quem já tem vitrine mas o match mudou).
async function rodarMatchLeadsSemMatch({ diasAtras, userId, semVitrine } = {}) {
  const params = [];
  let filtroData = '';
  if (diasAtras) {
    params.push(diasAtras);
    filtroData = `AND criado_em >= NOW() - make_interval(days => $${params.length})`;
  }
  let filtroUsuario = '';
  if (userId) {
    params.push(userId);
    filtroUsuario = `AND (user_id = $${params.length} OR codigo_usuario = $${params.length})`;
  }
  const filtroVitrine = semVitrine ? `AND COALESCE(vitrine_enviada, false) = false` : '';
  const { rows } = await query(`
    SELECT * FROM leads
    WHERE (matches IS NULL OR jsonb_typeof(matches) != 'array' OR jsonb_array_length(matches) = 0)
      AND (user_id IS NOT NULL OR codigo_usuario IS NOT NULL)
      ${filtroData}
      ${filtroUsuario}
      ${filtroVitrine}
    ORDER BY criado_em DESC
  `, params);
  console.log(`[match-pendentes] ${rows.length} leads sem match encontradas${diasAtras ? ' (últimos ' + diasAtras + ' dias)' : ''}${userId ? ' (conta ' + userId + ')' : ''}${semVitrine ? ' (sem vitrine)' : ''}`);

  let processadas = 0, geraramMatch = 0, puladas = 0, erros = 0;
  for (const row of rows) {
    const lead = rowToLead(row);
    const userId = lead.userId || lead.codigoUsuario;
    if (ehLeadCaptacao(lead) || !userId) { puladas++; continue; }
    try {
      const antes = (lead.matches || []).length;
      const { lead: leadAtualizada } = await mc.processar({ lead, mensagem: '', canal: lead.origem || 'sistema', userId });
      const depois = (leadAtualizada.matches || []).length;
      processadas++;
      if (depois > antes) geraramMatch++;
    } catch (e) {
      erros++;
      console.error(`[match-pendentes] erro na lead ${lead.id}:`, e.message);
    }
  }

  const resumo = { total: rows.length, processadas, geraramMatch, puladas, erros };
  console.log(`[match-pendentes] processadas: ${processadas} | geraram match: ${geraramMatch} | puladas (captação/sem dono): ${puladas} | erros: ${erros}`);
  return resumo;
}

module.exports = { rodarMatchLeadsSemMatch };
