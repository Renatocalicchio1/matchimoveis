// Testes de regressão — services/creditos.js
//
// Por que este arquivo existe: 2 incidentes reais já ocorreram aqui
// (lead_ativo_dia cobrando 25x mais que o pretendido, zerou o saldo de uma
// conta real numa cobrança só; match_coins_total historicamente ficou fora
// de sincronia com match_coins). Este arquivo trava esses dois
// comportamentos e o resto da aritmética de débito/crédito, pra nenhum dos
// dois voltar a acontecer sem que a suíte quebre primeiro.
//
// Isolamento: neste ambiente não há DATABASE_URL configurada, então
// services/salvarUsuario.js cai no fallback de JSON (users.json na raiz do
// repo) e services/salvarNotificacao.js faz o mesmo (notificacoes.json).
// Os testes abaixo fazem backup do conteúdo real desses arquivos antes de
// cada teste e restauram no finally, mesmo se o teste falhar — nenhum
// dado local fica alterado depois da suíte rodar.

'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const USERS_PATH = path.join(__dirname, '..', 'users.json');
const NOTIF_PATH = path.join(__dirname, '..', 'notificacoes.json');

function lerBackup(p) {
  return fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : null;
}
function restaurar(p, conteudoOriginal) {
  if (conteudoOriginal === null) {
    if (fs.existsSync(p)) fs.unlinkSync(p);
  } else {
    fs.writeFileSync(p, conteudoOriginal, 'utf8');
  }
}

async function comUsuarioIsolado(usuarioSeed, fn) {
  const backupUsers = lerBackup(USERS_PATH);
  const backupNotif = lerBackup(NOTIF_PATH);
  try {
    fs.writeFileSync(USERS_PATH, JSON.stringify([usuarioSeed], null, 2), 'utf8');
    if (fs.existsSync(NOTIF_PATH)) fs.writeFileSync(NOTIF_PATH, '[]', 'utf8');
    // Recarrega os módulos a cada teste pra não vazar estado de cache entre eles
    delete require.cache[require.resolve('../services/creditos.js')];
    delete require.cache[require.resolve('../services/salvarUsuario.js')];
    delete require.cache[require.resolve('../services/salvarNotificacao.js')];
    delete require.cache[require.resolve('../services/storage.js')];
    const creditos = require('../services/creditos.js');
    await fn(creditos);
  } finally {
    restaurar(USERS_PATH, backupUsers);
    restaurar(NOTIF_PATH, backupNotif);
  }
}

function usuarioBase(overrides = {}) {
  return {
    id: 'TEST-USER-01',
    codigo_usuario: 'TEST-USER-01',
    nome: 'Corretor de Teste',
    matchCoins: 1000,
    matchCoinsTotal: 1000,
    matchCoinsTransacoes: [],
    ...overrides
  };
}

function lerUsuarioSalvo() {
  const arr = JSON.parse(fs.readFileSync(USERS_PATH, 'utf8'));
  return arr.find(u => u.id === 'TEST-USER-01');
}

// ─────────────────────────────────────────────────────────
// 1. Integridade da tabela CUSTO — guarda contra valor hardcoded errado
// ─────────────────────────────────────────────────────────

test('CUSTO: todo valor é um número finito e não-negativo', async () => {
  const { CUSTO } = require('../services/creditos.js');
  for (const [acao, valor] of Object.entries(CUSTO)) {
    assert.equal(typeof valor, 'number', `CUSTO.${acao} deveria ser number`);
    assert.ok(Number.isFinite(valor), `CUSTO.${acao} não pode ser NaN/Infinity`);
    assert.ok(valor >= 0, `CUSTO.${acao} não pode ser negativo`);
  }
});

test('CUSTO.lead_ativo_dia continua < 1 — regressão do incidente de set/2026 (25x)', async () => {
  // Histórico real: chegou a valer 5 (deveria ser 0.2), 25x maior que o
  // pretendido — uma conta com 874 leads ativas perdeu -3.180 coins numa
  // cobrança só. É o ÚNICO custo recorrente (1x/dia por lead ativa, não por
  // ação única) — por isso tem que ficar sempre bem menor que os custos de
  // ação única, senão qualquer carteira grande zera o saldo sozinha.
  const { CUSTO } = require('../services/creditos.js');
  assert.equal(CUSTO.lead_ativo_dia, 0.2);
  assert.ok(CUSTO.lead_ativo_dia < 1, 'custo recorrente diário não pode se aproximar do custo de uma ação única');
});

test('CUSTO.editar_imovel continua 0 — editar não deveria cobrar', async () => {
  const { CUSTO } = require('../services/creditos.js');
  assert.equal(CUSTO.editar_imovel, 0);
});

// ─────────────────────────────────────────────────────────
// 2. consumir() — débito de ação única
// ─────────────────────────────────────────────────────────

test('consumir(): debita exatamente CUSTO[acao] e registra a transação', async () => {
  await comUsuarioIsolado(usuarioBase({ matchCoins: 1000 }), async (creditos) => {
    const ok = await creditos.consumir('TEST-USER-01', 'cadastrar_imovel');
    assert.equal(ok, true);
    const u = lerUsuarioSalvo();
    assert.equal(u.matchCoins, 1000 - creditos.CUSTO.cadastrar_imovel);
    assert.equal(u.matchCoinsTransacoes.length, 1);
    assert.equal(u.matchCoinsTransacoes[0].motivo, 'cadastrar_imovel');
    assert.equal(u.matchCoinsTransacoes[0].quantidade, -creditos.CUSTO.cadastrar_imovel);
  });
});

