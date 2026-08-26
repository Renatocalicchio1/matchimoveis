// Disparo único e manual (ago/2026, pedido explícito do Renato): pega as 3
// variações de assunto/corpo do modelo "afiliado" (services/campanha.js)
// com melhor taxa de engajamento real (clique vale 3x mais que abertura,
// mesma fórmula usada em todo o sistema pra pesar variação por desempenho)
// e manda pra 1.000 contatos de SÃO PAULO CAPITAL (DDD 11) da base de
// ~118 mil que ainda NUNCA foram contatados — dividido em 3 grupos (~333
// cada), um por variação vencedora, pra também comparar as 3 entre si nesse
// teste maior.
//
// Roda 1x só, direto no Render Shell — NÃO é um job contínuo, não mexe em
// nada do job normal da campanha (services/campanha.js `enviarProximo`).
// Espera alguns segundos entre cada envio (não é uma rajada instantânea) —
// mesmo motivo do intervalo variável do job normal: rajada de 1.000 emails
// no mesmo segundo é sinal pior pra reputação da conta SES do que o mesmo
// volume espalhado.
//
// Como rodar (Render Shell, dentro de /opt/render/project/src/):
//   node disparo-unico-top3-afiliado.js
//
// Mesma regra de elegibilidade do job normal (proximoLote em
// services/campanha.js — status='pendente', email válido, não é usuário
// cadastrado), só que com filtro extra de DDD 11 — por isso reimplementada
// aqui em vez de chamar proximoLote() direto (não dá pra filtrar DDD nela
// sem mexer na função usada pelo job contínuo). Usa o MESMO marcarEnviado(),
// então esses 1.000 contatos saem do jeito certo do banco (não voltam a ser
// pego pelo job normal, e entram nas estatísticas de /admin/emails como
// qualquer envio "afiliado" normal).

const { query } = require('./services/db');
const { enviarEmail } = require('./services/email');
const {
  marcarEnviado, statsPorModeloEmail,
  MODELOS, gerarHTML, nomeOuFallback
} = require('./services/campanha');

const TOTAL_CONTATOS = 1000;
const DDD_ALVO = '11'; // São Paulo capital
const AMOSTRA_MINIMA = 20; // mesmo piso usado no resto do sistema pra confiar numa taxa
const DELAY_MS_MIN = 3000;
const DELAY_MS_MAX = 8000;

function taxaEngajamento(stat) {
  return (stat.clicados * 3 + stat.abertos) / stat.enviados;
}

// Mesma extração de DDD usada em _dddDigits() (services/campanha.js): tira
// tudo que não é dígito; se sobrou 12+ dígitos tem "55" na frente (DDI),
// pula os 2 primeiros antes de pegar o DDD.
async function proximoLoteDDD(ddd, limite) {
  const { rows } = await query(`
    SELECT cc.id, cc.nome, cc.email, cc.celular
    FROM campanha_contatos cc
    WHERE cc.status = 'pendente'
      AND cc.email_valido = true
      AND LOWER(cc.email) NOT IN (SELECT LOWER(email) FROM usuarios WHERE email IS NOT NULL AND email != '')
      AND NOT EXISTS (
        SELECT 1 FROM usuarios u
        WHERE u.celular IS NOT NULL AND u.celular != ''
          AND cc.celular IS NOT NULL AND cc.celular != ''
          AND RIGHT(regexp_replace(u.celular, '\\D', '', 'g'), 8) = RIGHT(regexp_replace(cc.celular, '\\D', '', 'g'), 8)
      )
      AND (
        CASE WHEN length(regexp_replace(cc.celular, '\\D', '', 'g')) >= 12
          THEN substring(regexp_replace(cc.celular, '\\D', '', 'g') from 3 for 2)
          ELSE substring(regexp_replace(cc.celular, '\\D', '', 'g') from 1 for 2)
        END
      ) = $1
    ORDER BY (CASE WHEN cc.parece_corretor THEN 0 ELSE 1 END), cc.criado_em ASC
    LIMIT $2
  `, [ddd, limite]);
  return rows;
}

