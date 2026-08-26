// Disparo único e manual (ago/2026, pedido explícito do Renato): manda uma
// variação específica de "afiliado" — a que ele lembrou como vencedora
// histórica, "Enquanto você dorme, dá pra estar ganhando dos dois jeitos" —
// pra 500 contatos de São Paulo capital (DDD 11) da base de ~118 mil que
// ainda NUNCA foram contatados.
//
// Esse texto não existe mais em services/campanha.js MODELOS.afiliado — foi
// reescrito na reformulação "aversão à perda" (commit 946d6f88). Recuperado
// do histórico do git (commit e1c0da1f, o último antes da reescrita) e
// hardcoded aqui embaixo — decisão deliberada de reviver só pra ESSE
// disparo pontual, sem voltar ele pra rotação normal do MODELOS.
//
// Roda 1x só, direto no Render Shell — NÃO é um job contínuo.
//
// Como rodar (Render Shell, dentro de /opt/render/project/src/):
//   node disparo-500-ddd11-vencedora-historica.js

const { query } = require('./services/db');
const { enviarEmail } = require('./services/email');
const { marcarEnviado, gerarHTML, nomeOuFallback } = require('./services/campanha');

const TOTAL_CONTATOS = 500;
const DDD_ALVO = '11'; // São Paulo capital
const DELAY_MS_MIN = 3000;
const DELAY_MS_MAX = 8000;

// Texto original, recuperado de `git show e1c0da1f:services/campanha.js`.
const VARIANTE = {
  assunto: 'Enquanto você dorme, dá pra estar ganhando dos dois jeitos',
  corpo: `De um lado, a Match Imóveis cruza seus leads com os imóveis certos 24 horas por dia, mesmo enquanto você não está online. Do outro, cada corretor que você já indicou continua gerando comissão pra você todo mês, sem esforço extra.

• Leads cruzados automaticamente com sua carteira
• Comissão contínua de quem você já indicou
• Nenhum dos dois exige mensalidade

Criar conta é grátis e ainda vem com 1.000 créditos de bônus pra testar.`
};

// Mesma extração de DDD usada em _dddDigits() (services/campanha.js) e no
// disparo-unico-top3-afiliado.js.
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

function delay(ms) { return new Promise(r => setTimeout(r, ms)); }

async function main() {
  console.log('[500-ddd11] variação usada: "' + VARIANTE.assunto + '"');
  console.log('[500-ddd11] buscando ' + TOTAL_CONTATOS + ' contatos de DDD ' + DDD_ALVO + ' (nunca contatados)...');
  const contatos = await proximoLoteDDD(DDD_ALVO, TOTAL_CONTATOS);
  if (!contatos.length) {
    console.log('[500-ddd11] nenhum contato elegível de DDD ' + DDD_ALVO + ' encontrado — nada pra fazer.');
    return;
  }
  console.log('[500-ddd11] ' + contatos.length + ' contatos encontrados. Começando envio (' + (DELAY_MS_MIN / 1000) + '-' + (DELAY_MS_MAX / 1000) + 's entre cada um)...');

  let enviados = 0, erros = 0;
  for (let i = 0; i < contatos.length; i++) {
    const contato = contatos[i];
    try {
      const corpoPersonalizado = VARIANTE.corpo.replace(/\{nome\}/g, nomeOuFallback(contato.nome));
      const html = gerarHTML(corpoPersonalizado, contato, 'afiliado');
      await enviarEmail({ para: contato.email, assunto: VARIANTE.assunto, html, texto: VARIANTE.assunto });
      await marcarEnviado(contato.id, null, { modelo: 'afiliado', titulo: VARIANTE.assunto, corpo: VARIANTE.corpo });
      enviados++;
      if (enviados % 50 === 0) console.log('[500-ddd11] progresso: ' + enviados + '/' + contatos.length);
    } catch (e) {
      erros++;
      await marcarEnviado(contato.id, e.message).catch(() => {});
      console.error('[500-ddd11] erro:', contato.email, e.message);
    }
    await delay(DELAY_MS_MIN + Math.random() * (DELAY_MS_MAX - DELAY_MS_MIN));
  }

  console.log('[500-ddd11] concluído — ' + enviados + ' enviados, ' + erros + ' erros.');
}

main()
  .then(() => process.exit(0))
  .catch(e => { console.error('[500-ddd11] erro geral:', e.message); process.exit(1); });