test('consumir(): ação sem custo definido usa fallback de 10, nunca cobra 0 por engano', async () => {
  await comUsuarioIsolado(usuarioBase({ matchCoins: 1000 }), async (creditos) => {
    await creditos.consumir('TEST-USER-01', 'acao_que_nao_existe_no_catalogo');
    const u = lerUsuarioSalvo();
    assert.equal(u.matchCoins, 990);
  });
});

test('consumir(): custo 0 (editar_imovel) retorna true sem tocar no saldo', async () => {
  await comUsuarioIsolado(usuarioBase({ matchCoins: 500 }), async (creditos) => {
    const ok = await creditos.consumir('TEST-USER-01', 'editar_imovel');
    assert.equal(ok, true);
    const u = lerUsuarioSalvo();
    assert.equal(u.matchCoins, 500);
    assert.equal((u.matchCoinsTransacoes || []).length, 0);
  });
});

test('consumir(): saldo zerado retorna false e não desconta (não fica negativo)', async () => {
  await comUsuarioIsolado(usuarioBase({ matchCoins: 0 }), async (creditos) => {
    const ok = await creditos.consumir('TEST-USER-01', 'cadastrar_imovel');
    assert.equal(ok, false);
    const u = lerUsuarioSalvo();
    assert.equal(u.matchCoins, 0);
  });
});

test('consumir(): saldo menor que o custo da ação nunca fica negativo (floor em 0)', async () => {
  await comUsuarioIsolado(usuarioBase({ matchCoins: 3 }), async (creditos) => {
    // vitrine_whatsapp custa 15 — saldo de 3 não cobre
    await creditos.consumir('TEST-USER-01', 'vitrine_whatsapp');
    const u = lerUsuarioSalvo();
    assert.equal(u.matchCoins, 0);
    assert.ok(u.matchCoins >= 0);
  });
});

// ─────────────────────────────────────────────────────────
// 3. consumirLote() — débito em lote (ex: importação de XML)
// ─────────────────────────────────────────────────────────

test('consumirLote(): debita custoUnitário × qtd numa única transação (não 1 por item)', async () => {
  await comUsuarioIsolado(usuarioBase({ matchCoins: 1000 }), async (creditos) => {
    const custoUnit = creditos.CUSTO.importar_xml;
    await creditos.consumirLote('TEST-USER-01', 'importar_xml', 200);
    const u = lerUsuarioSalvo();
    assert.equal(u.matchCoins, 1000 - custoUnit * 200);
    assert.equal(u.matchCoinsTransacoes.length, 1, 'deveria gravar 1 entrada só, não 1 por imóvel importado');
    assert.equal(u.matchCoinsTransacoes[0].itens, 200);
  });
});

test('consumirLote(): satura no saldo disponível, nunca fica negativo', async () => {
  await comUsuarioIsolado(usuarioBase({ matchCoins: 10 }), async (creditos) => {
    await creditos.consumirLote('TEST-USER-01', 'importar_xml', 200); // custo total >> 10
    const u = lerUsuarioSalvo();
    assert.equal(u.matchCoins, 0);
  });
});

// ─────────────────────────────────────────────────────────
// 4. adicionarCreditos() — regressão do bug "match_coins_total não sincronizava"
// ─────────────────────────────────────────────────────────

test('adicionarCreditos(): incrementa matchCoins E matchCoinsTotal juntos', async () => {
  await comUsuarioIsolado(usuarioBase({ matchCoins: 100, matchCoinsTotal: 100 }), async (creditos) => {
    const ok = await creditos.adicionarCreditos('TEST-USER-01', 500, 'recarga');
    assert.equal(ok, true);
    const u = lerUsuarioSalvo();
    assert.equal(u.matchCoins, 600);
    assert.equal(u.matchCoinsTotal, 600, 'match_coins_total tem que acompanhar match_coins na recarga');
  });
});

// ─────────────────────────────────────────────────────────
// 5. debitarCreditos() — débito manual de admin
// ─────────────────────────────────────────────────────────

test('debitarCreditos(): nunca deixa o saldo negativo mesmo pedindo mais que o disponível', async () => {
  await comUsuarioIsolado(usuarioBase({ matchCoins: 50 }), async (creditos) => {
    await creditos.debitarCreditos('TEST-USER-01', 500, 'debito_admin');
    const u = lerUsuarioSalvo();
    assert.equal(u.matchCoins, 0);
  });
});

// ─────────────────────────────────────────────────────────
// 6. saldo()/temSaldo()
// ─────────────────────────────────────────────────────────

test('saldo() e temSaldo() refletem o estado atual do usuário', async () => {
  await comUsuarioIsolado(usuarioBase({ matchCoins: 42 }), async (creditos) => {
    // saldo()/temSaldo() buscam por u.id/u.userId — o seed usa `id`
    assert.equal(await creditos.saldo('TEST-USER-01'), 42);
    assert.equal(await creditos.temSaldo('TEST-USER-01'), true);
  });
  await comUsuarioIsolado(usuarioBase({ matchCoins: 0 }), async (creditos) => {
    assert.equal(await creditos.temSaldo('TEST-USER-01'), false);
  });
});
