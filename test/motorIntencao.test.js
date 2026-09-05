// Testes de regressão — cerebro/motor-intencao.js (matchPorMapa)
//
// Motor de Match é o "coração do sistema" (Raio-X + Conselho Técnico já
// mapearam os critérios eliminatórios e os pesos de score). Este arquivo
// trava o comportamento documentado hoje: critérios eliminatórios
// (transação/tipo/estado/cidade/bairro/valor/quartos/suítes/vagas) e o bug
// já conhecido de _bairrosProximos (compara texto exato, apesar do nome
// sugerir fuzzy matching) — pra qualquer mudança futura nesse arquivo
// precisar primeiro quebrar um teste explícito, nunca silenciosamente.
//
// Pura função, sem banco: matchPorMapa(lead, imoveis) só depende de
// imovelVisivelPublico() (services/salvarImovel.js), que também é pura
// (checa fotos + valor mínimo, sem I/O).

'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { matchPorMapa } = require('../cerebro/motor-intencao.js');

function sinal(valor) { return [{ valor, confianca: 90, score: 90 }]; }

function mapaBase(overrides = {}) {
  return {
    transacao: sinal('venda'),
    tipo_imovel: sinal('apartamento'),
    estado: sinal('SP'),
    cidade: sinal('São Paulo'),
    bairro: sinal('Moema'),
    valor: [{ valor: { max: 500000, min: 0 }, confianca: 90, score: 90 }],
    quartos: sinal(2),
    ...overrides
  };
}

function imovelBase(overrides = {}) {
  return {
    id: 'IM-1',
    tipo: 'apartamento',
    transacao: 'venda',
    estado: 'SP',
    cidade: 'São Paulo',
    bairro: 'Moema',
    valor_imovel: 500000,
    quartos: 2,
    suites: 1,
    vagas: 1,
    banheiros: 2,
    area_m2: 80,
    fotos: ['foto1.jpg'],
    status: 'ativo',
    ...overrides
  };
}

function lead(mapa) { return { mapaIntencao: mapa }; }

test('matchPorMapa: sem mapaIntencao ou sem imóveis retorna array vazio', () => {
  assert.deepEqual(matchPorMapa({}, [imovelBase()]), []);
  assert.deepEqual(matchPorMapa(lead(mapaBase()), []), []);
  assert.deepEqual(matchPorMapa(lead(mapaBase()), null), []);
});

test('matchPorMapa: imóvel sem foto é eliminado (nunca sugerido em match automático)', () => {
  const r = matchPorMapa(lead(mapaBase()), [imovelBase({ fotos: [] })]);
  assert.equal(r.length, 0);
});

test('matchPorMapa: imóvel abaixo do valor mínimo de venda (150k) é eliminado', () => {
  const r = matchPorMapa(lead(mapaBase({ valor: [{ valor: { max: 100000 }, confianca: 90 }] })), [imovelBase({ valor_imovel: 100000 })]);
  assert.equal(r.length, 0);
});

test('matchPorMapa: imóvel compatível em todos os critérios entra no resultado', () => {
  const r = matchPorMapa(lead(mapaBase()), [imovelBase()]);
  assert.equal(r.length, 1);
  assert.equal(r[0].imovel.id, 'IM-1');
  assert.ok(r[0].scoreMatch > 0);
});

test('critério eliminatório — transação: venda x aluguel nunca combina', () => {
  const r = matchPorMapa(lead(mapaBase({ transacao: sinal('aluguel') })), [imovelBase({ transacao: 'venda' })]);
  assert.equal(r.length, 0);
});

test('critério eliminatório — estado diferente elimina mesmo com resto igual', () => {
  const r = matchPorMapa(lead(mapaBase()), [imovelBase({ estado: 'RJ' })]);
  assert.equal(r.length, 0);
});

test('critério eliminatório — cidade diferente elimina', () => {
  const r = matchPorMapa(lead(mapaBase()), [imovelBase({ cidade: 'Campinas' })]);
  assert.equal(r.length, 0);
});

test('critério eliminatório — bairro diferente elimina (texto exato, sem fuzzy)', () => {
  const r = matchPorMapa(lead(mapaBase()), [imovelBase({ bairro: 'Vila Mariana' })]);
  assert.equal(r.length, 0);
});

test('BUG CONHECIDO: _bairrosProximos não reconhece grafias equivalentes não normalizadas por acento simples', () => {
  // Documentado no Raio-X/Conselho Técnico: _bairrosProximos compara texto
  // exato apesar do nome sugerir comparação aproximada. Este teste existe
  // pra a correção futura (se/quando decidida) precisar atualizar este
  // arquivo de propósito, nunca silenciosamente.
  const r = matchPorMapa(lead(mapaBase({ bairro: sinal('Jardim Paulista') })), [imovelBase({ bairro: 'Jd. Paulista' })]);
  assert.equal(r.length, 0, 'hoje "Jardim Paulista" e "Jd. Paulista" são tratados como bairros diferentes');
});

