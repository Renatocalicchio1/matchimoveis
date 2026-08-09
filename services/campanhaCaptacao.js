// Campanha em massa (disparo único pelo admin) — convida TODAS as leads do
// sistema que ainda não cadastraram um imóvel a cadastrar, usando um link
// fixo (REN-G9K6) e rastreado (abertura + clique + início de cadastro).
// Separada do email individual de "cadastre seu imóvel" que já dispara
// sozinho quando uma lead nova entra (services/salvarLead.js, inalterado).
//
// 1 envio por minuto (ver job em server.js) — dedup por email (não por
// lead: a mesma pessoa pode aparecer como lead em várias contas de
// corretor, manda só 1x). enviarEmail() já cuida do rodapé de descadastro.
const { query } = require('./db');
const { enviarEmail } = require('./email');

const LINK_CAMPANHA = 'https://matchimoveis.ia.br/captar/REN-G9K6';
const BASE_URL = 'https://matchimoveis.ia.br';

// Assuntos com benefício concreto e verificável (sem prazo garantido de
// venda/aluguel — promessa desse tipo é a primeira coisa que derruba
// credibilidade e pode até configurar propaganda enganosa).
const TITULOS = [
  'Você tem um imóvel disponível pra vender ou alugar?',
  '9.000 corretores podem estar buscando um imóvel como o seu',
  'Cadastre seu imóvel e apareça pra quem está procurando',
  'Seu imóvel pode estar rendendo mais do que está hoje',
  'Sem comissão pra cadastrar seu imóvel',
  'Coloque seu imóvel na vitrine certa',
  'Milhares de interessados podem estar buscando um imóvel como o seu',
  'Seu imóvel em centenas de milhares de anúncios, sem custo',
  '2 minutos pra colocar seu imóvel à venda ou aluguel',
  'Divulgamos seu imóvel automaticamente em vários portais'
];

const CORPOS = [
  'Temos uma rede de mais de 9.000 corretores prontos pra ajudar a vender ou alugar seu imóvel. Cadastre em menos de 2 minutos e comece a receber interessados.',
  'Divulgamos automaticamente nos principais portais do Brasil (OLX, ZAP, VivaReal e mais), sem nenhum custo pra você cadastrar.',
  'Cadastre as informações básicas do seu imóvel — leva menos de 2 minutos — e nosso time entra em contato pra cuidar de tudo.',
  'Temos compradores e interessados buscando imóvel na sua região agora. Cadastre o seu e apareça pra eles.',
  'Sem comissão pra cadastrar. Preencha as informações do seu imóvel e deixe o resto com a gente.',
  'Uma rede de milhares de corretores pode estar buscando exatamente um imóvel como o seu agora. Cadastre e não perca a oportunidade.',
  'Cadastro rápido, sem burocracia. Em poucos minutos seu imóvel já está pronto pra ser encontrado por quem procura.',
  'Quanto mais rápido seu imóvel aparecer pros interessados certos, mais rápido surgem as propostas. Cadastre agora — é grátis.'
];

// Gancho inicial — lembra a pessoa que ela já buscou um imóvel (comprar ou
// alugar) na plataforma, e sugere que ela também pode ter um pra vender.
// Sorteado à parte do corpo, pra multiplicar as combinações possíveis.
const GANCHOS = [
  'Vimos que você já buscou um imóvel para comprar ou alugar por aqui. E se você também tiver um imóvel seu pra vender ou alugar?',
  'Notamos que você esteve procurando um imóvel pra comprar ou alugar. Se por acaso você também tem um imóvel seu pra vender ou alugar, a gente pode ajudar a divulgar.',
  'Você já usou a Match Imóveis pra buscar um imóvel — pra comprar ou alugar. Aproveitando, você também tem algum imóvel seu pra vender ou alugar?',
  'Sabemos que você esteve em busca de um imóvel recentemente (comprar ou alugar). Se você também tem um imóvel seu pra vender ou alugar, cadastre com a gente.',
  'Você buscou um imóvel pra comprar ou alugar aqui na plataforma. Talvez você também tenha um imóvel pra vender ou alugar — é rápido cadastrar.'
];

