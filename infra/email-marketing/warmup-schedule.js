// warmup-schedule.js — cronograma de aquecimento progressivo de IP pra
// disparar os ~118.000 corretores sem queimar a reputação do domínio
// novo. Roda 1x/dia (cron) — cada execução manda só o lote do dia,
// nunca a base toda de uma vez.
//
// Uso:
//   node infra/email-marketing/warmup-schedule.js           # dispara o lote de hoje
//   node infra/email-marketing/warmup-schedule.js --dry-run # só mostra o cronograma, não dispara nada
//
// Estado persistido em warmup-progress.json (nessa mesma pasta) — guarda
// em que dia do cronograma está e quantos contatos já foram liberados,
// pra sobreviver a reinício do servidor/cron sem perder o progresso nem
// repetir um dia.

const fs = require('fs');
const path = require('path');

const ARQUIVO_PROGRESSO = path.join(__dirname, 'warmup-progress.json');

// Curva de aquecimento — cresce ~1.7x por dia até estabilizar, dobrando
// bem devagar no começo (é a fase mais sensível: os primeiros milhares de
// envio são o que decide se o IP/domínio nasce com reputação boa ou não).
// Ajusta os números pra sua realidade se a base for maior/menor que 118k —
// a função gerarCronograma() abaixo espalha automaticamente pra bater o
// total exato no último dia.
function gerarCronograma(totalContatos, dias = 18) {
  const curvaBase = [1000, 2000, 3500, 5000, 7000, 9000, 12000, 15000, 18000,
    22000, 26000, 30000, 35000, 40000, 45000, 50000, 55000, 60000];
  // Se o total pedido for menor que a soma da curva base, escala tudo
  // proporcionalmente pra caber no total real em vez de mandar mais do
  // que existe.
  const cronograma = [];
  let acumulado = 0;
  for (let dia = 0; dia < dias; dia++) {
    const alvoAcumuladoHoje = Math.min(
      totalContatos,
      Math.round((curvaBase[Math.min(dia, curvaBase.length - 1)] / curvaBase[curvaBase.length - 1]) * totalContatos)
    );
    const loteHoje = Math.max(0, alvoAcumuladoHoje - acumulado);
    if (loteHoje > 0) cronograma.push(loteHoje);
    acumulado = alvoAcumuladoHoje;
    if (acumulado >= totalContatos) break;
  }
  // Garante que a soma bate exatamente com o total (arredondamento pode
  // deixar sobra de 1-2 contatos no fim — joga no último dia)
  const soma = cronograma.reduce((a, b) => a + b, 0);
  if (soma < totalContatos && cronograma.length) {
    cronograma[cronograma.length - 1] += (totalContatos - soma);
  }
  return cronograma;
}

function lerProgresso() {
  if (!fs.existsSync(ARQUIVO_PROGRESSO)) return { diaAtual: 0, totalJaLiberado: 0, iniciadoEm: null };
  try { return JSON.parse(fs.readFileSync(ARQUIVO_PROGRESSO, 'utf8')); }
  catch (e) { return { diaAtual: 0, totalJaLiberado: 0, iniciadoEm: null }; }
}

function salvarProgresso(estado) {
  fs.writeFileSync(ARQUIVO_PROGRESSO, JSON.stringify(estado, null, 2));
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const TOTAL_CONTATOS = parseInt(process.env.WARMUP_TOTAL_CONTATOS || '118000', 10);
  const cronograma = gerarCronograma(TOTAL_CONTATOS);

  if (dryRun) {
    console.log('Cronograma de aquecimento pra', TOTAL_CONTATOS, 'contatos:');
    let acumulado = 0;
    cronograma.forEach((lote, i) => {
      acumulado += lote;
      console.log('  Dia ' + (i + 1) + ': +' + lote.toLocaleString('pt-BR') + ' (acumulado: ' + acumulado.toLocaleString('pt-BR') + ')');
    });
    return;
  }

  const estado = lerProgresso();
  if (!estado.iniciadoEm) estado.iniciadoEm = new Date().toISOString();

  if (estado.diaAtual >= cronograma.length) {
    console.log('[warmup] cronograma concluído — todos os', TOTAL_CONTATOS, 'contatos já liberados.');
    return;
  }

  const loteHoje = cronograma[estado.diaAtual];
  const inicio = estado.totalJaLiberado;
  const fim = estado.totalJaLiberado + loteHoje;

  console.log('[warmup] dia', estado.diaAtual + 1, 'de', cronograma.length, '— liberando contatos',
    inicio.toLocaleString('pt-BR'), 'a', fim.toLocaleString('pt-BR'), '(+' + loteHoje.toLocaleString('pt-BR') + ')');

  try {
    // dispararLoteDoWarmup precisa existir em services/listmonkSync.js —
    // cria (ou reaproveita) uma lista no Listmonk só com os contatos desse
    // intervalo [inicio, fim) e inicia uma campanha pra ela. Ver esse
    // arquivo pra implementação real (depende da API do Listmonk, não
    // testada contra uma instância de verdade).
    const { dispararLoteDoWarmup } = require('../../services/listmonkSync');
    await dispararLoteDoWarmup({ inicio, fim, diaWarmup: estado.diaAtual + 1 });
    estado.diaAtual += 1;
    estado.totalJaLiberado = fim;
    salvarProgresso(estado);
    console.log('[warmup] lote do dia', estado.diaAtual, 'disparado e progresso salvo.');
  } catch (e) {
    console.error('[warmup] erro ao disparar o lote de hoje, progresso NÃO avançado (tenta de novo amanhã ou manualmente):', e.message);
    process.exitCode = 1;
  }
}

module.exports = { gerarCronograma };

if (require.main === module) {
  main();
}
