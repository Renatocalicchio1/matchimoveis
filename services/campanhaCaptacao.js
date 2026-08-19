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
const { emailValido } = require('./validarEmailFormato');

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

// Reescrito (ago/2026, taxa de clique estava em 1,6% dos que abriram —
// bem abaixo da campanha de corretor): trocado "cadastrar" (que soa como
// burocracia) por benefício pessoal concreto — não precisar atender
// corretor um por um, não precisar sair anunciando em vários lugares.
const CORPOS = [
  'Cadastre seu imóvel em menos de 2 minutos e deixa com a gente atender quem se interessar — sem você precisar responder ligação nem mensagem de corretor um por um.',
  'Divulgamos automaticamente nos principais portais do Brasil (OLX, ZAP, VivaReal e mais) — você preenche uma vez, sem custo nenhum.',
  'Preencha as informações básicas do seu imóvel e nosso time cuida do resto: divulgação, contato com interessados, agendamento de visita.',
  'Tem gente procurando um imóvel como o seu agora mesmo — sem você precisar sair anunciando em vários lugares por conta própria.',
  'Sem comissão pra cadastrar. Você preenche uma vez e a gente cuida de fazer seu imóvel aparecer pra quem procura.',
  'Uma rede de milhares de corretores pode estar buscando exatamente um imóvel como o seu agora — sem você precisar correr atrás de ninguém.',
  'Cadastro rápido, sem burocracia — e você decide se aceita alguma proposta que aparecer, sem compromisso nenhum.',
  'Quanto mais rápido seu imóvel aparecer pros interessados certos, mais rápido surgem as propostas — e cadastrar é grátis.'
];

// Gancho inicial — reescrito (ago/2026) pra depender menos de a pessoa
// "lembrar" da marca Match Imóveis (ela pode ter interagido só com o
// corretor, sem nunca ver esse nome) e trazer o benefício mais cedo.
// Sorteado à parte do corpo, pra multiplicar as combinações possíveis.
const GANCHOS = [
  'Você entrou em contato com um corretor pela nossa plataforma. E se, ao invés de procurar um imóvel, você tivesse um pra vender ou alugar agora?',
  'Enquanto você procurava um imóvel por aqui, tem gente do outro lado buscando exatamente o oposto: alguém com um imóvel pra vender ou alugar.',
  'Você já usou a Match Imóveis pra buscar um imóvel. Se por acaso você também tem um pra vender ou alugar, a gente cuida da divulgação pra você.',
  'Sabemos que você andou procurando um imóvel recentemente. Se você também tem um imóvel seu parado, esperando comprador ou inquilino, isso pode te interessar.',
  'Vender ou alugar um imóvel sozinho dá trabalho: atender ligação, marcar visita, negociar. A gente faz isso por você, de graça.'
];

function _sorteia(lista) { return lista[Math.floor(Math.random() * lista.length)]; }

