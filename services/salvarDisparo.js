const { query } = require('./db');
const { v4: uuidv4 } = require('uuid');

let _iniciado = false;
async function _inicializar() {
  if (_iniciado) return;
  _iniciado = true;
  await query(`
    CREATE TABLE IF NOT EXISTS disparos_campanhas (
      id UUID PRIMARY KEY,
      nome_campanha TEXT NOT NULL,
      template_nome TEXT NOT NULL,
      template_idioma TEXT NOT NULL,
      mapeamento_variaveis JSONB DEFAULT '[]',
      status TEXT DEFAULT 'pendente',
      total_contatos INT DEFAULT 0,
      enviados INT DEFAULT 0,
      erros INT DEFAULT 0,
      delay_ms INT DEFAULT 2500,
      pausado BOOLEAN DEFAULT false,
      erro_geral TEXT,
      criado_em TIMESTAMP DEFAULT NOW(),
      criado_por TEXT,
      atualizado_em TIMESTAMP DEFAULT NOW()
    )
  `);
  await query(`
    CREATE TABLE IF NOT EXISTS disparos_contatos (
      id UUID PRIMARY KEY,
      campanha_id UUID NOT NULL REFERENCES disparos_campanhas(id) ON DELETE CASCADE,
      nome TEXT,
      telefone TEXT NOT NULL,
      variaveis JSONB DEFAULT '{}',
      status TEXT DEFAULT 'pendente',
      erro TEXT,
      tentativas INT DEFAULT 0,
      enviado_em TIMESTAMP,
      criado_em TIMESTAMP DEFAULT NOW()
    )
  `);
  await query(`CREATE INDEX IF NOT EXISTS idx_disparos_contatos_campanha ON disparos_contatos(campanha_id)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_disparos_contatos_status ON disparos_contatos(campanha_id, status)`);
  // corretor_user_id: pra quem os botões de link "Sim, eu tenho!"/"Quero ajuda pra
  // cadastrar!" apontam (/captar/{corretor_user_id}?tel={telefone}) — nulo pra
  // campanhas sem botão de URL dinâmica (só corpo de texto).
  await query(`ALTER TABLE disparos_campanhas ADD COLUMN IF NOT EXISTS corretor_user_id TEXT`);
  // Campanhas de aquisição de conta nova (ex: "leads garantidos") não apontam pra
  // um corretor existente — o botão de URL dinâmica usa o id da própria linha de
  // disparos_contatos como parâmetro (ex: /entrar/{id}), pra criar a conta na hora
  // que a pessoa clica. Fica desligado por padrão pra não afetar campanhas antigas.
  await query(`ALTER TABLE disparos_campanhas ADD COLUMN IF NOT EXISTS usar_contato_id_botao BOOLEAN DEFAULT false`);
  // Qual número da WABA envia essa campanha — desde que passamos a ter mais de
  // um número ativo (usuários do sistema vs. captação de proprietários), cada
  // campanha precisa saber o phone_number_id certo pra não tentar enviar
  // template de uma audiência pelo número da outra.
  await query(`ALTER TABLE disparos_campanhas ADD COLUMN IF NOT EXISTS phone_number_id TEXT`);
  // Telefones que clicaram "Não tenho imóvel" (resposta rápida) no webhook do Cloud
  // API — opt-out global, não fica preso a campanha/corretor específico porque a
  // planilha de disparo não tem dono.
  await query(`
    CREATE TABLE IF NOT EXISTS disparos_optout (
      telefone TEXT PRIMARY KEY,
      origem TEXT,
      criado_em TIMESTAMP DEFAULT NOW()
    )
  `);
  await query(`ALTER TABLE disparos_campanhas ADD COLUMN IF NOT EXISTS relancamentos INT DEFAULT 0`);
  // Campanhas que só podem mandar mensagem em janelas específicas do dia
  // (ex: horário de almoço/fim de tarde, pra não incomodar corretor em
  // horário ruim). Desligado por padrão — só liga quem pedir explicitamente
  // na criação da campanha.
  await query(`ALTER TABLE disparos_campanhas ADD COLUMN IF NOT EXISTS restringir_horario BOOLEAN DEFAULT false`);
  await query(`ALTER TABLE disparos_contatos ADD COLUMN IF NOT EXISTS auto_respondido_em TIMESTAMP`);
  // Teste A/B de mensagem: quando a campanha tem mais de 1 template em
  // `templates` (JSONB [{nome,idioma},...]), cada contato recebe um sorteado
  // na hora de entrar na fila (inserirContatos) — fica gravado nele mesmo
  // (template_nome_usado/idioma_usado) pra saber depois qual template levou
  // a mais clique/cadastro/compra. Campanha com 1 template só (a maioria)
  // usa direto template_nome/template_idioma, sem sorteio — templates fica
  // NULL e o worker cai no fallback.
  await query(`ALTER TABLE disparos_campanhas ADD COLUMN IF NOT EXISTS templates JSONB`);
  await query(`ALTER TABLE disparos_contatos ADD COLUMN IF NOT EXISTS template_nome_usado TEXT`);
  await query(`ALTER TABLE disparos_contatos ADD COLUMN IF NOT EXISTS template_idioma_usado TEXT`);
  // "enviado" só quer dizer que a Meta aceitou o pedido — não confirma que
  // chegou no aparelho da pessoa. O status de entrega de verdade (sent →
  // delivered → read, ou failed) chega depois via webhook (POST /messages
  // não devolve isso na hora) e é casado com o contato pelo message_id.
  await query(`ALTER TABLE disparos_contatos ADD COLUMN IF NOT EXISTS message_id TEXT`);
  await query(`ALTER TABLE disparos_contatos ADD COLUMN IF NOT EXISTS status_entrega TEXT`);
  await query(`ALTER TABLE disparos_contatos ADD COLUMN IF NOT EXISTS status_entrega_em TIMESTAMP`);
  await query(`CREATE INDEX IF NOT EXISTS idx_disparos_contatos_message_id ON disparos_contatos(message_id)`);
  // Reatribuição automática de contato de campanha (ago/2026): se o afiliado
  // dono (variaveis->>'refAdmin') não clicar em "Falar no WhatsApp" dentro de
  // 24h, o contato passa pra outro afiliado do mesmo nível — ver
  // _rodarReatribuicaoContatosAfiliado em server.js. contato_afiliado_em
  // marca o clique (GET /app/afiliados/contato/:id/whatsapp); reatribuido_em
  // reinicia a contagem de 24h a cada reatribuição (sem isso o
  // COALESCE(reatribuido_em, criado_em) usaria sempre a data de criação
  // original e reatribuiria de novo a cada ciclo do job).
  await query(`ALTER TABLE disparos_contatos ADD COLUMN IF NOT EXISTS contato_afiliado_em TIMESTAMP`);
  await query(`ALTER TABLE disparos_contatos ADD COLUMN IF NOT EXISTS reatribuido_em TIMESTAMP`);
  // Mensagem de follow-up (dispara dentro da janela de 24h pra quem respondeu
  // uma campanha) — linha única (id=1), editável pela tela em vez de fixa no
  // código.
  await query(`
    CREATE TABLE IF NOT EXISTS whatsapp_followup_config (
      id INT PRIMARY KEY DEFAULT 1,
      mensagem TEXT,
      atualizado_em TIMESTAMP DEFAULT NOW()
    )
  `);
}

