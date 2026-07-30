/**
 * services/jobCreditos.js
 * Job diário: debita créditos por lead ativo (lead_ativo_dia) + alertas de saldo baixo.
 */

const { lerUsuarios, salvarTodosUsuarios } = require('./salvarUsuario');
const { lerLeads } = require('./salvarLead');
const { criarNotificacao } = require('./salvarNotificacao');
const { CUSTO } = require('./creditos');

const CUSTO_LEAD_DIA = CUSTO.lead_ativo_dia;

async function debitarLeadsAtivos() {
  try {
    const hoje = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' }); // 'YYYY-MM-DD'
    const users = await lerUsuarios();
    let alterou = false;

    for (let i = 0; i < users.length; i++) {
      const u = users[i];
      const uid = u.id || u.userId;
      if (!uid) continue;

      // Idempotência: já debitado hoje? pula. Evita cobrar de novo se o
      // servidor reiniciar mais de uma vez no mesmo dia (o job roda no boot).
      if (u.ultimoDebitoLeadsAtivos === hoje) continue;
      users[i].ultimoDebitoLeadsAtivos = hoje;
      alterou = true;

      const leads = await lerLeads(uid);
      const ativos = leads.filter(l =>
        l.status !== 'arquivado' &&
        l.status !== 'fechado' &&
        l.status !== 'perdido' &&
        !(l.leadOculta === true && !((l.matches||[]).length || (l.matchesBase||[]).length))
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

      // salvarUsuario() ignora match_coins de propósito no upsert (evita
      // sobrescrever saldo real com dado desatualizado) — precisa de UPDATE
      // direto, mesmo padrão usado em services/creditos.js
      try {
        const { query: _qJobCred } = require('./db');
        await _qJobCred('UPDATE usuarios SET match_coins = $1 WHERE codigo_usuario = $2', [novoSaldo, uid]);
      } catch(e2) { console.error('[jobCreditos] erro PG débito:', e2.message); }

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
    const hoje = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
    const users = await lerUsuarios();
    let alterou = false;

    for (let i = 0; i < users.length; i++) {
      const u = users[i];
      const uid = u.id || u.userId;
      const saldo = u.matchCoins || 0;

      // Idempotência: não repete o mesmo alerta mais de 1x por dia (evita spam
      // se o servidor reiniciar varias vezes, e nao faz sentido lembrar de hora em hora)
      if (u.ultimoAlertaSaldoEm === hoje) continue;

      // Limiar por saldo absoluto, não percentual do total historico comprado
      // (matchCoinsTotal cresce pra sempre a cada recarga -- usar % dele fazia
      // contas antigas com muitas recargas disparar "acabando" com saldo alto)
      let alerta = null;
      if (saldo === 0) {
        alerta = { tipo: 'conta_pausada', titulo: 'Conta pausada', mensagem: '⛔ Seus créditos acabaram. Adicione créditos para reativar sua conta.' };
      } else if (saldo <= 200) {
        alerta = { tipo: 'creditos_criticos', titulo: 'Créditos quase zerados', mensagem: '🔴 Créditos quase zerados! Recarregue agora para não pausar sua conta.' };
      } else if (saldo <= 1000) {
        alerta = { tipo: 'creditos_baixos', titulo: 'Créditos acabando', mensagem: '⚠️ Seus créditos estão acabando. Considere recarregar.' };
      }

      if (!alerta) continue;

      users[i].ultimoAlertaSaldoEm = hoje;
      alterou = true;

      await criarNotificacao({
        id: Date.now().toString() + '_' + uid,
        tipo: alerta.tipo,
        titulo: alerta.titulo,
        mensagem: alerta.mensagem,
        usuarioId: uid, lida: false,
        criadaEm: new Date().toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo'})
      });
    }

    if (alterou) await salvarTodosUsuarios(users);
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

  // Débito de leads ativos: só às 23:59 (horário de Brasília), uma vez por dia.
  // A trava de idempotência em debitarLeadsAtivos() garante que reinícios do
  // servidor no mesmo dia não disparem a cobrança de novo.
  function _proximo2359BR(agora) {
    const hojeSP = agora.toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
    let alvo = new Date(hojeSP + 'T23:59:00-03:00');
    if (alvo <= agora) {
      const amanhaSP = new Date(alvo.getTime() + 24*60*60*1000).toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
      alvo = new Date(amanhaSP + 'T23:59:00-03:00');
    }
    return alvo;
  }
  const _agora = new Date();
  const _proxima2359 = _proximo2359BR(_agora);
  const _msAte2359 = _proxima2359 - _agora;
  setTimeout(() => {
    debitarLeadsAtivos();
    setInterval(debitarLeadsAtivos, 24 * 60 * 60 * 1000);
  }, _msAte2359);
  // Roda uma vez no boot também — se o servidor tiver ficado fora do ar
  // durante a janela das 23:59, isso evita pular o dia inteiro sem cobrar.
  setTimeout(debitarLeadsAtivos, 10000);

  // Alertas de saldo baixo continuam checando no boot + a cada 24h
  setInterval(verificarAlertas, 24 * 60 * 60 * 1000);
  setTimeout(verificarAlertas, 15000);
}

module.exports = { iniciarJobCreditos, rodarJob, debitarLeadsAtivos, verificarAlertas };
