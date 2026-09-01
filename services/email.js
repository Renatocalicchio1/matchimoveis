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
// "motivo": 'manual' (a própria pessoa clicou em descadastrar), 'bounce'
// (SES avisou que o endereço não existe/rejeitou permanentemente) ou
// 'reclamacao' (SES avisou que a pessoa marcou como spam) — ver
// services/sesWebhook.js. Todos os três caminhos usam a MESMA tabela, então
// o enviarEmail() já bloqueia automaticamente sem precisar checar 3 lugares.
let _tabelaOptoutPronta = false;
async function _garantirTabelaOptout() {
  if (_tabelaOptoutPronta) return;
  await query(`CREATE TABLE IF NOT EXISTS email_optout (
    email TEXT PRIMARY KEY,
    criado_em TIMESTAMP DEFAULT NOW()
  )`);
  await query(`ALTER TABLE email_optout ADD COLUMN IF NOT EXISTS motivo TEXT DEFAULT 'manual'`);
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

async function descadastrarEmail(email, motivo) {
  const e = _normalizarEmail(email);
  if (!e) return;
  await _garantirTabelaOptout();
  await query(
    'INSERT INTO email_optout (email, motivo) VALUES ($1,$2) ON CONFLICT (email) DO NOTHING',
    [e, motivo || 'manual']
  );
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

// Abertura padrão — igual à identificação do rodapé, mas em cima (primeira
// coisa que a pessoa vê), com link pra quem quiser conferir a empresa.
// Várias redações fixas sorteadas por envio, mesmo princípio de sempre variar.
const INTROS_EMPRESA = [
  'Olá! Somos a MatchImóveis, uma empresa do segmento imobiliário que ajuda unir quem está buscando um imóvel com quem tem um imóvel pra vender ou alugar.',
  'Olá! Aqui é a MatchImóveis — uma plataforma do mercado imobiliário feita pra conectar quem procura um imóvel com quem tem um imóvel disponível pra vender ou alugar.',
  'Oi! Somos a MatchImóveis, empresa do segmento imobiliário que une quem está buscando um imóvel e quem tem um imóvel pra vender ou alugar.',
  'Olá! A MatchImóveis é uma empresa voltada ao mercado imobiliário, feita pra unir quem procura um imóvel com quem tem um imóvel pra vender ou alugar.'
];
function _sortearIntro() { return INTROS_EMPRESA[Math.floor(Math.random() * INTROS_EMPRESA.length)]; }

function _cabecalhoEmpresa() {
  const intro = _sortearIntro();
  const dominio = BASE_URL.replace('https://', '');
  return {
    html: '<div style="padding:14px 24px;background:#fff5f5;border-bottom:2px solid #FF385C;font-family:Arial,sans-serif;font-size:12.5px;color:#374151;line-height:1.5">' + intro + ' Pra conferir a empresa, acesse <a href="' + BASE_URL + '" style="color:#FF385C;font-weight:600">' + dominio + '</a>.</div>',
    texto: intro + ' Pra conferir a empresa, acesse ' + BASE_URL + '.\n\n'
  };
}

// Marca d'água discreta da marca (ago/2026, pedido do Renato: "só um
// detalhezinho bem pequenininho... uma araucária, de canto, disfarçadinho,
// porque ela cresce pra cima") — SVG embutido como data URI (não depende de
// hospedar arquivo em lugar nenhum), cor cinza-esverdeada bem sutil, 20px,
// flutuando no canto do rodapé de todo e-mail que passa por enviarEmail().
const _ARAUCARIA_MARK_SRC = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAiIGhlaWdodD0iMjAiIHZpZXdCb3g9IjAgMCAyNCAyNCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KICA8ZyBmaWxsPSJub25lIiBzdHJva2U9IiNCN0M3QzQiIHN0cm9rZS13aWR0aD0iMS40IiBzdHJva2UtbGluZWNhcD0icm91bmQiPgogICAgPGxpbmUgeDE9IjEyIiB5MT0iMjIiIHgyPSIxMiIgeTI9IjkiLz4KICAgIDxwYXRoIGQ9Ik0xMiAxOCBDOSAxNy41IDYuNSAxOC41IDUgMjAuNSBNMTIgMTggQzE1IDE3LjUgMTcuNSAxOC41IDE5IDIwLjUiLz4KICAgIDxwYXRoIGQ9Ik0xMiAxNC41IEM5LjUgMTQgNy41IDE0LjggNi4zIDE2LjUgTTEyIDE0LjUgQzE0LjUgMTQgMTYuNSAxNC44IDE3LjcgMTYuNSIvPgogICAgPHBhdGggZD0iTTEyIDExLjMgQzEwLjIgMTEgOC44IDExLjYgOCAxMi44IE0xMiAxMS4zIEMxMy44IDExIDE1LjIgMTEuNiAxNiAxMi44Ii8+CiAgICA8Y2lyY2xlIGN4PSIxMiIgY3k9IjcuNSIgcj0iMS42IiBmaWxsPSIjQjdDN0M0IiBzdHJva2U9Im5vbmUiLz4KICA8L2c+Cjwvc3ZnPg==';

function _rodapeDescadastro(email) {
  const link = BASE_URL + '/email/descadastrar?email=' + encodeURIComponent(email);
  const identificacao = _sortearIdentificacao();
  return {
    html: '<div style="margin-top:32px;padding-top:16px;border-top:1px solid #e5e7eb;font-family:Arial,sans-serif;font-size:11px;color:#9ca3af">'
      + '<img src="' + _ARAUCARIA_MARK_SRC + '" width="20" height="20" alt="" style="float:right;margin-left:10px;opacity:.8">'
      + identificacao + '<br><br>Você recebeu este email da MatchImóveis. <a href="' + link + '" style="color:#9ca3af;text-decoration:underline">Não quero mais receber email desta empresa</a></div>',
    texto: '\n\n---\n' + identificacao + '\nVocê recebeu este email da MatchImóveis. Não quer mais receber? ' + link
  };
}

// ── TRACKING DE EMAIL (abertura + clique) ────────────────────────────────────
// Vale pra QUALQUER email que passe por enviarEmail() e informe `tipo` — como
// enviarEmail() é o único ponto de saída de email do sistema, isso cobre todo
// tipo de disparo (transacional, notificação, campanha) sem precisar de um
// mecanismo por fluxo. `variante` identifica qual redação de assunto/copy/botão
// foi usada nesse envio (pra comparar performance entre variações depois).
let _tabelaEmailEnviosPronta = false;
async function _garantirTabelaEmailEnvios() {
  if (_tabelaEmailEnviosPronta) return;
  await query(`CREATE TABLE IF NOT EXISTS email_envios (
    id SERIAL PRIMARY KEY,
    tipo TEXT NOT NULL,
    variante TEXT,
    destinatario TEXT,
    lead_id TEXT,
    user_id TEXT,
    assunto TEXT,
    botao_texto TEXT,
    enviado_em TIMESTAMP DEFAULT NOW(),
    aberto_em TIMESTAMP,
    aberturas INT DEFAULT 0,
    clicado_em TIMESTAMP,
    cliques INT DEFAULT 0
  )`);
  await query(`CREATE INDEX IF NOT EXISTS idx_email_envios_tipo ON email_envios(tipo, variante)`);
  _tabelaEmailEnviosPronta = true;
}

// Reescreve todo link http(s) do corpo pra passar pelo redirect de clique —
// cobre o botão de CTA e qualquer outro link solto, sem exigir que quem chama
// enviarEmail() marque manualmente "qual é o botão".
function _rastrearLinks(html, envioId) {
  return html.replace(/href="(https?:\/\/[^"]+)"/g, (m, url) => {
    return 'href="' + BASE_URL + '/email/clique/' + envioId + '?u=' + encodeURIComponent(url) + '"';
  });
}

