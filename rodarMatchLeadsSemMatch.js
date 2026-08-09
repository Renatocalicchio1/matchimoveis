// Roda o motor de match pra todas as leads que ainda não geraram nenhum
// match — lógica em services/matchPendentes.js (reaproveitada pelo job
// diário às 6h em server.js). Rodar manualmente no Render Shell:
// node rodarMatchLeadsSemMatch.js
const { rodarMatchLeadsSemMatch } = require('./services/matchPendentes');

rodarMatchLeadsSemMatch()
  .then(() => process.exit(0))
  .catch(e => { console.error('[match-pendentes] erro fatal:', e.message); process.exit(1); });
