/**
 * services/jobCreditos.js
 * Job diário: debita 10 créditos por lead ativo + alertas de saldo baixo.
 */

const { lerUsuarios, salvarTodosUsuarios } = require('./salvarUsuario');
const { lerLeads } = require('./salvarLead');
const { criarNotificacao } = require('./salvarNotificacao');

const CUSTO_LEAD_DIA = 10;

async function debitarLeadsAtivos() {
  try {
    const users = await lerUsuarios();
    let alterou = false;

    for (let i = 0; i < users.length; i++) {
      const u = users[i];
      const uid = u.id || u.userId;
      if (!uid) continue;

      const leads = lerLeads(uid);
      const ativos = leads.filter(l =>
        l.status !== 'arquivado' &&
        l.status !== 'fechado' &&
        l.status !== 'perdido'
      );

      if (ativos.length === 0) continue;

      const custo = ativos.length * CUSTO_LEAD_DIA;
      const saldoAtual = users[i].matchCoins || 0;
      const debitado = Math.min(custo, saldoAtual);
      const novoSaldo = Math.max(0, saldoAtual - custo);

      users[i].matchCoins = novoSaldo;
      if (!users[i].matchCoinsTransacoes) users[i].matchCoinsTransacoes = [];
      users[i].matchCoinsTransacoes.push({
        data: new Date().toISOString(),
        motivo: `${ativos.length} leads ativos`,
        quantidade: -debitado,
        saldoApos: novoSaldo
      });

      console.log(`[jobCreditos] ${u.nome || uid}: -${debitado} créditos (${ativos.length} leads) → saldo: ${novoSaldo}`);
      alterou = true;
    }

    if (alterou) await salvarTodosUsuarios(users);
  } catch(e) {
    console.error('[jobCreditos] Erro débito:', e.message);
  }
}

async function verificarAlertas() {
  try {
    const users = await lerUsuarios();

    for (const u of users) {
      const uid = u.id || u.userId;
      const saldo = u.matchCoins || 0;
      const total = Math.max(u.matchCoinsTotal || 1000, saldo, 1);
      const pct = Math.round((saldo / total) * 100);

      if (saldo === 0) {
        await criarNotificacao(uid, 'conta_pausada',
          '⛔ Seus créditos acabaram. Adicione créditos para reativar sua conta.', { pct });
      } else if (pct <= 10) {
        await criarNotificacao(uid, 'creditos_criticos',
          '🔴 Créditos quase zerados! Recarregue agora para não pausar sua conta.', { pct });
      } else if (pct <= 30) {
        await criarNotificacao(uid, 'creditos_baixos',
          '⚠️ Seus créditos estão acabando. Considere recarregar.', { pct });
      }
    }
  } catch(e) {
    console.error('[jobCreditos] Erro alertas:', e.message);
  }
}

async function rodarJob() {
  console.log('[jobCreditos] 🔄 Rodando job diário...');
  await debitarLeadsAtivos();
  await verificarAlertas();
  console.log('[jobCreditos] ✅ Job concluído');
}

function iniciarJobCreditos() {
  console.log('[jobCreditos] ⏱️ Job diário de créditos iniciado');
  setInterval(rodarJob, 24 * 60 * 60 * 1000);
  setTimeout(rodarJob, 10000);
}

module.exports = { iniciarJobCreditos, rodarJob, debitarLeadsAtivos, verificarAlertas };
