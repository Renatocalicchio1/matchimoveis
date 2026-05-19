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

  // PIPELINE: visita realizada → lead avança automaticamente
  try {
    const _leadId = visitas[idx].leadId || visitas[idx].lead_id || '';
    if (_leadId) {
      const _path = require('path');
      const _fs = require('fs');
      const _dir = process.env.RENDER ? '/opt/render/project/src/data' : _path.join(__dirname, '../..');
      const _dataFile = _path.join(_dir, 'data.json');
      if (_fs.existsSync(_dataFile)) {
        const _leads = JSON.parse(_fs.readFileSync(_dataFile, 'utf8'));
        const _li = _leads.findIndex(l => String(l.id) === String(_leadId));
        if (_li >= 0) {
          const _ws = (workflowStatus || '').toLowerCase();
          if (_ws === 'realizada') { _leads[_li].faseFunil = 'visitou'; _leads[_li].status = 'visitou'; }
          else if (_ws === 'confirmada') { _leads[_li].faseFunil = 'visita'; _leads[_li].status = 'visita'; }
          _leads[_li].atualizadoEm = new Date().toISOString();
          _fs.writeFileSync(_dataFile, JSON.stringify(_leads, null, 2));
          console.log('[PIPELINE] lead', _leadId, '->', _leads[_li].faseFunil);
        }
      }
    }
  } catch(_e) { console.error('[PIPELINE] erro:', _e.message); }

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