function _sorteia(lista) { return lista[Math.floor(Math.random() * lista.length)]; }

function _montarHtml(nome, corpo, linkRastreado, pixelUrl) {
  return '<div style="font-family:Arial,sans-serif;max-width:600px;padding:32px"><h2 style="color:#FF385C">Olá, ' + (nome || '') + '!</h2><p>' + corpo + '</p><a href="' + linkRastreado + '" style="display:inline-block;margin-top:16px;padding:12px 24px;background:#FF385C;color:#fff;text-decoration:none;border-radius:8px;font-weight:bold">Cadastrar meu imóvel →</a></div>'
    + (pixelUrl ? '<img src="' + pixelUrl + '" width="1" height="1" alt="" style="display:none">' : '');
}

let _tabelasProntas = false;
async function _garantirTabelas() {
  if (_tabelasProntas) return;
  await query(`CREATE TABLE IF NOT EXISTS campanha_captacao_envios (
    id SERIAL PRIMARY KEY,
    lead_id TEXT,
    email TEXT NOT NULL UNIQUE,
    nome TEXT,
    telefone TEXT,
    titulo_usado TEXT,
    corpo_usado TEXT,
    enviado_em TIMESTAMP DEFAULT NOW(),
    erro TEXT,
    aberto_em TIMESTAMP,
    clicado_em TIMESTAMP,
    iniciou_cadastro_em TIMESTAMP
  )`);
  // Colunas adicionadas depois da criação original — ALTER seguro pra quem
  // já tinha a tabela criada sem elas.
  await query(`ALTER TABLE campanha_captacao_envios ADD COLUMN IF NOT EXISTS telefone TEXT`);
  await query(`ALTER TABLE campanha_captacao_envios ADD COLUMN IF NOT EXISTS corpo_usado TEXT`);
  await query(`ALTER TABLE campanha_captacao_envios ADD COLUMN IF NOT EXISTS aberto_em TIMESTAMP`);
  await query(`CREATE TABLE IF NOT EXISTS captacao_campanha_config (
    id INT PRIMARY KEY DEFAULT 1,
    ativo BOOLEAN DEFAULT false,
    iniciado_em TIMESTAMP,
    atualizado_em TIMESTAMP DEFAULT NOW()
  )`);
  await query(`INSERT INTO captacao_campanha_config (id, ativo) VALUES (1, false) ON CONFLICT (id) DO NOTHING`);
  _tabelasProntas = true;
}

async function estaAtiva() {
  await _garantirTabelas();
  const { rows } = await query('SELECT ativo FROM captacao_campanha_config WHERE id=1');
  return !!(rows[0] && rows[0].ativo);
}

async function iniciarCampanha() {
  await _garantirTabelas();
  await query(`UPDATE captacao_campanha_config SET ativo=true, iniciado_em=COALESCE(iniciado_em, NOW()), atualizado_em=NOW() WHERE id=1`);
}

async function pausarCampanha() {
  await _garantirTabelas();
  await query(`UPDATE captacao_campanha_config SET ativo=false, atualizado_em=NOW() WHERE id=1`);
}

