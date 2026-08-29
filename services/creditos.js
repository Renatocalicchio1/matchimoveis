/**
 * services/creditos.js
 * R$20 = 1.000 créditos
 */
const { lerUsuarios, salvarTodosUsuarios } = require('./salvarUsuario');

// Bônus de boas-vindas de toda conta nova — 1.000 → 5.000 (ago/2026) → 2.500
// (ago/2026, pedido do Renato: "baixar de cinco mil pra dois mil e
// quinhentos"). Usado em 2 sentidos nos vários pontos de cadastro
// (server.js): (1) o valor em si, dado na criação da conta; (2) o limiar
// "match_coins_total > BONUS_CADASTRO" usado em vários lugares (funil de
// conta, filtros do admin, e-mail de reengajamento, follow-up 3 de campanha)
// pra distinguir quem só tem o bônus de quem já comprou de verdade — os dois
// sentidos têm que usar a MESMA constante, senão toda conta nova passa a
// contar como "já comprou" sem nunca ter pago nada (achado quando isso
// mudou de 1000 pra 5000: eram ~10 lugares com o número espalhado).
const BONUS_CADASTRO = 2500;

// Bônus instantâneo pro afiliado/indicador quando alguém se cadastra pelo
// link dele — baixou de 300 pra 100 (ago/2026, pedido do Renato: "os
// afiliados ganham 100 créditos quando alguém novo se cadastrar e não mais
// 300"). Constante única porque o mesmo valor aparece em 2 lugares
// funcionais (POST /login e /entrar/:contatoId, ambos chamam
// adicionarCreditos + atualizam o cache em memória) e em 4 textos de copy
// (notificação de indicação nas duas rotas, mensagem de /api/indicacao/lembrete,
// texto de compartilhar WhatsApp em app-afiliados.ejs).
const BONUS_INDICACAO = 100;

// Valores ajustados conforme tabela "Como seus créditos são usados" (ago/2026)
const CUSTO = {
  cadastrar_imovel:       10,
  editar_imovel:           0,
  importar_xml:            2,
  gerar_xml_portal:       10,
  sync_xml_24h:            5,
  lead_ativo_dia:          5,
  ia_qualifica_lead:      15,
  match_encontrado:       15,
  vitrine_whatsapp:       15,
  ia_responde_whatsapp:   20,
  followup_auto:          20,
  visita_agendada_ia:     25,
  notificacao_prop:       15,
  confirmacao_auto:       15,
  nova_lead:              15,
  importar_lead:          15,
  imovel_divulgado:       10,
  postar_instagram:       15,
  campanha_meta_criada:   15,
  lead_meta_recebido:     15,
  email_lead:             15
};

// O webhook do WhatsApp (/webhook/whatsapp) não checa saldo antes de responder —
// o débito de coins acontece depois que a IA já processou/respondeu, sem
// bloquear nada. Sem isso, o assistente seguia respondendo lead de graça mesmo
// com a conta zerada; só o painel web bloqueava. Desconecta a instância na
// Evolution API (mesma chamada de POST /app/whatsapp/desconectar) assim que o
// saldo cruza pra zero — dispara só 1x nesse débito exato, não fica tentando
// de novo enquanto o saldo continuar zerado (a próxima recarga reconecta
// normalmente pelo fluxo manual de reconexão).
async function _desconectarWhatsappSeZerado(codigoUsuario) {
  try {
    const { query: _qWA } = require('./db');
    const r = await _qWA('SELECT whatsapp_instance, whatsapp_status FROM usuarios WHERE codigo_usuario=$1 LIMIT 1', [codigoUsuario]);
    const row = r.rows[0];
    if (!row || !row.whatsapp_instance || row.whatsapp_status !== 'open') return;
    const EVOLUTION_URL = process.env.EVOLUTION_URL || 'https://match-evolution-api.onrender.com';
    const EVOLUTION_KEY = process.env.EVOLUTION_KEY || 'match2025evolution';
    await fetch(EVOLUTION_URL + '/instance/logout/' + row.whatsapp_instance, {
      method: 'DELETE', headers: { 'apikey': EVOLUTION_KEY }
    });
    await _qWA("UPDATE usuarios SET whatsapp_status='close', atualizado_em=NOW() WHERE codigo_usuario=$1", [codigoUsuario]);
    const { criarNotificacao } = require('./salvarNotificacao');
    await criarNotificacao({
      id: Date.now().toString() + '_wadc',
      tipo: 'saldo_zerado',
      titulo: 'WhatsApp desconectado',
      mensagem: 'Seus créditos acabaram e o WhatsApp foi desconectado automaticamente. Recarregue e reconecte pra voltar a receber leads por lá.',
      usuarioId: codigoUsuario,
      lida: false,
      criadaEm: new Date().toLocaleString('pt-BR', {timeZone:'America/Sao_Paulo'})
    });
    console.log('[creditos] whatsapp desconectado por saldo zerado:', codigoUsuario);
  } catch(e) { console.error('[creditos] erro ao desconectar whatsapp por saldo zerado:', e.message); }
}