async function registrarAberturaEmail(id) {
  await query(`UPDATE email_envios SET aberto_em = COALESCE(aberto_em, NOW()), aberturas = aberturas + 1 WHERE id=$1`, [id]).catch(() => {});
}

async function registrarCliqueEmail(id) {
  await query(`UPDATE email_envios SET clicado_em = COALESCE(clicado_em, NOW()), cliques = cliques + 1 WHERE id=$1`, [id]).catch(() => {});
}

// Agrega desempenho por tipo+variante+assunto+botão — base da tela /admin/emails.
// cadastrados: quantos destinatários distintos desse grupo hoje têm conta em
// usuarios (pedido explícito do Renato, ago/2026 — conversão real por
// campanha, não só abertura/clique).
async function statsEmailEnvios() {
  await _garantirTabelaEmailEnvios();
  const { rows } = await query(`
    SELECT tipo, variante, assunto, botao_texto,
      COUNT(*)::int as enviados,
      COUNT(aberto_em)::int as abertos,
      COUNT(clicado_em)::int as clicados,
      COUNT(DISTINCT CASE WHEN LOWER(destinatario) IN (SELECT LOWER(email) FROM usuarios WHERE email IS NOT NULL AND email != '') THEN LOWER(destinatario) END)::int as cadastrados,
      MAX(enviado_em) as ultimo_envio
    FROM email_envios
    GROUP BY tipo, variante, assunto, botao_texto
    ORDER BY tipo, enviados DESC
  `);
  return rows;
}

