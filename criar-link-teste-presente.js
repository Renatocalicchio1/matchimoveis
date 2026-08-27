// Cria 1 contato de teste (dentro de uma campanha de disparo de teste,
// separada da campanha real "Dia do Corretor") vinculado ao Bruno
// (BRU-8MPC), e imprime o link real de /entrar/:id?ref=BRU-8MPC — o MESMO
// link que o botão "🎁 Receber meu presente" do WhatsApp vai abrir de
// verdade. Serve pra testar o fluxo inteiro (cadastro automático, bônus de
// 100 coins pro Bruno, celebração, trava de área de atuação) sem precisar
// disparar WhatsApp nenhum.
//
// Usa um telefone falso (nunca existiu na base) por padrão, pra não colidir
// com ninguém real — pode passar um telefone de verdade seu como argumento
// se quiser testar recebendo em algum lugar.
//
// Grava 1 linha em disparos_campanhas + 1 em disparos_contatos (dado de
// teste, não mexe em nada da campanha real). Não desfaz sozinho — se quiser
// limpar depois, apague pelo nome da campanha ("TESTE — link presente").
//
// Rodar (Render Shell):
//   node criar-link-teste-presente.js
//   node criar-link-teste-presente.js 5511999998888   (telefone específico)
require('dotenv').config();
const { criarCampanha, inserirContatos } = require('./services/salvarDisparo');

async function main() {
  const telefoneArg = process.argv[2];
  const telefoneTeste = telefoneArg ? telefoneArg.replace(/\D/g, '') : ('5511' + Math.floor(900000000 + Math.random() * 99999999));

  const campanhaId = await criarCampanha({
    nomeCampanha: 'TESTE — link presente (apagar depois)',
    templateNome: 'teste_manual',
    templateIdioma: 'pt_BR',
    corretorUserId: null,
    usarContatoIdBotao: true,
    phoneNumberId: '1210590465475893'
  });

  const { inseridos } = await inserirContatos(
    campanhaId,
    [{ nome: 'Corretor Teste', telefone: telefoneTeste, variaveis: { nome: 'Corretor Teste', refAdmin: 'BRU-8MPC' } }],
    new Set(),
    true // ignorarHistorico
  );

  const { query } = require('./services/db');
  const { rows } = await query(`SELECT id FROM disparos_contatos WHERE campanha_id=$1 LIMIT 1`, [campanhaId]);
  const contatoId = rows[0]?.id;

  console.log('Contatos inseridos:', inseridos);
  console.log('Telefone de teste usado:', telefoneTeste);
  console.log('\n=== LINK PRA TESTAR (abre em aba anônima, sem estar logado) ===');
  console.log('https://www.matchimoveis.ia.br/entrar/' + contatoId + '?ref=BRU-8MPC');

  process.exit(0);
}

main().catch(e => { console.error('ERRO:', e.message); process.exit(1); });
