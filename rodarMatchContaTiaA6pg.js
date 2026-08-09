// Roda o motor de match só pras leads da conta TIA-A6PG que ainda não
// geraram nenhum match E nunca receberam vitrine — reaproveita
// services/matchPendentes.js (mesma lógica do job diário), só restringindo
// por conta + exigindo vitrine_enviada=false.
//
// Rodar no Render Shell: node rodarMatchContaTiaA6pg.js
const { rodarMatchLeadsSemMatch } = require('./services/matchPendentes');

rodarMatchLeadsSemMatch({ userId: 'TIA-A6PG', semVitrine: true })
  .then(() => process.exit(0))
  .catch(e => { console.error('[match-pendentes] erro fatal:', e.message); process.exit(1); });