async function escolherTop3() {
  const todas = await statsPorModeloEmail();
  const assuntosAtuais = new Set(MODELOS.afiliado.map(v => v.assunto));
  // Só entra na disputa quem tem envio registrado E cujo texto ainda existe
  // em MODELOS.afiliado hoje — a base de ~118 mil já rodou desde jul/2026,
  // e o texto das variações foi reescrito mais de uma vez nesse meio tempo
  // (reformulação "aversão à perda", ago/2026); tem estatística real de
  // assunto que não corresponde a variação nenhuma do código atual. Filtrar
  // ANTES de escolher o top 3 evita escolher uma vencedora "fantasma" e só
  // descobrir no meio do disparo que ela não existe mais pra reenviar.
  const doAfiliado = todas.filter(r => r.tipo === 'afiliado' && r.enviados > 0 && assuntosAtuais.has(r.assunto));
  // Só confia na taxa de quem já tem amostra decente — mas se menos de 3
  // variações bateram o piso, usa todas que existem mesmo assim (sempre
  // melhor que travar o disparo por falta de dado).
  const comAmostra = doAfiliado.filter(r => r.enviados >= AMOSTRA_MINIMA);
  const base = comAmostra.length >= 3 ? comAmostra : doAfiliado;
  base.sort((a, b) => taxaEngajamento(b) - taxaEngajamento(a));
  const top3 = base.slice(0, 3);
  if (!top3.length) {
    throw new Error('Nenhuma variação de "afiliado" com texto ainda igual ao atual tem envio registrado — não dá pra escolher a melhor.');
  }
  return top3.map(stat => ({ variante: MODELOS.afiliado.find(v => v.assunto === stat.assunto), stat }));
}

function delay(ms) { return new Promise(r => setTimeout(r, ms)); }

async function main() {
  console.log('[disparo-unico] escolhendo as 3 melhores variações de "afiliado"...');
  const top3 = await escolherTop3();
  top3.forEach((t, i) => {
    const pctAbertura = t.stat.enviados ? Math.round(t.stat.abertos / t.stat.enviados * 100) : 0;
    const pctClique = t.stat.enviados ? Math.round(t.stat.clicados / t.stat.enviados * 100) : 0;
    console.log('  #' + (i + 1) + ' — "' + t.variante.assunto + '" — ' + t.stat.enviados + ' enviados, ' + pctAbertura + '% abertura, ' + pctClique + '% clique');
  });

  console.log('[disparo-unico] buscando ' + TOTAL_CONTATOS + ' contatos elegíveis de DDD ' + DDD_ALVO + ' (nunca contatados)...');
  const contatos = await proximoLoteDDD(DDD_ALVO, TOTAL_CONTATOS);
  if (!contatos.length) {
    console.log('[disparo-unico] nenhum contato elegível de DDD ' + DDD_ALVO + ' encontrado — nada pra fazer.');
    return;
  }
  console.log('[disparo-unico] ' + contatos.length + ' contatos encontrados. Começando envio (' + (DELAY_MS_MIN / 1000) + '-' + (DELAY_MS_MAX / 1000) + 's entre cada um)...');

  let enviados = 0, erros = 0;
  for (let i = 0; i < contatos.length; i++) {
    const contato = contatos[i];
    const { variante } = top3[i % top3.length]; // alterna entre as 3 — ~1/3 dos 1.000 pra cada
    try {
      const corpoPersonalizado = variante.corpo.replace(/\{nome\}/g, nomeOuFallback(contato.nome));
      const html = gerarHTML(corpoPersonalizado, contato, 'afiliado');
      await enviarEmail({ para: contato.email, assunto: variante.assunto, html, texto: variante.assunto });
      await marcarEnviado(contato.id, null, { modelo: 'afiliado', titulo: variante.assunto, corpo: variante.corpo });
      enviados++;
      if (enviados % 50 === 0) console.log('[disparo-unico] progresso: ' + enviados + '/' + contatos.length);
    } catch (e) {
      erros++;
      await marcarEnviado(contato.id, e.message).catch(() => {});
      console.error('[disparo-unico] erro:', contato.email, e.message);
    }
    await delay(DELAY_MS_MIN + Math.random() * (DELAY_MS_MAX - DELAY_MS_MIN));
  }

  console.log('[disparo-unico] concluído — ' + enviados + ' enviados, ' + erros + ' erros.');
}

main()
  .then(() => process.exit(0))
  .catch(e => { console.error('[disparo-unico] erro geral:', e.message); process.exit(1); });