// ── Follow-ups automáticos (3 estágios, 5 variações cada) ──────────────────
// Mesmo princípio da campanha geral (services/campanha.js): nunca manda o
// mesmo texto sempre igual. Gatilho de cada estágio (ver proximoFollowup1/2/3
// abaixo): 1) não abriu o e-mail original; 2) abriu mas não clicou no link;
// 3) clicou mas não chegou a iniciar o cadastro do imóvel — 24h depois do
// respectivo evento, 1x por contato por estágio.
const MODELOS_FOLLOWUP = {
  followup1: [
    { assunto: 'Você viu o convite pra cadastrar seu imóvel?', corpo: 'Te mandei um e-mail sobre cadastrar seu imóvel na nossa rede de corretores, mas talvez tenha passado despercebido. Ainda dá tempo — leva menos de 2 minutos.' },
    { assunto: 'Ainda dá tempo de cadastrar seu imóvel', corpo: 'Notei que você ainda não abriu o e-mail que mandei sobre colocar seu imóvel numa rede com mais de 9.000 corretores. Vale a pena dar uma olhada.' },
    { assunto: 'Seu imóvel pode estar rendendo mais', corpo: 'Passando aqui de novo — te mandei um convite pra cadastrar seu imóvel sem custo, mas acho que ele passou batido. Confira quando puder.' },
    { assunto: '2 minutos pra colocar seu imóvel à venda ou aluguel', corpo: 'Reforçando o convite: cadastre seu imóvel na nossa plataforma e ele passa a aparecer pra milhares de interessados, sem nenhum custo.' },
    { assunto: 'Não quero que você perca essa oportunidade', corpo: 'Te chamei outro dia pra cadastrar seu imóvel com a gente, mas acho que o e-mail não chegou a ser aberto. Segue o convite de novo.' },
  ],
  followup2: [
    { assunto: 'Vi que você abriu meu e-mail sobre o seu imóvel', corpo: 'Você chegou a abrir o e-mail sobre cadastrar seu imóvel, mas ainda não deu o próximo passo. Dá uma olhada na página, é rápido.' },
    { assunto: 'Falta só um clique pra cadastrar seu imóvel', corpo: 'Notei que você abriu meu e-mail mas ainda não visitou a página de cadastro. Leva menos de 2 minutos, sem compromisso.' },
    { assunto: 'Seu imóvel ainda não está na nossa rede', corpo: 'Vi que você deu uma olhada no e-mail, mas ainda falta clicar pra ver como funciona o cadastro. Vale a pena conferir.' },
    { assunto: 'Passando pra lembrar do seu imóvel', corpo: 'Você abriu o convite que mandei, mas ainda não visitou a página de cadastro do imóvel. Sem comissão pra cadastrar, é só clicar.' },
    { assunto: 'Ainda dá tempo de colocar seu imóvel na vitrine', corpo: 'Vi que você abriu o e-mail sobre cadastrar seu imóvel. Se quiser continuar, é só entrar na página e preencher os dados básicos.' },
  ],
  followup3: [
    { assunto: 'Faltou só finalizar o cadastro do seu imóvel', corpo: 'Vi que você chegou a entrar na página pra cadastrar seu imóvel, mas não chegou a preencher os dados. Volta lá quando puder, leva menos de 2 minutos.' },
    { assunto: 'Seu imóvel está a um passo de aparecer pra milhares de corretores', corpo: 'Notei que você visitou a página de cadastro do seu imóvel, mas o cadastro ficou pela metade. Termina quando quiser, é rápido.' },
    { assunto: 'Não perca a chance de divulgar seu imóvel de graça', corpo: 'Você chegou a acessar a página de cadastro, mas não finalizou. Sem comissão pra cadastrar — vale a pena voltar e terminar.' },
    { assunto: 'Faltou pouco pra colocar seu imóvel na nossa rede', corpo: 'Vi que você entrou na página de cadastro do imóvel outro dia, mas não concluiu. Se quiser, ainda dá tempo de finalizar.' },
    { assunto: 'Seu imóvel pode estar perdendo interessados', corpo: 'Você chegou perto de cadastrar seu imóvel com a gente, mas o cadastro não foi concluído. Termina agora e comece a aparecer pra quem procura.' },
  ],
};

// Benefícios fixos em tópicos — sempre os mesmos, escaneáveis em 2 segundos.
// Só o texto de abertura (gancho + corpo) varia; a estrutura visual não.
const BENEFICIOS_CAPTACAO = [
  'Rede de mais de 9.000 corretores em todo o Brasil',
  'Cadastro simples, leva menos de 2 minutos',
  'Divulgação automática em portais como OLX, ZAP e VivaReal',
  'Sem comissão pra cadastrar'
];

