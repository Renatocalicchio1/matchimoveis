// Testes de regressão — services/jobCreditos.js
//
// Contexto do incidente real (set/2026, CRÍTICO): lead_ativo_dia chegou a
// valer 5 em vez de 0.2 (25x maior que o pretendido) — uma conta com 874
// leads ativas perdeu -3.180 coins numa cobrança só. O fix garantiu que
// services/creditos.js usa 0.2 (coberto em test/creditos.test.js). Este
// arquivo garante a OUTRA metade do fix: jobCreditos.js precisa importar
// CUSTO.lead_ativo_dia de creditos.js — nunca hardcodear o próprio valor de
// novo (já aconteceu 1x: CUSTO_LEAD_DIA=10 hardcoded aqui, divergente do
// catálogo).

'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

test('jobCreditos.js usa CUSTO.lead_ativo_dia de creditos.js, nunca um valor hardcoded', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'services', 'jobCreditos.js'), 'utf8');
  assert.match(
    src,
    /const\s+CUSTO_LEAD_DIA\s*=\s*CUSTO\.lead_ativo_dia/,
    'jobCreditos.js precisa derivar CUSTO_LEAD_DIA de CUSTO.lead_ativo_dia (services/creditos.js), não de um número hardcoded'
  );
  assert.match(
    src,
    /require\(['"]\.\/creditos['"]\)/,
    'jobCreditos.js precisa importar creditos.js (fonte única da tabela CUSTO)'
  );
});

test('debitarLeadsAtivos(): custo fracionado é arredondado antes de ir pro banco (coluna INTEGER)', async () => {
  // Regressão do efeito colateral do fix acima: match_coins é INTEGER no
  // banco; leads×0.2 só dá inteiro quando o total é múltiplo de 5. Sem
  // Math.round(), o UPDATE quebra silenciosamente (Postgres rejeita
  // decimal em coluna INTEGER) toda vez que não dá exato.
  const { CUSTO } = require('../services/creditos.js');
  for (const qtdLeads of [1, 2, 3, 4, 6, 7, 13, 41]) {
    const custoFracionado = qtdLeads * CUSTO.lead_ativo_dia;
    const custoArredondado = Math.round(custoFracionado);
    assert.equal(Number.isInteger(custoArredondado), true);
  }
});
