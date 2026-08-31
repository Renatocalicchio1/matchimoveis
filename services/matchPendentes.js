// Roda o motor de match (cerebro/match-core.js) pra leads que ainda não
// geraram nenhum match. Usado pelo job diário (server.js, 6h — sem
// restrição de data desde ago/2026, pra não deixar lead antiga órfã pra
// sempre) e pelo script manual rodarMatchLeadsSemMatch.js /
// preencherQuartosPendentes.js (Render Shell, mesma chamada sem filtro).
// Não passa `instancia` pro match-core, então a vitrine automática fica só
// salva, sem disparar WhatsApp em massa pros contatos.
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
//
// Sem `userId` (caso do job automático diário, que agora roda sem filtro de
// data) a query tem TETO por rodada — pedido explícito do Renato (ago/2026)
// ao tirar a restrição de 2 dias: "não pode sobrecarregar o sistema". Nessa
// chamada global, ordena por lead MAIS ANTIGA primeiro (não mais recente) —
// é exatamente a lead antiga tipo "Edvaldo" que ficava órfã que precisa
// prioridade; lead que não sobra vaga hoje entra amanhã (continua sem match
// até resolver, nunca sai da fila sozinha). Chamada scoped por `userId`
// (admin rodando /admin/rematch pra 1 conta) não usa teto — volume de 1
// conta só é sempre pequeno perto da base inteira.
const _TETO_PADRAO_GLOBAL = 500;
async function rodarMatchLeadsSemMatch({ diasAtras, userId, semVitrine, teto } = {}) {
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
  const ordem = userId ? 'DESC' : 'ASC';
  let limiteSQL = '';
  if (!userId) {
    const tetoNum = Math.min(Math.max(parseInt(teto, 10) || _TETO_PADRAO_GLOBAL, 1), 5000);
    params.push(tetoNum);
    limiteSQL = `LIMIT $${params.length}`;
  }
  const { rows } = await query(`
    SELECT * FROM leads
    WHERE (matches IS NULL OR jsonb_typeof(matches) != 'array' OR jsonb_array_length(matches) = 0)
      AND (user_id IS NOT NULL OR codigo_usuario IS NOT NULL)
      ${filtroData}
      ${filtroUsuario}
      ${filtroVitrine}
    ORDER BY criado_em ${ordem}
    ${limiteSQL}
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
