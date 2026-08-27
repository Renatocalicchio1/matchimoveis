// Reaplica a normalização de estado/cidade/bairro (services/salvarImovel.js
// — casamento aproximado contra a base confiável do IBGE/OSM, ver
// normalizarEstadoBR/normalizarCidadeBR/normalizarBairroBR) em cima de todo
// imóvel JÁ cadastrado — pedido do Renato (ago/2026): a correção que já
// está no ar só vale pra cadastro/edição/importação novos; isso aqui
// corrige o que já existe na base hoje.
//
// Por padrão roda em modo SIMULAÇÃO (não grava nada, só mostra o que ia
// mudar). Só grava de verdade com a flag --aplicar.
//
// Rodar (no Render Shell):
//   node corrigir-localidades-imoveis.js            (simula, não grava)
//   node corrigir-localidades-imoveis.js --aplicar   (grava de verdade)
require('dotenv').config();
const { query } = require('./services/db');
const {
  normalizarEstadoBR,
  normalizarCidadeBR,
  normalizarBairroBR,
  garantirDicionarioLocalidades
} = require('./services/salvarImovel');

const APLICAR = process.argv.includes('--aplicar');

async function main() {
  console.log(APLICAR ? '⚠️  MODO APLICAR — vai gravar as mudanças no banco.' : '🔍 MODO SIMULAÇÃO — não grava nada, só mostra o que mudaria (rode com --aplicar pra gravar).');

  await garantirDicionarioLocalidades();

  const { rows } = await query(`SELECT id, estado, cidade, bairro FROM imoveis`);
  console.log('Total de imóveis:', rows.length);

  let mudou = 0, semMudanca = 0, erro = 0;
  const amostraMudancas = [];

  for (const im of rows) {
    try {
      const estadoNovo = normalizarEstadoBR(im.estado);
      const cidadeNova = normalizarCidadeBR(estadoNovo, im.cidade);
      const bairroNovo = normalizarBairroBR(cidadeNova, im.bairro);

      const mudouEstado = (im.estado || '') !== estadoNovo;
      const mudouCidade = (im.cidade || '') !== cidadeNova;
      const mudouBairro = (im.bairro || '') !== bairroNovo;

      if (!mudouEstado && !mudouCidade && !mudouBairro) {
        semMudanca++;
        continue;
      }

      mudou++;
      if (amostraMudancas.length < 60) {
        amostraMudancas.push({
          id: im.id,
          estado: mudouEstado ? `${im.estado} → ${estadoNovo}` : im.estado,
          cidade: mudouCidade ? `${im.cidade} → ${cidadeNova}` : im.cidade,
          bairro: mudouBairro ? `${im.bairro} → ${bairroNovo}` : im.bairro
        });
      }

      if (APLICAR) {
        await query(
          `UPDATE imoveis SET estado=$1, cidade=$2, bairro=$3, atualizado_em=NOW() WHERE id=$4`,
          [estadoNovo, cidadeNova, bairroNovo, im.id]
        );
      }
    } catch (e) {
      erro++;
      console.error('[erro imóvel', im.id, ']', e.message);
    }
  }

  console.log('\n=== Amostra de mudanças (até 60) ===');
  console.table(amostraMudancas);

  console.log('\n=== Resumo ===');
  console.log('Sem mudança:', semMudanca);
  console.log(APLICAR ? 'Corrigidos:' : 'Seriam corrigidos:', mudou);
  console.log('Erros:', erro);
  if (!APLICAR && mudou > 0) {
    console.log('\nRode com --aplicar pra gravar essas mudanças de verdade:');
    console.log('  node corrigir-localidades-imoveis.js --aplicar');
  }

  process.exit(0);
}

main().catch(e => { console.error('ERRO GERAL:', e.message); process.exit(1); });