// Pool unificado das leads elegíveis — duas fontes:
// 1) `leads`: quem já buscou imóvel na plataforma (WhatsApp/manual/webhook/
//    importação), excluindo quem já é captação (_ehLeadCaptacao em server.js).
// 2) `interessados_portal`: a base minerada/importada (mesma usada em
//    /demanda) — não tem tipo_lead próprio, então checa "já captou" cruzando
//    telefone/email com uma lead de captação existente (mesmo critério do
//    job antigo de reenvio). NÃO mexe em vendido_em/vendido_para dessa
//    tabela — isso é de um fluxo diferente (compra paga via /demanda).
const _POOL_CAPTACAO_CTE = `
  WITH pool_captacao AS (
    SELECT l.id::text AS id, l.nome, l.email, COALESCE(l.telefone, l.whatsapp, l.contato) AS telefone, l.criado_em
    FROM leads l
    WHERE l.email IS NOT NULL AND l.email != ''
      AND COALESCE(l.tipo_lead, '') != 'cliente_vendedor'
      AND COALESCE(l.origem, '') != 'captacao_link'
      AND COALESCE(l.dados->>'temImovelParaCaptar', '') != 'true'
    UNION ALL
    SELECT ('interessado-' || ip.id) AS id, ip.nome, ip.email, ip.telefone, COALESCE(ip.data_lead, ip.criado_em) AS criado_em
    FROM interessados_portal ip
    WHERE ip.email IS NOT NULL AND ip.email != ''
      AND NOT EXISTS (
        SELECT 1 FROM leads lc
        WHERE lc.tipo_lead = 'cliente_vendedor'
          AND (
            LOWER(lc.email) = LOWER(ip.email)
            OR (ip.telefone IS NOT NULL AND ip.telefone != '' AND RIGHT(regexp_replace(COALESCE(lc.telefone, lc.whatsapp, ''), '\\D', '', 'g'), 8) = RIGHT(regexp_replace(ip.telefone, '\\D', '', 'g'), 8))
          )
      )
  )
`;

async function contarStatus() {
  await _garantirTabelas();
  const { rows: [ativo] } = await query('SELECT ativo, iniciado_em FROM captacao_campanha_config WHERE id=1');
  const { rows: [elegRow] } = await query(`
    ${_POOL_CAPTACAO_CTE}
    SELECT COUNT(DISTINCT LOWER(TRIM(email)))::int AS total FROM pool_captacao
  `);
  const { rows: [envRow] } = await query(`
    SELECT
      COUNT(*)::int AS enviados,
      COUNT(aberto_em)::int AS abertos,
      COUNT(clicado_em)::int AS clicados,
      COUNT(iniciou_cadastro_em)::int AS iniciaram
    FROM campanha_captacao_envios
    WHERE erro IS NULL
  `);
  const elegiveis = elegRow.total || 0;
  const enviados = envRow.enviados || 0;
  const abertos = envRow.abertos || 0;
  const clicados = envRow.clicados || 0;
  const iniciaram = envRow.iniciaram || 0;
  const pendentes = Math.max(0, elegiveis - enviados);
  return {
    ativo: !!(ativo && ativo.ativo),
    iniciadoEm: ativo && ativo.iniciado_em,
    elegiveis, enviados, pendentes, abertos, clicados, iniciaram,
    pctAbertura: enviados ? Math.round((abertos / enviados) * 1000) / 10 : 0,
    pctClique: enviados ? Math.round((clicados / enviados) * 1000) / 10 : 0,
    pctIniciaram: enviados ? Math.round((iniciaram / enviados) * 1000) / 10 : 0,
    // Intervalo entre envios é aleatório de 1 a 3 min (média 2) — ver
    // _agendarProximoEnvioCampanha em server.js.
    minutosRestantes: pendentes * 2,
  };
}

