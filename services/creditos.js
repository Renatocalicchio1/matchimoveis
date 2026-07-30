/**
 * services/creditos.js
 * R$20 = 1.000 créditos
 */
const { lerUsuarios, salvarTodosUsuarios } = require('./salvarUsuario');

const CUSTO = {
  cadastrar_imovel:       15,
  editar_imovel:           0,
  importar_xml:            2,
  gerar_xml_portal:       10,
  sync_xml_24h:            5,
  lead_ativo_dia:          5,
  ia_qualifica_lead:      30,
  match_encontrado:       20,
  vitrine_whatsapp:       30,
  ia_responde_whatsapp:   30,
  followup_auto:          25,
  visita_agendada_ia:     40,
  notificacao_prop:       15,
  confirmacao_auto:       15,
  nova_lead:              20,
  importar_lead:          10,
  imovel_divulgado:        2,
  postar_instagram:       30
};

async function consumir(userId, acao) {
  try {
    const custo = CUSTO[acao] || 10;
    if (custo === 0) return true;
    const users = await lerUsuarios();
    // Resolve id legado para codigo_usuario atual
  let _resolvedId = userId;
  try {
    const { query: _qRes } = require('./db');
    const _rRes = await _qRes(
      "SELECT codigo_usuario FROM usuarios WHERE codigo_usuario=$1 OR dados->>'user_id_legado'=$1 LIMIT 1",
      [userId]
    );
    if (_rRes.rows.length > 0) _resolvedId = _rRes.rows[0].codigo_usuario;
  } catch(e2) { /* mantém userId original */ }
  const idx = users.findIndex(u => u.id === _resolvedId || u.codigo_usuario === _resolvedId || u.codigoUsuario === _resolvedId);
  if (idx < 0) { console.log('[creditos] usuario nao encontrado apos resolucao:', userId, '->', _resolvedId); return true; }
    const saldoAtual = users[idx].matchCoins || 0;
    if (saldoAtual <= 0) return false;
    users[idx].matchCoins = Math.max(0, saldoAtual - custo);
    if (!users[idx].matchCoinsTransacoes) users[idx].matchCoinsTransacoes = [];
    users[idx].matchCoinsTransacoes.push({
      data: new Date().toISOString(),
      motivo: acao,
      quantidade: -(saldoAtual - users[idx].matchCoins),
      saldoApos: users[idx].matchCoins
    });
    await salvarTodosUsuarios(users);

    // salva no PostgreSQL também
    try {
      const { query: _qCred } = require('./db');
      await _qCred(
        "UPDATE usuarios SET match_coins = $1 WHERE codigo_usuario = $2",
        [users[idx].matchCoins, _resolvedId]
      );
    } catch(e2) { console.error('[creditos] erro PG consumir:', e2.message); }

    // avisos de saldo baixo
    const saldoNovo = users[idx].matchCoins;
    const saldoMax = users[idx].matchCoinsTotal || 1000;
    try {
      const { criarNotificacao } = require('./salvarNotificacao');
      if(saldoNovo === 0){
        criarNotificacao({
          id: Date.now().toString(),
          tipo: 'saldo_zerado',
          titulo: 'Conta pausada',
          mensagem: 'Seus créditos acabaram. Adicione créditos para continuar usando a plataforma.',
          usuarioId: userId,
          lida: false,
          criadaEm: new Date().toLocaleString('pt-BR', {timeZone:'America/Sao_Paulo'})
        });
      } else if(saldoNovo <= 200 && saldoAtual > 200){
        criarNotificacao({
          id: (Date.now()+1).toString(),
          tipo: 'saldo_baixo',
          titulo: 'Créditos acabando',
          mensagem: 'Você tem apenas ' + saldoNovo + ' créditos. Recarregue para não pausar sua conta.',
          usuarioId: userId,
          lida: false,
          criadaEm: new Date().toLocaleString('pt-BR', {timeZone:'America/Sao_Paulo'})
        });
      } else if(saldoNovo <= 500 && saldoAtual > 500){
        criarNotificacao({
          id: (Date.now()+2).toString(),
          tipo: 'saldo_medio',
          titulo: 'Créditos na metade',
          mensagem: 'Você tem ' + saldoNovo + ' créditos restantes.',
          usuarioId: userId,
          lida: false,
          criadaEm: new Date().toLocaleString('pt-BR', {timeZone:'America/Sao_Paulo'})
        });
      }
    } catch(e2) {}

    return true;
  } catch(e) {
    console.error('[creditos] Erro:', e.message);
    return true;
  }
}

async function adicionarCreditos(userId, quantidade, motivo = 'recarga') {
  try {
    const users = await lerUsuarios();
    const idx = users.findIndex(u => u.id === userId || u.userId === userId || u.codigo_usuario === userId || u.codigoUsuario === userId);
    if (idx < 0){ console.log('[creditos] usuario nao encontrado:', userId); return false; }
    users[idx].matchCoins = (users[idx].matchCoins || 0) + quantidade;
    users[idx].matchCoinsTotal = (users[idx].matchCoinsTotal || 0) + quantidade;
    if (!users[idx].matchCoinsTransacoes) users[idx].matchCoinsTransacoes = [];
    users[idx].matchCoinsTransacoes.push({
      data: new Date().toISOString(),
      motivo,
      quantidade: +quantidade,
      saldoApos: users[idx].matchCoins
    });
    await salvarTodosUsuarios(users);

    // salva no PostgreSQL também (match_coins_total precisa ir junto, senão o %
    // usado nos alertas de saldo fica cada vez mais impreciso conforme recarrega)
    try {
      const { query: _qCredA } = require('./db');
      await _qCredA(
        "UPDATE usuarios SET match_coins = $1, match_coins_total = $2 WHERE codigo_usuario = $3",
        [users[idx].matchCoins, users[idx].matchCoinsTotal, userId]
      );
      console.log('[creditos] PG adicionarCreditos:', userId, users[idx].matchCoins);
    } catch(e2) { console.error('[creditos] erro PG adicionar:', e2.message); }

    return true;
  } catch(e) {
    console.error('[creditos] Erro:', e.message);
    return false;
  }
}

async function temSaldo(userId) {
  try {
    const users = await lerUsuarios();
    const u = users.find(u => u.id === userId || u.userId === userId);
    return (u?.matchCoins || 0) > 0;
  } catch(e) { return true; }
}

async function saldo(userId) {
  try {
    const users = await lerUsuarios();
    const u = users.find(u => u.id === userId || u.userId === userId);
    return u?.matchCoins || 0;
  } catch(e) { return 0; }
}

module.exports = { consumir, adicionarCreditos, temSaldo, saldo, CUSTO };
