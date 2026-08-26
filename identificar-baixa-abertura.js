// Diagnóstico único e manual (ago/2026, pedido do Renato): "email com taxa
// de abertura baixa, na proporção envio/abertura, deve sair do template" —
// ou seja, dentro de cada TIPO de email que tem mais de 1 variação
// concorrendo (campanha 118 mil + qualquer outro email da plataforma que
// usa services/email.js enviarEmail() com `tipo`/`variante`), achar as
// variações com abertura muito abaixo da média das outras do mesmo tipo.
//
// SÓ DIAGNOSTICA — não edita nada em MODELOS/VARIANTES_* nem no banco. Roda
// 1x, imprime um relatório, e a exclusão de verdade (tirar o texto do
// array/services correspondente) é feita depois em código, olhando esse
// resultado — não dá pra excluir "sozinho" um texto que só existe hardcoded
// no server.js/services, sem passar por commit.
//
// Regra usada (combina os dois critérios que o Renato pediu: proporção
// envio/abertura + "baixa" = precisa ser baixa RELATIVO às outras variações
// do mesmo tipo, não um número fixo no vácuo — tipos diferentes têm taxa de
// abertura naturalmente diferente entre si):
//   - Só entra na comparação variação com amostra >= AMOSTRA_MINIMA (30 —
//     mais rigoroso que o piso de 20 usado em outros scripts, porque aqui a
//     decisão é permanente, não só "para de escolher hoje").
//   - Média do tipo = abertos totais / enviados totais das variações com
//     amostra suficiente desse tipo (média ponderada, não simples).
//   - Variação "candidata a exclusão" = taxa dela < 50% da média do tipo.
//   - Tipo com só 1 variação com amostra não entra no relatório (não tem
//     com o que comparar, e excluir a única opção apagaria o tipo inteiro).
//
// Como rodar (Render Shell, dentro de /opt/render/project/src/):
//   node identificar-baixa-abertura.js

const { statsPorModeloEmail } = require('./services/campanha');
const { statsEmailEnvios } = require('./services/email');

const AMOSTRA_MINIMA = 30;
const LIMIAR_RELATIVO = 0.5; // abaixo de 50% da média do tipo = "baixa"

function taxaAbertura(r) { return r.enviados ? r.abertos / r.enviados : 0; }

async function main() {
  console.log('[baixa-abertura] lendo estatísticas reais (campanha 118 mil + todos os outros emails da plataforma)...\n');

  const doCampanha = (await statsPorModeloEmail()).map(r => ({ ...r, chave: r.assunto }));
  const doResto = (await statsEmailEnvios()).map(r => ({ ...r, chave: r.variante || r.assunto }));
  const todas = [...doCampanha, ...doResto];

  // Agrupa por tipo
  const porTipo = new Map();
  for (const r of todas) {
    if (!porTipo.has(r.tipo)) porTipo.set(r.tipo, []);
    porTipo.get(r.tipo).push(r);
  }

  let totalCandidatas = 0;
  const relatorio = [];

  for (const [tipo, linhas] of porTipo) {
    const comAmostra = linhas.filter(r => r.enviados >= AMOSTRA_MINIMA);
    if (comAmostra.length < 2) continue; // nada pra comparar nesse tipo

    const enviadosTotal = comAmostra.reduce((s, r) => s + r.enviados, 0);
    const abertosTotal = comAmostra.reduce((s, r) => s + r.abertos, 0);
    const mediaTipo = enviadosTotal ? abertosTotal / enviadosTotal : 0;

    const linhasComTaxa = comAmostra
      .map(r => ({ ...r, taxa: taxaAbertura(r) }))
      .sort((a, b) => b.taxa - a.taxa);

    const candidatas = linhasComTaxa.filter(r => r.taxa < mediaTipo * LIMIAR_RELATIVO);
    totalCandidatas += candidatas.length;

    relatorio.push({ tipo, mediaTipo, linhas: linhasComTaxa, candidatas });
  }

  if (!relatorio.length) {
    console.log('[baixa-abertura] nenhum tipo tem 2+ variações com amostra >= ' + AMOSTRA_MINIMA + ' envios ainda — nada pra comparar.');
    return;
  }

  for (const { tipo, mediaTipo, linhas, candidatas } of relatorio) {
    console.log('=== ' + tipo + ' — média do tipo: ' + (mediaTipo * 100).toFixed(1) + '% de abertura ===');
    linhas.forEach(r => {
      const marca = candidatas.includes(r) ? '  ⚠️ CANDIDATA A EXCLUSÃO' : '';
      console.log('  "' + (r.chave || '(sem assunto)') + '" — ' + r.enviados + ' enviados, ' + (r.taxa * 100).toFixed(1) + '% abertura' + marca);
    });
    console.log('');
  }

  console.log('---');
  console.log('[baixa-abertura] total de variações candidatas a exclusão: ' + totalCandidatas + (totalCandidatas ? ' — copia esse output e manda pro Claude decidir onde cada uma vive no código (MODELOS/VARIANTES_*) pra tirar de vez.' : ''));
}

main()
  .then(() => process.exit(0))
  .catch(e => { console.error('[baixa-abertura] erro geral:', e.message); process.exit(1); });
