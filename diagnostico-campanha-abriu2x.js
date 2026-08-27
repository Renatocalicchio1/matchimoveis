// Passo 1 do disparo WhatsApp combinado com o Renato (ago/2026): quantos
// contatos da campanha de e-mail (118k) abriram pelo menos 2 dos 4 e-mails
// possíveis (1º envio + follow-up 1/2/3 — cada um tem sua própria coluna de
// abertura em campanha_contatos: aberto_em/followup1_aberto_em/
// followup2_aberto_em/followup3_aberto_em) e NUNCA viraram conta na
// plataforma.
//
// "Nunca se cadastrou" checado por e-mail cruzado direto contra `usuarios`
// (mesmo padrão já usado em outro ponto do server.js) — não confia só em
// campanha_contatos.status='convertido', porque esse campo só é setado no
// fluxo específico de cadastro via link de campanha (/entrar); quem se
// cadastrou por fora (landing normal) não passa por ali e ficaria contado
// errado como "não cadastrou".
//
// Só leitura, não grava nada.
//
// Rodar (Render Shell):
//   node diagnostico-campanha-abriu2x.js
require('dotenv').config();
const { query } = require('./services/db');

async function main() {
  const totalContatos = await query(`SELECT COUNT(*) c FROM campanha_contatos`);
  console.log('Total de contatos na campanha:', totalContatos.rows[0].c);

  const porQtdAberturas = await query(`
    SELECT qtd_aberturas, COUNT(*) c FROM (
      SELECT
        (CASE WHEN aberto_em IS NOT NULL THEN 1 ELSE 0 END) +
        (CASE WHEN followup1_aberto_em IS NOT NULL THEN 1 ELSE 0 END) +
        (CASE WHEN followup2_aberto_em IS NOT NULL THEN 1 ELSE 0 END) +
        (CASE WHEN followup3_aberto_em IS NOT NULL THEN 1 ELSE 0 END) AS qtd_aberturas
      FROM campanha_contatos
    ) x
    GROUP BY qtd_aberturas ORDER BY qtd_aberturas
  `);
  console.log('\n=== Distribuição por quantidade de e-mails distintos abertos (0 a 4) ===');
  console.table(porQtdAberturas.rows);

  const abriu2Total = await query(`
    SELECT COUNT(*) c FROM campanha_contatos cc
    WHERE (
      (CASE WHEN cc.aberto_em IS NOT NULL THEN 1 ELSE 0 END) +
      (CASE WHEN cc.followup1_aberto_em IS NOT NULL THEN 1 ELSE 0 END) +
      (CASE WHEN cc.followup2_aberto_em IS NOT NULL THEN 1 ELSE 0 END) +
      (CASE WHEN cc.followup3_aberto_em IS NOT NULL THEN 1 ELSE 0 END)
    ) >= 2
  `);
  console.log('\nAbriu >= 2 e-mails (total, com ou sem cadastro):', abriu2Total.rows[0].c);

  const abriu2NaoCadastrou = await query(`
    SELECT COUNT(*) c FROM campanha_contatos cc
    WHERE (
      (CASE WHEN cc.aberto_em IS NOT NULL THEN 1 ELSE 0 END) +
      (CASE WHEN cc.followup1_aberto_em IS NOT NULL THEN 1 ELSE 0 END) +
      (CASE WHEN cc.followup2_aberto_em IS NOT NULL THEN 1 ELSE 0 END) +
      (CASE WHEN cc.followup3_aberto_em IS NOT NULL THEN 1 ELSE 0 END)
    ) >= 2
    AND cc.email IS NOT NULL AND cc.email != ''
    AND NOT EXISTS (SELECT 1 FROM usuarios u WHERE LOWER(u.email) = LOWER(cc.email))
  `);
  console.log('Abriu >= 2 e-mails E NÃO se cadastrou:', abriu2NaoCadastrou.rows[0].c);

  // Bônus — já pensando no próximo passo (disparo por WhatsApp): desse grupo,
  // quantos têm celular preenchido de verdade (sem isso não dá pra disparar).
  const abriu2NaoCadastrouComCelular = await query(`
    SELECT COUNT(*) c FROM campanha_contatos cc
    WHERE (
      (CASE WHEN cc.aberto_em IS NOT NULL THEN 1 ELSE 0 END) +
      (CASE WHEN cc.followup1_aberto_em IS NOT NULL THEN 1 ELSE 0 END) +
      (CASE WHEN cc.followup2_aberto_em IS NOT NULL THEN 1 ELSE 0 END) +
      (CASE WHEN cc.followup3_aberto_em IS NOT NULL THEN 1 ELSE 0 END)
    ) >= 2
    AND cc.email IS NOT NULL AND cc.email != ''
    AND NOT EXISTS (SELECT 1 FROM usuarios u WHERE LOWER(u.email) = LOWER(cc.email))
    AND cc.celular IS NOT NULL AND cc.celular != ''
  `);
  console.log('Do grupo acima, com celular preenchido (dá pra disparar WhatsApp):', abriu2NaoCadastrouComCelular.rows[0].c);

  const amostra = await query(`
    SELECT cc.id, cc.nome, cc.email, cc.celular,
      (CASE WHEN cc.aberto_em IS NOT NULL THEN 1 ELSE 0 END) +
      (CASE WHEN cc.followup1_aberto_em IS NOT NULL THEN 1 ELSE 0 END) +
      (CASE WHEN cc.followup2_aberto_em IS NOT NULL THEN 1 ELSE 0 END) +
      (CASE WHEN cc.followup3_aberto_em IS NOT NULL THEN 1 ELSE 0 END) AS qtd_aberturas
    FROM campanha_contatos cc
    WHERE (
      (CASE WHEN cc.aberto_em IS NOT NULL THEN 1 ELSE 0 END) +
      (CASE WHEN cc.followup1_aberto_em IS NOT NULL THEN 1 ELSE 0 END) +
      (CASE WHEN cc.followup2_aberto_em IS NOT NULL THEN 1 ELSE 0 END) +
      (CASE WHEN cc.followup3_aberto_em IS NOT NULL THEN 1 ELSE 0 END)
    ) >= 2
    AND cc.email IS NOT NULL AND cc.email != ''
    AND NOT EXISTS (SELECT 1 FROM usuarios u WHERE LOWER(u.email) = LOWER(cc.email))
    AND cc.celular IS NOT NULL AND cc.celular != ''
    LIMIT 15
  `);
  console.log('\n=== Amostra (até 15) ===');
  console.table(amostra.rows);

  process.exit(0);
}

main().catch(e => { console.error('ERRO:', e.message); process.exit(1); });