// Rede de segurança (ago/2026): pega toda conta com saldo zerado que ainda
// está com WhatsApp conectado — casos que a checagem "no momento do débito"
// (dentro de consumir/consumirLote/debitarLeadsAtivos, todas só disparam
// quando o saldo CRUZA pra zero naquele exato débito) não cobre: reconectar
// manualmente depois de já estar zerado, ou zerar por um caminho que não
// passa por nenhuma dessas funções. Roda 1x/dia (ver iniciarJobCreditos em
// jobCreditos.js). Reaproveita _desconectarWhatsappSeZerado(), que já
// confere status==='open' antes de fazer qualquer coisa — seguro chamar
// mesmo pra quem já estiver desconectado.
async function desconectarWhatsappContasSemCredito() {
  try {
    const { query: _qSweep } = require('./db');
    const { rows } = await _qSweep(
      `SELECT codigo_usuario FROM usuarios WHERE COALESCE(match_coins,0) <= 0 AND whatsapp_status='open' AND whatsapp_instance IS NOT NULL AND whatsapp_instance != ''`
    );
    for (const r of rows) {
      await _desconectarWhatsappSeZerado(r.codigo_usuario);
    }
    if (rows.length) console.log('[creditos] varredura diária: desconectou WhatsApp de', rows.length, 'conta(s) sem crédito');
  } catch(e) { console.error('[creditos] erro na varredura de whatsapp sem credito:', e.message); }
}

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
        "UPDATE usuarios SET match_coins = $1, atualizado_em=NOW() WHERE codigo_usuario = $2",
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
        _desconectarWhatsappSeZerado(_resolvedId).catch(()=>{});
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

