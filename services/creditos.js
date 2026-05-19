/**
 * services/creditos.js
 * R$1 = 100 créditos
 */

const { lerUsuarios, salvarTodosUsuarios } = require('./salvarUsuario');

// R$1 = 100 créditos | 1.000 créditos grátis no cadastro
const CUSTO = {
  cadastrar_imovel:       10,
  editar_imovel:           5,
  importar_xml:           20,
  gerar_xml_portal:       10,
  sync_xml_24h:            5,
  lead_ativo_dia:          2,
  ia_qualifica_lead:      10,
  match_encontrado:       15,
  vitrine_whatsapp:       20,
  ia_responde_whatsapp:    8,
  followup_auto:          10,
  visita_agendada_ia:     30,
  notificacao_prop:        5,
  confirmacao_auto:        5
};

async function consumir(userId, acao) {
  try {
    const custo = CUSTO[acao] || 10;
    const users = await lerUsuarios();
    const idx = users.findIndex(u => u.id === userId || u.userId === userId);
    if (idx < 0) return true;

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
    return true;
  } catch(e) {
    console.error('[creditos] Erro:', e.message);
    return true;
  }
}

async function adicionarCreditos(userId, quantidade, motivo = 'recarga') {
  try {
    const users = await lerUsuarios();
    const idx = users.findIndex(u => u.id === userId || u.userId === userId);
    if (idx < 0) return false;

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