// Janelas de envio em horário de Brasília (12h-13h e 20h-21h) — pedido
// explícito pra campanhas que não devem incomodar o corretor fora desses
// horários. Usa Intl com timeZone fixo em vez de confiar no TZ do processo
// (Render roda em UTC), então funciona igual local e em produção.
const JANELAS_HORARIO_BRASILIA = [12, 20];
function dentroDaJanelaDisparo() {
  const hora = parseInt(
    new Intl.DateTimeFormat('en-US', { timeZone: 'America/Sao_Paulo', hour: '2-digit', hour12: false }).format(new Date()),
    10
  );
  return JANELAS_HORARIO_BRASILIA.includes(hora);
}

async function listarCampanhasAguardandoJanela() {
  await _inicializar();
  const { rows } = await query(`SELECT * FROM disparos_campanhas WHERE status='aguardando_janela'`);
  return rows;
}

async function marcarOptout(telefone, origem) {
  await _inicializar();
  await query(
    `INSERT INTO disparos_optout (telefone, origem) VALUES ($1,$2) ON CONFLICT (telefone) DO NOTHING`,
    [telefone, origem || '']
  );
  // Além de bloquear campanhas futuras (checado em inserirContatos), cancela
  // na hora qualquer envio ainda pendente desse telefone em campanhas já
  // existentes (pausada, ou fila ainda não chegou nele) — clicar "não tenho
  // interesse" tem que parar de verdade, não só valer pra próxima campanha.
  await query(
    `UPDATE disparos_contatos SET status='optout' WHERE telefone=$1 AND status='pendente'`,
    [telefone]
  );
}

