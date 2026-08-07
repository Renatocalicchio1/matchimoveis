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
  // "enviado" só quer dizer que a Meta aceitou o pedido — não confirma que
  // chegou no aparelho da pessoa. O status de entrega de verdade (sent →
  // delivered → read, ou failed) chega depois via webhook (POST /messages
  // não devolve isso na hora) e é casado com o contato pelo message_id.
  await query(`ALTER TABLE disparos_contatos ADD COLUMN IF NOT EXISTS message_id TEXT`);
  await query(`ALTER TABLE disparos_contatos ADD COLUMN IF NOT EXISTS status_entrega TEXT`);
  await query(`ALTER TABLE disparos_contatos ADD COLUMN IF NOT EXISTS status_entrega_em TIMESTAMP`);
  await query(`CREATE INDEX IF NOT EXISTS idx_disparos_contatos_message_id ON disparos_contatos(message_id)`);
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

async function criarCampanha({ nomeCampanha, templateNome, templateIdioma, mapeamentoVariaveis, delayMs, criadoPor, corretorUserId, usarContatoIdBotao, phoneNumberId }) {
  await _inicializar();
  const id = uuidv4();
  await query(
    `INSERT INTO disparos_campanhas (id, nome_campanha, template_nome, template_idioma, mapeamento_variaveis, delay_ms, criado_por, corretor_user_id, usar_contato_id_botao, phone_number_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
    [id, nomeCampanha, templateNome, templateIdioma, JSON.stringify(mapeamentoVariaveis || []), delayMs || 2500, criadoPor || '', corretorUserId || null, !!usarContatoIdBotao, phoneNumberId || null]
  );
  return id;
}

// ignorarHistorico: pra campanhas de remarketing de propósito (template novo
// pra quem já recebeu mensagem antes) — ainda respeita opt-out (quem pediu
// pra não receber mais continua bloqueado), só pula a checagem de "já
// enviado antes".
async function inserirContatos(campanhaId, contatos, jaCadastradosSet, ignorarHistorico) {
  await _inicializar();
  const telefones = [...new Set(contatos.map(c => c.telefone).filter(Boolean))];
  const optados = new Set(await listarOptout(telefones));
  const jaEnviadosSet = ignorarHistorico ? new Set() : new Set(await listarJaEnviados(telefones));
  const _jaCadSet = jaCadastradosSet || new Set();
  let inseridos = 0, optout = 0, jaEnviados = 0, jaCadastrados = 0;
  for (const c of contatos) {
    if (!c.telefone) continue;
    const emOptout = optados.has(c.telefone);
    const jaFoiEnviado = !emOptout && jaEnviadosSet.has(c.telefone);
    const jaTemConta = !emOptout && !jaFoiEnviado && _jaCadSet.has(c.telefone);
    const status = emOptout ? 'optout' : jaFoiEnviado ? 'ja_enviado' : jaTemConta ? 'ja_cadastrado' : 'pendente';
    if (jaTemConta) jaCadastrados++;
    await query(
      `INSERT INTO disparos_contatos (id, campanha_id, nome, telefone, variaveis, status) VALUES ($1,$2,$3,$4,$5,$6)`,
      [uuidv4(), campanhaId, c.nome || '', c.telefone, JSON.stringify(c.variaveis || {}), status]
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

async function listarCampanhas() {
  await _inicializar();
  const { rows } = await query(`SELECT * FROM disparos_campanhas ORDER BY criado_em DESC LIMIT 100`);
  return rows;
}

async function listarContatos(campanhaId, { pagina = 1, status = '', q = '' } = {}) {
  await _inicializar();
  const offset = (pagina - 1) * 50;
  const params = [campanhaId];
  let where = 'WHERE campanha_id=$1';
  if (status) { params.push(status); where += ` AND status=$${params.length}`; }
  if (q) { params.push('%' + q + '%'); where += ` AND (nome ILIKE $${params.length} OR telefone ILIKE $${params.length})`; }
  params.push(50); params.push(offset);
  const { rows } = await query(
    `SELECT id, nome, telefone, status, erro, enviado_em, status_entrega, status_entrega_em FROM disparos_contatos ${where} ORDER BY criado_em ASC LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );
  const { rows: tot } = await query(`SELECT COUNT(*) as total FROM disparos_contatos ${where}`, params.slice(0, -2));
  return { contatos: rows, total: parseInt(tot[0]?.total || 0) };
}

async function proximoLotePendente(campanhaId, limite) {
  await _inicializar();
  const { rows } = await query(
    `SELECT id, nome, telefone, variaveis FROM disparos_contatos WHERE campanha_id=$1 AND status='pendente' ORDER BY criado_em ASC LIMIT $2`,
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
  listarCampanhasTravadas
};