// Total de cadastros ÚNICOS entre TODO email já rastreado (email_envios +
// campanha_contatos), pro KPI geral de /admin/emails. NÃO é a soma do
// `cadastrados` de cada linha de statsEmailEnvios()/statsPorModeloEmail() —
// essas linhas são por tipo+variante, e uma mesma pessoa aparece em várias
// (ex: recebeu o e-mail principal da campanha E o followup1 E o followup2 —
// 3 linhas diferentes, mesmo email). Somar as linhas conta esse mesmo
// cadastro 2-3x; aqui é 1 query só, com COUNT(DISTINCT email) sobre a união
// das duas fontes, então cada pessoa entra 1x no total, não importa quantos
// tipos de email ela recebeu.
async function contarCadastradosUnicos() {
  await _garantirTabelaEmailEnvios();
  const { rows } = await query(`
    SELECT COUNT(DISTINCT email_lower)::int as total FROM (
      SELECT LOWER(destinatario) as email_lower FROM email_envios WHERE destinatario IS NOT NULL AND destinatario != ''
      UNION
      SELECT LOWER(email) FROM campanha_contatos WHERE status = 'enviado' AND email IS NOT NULL AND email != ''
    ) t
    WHERE email_lower IN (SELECT LOWER(email) FROM usuarios WHERE email IS NOT NULL AND email != '')
  `);
  return rows[0]?.total || 0;
}

// PAUSA GERAL DE EMAIL (ago/2026, pedido explícito do Renato: "para o envio
// de todos os emails do sistema, tudo que envia email") — enviarEmail() é o
// único ponto de saída de email da plataforma (confirmado: nenhum outro
// arquivo instancia SESClient/SendEmailCommand direto), então esse boolean
// sozinho pausa TODO tipo de envio (transacional, notificação, campanha,
// follow-up, convite de portal etc) sem precisar mexer em cada fluxo. Não é
// remoção — quem chama continua recebendo um retorno normal ({skipped:true}),
// nenhum caller precisa saber que está pausado, nem quebra por causa disso.
// Reverter é só voltar pra false.
const _EMAILS_PAUSADOS = true;

async function enviarEmail({ para, assunto, html, texto, tipo, variante, botaoTexto, leadId, userId }) {
  if (_EMAILS_PAUSADOS) {
    console.log('[EMAIL] pausado (envio geral desligado) — não enviado pra:', para, tipo ? ('| tipo: ' + tipo + (variante ? '/' + variante : '')) : '');
    return { skipped: true, pausado: true };
  }
  if (await emailDescadastrado(para).catch(() => false)) {
    console.log('[EMAIL] pulado (descadastrado):', para);
    return { skipped: true };
  }
  let corpoHtml = html;
  let envioId = null;
  if (tipo) {
    try {
      await _garantirTabelaEmailEnvios();
      const r = await query(
        `INSERT INTO email_envios (tipo, variante, destinatario, lead_id, user_id, assunto, botao_texto) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
        [tipo, variante || null, para, leadId || null, userId || null, assunto, botaoTexto || null]
      );
      envioId = r.rows[0].id;
      corpoHtml = _rastrearLinks(corpoHtml, envioId) + '<img src="' + BASE_URL + '/email/pixel/' + envioId + '" width="1" height="1" style="display:none" alt="">';
    } catch (e) { console.error('[EMAIL] falha ao registrar tracking:', e.message); }
  }
  const cabecalho = _cabecalhoEmpresa();
  const rodape = _rodapeDescadastro(para);
  const cmd = new SendEmailCommand({
    Source: `MatchImóveis <${FROM}>`,
    Destination: { ToAddresses: [para] },
    Message: {
      Subject: { Data: assunto, Charset: 'UTF-8' },
      Body: {
        Html: { Data: cabecalho.html + corpoHtml + rodape.html, Charset: 'UTF-8' },
        Text: { Data: cabecalho.texto + (texto || assunto) + rodape.texto, Charset: 'UTF-8' }
      }
    }
  });
  const result = await ses.send(cmd);
  console.log('[EMAIL] enviado para:', para, '| MessageId:', result.MessageId, tipo ? ('| tipo: ' + tipo + (variante ? '/' + variante : '')) : '');
  return { ...result, envioId };
}

module.exports = { enviarEmail, descadastrarEmail, emailDescadastrado, registrarAberturaEmail, registrarCliqueEmail, statsEmailEnvios, contarCadastradosUnicos };