async function listarOptout(telefones) {
  await _inicializar();
  if (!telefones || !telefones.length) return [];
  const { rows } = await query(`SELECT telefone FROM disparos_optout WHERE telefone = ANY($1)`, [telefones]);
  return rows.map(r => r.telefone);
}

// Lista completa (nome vem de qualquer contato de disparo que já teve esse
// telefone, se existir) — pra tela de admin ver quem descadastrou e quando.
async function listarOptoutCompleto() {
  await _inicializar();
  const { rows } = await query(`
    SELECT o.telefone, o.origem, o.criado_em,
      (SELECT dc.nome FROM disparos_contatos dc WHERE dc.telefone = o.telefone AND dc.nome != '' ORDER BY dc.criado_em DESC LIMIT 1) as nome
    FROM disparos_optout o
    ORDER BY o.criado_em DESC
  `);
  return rows;
}

// Telefones que já receberam disparo com sucesso em QUALQUER campanha anterior —
// evita reenvio duplicado quando os 50k contatos são subidos em lotes/planilhas
// separadas ao longo do tempo (inserirContatos só olhava optout antes disso).
async function listarJaEnviados(telefones) {
  await _inicializar();
  if (!telefones || !telefones.length) return [];
  const { rows } = await query(
    `SELECT DISTINCT telefone FROM disparos_contatos WHERE telefone = ANY($1) AND status='enviado'`,
    [telefones]
  );
  return rows.map(r => r.telefone);
}

// templates: opcional, array [{nome,idioma}] pra teste A/B — quando tem
// 2+ entradas, cada contato sorteia um template na hora de entrar na fila
// (inserirContatos). templateNome/templateIdioma continuam obrigatórios
// como fallback (campanha de 1 template só não usa o array).
async function criarCampanha({ nomeCampanha, templateNome, templateIdioma, templates, mapeamentoVariaveis, delayMs, criadoPor, corretorUserId, usarContatoIdBotao, phoneNumberId, restringirHorario }) {
  await _inicializar();
  const id = uuidv4();
  await query(
    `INSERT INTO disparos_campanhas (id, nome_campanha, template_nome, template_idioma, templates, mapeamento_variaveis, delay_ms, criado_por, corretor_user_id, usar_contato_id_botao, phone_number_id, restringir_horario)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
    [id, nomeCampanha, templateNome, templateIdioma, (templates && templates.length > 1) ? JSON.stringify(templates) : null, JSON.stringify(mapeamentoVariaveis || []), delayMs || 2500, criadoPor || '', corretorUserId || null, !!usarContatoIdBotao, phoneNumberId || null, !!restringirHorario]
  );
  return id;
}

// ignorarHistorico: pra campanhas de remarketing de propósito (template novo
// pra quem já recebeu mensagem antes) — ainda respeita opt-out (quem pediu
// pra não receber mais continua bloqueado), só pula a checagem de "já
// enviado antes".
// templates: mesmo array [{nome,idioma}] passado em criarCampanha — quando
// tem 2+, cada contato sorteia um pra virar teste A/B (ver comentário na
// migração de template_nome_usado). Passar de novo aqui (em vez de buscar
// a campanha dentro da função) porque quem chama já tem esse dado na mão
// na maioria dos casos, evita 1 SELECT a mais por lote grande.
async function inserirContatos(campanhaId, contatos, jaCadastradosSet, ignorarHistorico, templates) {
  await _inicializar();
  const telefones = [...new Set(contatos.map(c => c.telefone).filter(Boolean))];
  const optados = new Set(await listarOptout(telefones));
  const jaEnviadosSet = ignorarHistorico ? new Set() : new Set(await listarJaEnviados(telefones));
  const _jaCadSet = jaCadastradosSet || new Set();
  const _sorteioAtivo = Array.isArray(templates) && templates.length > 1;
  let inseridos = 0, optout = 0, jaEnviados = 0, jaCadastrados = 0;
  for (const c of contatos) {
    if (!c.telefone) continue;
    const emOptout = optados.has(c.telefone);
    const jaFoiEnviado = !emOptout && jaEnviadosSet.has(c.telefone);
    const jaTemConta = !emOptout && !jaFoiEnviado && _jaCadSet.has(c.telefone);
    const status = emOptout ? 'optout' : jaFoiEnviado ? 'ja_enviado' : jaTemConta ? 'ja_cadastrado' : 'pendente';
    if (jaTemConta) jaCadastrados++;
    const _sorteado = _sorteioAtivo ? templates[Math.floor(Math.random() * templates.length)] : null;
    await query(
      `INSERT INTO disparos_contatos (id, campanha_id, nome, telefone, variaveis, status, template_nome_usado, template_idioma_usado) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [uuidv4(), campanhaId, c.nome || '', c.telefone, JSON.stringify(c.variaveis || {}), status, _sorteado?.nome || null, _sorteado?.idioma || null]
    );
    inseridos++;
    if (emOptout) optout++;
    if (jaFoiEnviado) jaEnviados++;
  }
  if (inseridos > 0) {
    await query(`UPDATE disparos_campanhas SET total_contatos = total_contatos + $1 WHERE id=$2`, [inseridos, campanhaId]);
  }
  return { inseridos, optout, jaEnviados, jaCadastrados };
}

