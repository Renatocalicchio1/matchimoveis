// Reconciliação de endereço (endereco/cep/numero/complemento) dos imóveis da conta MAU-EHAM
// contra export do CRM legado (backup281125.06_22_1.xlsx, aba "Imóveis").
//
// Por padrão roda em modo RELATÓRIO (não escreve nada no banco).
// Só grava de fato com a flag --aplicar, e mesmo assim só nos casos de alta confiança
// (chave CEP+Número única dentro do mesmo bairro/cidade, sem conflito com dado já existente).
// Casos ambíguos ou com conflito NUNCA são sobrescritos automaticamente — ficam no relatório
// pra decisão manual (exigência: "não pode ter erro").
//
// Uso:
//   node reconciliar-enderecos-mauricio.js                 → gera relatório em ./relatorio-mauricio/
//   node reconciliar-enderecos-mauricio.js --aplicar        → além do relatório, aplica os UPDATEs de alta confiança
//
// Requer mapa-mauricio.json na mesma pasta (gerado a partir do export do CRM) e DATABASE_URL no ambiente.

const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

const APLICAR = process.argv.includes('--aplicar');
const MAPA_PATH = path.join(__dirname, 'mapa-mauricio.json');
const USER_ID = 'MAU-EHAM';
const TOLERANCIA_VALOR = 0.05; // 5% pra desempate por valor entre candidatos de mesma chave CEP+numero

if (!fs.existsSync(MAPA_PATH)) {
  console.error('❌ Não achei mapa-mauricio.json em', MAPA_PATH);
  console.error('   Copie o arquivo enviado pra essa mesma pasta antes de rodar.');
  process.exit(1);
}

const registros = JSON.parse(fs.readFileSync(MAPA_PATH, 'utf8'));
console.log('Registros do CRM carregados:', registros.length);