// Botão trocado de "Cadastrar meu imóvel →" pra "Anunciar meu imóvel grátis →"
// (ago/2026) — "cadastrar" pede compromisso de preencher tudo já no primeiro
// clique; "anunciar...grátis" foca no resultado e no custo zero, sem
// prometer nada que a página de destino não entrega (ela já é o formulário
// de cadastro mesmo, só muda o enquadramento do convite).
function _montarHtml(nome, corpo, linkRastreado, pixelUrl) {
  const beneficios = BENEFICIOS_CAPTACAO.map(b =>
    '<li style="margin:8px 0;padding-left:22px;position:relative">'
    + '<span style="position:absolute;left:0;color:#00A699;font-weight:bold">✓</span>' + b + '</li>'
  ).join('');
  return '<div style="font-family:Arial,sans-serif;max-width:600px;padding:32px">'
    + '<h2 style="color:#FF385C;margin:0 0 16px 0">Olá, ' + (nome || '') + '!</h2>'
    + '<p style="margin:0 0 20px 0;font-size:15px;line-height:1.7;color:#222">' + corpo + '</p>'
    + '<ul style="list-style:none;padding:18px 22px;margin:0 0 24px 0;background:#f9fafb;border-radius:10px;font-size:14.5px;color:#374151">' + beneficios + '</ul>'
    + '<a href="' + linkRastreado + '" style="display:inline-block;padding:14px 28px;background:#FF385C;color:#fff;text-decoration:none;border-radius:8px;font-weight:bold;font-size:15px">Anunciar meu imóvel grátis →</a>'
    + '<p style="margin-top:18px;font-size:12.5px;color:#9ca3af">Sem compromisso — você decide se aceita alguma proposta.</p>'
    + '</div>'
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
  // Follow-up automático (mesmo mecanismo da campanha geral em services/campanha.js):
  // 3 e-mails, 24h depois do respectivo gatilho, 1x por contato por estágio.
  await query(`ALTER TABLE campanha_captacao_envios ADD COLUMN IF NOT EXISTS followup1_enviado_em TIMESTAMP`);
  await query(`ALTER TABLE campanha_captacao_envios ADD COLUMN IF NOT EXISTS followup2_enviado_em TIMESTAMP`);
  await query(`ALTER TABLE campanha_captacao_envios ADD COLUMN IF NOT EXISTS followup3_enviado_em TIMESTAMP`);
  // "Atender" manualmente pelo WhatsApp — mesma lógica de campanha_contatos
  // (claim por primeiro clique, cor gravada no momento do atendimento).
  await query(`ALTER TABLE campanha_captacao_envios ADD COLUMN IF NOT EXISTS atendido_por TEXT`);
  await query(`ALTER TABLE campanha_captacao_envios ADD COLUMN IF NOT EXISTS atendido_por_nome TEXT`);
  await query(`ALTER TABLE campanha_captacao_envios ADD COLUMN IF NOT EXISTS atendido_por_cor TEXT`);
  await query(`ALTER TABLE campanha_captacao_envios ADD COLUMN IF NOT EXISTS atendido_em TIMESTAMP`);
  // Diferente de atendido_por (quem "é dono" do contato, 1x) — marca toda
  // vez que o botão de WhatsApp manual foi clicado de fato, pra distinguir
  // na tela quem já foi contactado de quem ainda não foi.
  await query(`ALTER TABLE campanha_captacao_envios ADD COLUMN IF NOT EXISTS wa_manual_enviado_em TIMESTAMP`);
  // Vínculo com o imóvel de fato criado em /captar/iniciar (quando veio com
  // ?ce=) — usado pra creditar o bônus de 200 coins pro sub-admin certo
  // assim que o cadastro é finalizado (POST /captar/imovel/:id, finalizar=true)
  // e pra evitar creditar 2x o mesmo imóvel.
  await query(`ALTER TABLE campanha_captacao_envios ADD COLUMN IF NOT EXISTS imovel_captado_id TEXT`);
  await query(`ALTER TABLE campanha_captacao_envios ADD COLUMN IF NOT EXISTS bonus_captacao_pago_em TIMESTAMP`);
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
  _cacheStatusEm = 0;
}