// Debita o custo de várias unidades da mesma ação numa tacada só (ex: 200 imóveis
// importados de um XML) — gera UMA entrada no histórico com o total, em vez de
// uma entrada por item (o que inundava /app/coins com dezenas de linhas "-2").
async function consumirLote(userId, acao, qtd) {
  try {
    if (!qtd || qtd <= 0) return true;
    const custoUnit = CUSTO[acao] || 10;
    if (custoUnit === 0) return true;
    const custoTotal = custoUnit * qtd;
    const users = await lerUsuarios();
    let _resolvedId = userId;
    try {
      const { query: _qRes } = require('./db');
      const _rRes = await _qRes(
        "SELECT codigo_usuario FROM usuarios WHERE codigo_usuario=$1 OR dados->>'user_id_legado'=$1 LIMIT 1",
        [userId]
      );
      if (_rRes.rows.length > 0) _resolvedId = _rRes.rows[0].codigo_usuario;
    } catch (e2) { /* mantém userId original */ }
    const idx = users.findIndex(u => u.id === _resolvedId || u.codigo_usuario === _resolvedId || u.codigoUsuario === _resolvedId);
    if (idx < 0) { console.log('[creditos] usuario nao encontrado apos resolucao:', userId, '->', _resolvedId); return true; }
    const saldoAtual = users[idx].matchCoins || 0;
    if (saldoAtual <= 0) return false;
    const debito = Math.min(saldoAtual, custoTotal);
    users[idx].matchCoins = Math.max(0, saldoAtual - debito);
    if (!users[idx].matchCoinsTransacoes) users[idx].matchCoinsTransacoes = [];
    users[idx].matchCoinsTransacoes.push({
      data: new Date().toISOString(),
      motivo: acao,
      itens: qtd,
      quantidade: -debito,
      saldoApos: users[idx].matchCoins
    });
    await salvarTodosUsuarios(users);

    try {
      const { query: _qCred } = require('./db');
      await _qCred(
        "UPDATE usuarios SET match_coins = $1, atualizado_em=NOW() WHERE codigo_usuario = $2",
        [users[idx].matchCoins, _resolvedId]
      );
    } catch (e2) { console.error('[creditos] erro PG consumirLote:', e2.message); }

    const saldoNovo = users[idx].matchCoins;
    try {
      const { criarNotificacao } = require('./salvarNotificacao');
      if (saldoNovo === 0) {
        criarNotificacao({ id: Date.now().toString(), tipo: 'saldo_zerado', titulo: 'Conta pausada', mensagem: 'Seus créditos acabaram. Adicione créditos para continuar usando a plataforma.', usuarioId: userId, lida: false, criadaEm: new Date().toLocaleString('pt-BR', {timeZone:'America/Sao_Paulo'}) });
        _desconectarWhatsappSeZerado(_resolvedId).catch(()=>{});
      } else if (saldoNovo <= 200 && saldoAtual > 200) {
        criarNotificacao({ id: (Date.now()+1).toString(), tipo: 'saldo_baixo', titulo: 'Créditos acabando', mensagem: 'Você tem apenas ' + saldoNovo + ' créditos. Recarregue para não pausar sua conta.', usuarioId: userId, lida: false, criadaEm: new Date().toLocaleString('pt-BR', {timeZone:'America/Sao_Paulo'}) });
      } else if (saldoNovo <= 500 && saldoAtual > 500) {
        criarNotificacao({ id: (Date.now()+2).toString(), tipo: 'saldo_medio', titulo: 'Créditos na metade', mensagem: 'Você tem ' + saldoNovo + ' créditos restantes.', usuarioId: userId, lida: false, criadaEm: new Date().toLocaleString('pt-BR', {timeZone:'America/Sao_Paulo'}) });
      }
    } catch (e2) {}

    return true;
  } catch (e) {
    console.error('[creditos] Erro consumirLote:', e.message);
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
        "UPDATE usuarios SET match_coins = $1, match_coins_total = $2, atualizado_em=NOW() WHERE codigo_usuario = $3",
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

// Débito de quantidade arbitrária (não amarrado a uma ação com custo fixo em
// CUSTO) — usado pelo admin em /admin/demanda pra debitar da conta escolhida
// o equivalente em créditos de um combo, quando os leads são entregues sem
// passar pelo Mercado Pago. Não bloqueia por saldo insuficiente (é uma ação
// de admin, não um consumo de plataforma) — só nunca deixa o saldo negativo.
async function debitarCreditos(userId, quantidade, motivo = 'debito_admin') {
  try {
    const users = await lerUsuarios();
    let _resolvedId = userId;
    try {
      const { query: _qResD } = require('./db');
      const _rResD = await _qResD(
        "SELECT codigo_usuario FROM usuarios WHERE codigo_usuario=$1 OR dados->>'user_id_legado'=$1 LIMIT 1",
        [userId]
      );
      if (_rResD.rows.length > 0) _resolvedId = _rResD.rows[0].codigo_usuario;
    } catch(e2) { /* mantém userId original */ }
    const idx = users.findIndex(u => u.id === _resolvedId || u.codigo_usuario === _resolvedId || u.codigoUsuario === _resolvedId);
    if (idx < 0) { console.log('[creditos] usuario nao encontrado para debitarCreditos:', userId); return false; }
    const saldoAtual = users[idx].matchCoins || 0;
    users[idx].matchCoins = Math.max(0, saldoAtual - quantidade);
    if (!users[idx].matchCoinsTransacoes) users[idx].matchCoinsTransacoes = [];
    users[idx].matchCoinsTransacoes.push({
      data: new Date().toISOString(),
      motivo,
      quantidade: -(saldoAtual - users[idx].matchCoins),
      saldoApos: users[idx].matchCoins
    });
    await salvarTodosUsuarios(users);

    try {
      const { query: _qCredD } = require('./db');
      await _qCredD(
        "UPDATE usuarios SET match_coins = $1, atualizado_em=NOW() WHERE codigo_usuario = $2",
        [users[idx].matchCoins, _resolvedId]
      );
    } catch(e2) { console.error('[creditos] erro PG debitarCreditos:', e2.message); }

    // Faltava aqui (ago/2026) — consumir()/consumirLote() já desconectavam o
    // WhatsApp ao zerar o saldo, mas esse débito manual de admin (usado em
    // /admin/demanda/transferir) não tinha o mesmo gatilho.
    if (users[idx].matchCoins === 0 && saldoAtual > 0) {
      _desconectarWhatsappSeZerado(_resolvedId).catch(()=>{});
    }

    return true;
  } catch(e) {
    console.error('[creditos] Erro debitarCreditos:', e.message);
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

module.exports = { consumir, consumirLote, adicionarCreditos, debitarCreditos, temSaldo, saldo, CUSTO, BONUS_CADASTRO, BONUS_INDICACAO, _desconectarWhatsappSeZerado, desconectarWhatsappContasSemCredito };
