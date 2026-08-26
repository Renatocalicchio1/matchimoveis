// Disparo único e manual (ago/2026, pedido explícito do Renato): manda o
// followup2 (services/campanha.js) pra quem abriu o followup1 mas nunca
// recebeu o followup2 — usa as 3 variações de followup2 com melhor
// engajamento real.
//
// Por que esse público existe fora do job automático: proximoFollowup2()
// só olha o campo genérico `aberto_em` (abriu o e-mail ORIGINAL — pagina/
// demanda/afiliado). Quem nunca abriu o original, recebeu o followup1, e aí
// sim abriu o followup1 (followup1_aberto_em preenchido) nunca bate esse
// critério — fica pra sempre sem receber followup2, mesmo já tendo mostrado
// interesse de verdade num segundo toque. Esse script fecha esse buraco,
// 1x só.
//
// Roda 1x só, direto no Render Shell — NÃO é um job contínuo, não mexe em
// nada do job automático (services/campanha.js `enviarProximo`/
// proximoFollowup2). Usa o contato e o marcarFollowupEnviado(id,2,titulo)
// REAIS — assim o followup2 desse envio fica registrado do jeito certo
// (followup2_enviado_em/titulo_usado), e o job automático não tenta mandar
// de novo depois.
//
// Como rodar (Render Shell, dentro de /opt/render/project/src/):
//   node disparo-reforco-abriu-followup2.js

const { query } = require('./services/db');
const { enviarEmail } = require('./services/email');
const { topVariantesPorEngajamento, gerarHTML, nomeOuFallback, marcarFollowupEnviado } = require('./services/campanha');

const AMOSTRA_MINIMA = 20;
const DELAY_MS_MIN = 3000;
const DELAY_MS_MAX = 8000;

async function contatosAbriramFollowup1SemFollowup2() {
  const { rows } = await query(`
    SELECT id, nome, email, celular
    FROM campanha_contatos
    WHERE followup1_aberto_em IS NOT NULL
      AND followup2_enviado_em IS NULL
      AND email_valido = true
      AND LOWER(email) NOT IN (SELECT LOWER(email) FROM usuarios WHERE email IS NOT NULL AND email != '')
    ORDER BY followup1_aberto_em DESC
  `);
  return rows;
}

function delay(ms) { return new Promise(r => setTimeout(r, ms)); }

async function main() {
  console.log('[reforco-abriu-followup1] escolhendo as 3 melhores variações de "followup2"...');
  const top3 = await topVariantesPorEngajamento('followup2', 3, AMOSTRA_MINIMA);
  const semDadoNenhum = top3.every(t => t.stat.enviados === 0);
  if (semDadoNenhum) {
    console.log('  (followup2 ainda não tem estatística real registrada — sorteando entre as variações atuais)');
  }
  top3.forEach((t, i) => {
    const pctAbertura = t.stat.enviados ? Math.round(t.stat.abertos / t.stat.enviados * 100) : 0;
    const pctClique = t.stat.enviados ? Math.round(t.stat.clicados / t.stat.enviados * 100) : 0;
    console.log('  #' + (i + 1) + ' — "' + t.variante.assunto + '" — ' + t.stat.enviados + ' enviados, ' + pctAbertura + '% abertura, ' + pctClique + '% clique');
  });

  console.log('[reforco-abriu-followup1] buscando contatos que abriram o followup1 e nunca receberam o followup2...');
  const contatos = await contatosAbriramFollowup1SemFollowup2();
  if (!contatos.length) {
    console.log('[reforco-abriu-followup1] nenhum contato encontrado — nada pra fazer.');
    return;
  }
  console.log('[reforco-abriu-followup1] ' + contatos.length + ' contatos encontrados. Começando envio (' + (DELAY_MS_MIN / 1000) + '-' + (DELAY_MS_MAX / 1000) + 's entre cada um)...');

  let enviados = 0, erros = 0;
  for (let i = 0; i < contatos.length; i++) {
    const contato = contatos[i];
    const { variante } = top3[i % top3.length]; // alterna entre as 3
    try {
      const corpoPersonalizado = variante.corpo.replace(/\{nome\}/g, nomeOuFallback(contato.nome));
      const html = gerarHTML(corpoPersonalizado, contato, 'followup2');
      await enviarEmail({ para: contato.email, assunto: variante.assunto, html, texto: variante.assunto });
      await marcarFollowupEnviado(contato.id, 2, variante.assunto);
      enviados++;
      if (enviados % 50 === 0) console.log('[reforco-abriu-followup1] progresso: ' + enviados + '/' + contatos.length);
    } catch (e) {
      erros++;
      console.error('[reforco-abriu-followup1] erro:', contato.email, e.message);
    }
    await delay(DELAY_MS_MIN + Math.random() * (DELAY_MS_MAX - DELAY_MS_MIN));
  }

  console.log('[reforco-abriu-followup1] concluído — ' + enviados + ' enviados, ' + erros + ' erros.');
}

main()
  .then(() => process.exit(0))
  .catch(e => { console.error('[reforco-abriu-followup1] erro geral:', e.message); process.exit(1); });
