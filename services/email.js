const { SESClient, SendEmailCommand } = require('@aws-sdk/client-ses');
const { query } = require('./db');

const ses = new SESClient({
  region: process.env.AWS_REGION || 'us-east-2',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  }
});

const FROM = process.env.AWS_SES_FROM || 'noreply@matchimoveis.online';
const BASE_URL = 'https://matchimoveis.ia.br';

// Descadastro de email — vale pra QUALQUER email da plataforma (lead,
// proprietário/cliente ou corretor), não só campanha em massa. enviarEmail()
// é o único ponto de saída de email do sistema, então checar/anexar o
// rodapé aqui garante que nenhum tipo de email escapa dessa regra.
let _tabelaOptoutPronta = false;
async function _garantirTabelaOptout() {
  if (_tabelaOptoutPronta) return;
  await query(`CREATE TABLE IF NOT EXISTS email_optout (
    email TEXT PRIMARY KEY,
    criado_em TIMESTAMP DEFAULT NOW()
  )`);
  _tabelaOptoutPronta = true;
}

function _normalizarEmail(email) {
  return (email || '').toString().trim().toLowerCase();
}

async function emailDescadastrado(email) {
  const e = _normalizarEmail(email);
  if (!e) return false;
  await _garantirTabelaOptout();
  const { rows } = await query('SELECT 1 FROM email_optout WHERE email = $1', [e]);
  return rows.length > 0;
}

async function descadastrarEmail(email) {
  const e = _normalizarEmail(email);
  if (!e) return;
  await _garantirTabelaOptout();
  await query('INSERT INTO email_optout (email) VALUES ($1) ON CONFLICT DO NOTHING', [e]);
}

// Identificação da empresa — exigida em todo email comercial, vale pra
// QUALQUER envio da plataforma (junto do rodapé de descadastro acima).
// Várias redações fixas, sorteada uma por envio (mesmo princípio dos
// textos de campanha: nunca repetir literalmente a mesma frase toda vez).
const IDENTIFICACOES_EMPRESA = [
  'MatchImóveis é uma captadora de imóveis do Grupo Rankim (CNPJ 23.186.832/0001-40). Para corretores e imobiliárias, é uma plataforma completa com várias funcionalidades, incluindo captação de leads.',
  'MatchImóveis, do Grupo Rankim (CNPJ 23.186.832/0001-40), é uma plataforma de captação de imóveis. Pra corretores e imobiliárias, oferece uma plataforma completa com diversas funcionalidades, entre elas a captação de leads.',
  'A MatchImóveis (Grupo Rankim, CNPJ 23.186.832/0001-40) atua na captação de imóveis. Corretores e imobiliárias encontram aqui uma plataforma completa, com várias funcionalidades e captação de leads.',
  'MatchImóveis é uma empresa do Grupo Rankim (CNPJ 23.186.832/0001-40) especializada em captação de imóveis, e também é uma plataforma completa pra corretores e imobiliárias, com várias funcionalidades e captação de leads.'
];
function _sortearIdentificacao() { return IDENTIFICACOES_EMPRESA[Math.floor(Math.random() * IDENTIFICACOES_EMPRESA.length)]; }

function _rodapeDescadastro(email) {
  const link = BASE_URL + '/email/descadastrar?email=' + encodeURIComponent(email);
  const identificacao = _sortearIdentificacao();
  return {
    html: '<div style="margin-top:32px;padding-top:16px;border-top:1px solid #e5e7eb;font-family:Arial,sans-serif;font-size:11px;color:#9ca3af">' + identificacao + '<br><br>Você recebeu este email da MatchImóveis. <a href="' + link + '" style="color:#9ca3af;text-decoration:underline">Não quero mais receber email desta empresa</a></div>',
    texto: '\n\n---\n' + identificacao + '\nVocê recebeu este email da MatchImóveis. Não quer mais receber? ' + link
  };
}

async function enviarEmail({ para, assunto, html, texto }) {
  if (await emailDescadastrado(para).catch(() => false)) {
    console.log('[EMAIL] pulado (descadastrado):', para);
    return { skipped: true };
  }
  const rodape = _rodapeDescadastro(para);
  const cmd = new SendEmailCommand({
    Source: `MatchImóveis <${FROM}>`,
    Destination: { ToAddresses: [para] },
    Message: {
      Subject: { Data: assunto, Charset: 'UTF-8' },
      Body: {
        Html: { Data: html + rodape.html, Charset: 'UTF-8' },
        Text: { Data: (texto || assunto) + rodape.texto, Charset: 'UTF-8' }
      }
    }
  });
  const result = await ses.send(cmd);
  console.log('[EMAIL] enviado para:', para, '| MessageId:', result.MessageId);
  return result;
}

module.exports = { enviarEmail, descadastrarEmail, emailDescadastrado };
