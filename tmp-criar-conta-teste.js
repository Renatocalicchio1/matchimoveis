// Script de diagnóstico/teste — rodar no Render Shell: node tmp-criar-conta-teste.js
// Cria 1 conta corretor de teste com dado sintético (nunca dado real de
// ninguém): email em @example.com (domínio reservado IANA só pra
// documentação/teste, nunca entrega de verdade) e telefone com DDD 47
// (Balneário Camboriú) mas padrão claramente não-real.
const NOME = 'Conta Teste Claude';
const TELEFONE = '47000000001';
const EMAIL = 'conta.teste.claude@example.com';

function gerarCodigoUsuario(nome) {
  const ini = (nome || 'USR').substring(0, 3).toUpperCase().replace(/[^A-Z]/g, '').padEnd(3, 'X');
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let rand = '';
  for (let i = 0; i < 4; i++) rand += chars[Math.floor(Math.random() * chars.length)];
  return ini + '-' + rand;
}

(async () => {
  const { lerUsuarios, salvarUsuario } = require('./services/salvarUsuario');
  const { BONUS_CADASTRO } = require('./services/creditos');

  const users = await lerUsuarios();
  if (users.find(u => String(u.telefone || u.celular || '').replace(/\D/g, '') === TELEFONE)) {
    console.log('Já existe conta com esse telefone — nada foi criado.');
    process.exit(0);
  }
  if (users.find(u => (u.email || '').trim().toLowerCase() === EMAIL)) {
    console.log('Já existe conta com esse e-mail — nada foi criado.');
    process.exit(0);
  }

  const codigo = gerarCodigoUsuario(NOME);
  const novo = {
    id: codigo,
    codigoUsuario: codigo,
    nome: NOME,
    telefone: TELEFONE,
    celular: TELEFONE,
    email: EMAIL,
    tipo: 'corretor',
    ativo: true,
    senha: '', // login sem senha, só telefone — igual cadastro normal sem senha definida
    matchCoins: BONUS_CADASTRO,
    matchCoinsTotal: BONUS_CADASTRO,
    matchCoinsBonusInicial: BONUS_CADASTRO,
    afiliadoNivel: 3,
  };
  await salvarUsuario(novo);
  console.log('Conta de teste criada:');
  console.log('  Código:', codigo);
  console.log('  Nome:', NOME);
  console.log('  Telefone (login):', TELEFONE);
  console.log('  E-mail:', EMAIL);
  console.log('  Coins iniciais:', BONUS_CADASTRO);
  process.exit(0);
})().catch(e => { console.error('Erro:', e.message); process.exit(1); });