async function atualizarCampanha(id, dados) {
  await _inicializar();
  const campos = [];
  const vals = [];
  let i = 1;
  for (const [k, v] of Object.entries(dados)) {
    campos.push(`${k}=$${i}`);
    vals.push(v);
    i++;
  }
  campos.push(`atualizado_em=NOW()`);
  vals.push(id);
  await query(`UPDATE disparos_campanhas SET ${campos.join(',')} WHERE id=$${i}`, vals);
}

async function incrementarContador(id, campo) {
  await _inicializar();
  if (campo !== 'enviados' && campo !== 'erros') throw new Error('Campo de contador inválido');
  await query(`UPDATE disparos_campanhas SET ${campo}=${campo}+1, atualizado_em=NOW() WHERE id=$1`, [id]);
}

async function buscarCampanha(id) {
  await _inicializar();
  const { rows } = await query(`SELECT * FROM disparos_campanhas WHERE id=$1`, [id]);
  return rows[0] || null;
}

async function buscarContato(id) {
  await _inicializar();
  const { rows } = await query(`SELECT * FROM disparos_contatos WHERE id=$1`, [id]);
  return rows[0] || null;
}

// Leads atribuídos a um sub-admin (refAdmin gravado em variaveis na hora do
// round-robin) — é a lista que ele acompanha em /admin/minhas-comissoes pra
// saber quem já foi avisado e quem ainda não respondeu/converteu, antes
// mesmo de virar comissão.
async function listarContatosPorRefAdmin(refAdmin, limite = 200) {
  await _inicializar();
  const { rows } = await query(
    `SELECT id, nome, telefone, status, status_entrega, enviado_em, auto_respondido_em, criado_em
     FROM disparos_contatos
     WHERE variaveis->>'refAdmin' = $1
     ORDER BY criado_em DESC LIMIT $2`,
    [refAdmin, limite]
  );
  return rows;
}

// Marca que o afiliado clicou em "Falar no WhatsApp" pra esse contato —
// congela ele na conta atual (não entra mais no rebalanceamento/reatribuição
// automática, ver _rodarReatribuicaoContatosAfiliado em server.js).
async function marcarContatoAfiliadoClicado(id) {
  await _inicializar();
  await query(`UPDATE disparos_contatos SET contato_afiliado_em=NOW() WHERE id=$1`, [id]);
}

// Todo contato de campanha ainda em aberto (não convertido) com um afiliado
// dono — base pro job de reatribuição/rebalanceamento entre afiliados do
// mesmo nível. Sem limite: o job processa nível a nível em memória.
async function listarContatosAbertosComAfiliado() {
  await _inicializar();
  const { rows } = await query(
    `SELECT id, variaveis, criado_em, reatribuido_em, contato_afiliado_em
     FROM disparos_contatos
     WHERE variaveis->>'refAdmin' IS NOT NULL AND variaveis->>'refAdmin' != '' AND status != 'convertido'`
  );
  return rows;
}

