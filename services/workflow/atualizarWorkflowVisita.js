const { query, dbOk } = require('../db');
const { registrarEvento } = require('../memoria/registrarEvento');
const { criarNotificacao } = require('../notificacoes/criarNotificacao');

async function atualizarWorkflowVisita(visitaId, workflowStatus, extras = {}) {
  if (!await dbOk()) return { erro: 'DB indisponível' };
  try {
    // Busca visita no PG
    const r = await query('SELECT * FROM visitas WHERE id=$1', [visitaId]);
    if (!r.rows.length) return { erro: 'Visita não encontrada' };
    const visita = r.rows[0];

    // Atualiza workflow no PG
    await query(`
      UPDATE visitas SET
        workflow_status=$1, workflow_atualizado_em=NOW(),
        workflow_responsavel=$2, workflow_label=$3, workflow_proxima_acao=$4,
        atualizado_em=NOW()
      WHERE id=$5
    `, [
      workflowStatus,
      extras.workflowResponsavel || visita.workflow_responsavel || '',
      extras.workflowLabel || visita.workflow_label || '',
      extras.workflowProximaAcao || visita.workflow_proxima_acao || '',
      visitaId
    ]);

    // PIPELINE: atualiza faseFunil da lead no PG
    const leadId = visita.lead_id || '';
    if (leadId) {
      try {
        const ws = (workflowStatus || '').toLowerCase();
        if (ws === 'realizada') {
          await query(`UPDATE leads SET fase_funil='visitou', status='visitou', atualizado_em=NOW() WHERE id=$1`, [leadId]);
          console.log('[PIPELINE] lead', leadId, '-> visitou');
        } else if (ws === 'confirmada') {
          await query(`UPDATE leads SET fase_funil='visita', status='visita', atualizado_em=NOW() WHERE id=$1`, [leadId]);
          console.log('[PIPELINE] lead', leadId, '-> visita');
        }
      } catch(e) { console.error('[PIPELINE] erro:', e.message); }
    }

    // Notificação e evento
    const userId = visita.user_id || visita.corretor_id || '';
    registrarEvento({
      tipo: 'WORKFLOW_VISITA_ATUALIZADO', visitaId, leadId,
      imovelId: visita.imovel_id || '', userId,
      descricao: `Workflow alterado para ${workflowStatus}`,
      payload: { workflowStatus }
    });
    await criarNotificacao({
      tipo: 'WORKFLOW_VISITA', titulo: 'Workflow da visita atualizado',
      mensagem: `Visita alterada para ${workflowStatus}`,
      prioridade: 'alta', userId, leadId, visitaId,
      imovelId: visita.imovel_id || '', acao: 'abrir_visita', link: '/app/visitas'
    });

    return { ...visita, workflowStatus };
  } catch(e) {
    console.error('[atualizarWorkflowVisita PG]', e.message);
    return { erro: e.message };
  }
}

module.exports = { atualizarWorkflowVisita };