test('critério eliminatório — valor acima de +20% elimina', () => {
  const r = matchPorMapa(lead(mapaBase({ valor: [{ valor: { max: 500000 }, confianca: 90 }] })), [imovelBase({ valor_imovel: 650000 })]); // +30%
  assert.equal(r.length, 0);
});

test('critério eliminatório — valor abaixo de -20% elimina', () => {
  const r = matchPorMapa(lead(mapaBase({ valor: [{ valor: { max: 500000 }, confianca: 90 }] })), [imovelBase({ valor_imovel: 350000 })]); // -30%
  assert.equal(r.length, 0);
});

test('tolerância de valor — dentro de +20% passa', () => {
  const r = matchPorMapa(lead(mapaBase({ valor: [{ valor: { max: 500000 }, confianca: 90 }] })), [imovelBase({ valor_imovel: 590000 })]); // +18%
  assert.equal(r.length, 1);
});

test('critério eliminatório — quartos precisa ser exato (não aceita mais nem menos)', () => {
  assert.equal(matchPorMapa(lead(mapaBase({ quartos: sinal(3) })), [imovelBase({ quartos: 2 })]).length, 0);
  assert.equal(matchPorMapa(lead(mapaBase({ quartos: sinal(2) })), [imovelBase({ quartos: 3 })]).length, 0);
  assert.equal(matchPorMapa(lead(mapaBase({ quartos: sinal(2) })), [imovelBase({ quartos: 2 })]).length, 1);
});

test('suítes: aceita até 1 a menos do que o pedido, mas não 2 a menos', () => {
  const mapaComSuite = mapaBase({ suites: sinal(2) });
  assert.equal(matchPorMapa(lead(mapaComSuite), [imovelBase({ suites: 1 })]).length, 1, 'suíte 1 a menos deveria passar');
  assert.equal(matchPorMapa(lead(mapaComSuite), [imovelBase({ suites: 0 })]).length, 0, 'suíte 2 a menos deveria eliminar');
});

test('vagas: aceita até 1 a menos do que o pedido, mas não 2 a menos', () => {
  const mapaComVaga = mapaBase({ vagas: sinal(2) });
  assert.equal(matchPorMapa(lead(mapaComVaga), [imovelBase({ vagas: 1 })]).length, 1, 'vaga 1 a menos deveria passar');
  assert.equal(matchPorMapa(lead(mapaComVaga), [imovelBase({ vagas: 0 })]).length, 0, 'vaga 2 a menos deveria eliminar');
});

test('terreno/comercial: critério de quartos é ignorado', () => {
  const r = matchPorMapa(
    lead(mapaBase({ tipo_imovel: sinal('terreno'), quartos: sinal(3) })),
    [imovelBase({ tipo: 'terreno', quartos: 0, valor_imovel: 500000 })]
  );
  assert.equal(r.length, 1, 'terreno não deveria ser eliminado por não ter quartos');
});

test('imóvel inativo nunca entra no resultado, mesmo compatível em tudo mais', () => {
  const r = matchPorMapa(lead(mapaBase()), [imovelBase({ status: 'inativo' })]);
  assert.equal(r.length, 0);
});

test('scoring: imóvel com preço quase idêntico ao pedido pontua mais que um no limite da tolerância', () => {
  const mapaComValor = mapaBase({ valor: [{ valor: { max: 500000 }, confianca: 90 }] });
  const [exato] = matchPorMapa(lead(mapaComValor), [imovelBase({ id: 'A', valor_imovel: 500000 })]);
  const [limite] = matchPorMapa(lead(mapaComValor), [imovelBase({ id: 'B', valor_imovel: 590000 })]); // +18%, ainda dentro da tolerância
  assert.ok(exato.scoreMatch > limite.scoreMatch, 'preço mais próximo do pedido deveria pontuar mais');
});

test('resultado vem ordenado por score decrescente e deduplicado por id', () => {
  const mapaComValor = mapaBase({ valor: [{ valor: { max: 500000 }, confianca: 90 }] });
  const imoveis = [
    imovelBase({ id: 'BAIXO', valor_imovel: 590000 }),
    imovelBase({ id: 'ALTO', valor_imovel: 500000 }),
    imovelBase({ id: 'ALTO', valor_imovel: 500000 }), // duplicado de propósito
  ];
  const r = matchPorMapa(lead(mapaComValor), imoveis);
  const ids = r.map(x => x.imovel.id);
  assert.deepEqual(ids, ['ALTO', 'BAIXO']);
  assert.equal(new Set(ids).size, ids.length, 'não deveria haver id repetido no resultado');
});
