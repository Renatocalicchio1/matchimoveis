// Testes de regressão — Match Contínuo (ETAPA 4 de implementação, set/2026)
//
// Cobre só a parte pura e testável sem banco: o filtro de candidatas
// (leadsCandidatasParaImovel, cerebro/match-core.js) que decide quais leads
// vale a pena reavaliar quando um imóvel novo entra, ANTES de rodar o match
// completo (que consulta o banco por lead via _matchCaso2). O restante do
// fluxo (reavaliarImovelNovo) depende de Postgres — não testável neste
// ambiente sem DATABASE_URL; precisa de validação em staging/produção real
// antes de generalizar o gatilho pra outros pontos de entrada de imóvel.

'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const matchCore = require('../cerebro/match-core.js');
const { leadsCandidatasParaImovel } = matchCore;

function leadCom(mapaOverrides = {}, overrides = {}) {
  return {
    id: overrides.id || 'L1',
    tipoLead: overrides.tipoLead || 'cliente',
    mapaIntencao: {
      tipo_imovel: [{ valor: 'apartamento' }],
      estado: [{ valor: 'SP' }],
      ...mapaOverrides
    },
    ...overrides
  };
}

test('leadsCandidatasParaImovel: lead sem mapaIntencao.tipo_imovel é eliminada (nunca disse o que procura)', () => {
  const leads = [leadCom({ tipo_imovel: [] })];
  assert.equal(leadsCandidatasParaImovel(leads, 'SP').length, 0);
});

test('leadsCandidatasParaImovel: lead do tipo "corretor" (imóvel próprio na carteira, não cliente) é eliminada', () => {
  const leads = [leadCom({}, { tipoLead: 'corretor' })];
  assert.equal(leadsCandidatasParaImovel(leads, 'SP').length, 0);
});

test('leadsCandidatasParaImovel: mesmo estado (lead e imóvel) é candidata', () => {
  const leads = [leadCom({ estado: [{ valor: 'SP' }] })];
  assert.equal(leadsCandidatasParaImovel(leads, 'SP').length, 1);
});

test('leadsCandidatasParaImovel: estado diferente confirmado dos dois lados é eliminada (barato, antes do match caro)', () => {
  const leads = [leadCom({ estado: [{ valor: 'RJ' }] })];
  assert.equal(leadsCandidatasParaImovel(leads, 'SP').length, 0);
});

test('leadsCandidatasParaImovel: reconhece sigla e nome completo como o mesmo estado (São Paulo == SP)', () => {
  // Regressão de um bug real achado nesta sessão: a 1ª versão comparava
  // texto normalizado cru ("sao paulo" !== "sp"), eliminando candidata
  // válida antes até de tentar o match completo. Corrigido reaproveitando
  // _normalizarEstado (motor-intencao.js) — a MESMA normalização que
  // matchPorMapa usa de verdade, em vez de uma 2ª tabela sigla↔nome.
  const leadsNome = [leadCom({ estado: [{ valor: 'São Paulo' }] })];
  const leadsSigla = [leadCom({ estado: [{ valor: 'SP' }] })];
  assert.equal(leadsCandidatasParaImovel(leadsNome, 'SP').length, 1, 'lead com "São Paulo" deveria bater com imóvel "SP"');
  assert.equal(leadsCandidatasParaImovel(leadsSigla, 'São Paulo').length, 1, 'lead com "SP" deveria bater com imóvel "São Paulo"');
});

test('leadsCandidatasParaImovel: sem estado no imóvel deixa passar (não elimina por falta de dado)', () => {
  const leads = [leadCom({ estado: [{ valor: 'RJ' }] })];
  assert.equal(leadsCandidatasParaImovel(leads, '').length, 1);
});

test('leadsCandidatasParaImovel: sem estado na lead (usa cidade.estado como fallback) e imóvel com estado — deixa passar se não conseguir resolver', () => {
  const leads = [leadCom({ estado: [] })];
  assert.equal(leadsCandidatasParaImovel(leads, 'SP').length, 1);
});

test('leadsCandidatasParaImovel: array vazio ou nulo não quebra, retorna vazio', () => {
  assert.deepEqual(leadsCandidatasParaImovel([], 'SP'), []);
  assert.deepEqual(leadsCandidatasParaImovel(null, 'SP'), []);
  assert.deepEqual(leadsCandidatasParaImovel([null, undefined, leadCom()], 'SP').length, 1);
});

test('leadsCandidatasParaImovel: filtra corretamente uma lista mista de várias leads', () => {
  const leads = [
    leadCom({}, { id: 'A' }),                                   // SP, tipo ok — candidata
    leadCom({ estado: [{ valor: 'RJ' }] }, { id: 'B' }),        // RJ x SP — eliminada
    leadCom({ tipo_imovel: [] }, { id: 'C' }),                   // sem tipo — eliminada
    leadCom({}, { id: 'D', tipoLead: 'corretor' }),              // é o próprio corretor — eliminada
    leadCom({}, { id: 'E' }),                                    // SP, tipo ok — candidata
  ];
  const r = leadsCandidatasParaImovel(leads, 'SP');
  assert.deepEqual(r.map(l => l.id).sort(), ['A', 'E']);
});

test('reavaliarImovelNovo: sem imóvel ou sem userId retorna resultado zerado sem lançar erro', async () => {
  assert.deepEqual(await matchCore.reavaliarImovelNovo(null, 'U1'), { avaliadas: 0, novosMatches: 0 });
  assert.deepEqual(await matchCore.reavaliarImovelNovo({ id: 'IM1' }, null), { avaliadas: 0, novosMatches: 0 });
});