// Move o contato pra outro afiliado — usado tanto na reatribuição por
// inatividade (24h sem clicar) quanto no rebalanceamento quando um afiliado
// novo assina o contrato (todo mundo tem que ter contato pra ligar).
// reatribuido_em reinicia a contagem de 24h a partir de agora.
async function reatribuirContato(id, novoRefAdmin) {
  await _inicializar();
  await query(
    `UPDATE disparos_contatos SET variaveis = jsonb_set(COALESCE(variaveis,'{}'::jsonb), '{refAdmin}', to_jsonb($1::text)), reatribuido_em=NOW() WHERE id=$2`,
    [novoRefAdmin, id]
  );
}

// Usado pelo webhook de mensagem recebida (/webhook/whatsapp-cloud) pra
// achar de qual campanha/refAdmin esse telefone veio, e poder responder
// automaticamente mencionando o sub-admin certo. Pega o envio mais recente
// pra esse telefone (um mesmo número pode ter entrado em campanhas diferentes
// ao longo do tempo).
async function buscarContatoPorTelefone(telefone) {
  await _inicializar();
  const { rows } = await query(
    `SELECT * FROM disparos_contatos WHERE telefone=$1 AND status IN ('enviado','convertido') ORDER BY criado_em DESC LIMIT 1`,
    [telefone]
  );
  return rows[0] || null;
}

// Só manda a resposta automática 1x por contato — evita reenviar o mesmo
// pitch toda vez que a pessoa manda outra mensagem na conversa.
async function marcarAutoRespondido(id) {
  await _inicializar();
  await query(`UPDATE disparos_contatos SET auto_respondido_em=NOW() WHERE id=$1`, [id]);
}

async function listarCampanhas() {
  await _inicializar();
  const { rows } = await query(`SELECT * FROM disparos_campanhas ORDER BY criado_em DESC LIMIT 100`);
  return rows;
}

// "Cadastrou" aqui é checado ao vivo (telefone do contato bate com telefone/
// celular de algum usuário), não o status estático "ja_cadastrado" (que só
// marca quem já tinha conta ANTES da campanha começar) — pega também quem se
// cadastrou depois de receber o disparo. Comparação por sufixo de 8 dígitos,
// mesmo padrão usado no resto do sistema (telefone nem sempre salvo com DDI).
const _CADASTROU_EXISTS = `EXISTS (
  SELECT 1 FROM usuarios u
  WHERE RIGHT(REGEXP_REPLACE(COALESCE(u.telefone,''), '\\D', '', 'g'), 8) = RIGHT(REGEXP_REPLACE(disparos_contatos.telefone,'\\D','','g'), 8)
     OR RIGHT(REGEXP_REPLACE(COALESCE(u.celular,''), '\\D', '', 'g'), 8) = RIGHT(REGEXP_REPLACE(disparos_contatos.telefone,'\\D','','g'), 8)
)`;