// Roda 1 tick — manda pra UMA lead elegível ainda não contemplada. Chamado
// pelo job de 1/min em server.js.
async function enviarProximoEmail() {
  await _garantirTabelas();
  if (!(await estaAtiva())) return { enviado: false, motivo: 'pausada' };

  const { rows } = await query(`
    ${_POOL_CAPTACAO_CTE}
    SELECT DISTINCT ON (LOWER(TRIM(p.email))) p.id, p.nome, p.email, p.telefone
    FROM pool_captacao p
    WHERE NOT EXISTS (
      SELECT 1 FROM campanha_captacao_envios e WHERE LOWER(TRIM(e.email)) = LOWER(TRIM(p.email))
    )
    ORDER BY LOWER(TRIM(p.email)), p.criado_em ASC
    LIMIT 1
  `);
  if (!rows.length) { await pausarCampanha(); return { enviado: false, motivo: 'concluida' }; }

  const lead = rows[0];
  const emailNorm = String(lead.email).trim();

  // Reserva a linha já (protege contra o próximo tick rodar antes desse
  // terminar de enviar, ex: envio lento na SES).
  let envioId;
  try {
    const { rows: ins } = await query(
      `INSERT INTO campanha_captacao_envios (lead_id, email, nome, telefone) VALUES ($1,$2,$3,$4)
       ON CONFLICT (email) DO NOTHING RETURNING id`,
      [lead.id, emailNorm, lead.nome || '', lead.telefone || '']
    );
    if (!ins.length) return { enviado: false, motivo: 'ja_reservado' };
    envioId = ins[0].id;
  } catch (e) { return { enviado: false, motivo: 'erro_reserva', erro: e.message }; }

  const titulo = _sorteia(TITULOS);
  const corpo = _sorteia(GANCHOS) + ' ' + _sorteia(CORPOS);
  const linkRastreado = BASE_URL + '/captacao-campanha/click/' + envioId;
  const pixelUrl = BASE_URL + '/captacao-campanha/open/' + envioId;

  try {
    await enviarEmail({
      para: emailNorm,
      assunto: titulo,
      html: _montarHtml(lead.nome, corpo, linkRastreado, pixelUrl),
      texto: corpo + ' Cadastre: ' + linkRastreado
    });
    await query(`UPDATE campanha_captacao_envios SET titulo_usado=$1, corpo_usado=$2 WHERE id=$3`, [titulo, corpo, envioId]);
    return { enviado: true, email: emailNorm, titulo };
  } catch (e) {
    await query(`UPDATE campanha_captacao_envios SET erro=$1 WHERE id=$2`, [e.message, envioId]);
    return { enviado: false, motivo: 'erro_envio', erro: e.message };
  }
}

async function registrarAbertura(envioId) {
  if (!envioId) return;
  await _garantirTabelas();
  await query(`UPDATE campanha_captacao_envios SET aberto_em=COALESCE(aberto_em, NOW()) WHERE id=$1`, [envioId]);
}

async function registrarClique(envioId) {
  await _garantirTabelas();
  // Quem clicou necessariamente abriu — marca os dois se só o clique chegou
  // (cliente de email que bloqueia a imagem do pixel mas segue o link).
  await query(`UPDATE campanha_captacao_envios SET clicado_em=COALESCE(clicado_em, NOW()), aberto_em=COALESCE(aberto_em, NOW()) WHERE id=$1`, [envioId]);
}

async function registrarInicioCadastro(envioId) {
  if (!envioId) return;
  await _garantirTabelas();
  await query(`UPDATE campanha_captacao_envios SET iniciou_cadastro_em=COALESCE(iniciou_cadastro_em, NOW()) WHERE id=$1`, [envioId]);
}

// Lista os envios mais recentes pra tabela do painel admin.
async function listarEnvios({ limite = 50, offset = 0 } = {}) {
  await _garantirTabelas();
  const { rows } = await query(
    `SELECT id, nome, email, telefone, titulo_usado, enviado_em, aberto_em, clicado_em, iniciou_cadastro_em, erro
     FROM campanha_captacao_envios
     ORDER BY enviado_em DESC
     LIMIT $1 OFFSET $2`,
    [limite, offset]
  );
  return rows;
}

// Reconstrói o HTML exatamente como foi enviado (mesmo título/corpo), pro
// admin conferir como ficou — sem o pixel de abertura (preview não deve
// contar como "abriu").
async function buscarEnvioParaPreview(envioId) {
  await _garantirTabelas();
  const { rows } = await query(`SELECT * FROM campanha_captacao_envios WHERE id=$1`, [envioId]);
  const envio = rows[0];
  if (!envio) return null;
  const linkRastreado = BASE_URL + '/captacao-campanha/click/' + envio.id;
  const html = _montarHtml(envio.nome, envio.corpo_usado || '', linkRastreado, null);
  return { ...envio, html };
}

module.exports = {
  LINK_CAMPANHA,
  iniciarCampanha, pausarCampanha, estaAtiva,
  contarStatus, enviarProximoEmail,
  registrarAbertura, registrarClique, registrarInicioCadastro,
  listarEnvios, buscarEnvioParaPreview
};
