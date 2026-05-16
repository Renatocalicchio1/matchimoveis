const fs = require('fs');
const path = require('path');
const { aplicarWorkflowVisita } = require('./services/visitaWorkflow');

const DATA_DIR = process.env.DATA_DIR || __dirname;
const file = path.join(DATA_DIR, 'visitas.json');

if (!fs.existsSync(file)) {
  console.log('visitas.json não encontrado');
  process.exit(0);
}

const visitas = JSON.parse(fs.readFileSync(file, 'utf8'));
const atualizadas = visitas.map(v => aplicarWorkflowVisita(v));

fs.writeFileSync(file, JSON.stringify(atualizadas, null, 2));

console.log('VISITAS ATUALIZADAS COM WORKFLOW:', atualizadas.length);
console.log(atualizadas.map(v => ({
  id: v.id,
  cliente: v.nome,
  status: v.status,
  workflowStatus: v.workflowStatus,
  workflowResponsavel: v.workflowResponsavel,
  workflowProximaAcao: v.workflowProximaAcao
})));