function normTexto(s) {
  return String(s || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().trim().replace(/\s+/g, ' ');
}
function normDigitos(s) {
  return String(s || '').replace(/\D/g, '');
}
function normTransacao(s) {
  const t = normTexto(s);
  if (t.includes('aluguel') || t.includes('locacao')) return 'locacao';
  if (t.includes('venda')) return 'venda';
  return t;
}

// índice por bairro+cidade pra restringir candidatos antes de qualquer outra checagem
const idxBairroCidade = new Map();
for (const r of registros) {
  const chave = r.cidadeNorm + '|' + r.bairroNorm;
  if (!idxBairroCidade.has(chave)) idxBairroCidade.set(chave, []);
  idxBairroCidade.get(chave).push(r);
}

function candidatosBairroCidade(cidadeNorm, bairroNorm) {
  return idxBairroCidade.get(cidadeNorm + '|' + bairroNorm) || [];
}

function escolherPorCepNumero(candidatos, cepNorm, numeroNorm, valorRef) {
  const bateChave = candidatos.filter(c => c.cepNorm === cepNorm && c.numeroNorm === numeroNorm);
  if (bateChave.length === 0) return { status: 'sem_correspondencia' };
  if (bateChave.length === 1) return { status: 'ok', candidato: bateChave[0] };

  // múltiplos registros no CRM com mesmo CEP+número (ex: apto no mesmo prédio) — desempata por valor
  if (!valorRef) return { status: 'ambiguo', candidatos: bateChave };
  const comDiff = bateChave
    .filter(c => c.valor)
    .map(c => ({ c, diff: Math.abs(c.valor - valorRef) / valorRef }))
    .filter(x => x.diff <= TOLERANCIA_VALOR)
    .sort((a, b) => a.diff - b.diff);

  if (comDiff.length === 0) return { status: 'ambiguo', candidatos: bateChave };
  if (comDiff.length >= 2 && Math.abs(comDiff[0].diff - comDiff[1].diff) < 0.001) {
    return { status: 'ambiguo', candidatos: bateChave }; // empate técnico, não arrisca
  }
  return { status: 'ok', candidato: comDiff[0].c };
}

async function run() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

  const { rows: imoveis } = await pool.query(
    `SELECT id, endereco, numero, complemento, cep, bairro, cidade, estado, transacao, valor_imovel, titulo
     FROM imoveis WHERE user_id=$1 OR usuario_id=$1 OR codigo_usuario=$1 OR corretor_id=$1`,
    [USER_ID]
  );
  console.log('Imóveis MAU-EHAM no banco:', imoveis.length);

  const relatorio = {
    prontosParaAplicar: [],
    aplicados: [],
    conflitos: [],
    ambiguos: [],
    semCorrespondencia: [],
  };

  for (const im of imoveis) {
    const cidadeNorm = normTexto(im.cidade);
    const bairroNorm = normTexto(im.bairro);
    const cepNorm = normDigitos(im.cep);
    const numeroNorm = normDigitos(im.numero);
    const enderecoNorm = normTexto(im.endereco);
    const valor = Number(im.valor_imovel) || 0;
    const transacaoNorm = normTransacao(im.transacao);

    const candidatos = candidatosBairroCidade(cidadeNorm, bairroNorm);
    if (!candidatos.length) {
      relatorio.semCorrespondencia.push({ id: im.id, titulo: im.titulo, motivo: 'sem imóvel do CRM no mesmo bairro/cidade', bairro: im.bairro, cidade: im.cidade });
      continue;
    }

    // se o imóvel já tem CEP+número preenchidos, usa como chave primária (é o caso mais forte)
    let resultado;
    if (cepNorm && numeroNorm) {
      resultado = escolherPorCepNumero(candidatos, cepNorm, numeroNorm, valor);
    } else {
      // sem CEP+número ainda — tenta achar candidato único cruzando bairro+cidade+transação+valor (tolerância mais apertada)
      let pool2 = candidatos;
      if (transacaoNorm) pool2 = pool2.filter(c => !c.transacao || normTransacao(c.transacao) === transacaoNorm);
      if (valor) {
        const comDiff = pool2
          .filter(c => c.valor)
          .map(c => ({ c, diff: Math.abs(c.valor - valor) / valor }))
          .filter(x => x.diff <= TOLERANCIA_VALOR)
          .sort((a, b) => a.diff - b.diff);
        if (comDiff.length === 1) resultado = { status: 'ok', candidato: comDiff[0].c };
        else if (comDiff.length > 1 && Math.abs(comDiff[0].diff - comDiff[1].diff) >= 0.001) resultado = { status: 'ok', candidato: comDiff[0].c };
        else resultado = { status: comDiff.length ? 'ambiguo' : 'sem_correspondencia', candidatos: comDiff.map(x => x.c) };
      } else {
        resultado = { status: 'sem_correspondencia' };
      }
    }

    if (resultado.status === 'sem_correspondencia') {
      relatorio.semCorrespondencia.push({ id: im.id, titulo: im.titulo, bairro: im.bairro, cidade: im.cidade, cep: im.cep, numero: im.numero, valor });
      continue;
    }
    if (resultado.status === 'ambiguo') {
      relatorio.ambiguos.push({
        id: im.id, titulo: im.titulo, bairro: im.bairro, cidade: im.cidade, valorAtual: valor,
        candidatos: resultado.candidatos.map(c => ({ referencia: c.referencia, endereco: c.logradouroOriginal, numero: c.numeroOriginal, cep: c.cepOriginal, valor: c.valor })),
      });
      continue;
    }

    // status ok — checa conflito com dado já existente antes de propor aplicação
    const c = resultado.candidato;
    const conflitos = [];
    if (cepNorm && c.cepNorm && cepNorm !== c.cepNorm) conflitos.push(`cep atual "${im.cep}" difere do CRM "${c.cepOriginal}"`);
    if (numeroNorm && c.numeroNorm && numeroNorm !== c.numeroNorm) conflitos.push(`numero atual "${im.numero}" difere do CRM "${c.numeroOriginal}"`);
    if (enderecoNorm && c.logradouroNorm && !enderecoNorm.includes(c.logradouroNorm) && !c.logradouroNorm.includes(enderecoNorm)) {
      conflitos.push(`endereco atual "${im.endereco}" difere do CRM "${c.logradouroOriginal}"`);
    }

    if (conflitos.length) {
      relatorio.conflitos.push({ id: im.id, titulo: im.titulo, referenciaCrm: c.referencia, conflitos });
      continue;
    }

    const campos = {};
    if (!enderecoNorm && c.logradouroOriginal) campos.endereco = c.logradouroOriginal;
    if (!numeroNorm && c.numeroOriginal) campos.numero = c.numeroOriginal;
    if (!cepNorm && c.cepOriginal) campos.cep = c.cepOriginal;
    if (!normTexto(im.complemento) && c.complemento) campos.complemento = c.complemento;

    if (!Object.keys(campos).length) continue; // já estava tudo preenchido e batendo, nada a fazer

    const item = { id: im.id, titulo: im.titulo, referenciaCrm: c.referencia, campos };

    if (APLICAR) {
      const sets = Object.keys(campos).map((k, i) => `${k}=$${i + 2}`).join(', ');
      const valores = Object.values(campos);
      await pool.query(`UPDATE imoveis SET ${sets} WHERE id=$1`, [im.id, ...valores]);
      relatorio.aplicados.push(item);
    } else {
      relatorio.prontosParaAplicar.push(item);
    }
  }

  const dir = path.join(__dirname, 'relatorio-mauricio');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'relatorio.json'), JSON.stringify(relatorio, null, 2));

  const resumo = `
RECONCILIAÇÃO DE ENDEREÇOS — MAU-EHAM
Modo: ${APLICAR ? 'APLICADO (gravou no banco)' : 'RELATÓRIO (nada foi gravado — rode com --aplicar pra gravar)'}

Total imóveis analisados: ${imoveis.length}
✅ ${APLICAR ? 'Aplicados' : 'Prontos pra aplicar (alta confiança)'}: ${(APLICAR ? relatorio.aplicados : relatorio.prontosParaAplicar).length}
⚠️  Conflito (CRM diverge de dado já preenchido — NÃO sobrescrito): ${relatorio.conflitos.length}
❓ Ambíguo (mais de 1 candidato no CRM, sem desempate confiável): ${relatorio.ambiguos.length}
❌ Sem correspondência no CRM: ${relatorio.semCorrespondencia.length}

Detalhes completos em: relatorio-mauricio/relatorio.json
`.trim();

  fs.writeFileSync(path.join(dir, 'RESUMO.txt'), resumo);
  console.log('\n' + resumo);

  await pool.end();
}

run().catch(e => { console.error(e); process.exit(1); });
