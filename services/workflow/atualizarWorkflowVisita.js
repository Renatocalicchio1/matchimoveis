const fs = require('fs');
const path = require('path');

const { registrarEvento } = require('../memoria/registrarEvento');
const { criarNotificacao } = require('../notificacoes/criarNotificacao');

const DATA_DIR =
  process.env.RENDER
    ? '/opt/render/project/src/data'
    : '.';

const visitasFile = path.join(DATA_DIR, 'visitas.json');

function loadVisitas() {
  if (!fs.existsSync(visitasFile)) return [];
  try {
    return JSON.parse(fs.readFileSync(visitasFile, 'utf8'));
  } catch {
    return [];
  }
}

function saveVisitas(data) {
  fs.writeFileSync(visitasFile, JSON.stringify(data, null, 2));
}

function atualizarWorkflowVisita(visitaId, workflowStatus, extras = {}) {
  const visitas = loadVisitas();

  const idx = visitas.findIndex(v => String(v.id) === String(visitaId));

  if (idx === -1) {
    return { erro: 'Visita não encontrada' };
  }

  visitas[idx].workflowStatus = workflowStatus;
  visitas[idx].workflowAtualizadoEm = new Date().toISOString();

  if (extras.workflowResponsavel) {
    visitas[idx].workflowResponsavel = extras.workflowResponsavel;
  }

  if (extras.workflowLabel) {
    visitas[idx].workflowLabel = extras.workflowLabel;
  }

  if (extras.workflowProximaAcao) {
    visitas[idx].workflowProximaAcao = extras.workflowProximaAcao;
  }

  saveVisitas(visitas);

  registrarEvento({
    tipo: 'WORKFLOW_VISITA_ATUALIZADO',
    visitaId: visitas[idx].id,
    leadId: visitas[idx].leadId || '',
    imovelId: visitas[idx].imovelId || '',
    userId: visitas[idx].userId || '',
    descricao: `Workflow alterado para ${workflowStatus}`,
    payload: {
      workflowStatus
    }
  });

  criarNotificacao({
    tipo: 'WORKFLOW_VISITA',
    titulo: 'Workflow da visita atualizado',
    mensagem: `Visita alterada para ${workflowStatus}`,
    prioridade: 'alta',
    userId: visitas[idx].userId || '',
    leadId: visitas[idx].leadId || '',
    visitaId: visitas[idx].id,
    imovelId: visitas[idx].imovelId || '',
    acao: 'abrir_visita',
    link: '/app/visitas'
  });

  return visitas[idx];
}

module.exports = {
  atualizarWorkflowVisita
};