// refAdmin: quando passado (sub-admin olhando a própria lista), restringe
// aos contatos atribuídos a ele no round-robin — mesmo campo gravado em
// variaveis.refAdmin na criação da campanha (ver inserirContatos).
async function listarContatos(campanhaId, { pagina = 1, status = '', q = '', refAdmin = '' } = {}) {
  await _inicializar();
  const offset = (pagina - 1) * 50;
  const params = [campanhaId];
  let where = 'WHERE campanha_id=$1';
  if (refAdmin) { params.push(refAdmin); where += ` AND variaveis->>'refAdmin' = $${params.length}`; }
  if (status === 'cadastrou') { where += ` AND ${_CADASTROU_EXISTS}`; }
  else if (status) { params.push(status); where += ` AND status=$${params.length}`; }
  if (q) { params.push('%' + q + '%'); where += ` AND (nome ILIKE $${params.length} OR telefone ILIKE $${params.length})`; }
  params.push(50); params.push(offset);
  const { rows } = await query(
    `SELECT id, nome, telefone, status, erro, enviado_em, status_entrega, status_entrega_em, ${_CADASTROU_EXISTS} AS cadastrou
     FROM disparos_contatos ${where} ORDER BY criado_em ASC LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );
  const { rows: tot } = await query(`SELECT COUNT(*) as total FROM disparos_contatos ${where}`, params.slice(0, -2));
  return { contatos: rows, total: parseInt(tot[0]?.total || 0) };
}

async function proximoLotePendente(campanhaId, limite) {
  await _inicializar();
  const { rows } = await query(
    `SELECT id, nome, telefone, variaveis, template_nome_usado, template_idioma_usado FROM disparos_contatos WHERE campanha_id=$1 AND status='pendente' ORDER BY criado_em ASC LIMIT $2`,
    [campanhaId, limite]
  );
  return rows;
}

async function marcarContato(id, { status, erro, incrementarTentativa, messageId }) {
  await _inicializar();
  if (incrementarTentativa) {
    await query(
      `UPDATE disparos_contatos SET status=$1, erro=$2, tentativas=tentativas+1, enviado_em=CASE WHEN $1='enviado' THEN NOW() ELSE enviado_em END, message_id=COALESCE($4,message_id) WHERE id=$3`,
      [status, erro || null, id, messageId || null]
    );
  } else {
    await query(
      `UPDATE disparos_contatos SET status=$1, erro=$2, enviado_em=CASE WHEN $1='enviado' THEN NOW() ELSE enviado_em END, message_id=COALESCE($4,message_id) WHERE id=$3`,
      [status, erro || null, id, messageId || null]
    );
  }
}

// Casa o evento de status (sent/delivered/read/failed) que chega no webhook
// da Meta com o contato que recebeu aquele message_id. failed atualiza o
// status principal pra 'erro' também (a mensagem foi aceita mas não chegou).
async function marcarEntregaPorMessageId(messageId, statusEntrega, erro) {
  await _inicializar();
  if (statusEntrega === 'failed') {
    await query(
      `UPDATE disparos_contatos SET status_entrega=$1, status_entrega_em=NOW(), status='erro', erro=COALESCE($2,erro) WHERE message_id=$3`,
      [statusEntrega, erro || null, messageId]
    );
  } else {
    // Não regride (ex: 'read' chegando antes de um 'delivered' atrasado, ou
    // reentrega do mesmo evento) — só avança sent < delivered < read.
    await query(
      `UPDATE disparos_contatos SET status_entrega=$1, status_entrega_em=NOW()
       WHERE message_id=$2 AND (status_entrega IS NULL
         OR (status_entrega='sent' AND $1 IN ('delivered','read'))
         OR (status_entrega='delivered' AND $1='read'))`,
      [statusEntrega, messageId]
    );
  }
}

// Campanhas presas em "enviando" sem atualização há X minutos — indica worker_thread
// morto abruptamente (ex.: deploy no meio do disparo). Limita relançamentos pra não
// tentar pra sempre uma campanha que trava por outro motivo (ex.: token expirado).
async function listarCampanhasTravadas(minutos = 10, maxRelancamentos = 2) {
  await _inicializar();
  const { rows } = await query(
    `SELECT * FROM disparos_campanhas WHERE status='enviando' AND pausado=false AND atualizado_em < NOW() - ($1 || ' minutes')::interval AND COALESCE(relancamentos,0) < $2`,
    [minutos, maxRelancamentos]
  );
  return rows;
}

async function statsCampanha(campanhaId) {
  await _inicializar();
  const { rows } = await query(`SELECT status, COUNT(*) as total FROM disparos_contatos WHERE campanha_id=$1 GROUP BY status`, [campanhaId]);
  return rows;
}

// Quebra por status_entrega real (sent/delivered/read/failed) — diferente de
// statsCampanha, que só reflete se a Meta aceitou o pedido (status='enviado').
async function statsEntrega(campanhaId) {
  await _inicializar();
  const { rows } = await query(
    `SELECT status_entrega, COUNT(*) as total FROM disparos_contatos WHERE campanha_id=$1 AND status_entrega IS NOT NULL GROUP BY status_entrega`,
    [campanhaId]
  );
  const mapa = {};
  rows.forEach(r => { mapa[r.status_entrega] = parseInt(r.total); });
  return mapa;
}

// Performance por variante de template (teste A/B) — pra cada template usado
// numa campanha, quantos foram enviados, responderam, cadastraram e (o que
// importa de verdade) compraram. "Comprou" é lido de usuarios.dados->>'comprouEm'
// (marcado em server.js na hora do pagamento aprovado), casado pelo telefone
// do contato do mesmo jeito que _CADASTROU_EXISTS já faz.
async function statsPorTemplate(campanhaId) {
  await _inicializar();
  const { rows } = await query(`
    SELECT
      COALESCE(dc.template_nome_usado, camp.template_nome) AS template,
      COUNT(*) AS total,
      COUNT(*) FILTER (WHERE dc.status IN ('enviado','convertido')) AS enviados,
      COUNT(*) FILTER (WHERE dc.auto_respondido_em IS NOT NULL) AS respondeu,
      COUNT(*) FILTER (WHERE dc.status = 'convertido') AS cadastrou,
      COUNT(*) FILTER (WHERE EXISTS (
        SELECT 1 FROM usuarios u
        WHERE (RIGHT(REGEXP_REPLACE(COALESCE(u.telefone,''), '\\D', '', 'g'), 8) = RIGHT(REGEXP_REPLACE(dc.telefone,'\\D','','g'), 8)
           OR RIGHT(REGEXP_REPLACE(COALESCE(u.celular,''), '\\D', '', 'g'), 8) = RIGHT(REGEXP_REPLACE(dc.telefone,'\\D','','g'), 8))
          AND u.dados->>'comprouEm' IS NOT NULL
      )) AS comprou
    FROM disparos_contatos dc
    JOIN disparos_campanhas camp ON camp.id = dc.campanha_id
    WHERE dc.campanha_id = $1
    GROUP BY COALESCE(dc.template_nome_usado, camp.template_nome)
    ORDER BY comprou DESC, cadastrou DESC
  `, [campanhaId]);
  return rows.map(r => ({
    template: r.template,
    total: parseInt(r.total), enviados: parseInt(r.enviados), respondeu: parseInt(r.respondeu),
    cadastrou: parseInt(r.cadastrou), comprou: parseInt(r.comprou)
  }));
}

async function buscarFollowupMensagem() {
  await _inicializar();
  const { rows } = await query(`SELECT mensagem FROM whatsapp_followup_config WHERE id=1`);
  return rows[0]?.mensagem || null;
}

async function salvarFollowupMensagem(mensagem) {
  await _inicializar();
  await query(
    `INSERT INTO whatsapp_followup_config (id, mensagem) VALUES (1,$1)
     ON CONFLICT (id) DO UPDATE SET mensagem=EXCLUDED.mensagem, atualizado_em=NOW()`,
    [mensagem]
  );
}

// Telefones (últimos 8 dígitos, pra comparar sem se importar com DDI/formatação
// diferente entre a planilha da campanha e o número normalizado da inbox) de
// quem faz parte de uma campanha específica — usado pra filtrar a inbox e o
// follow-up de 24h por campanha.
async function listarTelefonesDaCampanha(campanhaId) {
  await _inicializar();
  const { rows } = await query(`SELECT telefone FROM disparos_contatos WHERE campanha_id=$1`, [campanhaId]);
  return new Set(rows.map(r => String(r.telefone || '').replace(/\D/g, '').slice(-8)).filter(Boolean));
}

module.exports = {
  criarCampanha,
  inserirContatos,
  atualizarCampanha,
  incrementarContador,
  buscarCampanha,
  buscarContato,
  listarCampanhas,
  listarContatos,
  proximoLotePendente,
  marcarContato,
  marcarEntregaPorMessageId,
  statsCampanha,
  statsEntrega,
  marcarOptout,
  listarOptout,
  listarOptoutCompleto,
  listarJaEnviados,
  listarCampanhasTravadas,
  buscarFollowupMensagem,
  salvarFollowupMensagem,
  listarTelefonesDaCampanha,
  dentroDaJanelaDisparo,
  listarCampanhasAguardandoJanela,
  buscarContatoPorTelefone,
  marcarAutoRespondido,
  listarContatosPorRefAdmin,
  statsPorTemplate,
  marcarContatoAfiliadoClicado,
  listarContatosAbertosComAfiliado,
  reatribuirContato
};