async function pausarCampanha() {
  await _garantirTabelas();
  await query(`UPDATE captacao_campanha_config SET ativo=false, atualizado_em=NOW() WHERE id=1`);
  _cacheStatusEm = 0;
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

// Cache curto (60s) — _POOL_CAPTACAO_CTE junta leads (a tabela mais pesada
// do banco) com interessados_portal via NOT EXISTS correlacionado (compara
// email e telefone linha a linha, com regex de limpeza), a consulta mais
// cara do sistema. Rodava do zero toda vez que a tela /admin/captacao-
// campanha era aberta, e de novo a cada poll automático — consumindo o
// servidor à toa. Ago/2026. Invalidado na hora em iniciar/pausarCampanha
// pra não mostrar status desatualizado logo depois de clicar no botão.
let _cacheStatus = null;
let _cacheStatusEm = 0;
const _CACHE_STATUS_TTL_MS = 60000;
async function contarStatus() {
  if (_cacheStatus && (Date.now() - _cacheStatusEm) < _CACHE_STATUS_TTL_MS) return _cacheStatus;
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
  _cacheStatus = {
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
  _cacheStatusEm = Date.now();
  return _cacheStatus;
}

// ── Follow-ups automáticos ──────────────────────────────────────────────
// 3 estágios, cada um só elegível 24h depois do respectivo gatilho e só 1x
// por contato (followupN_enviado_em IS NULL). Diferente do estágio do botão
// de WhatsApp manual (que é por estado atual, sem prazo) — aqui tem prazo
// porque é disparo automático.
async function proximoFollowup1() {
  await _garantirTabelas();
  const { rows } = await query(`
    SELECT id, nome, email, telefone FROM campanha_captacao_envios
    WHERE erro IS NULL
      AND aberto_em IS NULL
      AND enviado_em <= NOW() - INTERVAL '24 hours'
      AND followup1_enviado_em IS NULL
    ORDER BY enviado_em ASC LIMIT 1
  `);
  return rows[0] || null;
}
async function proximoFollowup2() {
  await _garantirTabelas();
  const { rows } = await query(`
    SELECT id, nome, email, telefone FROM campanha_captacao_envios
    WHERE erro IS NULL
      AND aberto_em IS NOT NULL
      AND clicado_em IS NULL
      AND aberto_em <= NOW() - INTERVAL '24 hours'
      AND followup2_enviado_em IS NULL
    ORDER BY aberto_em ASC LIMIT 1
  `);
  return rows[0] || null;
}
async function proximoFollowup3() {
  await _garantirTabelas();
  const { rows } = await query(`
    SELECT id, nome, email, telefone FROM campanha_captacao_envios
    WHERE erro IS NULL
      AND clicado_em IS NOT NULL
      AND iniciou_cadastro_em IS NULL
      AND clicado_em <= NOW() - INTERVAL '24 hours'
      AND followup3_enviado_em IS NULL
    ORDER BY clicado_em ASC LIMIT 1
  `);
  return rows[0] || null;
}
const _FOLLOWUP_COLUNA = { 1: 'followup1_enviado_em', 2: 'followup2_enviado_em', 3: 'followup3_enviado_em' };
async function marcarFollowupEnviado(id, numero) {
  const coluna = _FOLLOWUP_COLUNA[numero];
  if (!coluna) throw new Error('número de follow-up inválido: ' + numero);
  await query(`UPDATE campanha_captacao_envios SET ${coluna}=NOW() WHERE id=$1`, [id]);
}
async function _enviarFollowup(envio, tipo, numero) {
  const variacao = _sorteia(MODELOS_FOLLOWUP[tipo]);
  const linkRastreado = BASE_URL + '/captacao-campanha/click/' + envio.id;
  const pixelUrl = BASE_URL + '/captacao-campanha/open/' + envio.id;
  try {
    await enviarEmail({
      para: envio.email,
      assunto: variacao.assunto,
      html: _montarHtml(envio.nome, variacao.corpo, linkRastreado, pixelUrl),
      texto: variacao.corpo + ' Cadastre: ' + linkRastreado,
      tipo: 'campanha_captacao_' + tipo,
      variante: variacao.assunto
    });
    await marcarFollowupEnviado(envio.id, numero);
    return { enviado: true, email: envio.email, modelo: tipo, titulo: variacao.assunto };
  } catch (e) {
    // não marca followupN_enviado_em em caso de erro — tenta de novo no
    // próximo ciclo (ver enviarProximoEmail: quem chama isso segue pra
    // próxima camada em vez de travar ali, mesmo fix aplicado em
    // services/campanha.js pra campanha geral)
    return { enviado: false, motivo: 'erro_envio', erro: e.message };
  }
}

// Quem (admin ou conta admin secundária) clicou pra falar com esse contato
// pelo WhatsApp — mesmo mecanismo de campanha_contatos (primeiro clique
// ganha, cor gravada no momento do atendimento).
async function marcarAtendido(id, { por, nome, cor }) {
  await _garantirTabelas();
  const { rows } = await query('SELECT atendido_por, atendido_por_nome, atendido_por_cor FROM campanha_captacao_envios WHERE id=$1', [id]);
  if (rows[0] && rows[0].atendido_por) {
    return { ok: false, jaAtendido: true, nome: rows[0].atendido_por_nome, cor: rows[0].atendido_por_cor };
  }
  await query(
    `UPDATE campanha_captacao_envios SET atendido_por=$1, atendido_por_nome=$2, atendido_por_cor=$3, atendido_em=NOW() WHERE id=$4`,
    [por, nome, cor, id]
  );
  return { ok: true, nome, cor };
}

// Marca que o botão de WhatsApp manual foi clicado de fato (mensagem aberta
// pra envio) — chamado a cada clique, pode sobrescrever (reenviar atualiza
// a data pro envio mais recente).
async function marcarWhatsappManualEnviado(id) {
  await _garantirTabelas();
  await query(`UPDATE campanha_captacao_envios SET wa_manual_enviado_em=NOW() WHERE id=$1`, [id]);
}

// Divide o backlog de envios sem atendente entre os sub-admins ativos —
// round-robin, idempotente (só mexe em quem tá com atendido_por vazio).
// Antes só pegava quem tinha clicado (clicado_em IS NOT NULL); mudou pra
// pegar TODO envio parado (erro IS NULL, senão inclui quem nem chegou a
// receber o e-mail) porque agora o trabalho do sub-admin aqui é mandar
// e-mail manual pra reativar quem tá parado, não só responder quem já
// demonstrou interesse — enquanto o disparo dessa campanha não integra com
// template de WhatsApp da Meta (ver /admin/disparos), esse é o canal.
// Prioriza quem clicou (interesse mais forte) antes do resto do backlog.
async function distribuirAtendimentosAbertos(contasAtivas) {
  await _garantirTabelas();
  if (!contasAtivas || !contasAtivas.length) return { distribuidos: 0 };
  const { rows } = await query(
    `SELECT id FROM campanha_captacao_envios
     WHERE erro IS NULL AND (atendido_por IS NULL OR atendido_por = '')
     ORDER BY (clicado_em IS NULL), COALESCE(clicado_em, enviado_em) ASC`
  );
  let distribuidos = 0;
  for (let i = 0; i < rows.length; i++) {
    const conta = contasAtivas[i % contasAtivas.length];
    await query(
      `UPDATE campanha_captacao_envios SET atendido_por=$1, atendido_por_nome=$2, atendido_por_cor=$3, atendido_em=NOW() WHERE id=$4`,
      [conta.usuario, conta.nome || conta.usuario, conta.cor, rows[i].id]
    );
    distribuidos++;
  }
  return { distribuidos };
}

// Vincula o imóvel de fato criado (POST /captar/iniciar) à linha da campanha
// que trouxe esse proprietário até aqui (?ce=) — sem isso não dá pra saber,
// no momento de finalizar o cadastro, qual sub-admin atendeu esse contato.
async function vincularImovelCaptado(envioId, imovelId) {
  if (!envioId || !imovelId) return;
  await _garantirTabelas();
  await query(`UPDATE campanha_captacao_envios SET imovel_captado_id=$1 WHERE id=$2`, [imovelId, envioId]);
}

// Chamado quando o cadastro do imóvel é finalizado (finalizar=true) — se
// esse imóvel veio da campanha de captação E tem um sub-admin atendendo,
// retorna quem deve receber os 200 coins. bonus_captacao_pago_em garante que
// só paga 1x por imóvel, mesmo se o form de finalizar for reenviado.
async function buscarEnvioParaBonus(imovelId) {
  await _garantirTabelas();
  const { rows } = await query(
    `SELECT id, atendido_por, atendido_por_nome FROM campanha_captacao_envios
     WHERE imovel_captado_id=$1 AND atendido_por IS NOT NULL AND atendido_por != '' AND bonus_captacao_pago_em IS NULL LIMIT 1`,
    [imovelId]
  );
  return rows[0] || null;
}
async function marcarBonusCaptacaoPago(envioId) {
  await _garantirTabelas();
  await query(`UPDATE campanha_captacao_envios SET bonus_captacao_pago_em=NOW() WHERE id=$1`, [envioId]);
}

// Número pode ter sido reciclado ou a pessoa pediu pra não receber mais —
// só apaga o telefone, mantém nome/email/histórico (e-mail nunca muda).
async function excluirTelefoneContato(id) {
  await _garantirTabelas();
  await query('UPDATE campanha_captacao_envios SET telefone=$1 WHERE id=$2', ['', id]);
}

// Roda 1 tick — manda pra UMA lead elegível ainda não contemplada. Chamado
// pelo job de 1/min em server.js. Follow-ups têm prioridade sobre o próximo
// contato "novo" da pool — mesmo princípio da campanha geral: prazo (24h)
// tem que sair no tempo certo. Follow-up com erro cai pra próxima camada
// (e por fim pra pool normal) em vez de travar o ciclo ali — sem isso, 1
// contato com envio sempre falhando vira "o próximo elegível" pra sempre e
// bloqueia a campanha inteira (bug real, corrigido antes na campanha geral).
async function enviarProximoEmail() {
  await _garantirTabelas();
  if (!(await estaAtiva())) return { enviado: false, motivo: 'pausada' };

  const f1 = await proximoFollowup1();
  if (f1) {
    const r1 = await _enviarFollowup(f1, 'followup1', 1);
    if (r1.enviado) return r1;
  }
  const f2 = await proximoFollowup2();
  if (f2) {
    const r2 = await _enviarFollowup(f2, 'followup2', 2);
    if (r2.enviado) return r2;
  }
  const f3 = await proximoFollowup3();
  if (f3) {
    const r3 = await _enviarFollowup(f3, 'followup3', 3);
    if (r3.enviado) return r3;
  }

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
  // Antes, "acabou a pool de gente nova" pausava a campanha inteira — mas
  // isso também impediria os follow-ups (que dependem de ativo=true) de
  // continuarem disparando pros dias seguintes, pra quem só ainda não
  // completou 24h de espera. Só registra "sem novo elegível" e segue ativa.
  if (!rows.length) return { enviado: false, motivo: 'sem_elegiveis_novos' };

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

  // Formato + MX do domínio — email que não passa nem some da fila (fica
  // registrado com erro) nem conta como enviado. O próximo tick já pula
  // pra próxima lead, já que essa entrou em campanha_captacao_envios.
  if (!(await emailValido(emailNorm))) {
    await query(`UPDATE campanha_captacao_envios SET erro=$1 WHERE id=$2`, ['email inválido (formato ou sem MX)', envioId]);
    return { enviado: false, motivo: 'email_invalido' };
  }

  const titulo = _sorteia(TITULOS);
  const corpo = _sorteia(GANCHOS) + ' ' + _sorteia(CORPOS);
  const linkRastreado = BASE_URL + '/captacao-campanha/click/' + envioId;
  const pixelUrl = BASE_URL + '/captacao-campanha/open/' + envioId;

  try {
    await enviarEmail({
      para: emailNorm,
      assunto: titulo,
      html: _montarHtml(lead.nome, corpo, linkRastreado, pixelUrl),
      texto: corpo + ' Cadastre: ' + linkRastreado,
      tipo: 'campanha_captacao_inicial',
      variante: titulo,
      leadId: lead.id
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

// Lista os envios mais recentes pra tabela do painel admin — filtro opcional
// por texto (nome/email) e por evento (abriu/clicou/cadastrou), pra achar
// rápido quem interagiu com a campanha sem precisar rolar tudo.
// "telefone": se a pessoa completou o cadastro do imóvel (virou lead
// tipo_lead='cliente_vendedor'), mostra o telefone QUE ELA MESMA digitou
// nesse cadastro (sempre mais atual) em vez do da planilha original de
// origem — mesmo princípio do celular da campanha geral (services/
// campanha.js): e-mail é o vínculo confiável, o telefone pode estar
// desatualizado na fonte antiga.
async function listarEnvios({ limite = 50, offset = 0, q = '', filtro = '', refAdmin = '' } = {}) {
  await _garantirTabelas();
  // Prefixo "e." em todas as colunas — a partir daqui a query ganhou JOIN
  // com imoveis/usuarios (pro flag do QuintoAndar) e "nome"/"email" existem
  // nas duas tabelas, então sem qualificar dava erro de coluna ambígua.
  let where = 'WHERE 1=1';
  const params = [];
  if (q) { params.push('%' + q + '%'); where += ` AND (e.nome ILIKE $${params.length} OR e.email ILIKE $${params.length} OR e.telefone ILIKE $${params.length})`; }
  if (filtro === 'abriu') where += ' AND e.aberto_em IS NOT NULL';
  else if (filtro === 'clicou') where += ' AND e.clicado_em IS NOT NULL';
  else if (filtro === 'cadastrou') where += ' AND e.iniciou_cadastro_em IS NOT NULL';
  else if (filtro === 'erro') where += ' AND e.erro IS NOT NULL';
  else if (filtro === 'captado') where += ' AND e.imovel_captado_id IS NOT NULL';
  else if (filtro === 'bonus_pago') where += ' AND e.bonus_captacao_pago_em IS NOT NULL';
  else if (filtro === 'followup1') where += ' AND e.followup1_enviado_em IS NOT NULL';
  else if (filtro === 'followup2') where += ' AND e.followup2_enviado_em IS NOT NULL';
  else if (filtro === 'followup3') where += ' AND e.followup3_enviado_em IS NOT NULL';
  else if (filtro === 'sem_followup') where += ' AND e.followup1_enviado_em IS NULL AND e.followup2_enviado_em IS NULL AND e.followup3_enviado_em IS NULL';
  // Sub-admin só vê os próprios atendimentos (cada um já tem atendimentos
  // feitos — não faz sentido ele ver a lista inteira de todo mundo). Pro
  // superadmin, refAdmin '_nenhum' acha quem ainda não tem sub-admin.
  if (refAdmin === '_nenhum') where += ` AND (e.atendido_por IS NULL OR e.atendido_por = '')`;
  else if (refAdmin) { params.push(refAdmin); where += ` AND e.atendido_por = $${params.length}`; }

  params.push(limite); params.push(offset);
  const { rows } = await query(
    `SELECT e.id, e.nome, e.email, e.titulo_usado, e.enviado_em, e.aberto_em, e.clicado_em, e.iniciou_cadastro_em, e.erro,
       e.followup1_enviado_em, e.followup2_enviado_em, e.followup3_enviado_em,
       e.atendido_por, e.atendido_por_nome, e.atendido_por_cor, e.atendido_em, e.wa_manual_enviado_em,
       e.imovel_captado_id, e.bonus_captacao_pago_em,
       COALESCE(
         (SELECT l.telefone FROM leads l WHERE l.tipo_lead='cliente_vendedor' AND l.telefone IS NOT NULL AND l.telefone != ''
          AND LOWER(l.email)=LOWER(e.email) ORDER BY l.criado_em DESC LIMIT 1),
         e.telefone
       ) AS telefone,
       im.status AS imovel_status,
       -- Aproximação dos critérios de services/gerarXMLQuintoAndarGlobal (server.js): endereço + proprietário
       -- completos, transação venda, status ativo e dono autorizado — sem o filtro exato de cidade atendida
       -- pelo QuintoAndar (lista fixa de ~90 municípios), então é "elegível", não garantia 100% de já estar no feed.
       (im.status='ativo' AND im.transacao='venda' AND u.autoriza_quintoandar=true
        AND COALESCE(im.cep,'')!='' AND COALESCE(im.endereco,'')!='' AND COALESCE(im.numero,'')!=''
        AND COALESCE(im.proprietario->>'nome','')!='' AND (COALESCE(im.proprietario->>'celular','')!='' OR COALESCE(im.proprietario->>'telefone','')!='')
       ) AS elegivel_quintoandar
     FROM campanha_captacao_envios e
     LEFT JOIN imoveis im ON im.id = e.imovel_captado_id
     LEFT JOIN usuarios u ON u.codigo_usuario = im.user_id
     ${where}
     -- Quem já recebeu o WhatsApp manual (wa_manual_enviado_em) desce pro
     -- final da lista — mesmo critério (e mesma posição, na frente da
     -- prioridade de elegibilidade abaixo) já aplicado em /admin/campanha/
     -- contatos (ago/2026), pra sumir de cima assim que o sub-admin clica
     -- "Enviar" e sobrar só quem ainda falta mandar.
     ORDER BY (e.wa_manual_enviado_em IS NULL) DESC,
       (COALESCE(
         (SELECT l.telefone FROM leads l WHERE l.tipo_lead='cliente_vendedor' AND l.telefone IS NOT NULL AND l.telefone != ''
          AND LOWER(l.email)=LOWER(e.email) ORDER BY l.criado_em DESC LIMIT 1),
         e.telefone
       ) IS NOT NULL AND COALESCE(
         (SELECT l.telefone FROM leads l WHERE l.tipo_lead='cliente_vendedor' AND l.telefone IS NOT NULL AND l.telefone != ''
          AND LOWER(l.email)=LOWER(e.email) ORDER BY l.criado_em DESC LIMIT 1),
         e.telefone
       ) <> '' AND e.iniciou_cadastro_em IS NULL AND e.enviado_em IS NOT NULL) DESC,
       e.enviado_em DESC
     LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );
  const { rows: totRows } = await query(`SELECT COUNT(*) AS total FROM campanha_captacao_envios e ${where}`, params.slice(0, -2));
  return { envios: rows, total: parseInt(totRows[0]?.total) || 0 };
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

// Round-robin de quem chega direto no link fixo /captar/REN-G9K6 (sem passar
// pela campanha de e-mail em massa) — schema diferente de
// distribuirAtendimentosAbertos: não usa campanha_captacao_envios (exige
// e-mail único, e essa captação normalmente nem coleta e-mail), vive direto
// na lead (leads.dados->>'atendidoPorAdminCaptacao'). NOT EXISTS exclui quem
// já foi tratado pela distribuição da campanha de e-mail (mesmo imóvel com
// imovel_captado_id numa linha de campanha_captacao_envios), pra não
// distribuir 2x a mesma captação em mecanismos diferentes. Serve também de
// catch-up de quem entrou antes desse mecanismo existir (ago/2026) — pedido
// do Renato.
async function distribuirCaptacaoDireta(contasAtivas) {
  if (!contasAtivas || !contasAtivas.length) return { distribuidos: 0 };
  const { rows } = await query(`
    SELECT l.id FROM leads l
    WHERE l.user_id='REN-G9K6' AND l.origem='captacao_link'
      AND (l.dados->>'atendidoPorAdminCaptacao' IS NULL OR l.dados->>'atendidoPorAdminCaptacao' = '')
      AND NOT EXISTS (
        SELECT 1 FROM imoveis im
        JOIN campanha_captacao_envios e ON e.imovel_captado_id = im.id
        WHERE im.dados->>'leadOrigemId' = l.id
      )
    ORDER BY l.criado_em ASC
  `);
  let distribuidos = 0;
  for (let i = 0; i < rows.length; i++) {
    const conta = contasAtivas[i % contasAtivas.length];
    await query(
      `UPDATE leads SET dados = dados || $1::jsonb WHERE id=$2`,
      [JSON.stringify({ atendidoPorAdminCaptacao: conta.usuario, atendidoPorAdminCaptacaoNome: conta.nome || conta.usuario, atendidoPorAdminCaptacaoCor: conta.cor }), rows[i].id]
    );
    distribuidos++;
  }
  return { distribuidos };
}

module.exports = {
  LINK_CAMPANHA,
  iniciarCampanha, pausarCampanha, estaAtiva,
  contarStatus, enviarProximoEmail,
  registrarAbertura, registrarClique, registrarInicioCadastro,
  listarEnvios, buscarEnvioParaPreview,
  marcarAtendido, excluirTelefoneContato,
  distribuirAtendimentosAbertos, vincularImovelCaptado,
  buscarEnvioParaBonus, marcarBonusCaptacaoPago,
  distribuirCaptacaoDireta, marcarWhatsappManualEnviado
};
