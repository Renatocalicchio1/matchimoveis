// Roda o motor de match (cerebro/match-core.js) pra todas as leads que ainda
// não geraram nenhum match — útil depois de importar um lote grande sem
// perfil completo na hora, ou pra reprocessar depois de ajustar as regras de
// match (motor-intencao.js). Não manda WhatsApp (instancia não é passada pro
// match-core, então a vitrine automática fica só salva, sem disparar em
// massa pros contatos).
//
// Rodar no Render Shell: node rodarMatchLeadsSemMatch.js
const mc = require('./cerebro/match-core');
const { query } = require('./services/db');
const { rowToLead } = require('./services/salvarLead');

function ehLeadCaptacao(l) {
  return l.tipoLead === 'cliente_vendedor' || l.tipo_lead === 'cliente_vendedor' || l.origem === 'captacao_link' || (l.dados && l.dados.temImovelParaCaptar === true);
}

(async () => {
  const { rows } = await query(`
    SELECT * FROM leads
    WHERE (matches IS NULL OR jsonb_typeof(matches) != 'array' OR jsonb_array_length(matches) = 0)
      AND (user_id IS NOT NULL OR codigo_usuario IS NOT NULL)
    ORDER BY criado_em DESC
  `);
  console.log(`[match-pendentes] ${rows.length} leads sem match encontradas`);

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

  console.log(`[match-pendentes] processadas: ${processadas} | geraram match: ${geraramMatch} | puladas (captação/sem dono): ${puladas} | erros: ${erros}`);
  process.exit(0);
})().catch(e => { console.error('[match-pendentes] erro fatal:', e.message); process.exit(1); });
