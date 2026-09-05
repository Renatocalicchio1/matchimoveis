// Testes de regressão — Next Best Action (ETAPA 5 de implementação, set/2026)
// services/nextBestAction.js — regras determinísticas puras, sem banco.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { avaliarPrioridade, compararPrioridade, PRIORIDADE } = require('../services/nextBestAction.js');

test('visita_pendente: sempre alta, independente de contexto', () => {
  assert.equal(avaliarPrioridade('visita_pendente').prioridade, PRIORIDADE.ALTA);
  assert.equal(avaliarPrioridade('visita_pendente', {}).prioridade, PRIORIDADE.ALTA);
  assert.ok(avaliarPrioridade('visita_pendente').motivo.length > 0, 'precisa explicar "por que estou vendo isso"');
});

test('lead_quente_sem_contato: escala pra alta com 4h+ sem contato, média abaixo disso', () => {
  assert.equal(avaliarPrioridade('lead_quente_sem_contato', { horasSemContato: 1 }).prioridade, PRIORIDADE.MEDIA);
  assert.equal(avaliarPrioridade('lead_quente_sem_contato', { horasSemContato: 3.9 }).prioridade, PRIORIDADE.MEDIA);
  assert.equal(avaliarPrioridade('lead_quente_sem_contato', { horasSemContato: 4 }).prioridade, PRIORIDADE.ALTA);
  assert.equal(avaliarPrioridade('lead_quente_sem_contato', { horasSemContato: 24 }).prioridade, PRIORIDADE.ALTA);
});

test('match_novo: alta só com score >= 80, média sem score ou score baixo', () => {
  assert.equal(avaliarPrioridade('match_novo', { score: 95 }).prioridade, PRIORIDADE.ALTA);
  assert.equal(avaliarPrioridade('match_novo', { score: 80 }).prioridade, PRIORIDADE.ALTA);
  assert.equal(avaliarPrioridade('match_novo', { score: 79 }).prioridade, PRIORIDADE.MEDIA);
  assert.equal(avaliarPrioridade('match_novo', { score: 40 }).prioridade, PRIORIDADE.MEDIA);
  assert.equal(avaliarPrioridade('match_novo', {}).prioridade, PRIORIDADE.MEDIA, 'sem score não deveria penalizar pra baixa');
});

test('cliente_parado: sempre média', () => {
  assert.equal(avaliarPrioridade('cliente_parado', { diasParado: 10 }).prioridade, PRIORIDADE.MEDIA);
  assert.equal(avaliarPrioridade('cliente_parado', { diasParado: 60 }).prioridade, PRIORIDADE.MEDIA);
});

test('xml_desatualizado: sempre baixa', () => {
  assert.equal(avaliarPrioridade('xml_desatualizado', { horasSemSync: 48 }).prioridade, PRIORIDADE.BAIXA);
});

test('sinal desconhecido: nunca quebra, cai em baixa com motivo vazio', () => {
  const r = avaliarPrioridade('sinal_que_nao_existe', { qualquer: 'coisa' });
  assert.equal(r.prioridade, PRIORIDADE.BAIXA);
  assert.equal(r.motivo, '');
});

test('todo motivo não-vazio é uma frase legível (string, não objeto/undefined)', () => {
  const sinais = ['visita_pendente', 'lead_quente_sem_contato', 'match_novo', 'cliente_parado', 'xml_desatualizado'];
  for (const s of sinais) {
    const r = avaliarPrioridade(s, { horasSemContato: 5, score: 90, diasParado: 5, horasSemSync: 30 });
    assert.equal(typeof r.motivo, 'string');
    assert.ok(r.motivo.length > 5, `motivo de "${s}" deveria ser uma frase de verdade, veio: "${r.motivo}"`);
  }
});

test('compararPrioridade: alta vem antes de média, média antes de baixa', () => {
  const alta = { prioridade: 'alta' };
  const media = { prioridade: 'media' };
  const baixa = { prioridade: 'baixa' };
  assert.ok(compararPrioridade(alta, media) < 0);
  assert.ok(compararPrioridade(media, baixa) < 0);
  assert.ok(compararPrioridade(alta, baixa) < 0);
  assert.equal(compararPrioridade(alta, alta), 0);
});

test('compararPrioridade: card sem prioridade nunca vem antes de um com prioridade definida', () => {
  const semPrioridade = {};
  const baixa = { prioridade: 'baixa' };
  assert.ok(compararPrioridade(semPrioridade, baixa) > 0);
});
