const fs = require('fs');
const path = require('path');
const { lerJSON, salvarJSON } = require('./storage');
const { query, dbOk } = require('./db');

async function _inicializarUsuarios() {
  try {
    const { dbOk: _dok, query: _q } = require('./db');
    if (!await _dok()) return;
    await _q(`CREATE TABLE IF NOT EXISTS usuarios (
      id TEXT PRIMARY KEY, nome TEXT, telefone TEXT, celular TEXT, email TEXT, senha TEXT,
      tipo TEXT DEFAULT 'corretor', ativo BOOLEAN DEFAULT true, codigo_usuario TEXT,
      creci TEXT, cpf TEXT, match_coins INTEGER DEFAULT 0, match_coins_total INTEGER DEFAULT 0,
      match_coins_bonus_inicial INTEGER DEFAULT 0, whatsapp_instance TEXT,
      whatsapp_status TEXT, whatsapp_numero TEXT, bloqueados JSONB DEFAULT '[]',
      lat DOUBLE PRECISION, lng DOUBLE PRECISION, endereco TEXT,
      xml_url TEXT, xml_atualizado_em TIMESTAMPTZ, xml_total INTEGER DEFAULT 0,
      historico_assistente JSONB DEFAULT '[]',
      criado_em TIMESTAMPTZ DEFAULT NOW(), atualizado_em TIMESTAMPTZ DEFAULT NOW(),
      dados JSONB DEFAULT '{}'
    )`);
    // Trava de verdade no banco contra celular/email duplicado (ago/2026) —
    // a checagem em JS antes do INSERT (ver /login e _criarContaDemanda em
    // server.js) tem uma janela de corrida: dois cadastros quase simultâneos
    // (duplo clique, form reenviado) podem ambos passar pela checagem antes
    // de qualquer um salvar. Índice único parcial (ignora vazio, então não
    // barra conta sem telefone/email) fecha essa janela de vez — cada um em
    // try/catch separado porque, se já existir duplicata na base de antes
    // dessa trava existir, a criação do índice falha (não dá pra criar índice
    // único sobre dado já duplicado) mas não pode derrubar o boot nem impedir
    // que o outro índice seja criado.
    try {
      await _q(`CREATE UNIQUE INDEX IF NOT EXISTS idx_usuarios_telefone_unico ON usuarios (telefone) WHERE telefone IS NOT NULL AND telefone <> ''`);
    } catch(e) { console.error('[usuarios boot] índice único de telefone não criado (provável duplicata já existente na base):', e.message); }
    try {
      await _q(`CREATE UNIQUE INDEX IF NOT EXISTS idx_usuarios_email_unico ON usuarios (lower(trim(email))) WHERE email IS NOT NULL AND trim(email) <> ''`);
    } catch(e) { console.error('[usuarios boot] índice único de email não criado (provável duplicata já existente na base):', e.message); }
  } catch(e) { console.error('[usuarios boot]', e.message); }
}
_inicializarUsuarios();

function usersPath() {
  const DIR = process.env.RENDER ? '/opt/render/project/src/data' : path.join(__dirname, '..');
  return path.join(DIR, 'users.json');
}

function rowToUser(r) {
  return {
    id: r.codigo_usuario || r.id,
    nome: r.nome,
    email: r.email,
    senha: r.senha,
    telefone: r.telefone || r.celular,
    celular: r.celular || r.telefone,
    tipo: r.tipo,
    ativo: r.ativo,
    creditos: r.creditos || r.match_coins || 0,
    matchCoins: r.match_coins || 0,
    matchCoinsTotal: r.match_coins_total || 0,
    codigoUsuario: r.codigo_usuario,
    creci: r.creci,
    cpf: r.cpf,
    whatsappInstance: r.whatsapp_instance,
    whatsappStatus: r.whatsapp_status,
    whatsappNumero: r.whatsapp_numero,
    bloqueados: r.bloqueados || [],
    plano: r.plano || r.dados?.plano || 'basico',
    autorizaQuintoandar: r.autoriza_quintoandar || false,
    autoriza_quintoandar: r.autoriza_quintoandar || false,
    lat: r.lat,
    lng: r.lng,
    endereco: r.endereco,
    xmlUrl: r.xml_url,
    xmlAtualizadoEm: r.xml_atualizado_em,
    xmlTotal: r.xml_total || 0,
    historicoAssistente: r.historico_assistente || [],
    criadoEm: r.criado_em,
    ...(r.dados || {})
  };
}

function userToRow(user) {
  const dados = { ...user };
  ['id','nome','email','senha','telefone','celular','tipo','ativo','creditos','matchCoins',
   'matchCoinsTotal','codigoUsuario','creci','cpf','whatsappInstance','whatsappStatus',
   'whatsappNumero','bloqueados','plano','lat','lng','endereco','xmlUrl','xmlAtualizadoEm',
   'xmlTotal','historicoAssistente','criadoEm'].forEach(k => delete dados[k]);
  return {
    id: user.id,
    nome: user.nome || '',
    email: user.email || '',
    senha: user.senha || '',
    telefone: user.telefone || user.celular || '',
    celular: user.celular || user.telefone || '',
    tipo: user.tipo || 'corretor',
    ativo: user.ativo !== false,
    codigo_usuario: user.codigoUsuario || user.codigo_usuario || '',
    creci: user.creci || '',
    cpf: user.cpf || '',
    match_coins: user.matchCoins || user.creditos || 0,
    match_coins_total: user.matchCoinsTotal || 0,
    whatsapp_instance: user.whatsappInstance || null,
    whatsapp_status: user.whatsappStatus || null,
    whatsapp_numero: user.whatsappNumero || null,
    bloqueados: JSON.stringify(user.bloqueados || []),
    lat: user.lat || null,
    lng: user.lng || null,
    endereco: user.endereco || '',
    xml_url: user.xmlUrl || user.xmlUrl || '',
    xml_total: user.xmlTotal || 0,
    historico_assistente: JSON.stringify(user.historicoAssistente || []),
    dados: JSON.stringify(dados)
  };
}

async function lerUsuarios() {
  if (await dbOk()) {
    try {
      const res = await query('SELECT * FROM usuarios ORDER BY criado_em ASC');
      return res.rows.map(rowToUser);
    } catch(e) {
      console.error('[lerUsuarios PG]', e.message);
    }
  }
  return lerJSON(usersPath(), []);
}

async function salvarUsuario(user) {
  if (await dbOk()) {
    try {
      const r = userToRow(user);
      await query(`
        INSERT INTO usuarios (id,nome,email,senha,telefone,celular,tipo,ativo,codigo_usuario,
          creci,cpf,match_coins,match_coins_total,whatsapp_instance,whatsapp_status,
          whatsapp_numero,bloqueados,lat,lng,endereco,xml_url,xml_total,
          historico_assistente,dados)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24)
        ON CONFLICT (id) DO UPDATE SET
          nome=EXCLUDED.nome, email=EXCLUDED.email, senha=EXCLUDED.senha,
          telefone=EXCLUDED.telefone, celular=EXCLUDED.celular,
          tipo=EXCLUDED.tipo, ativo=EXCLUDED.ativo,
          codigo_usuario=EXCLUDED.codigo_usuario,
          creci=EXCLUDED.creci, cpf=EXCLUDED.cpf,
          whatsapp_instance=EXCLUDED.whatsapp_instance,
          whatsapp_status=EXCLUDED.whatsapp_status,
          whatsapp_numero=EXCLUDED.whatsapp_numero,
          bloqueados=EXCLUDED.bloqueados,
          lat=EXCLUDED.lat, lng=EXCLUDED.lng, endereco=EXCLUDED.endereco,
          xml_url=EXCLUDED.xml_url, xml_total=EXCLUDED.xml_total,
          historico_assistente=EXCLUDED.historico_assistente,
          dados=EXCLUDED.dados,
          -- match_coins NAO atualizado no upsert para nao sobrescrever saldo real
          atualizado_em=NOW()
      `, [r.id,r.nome,r.email,r.senha,r.telefone,r.celular,r.tipo,r.ativo,r.codigo_usuario,
          r.creci,r.cpf,r.match_coins,r.match_coins_total,r.whatsapp_instance,r.whatsapp_status,
          r.whatsapp_numero,r.bloqueados,r.lat,r.lng,r.endereco,r.xml_url,r.xml_total,
          r.historico_assistente,r.dados]);
      return user;
    } catch(e) {
      // unique_violation (celular ou email já usado por outra conta, ver
      // índices em _inicializarUsuarios) não pode cair no fallback de JSON
      // abaixo — em produção (dbOk()==true) esse arquivo local não é lido por
      // ninguém, então o cadastro pareceria ter dado certo pro chamador
      // (retorna `user` normalmente) mas a conta não existiria de fato no
      // banco. Relança marcado como duplicado pra quem chamou (ver
      // salvarTodosUsuarios) decidir o que fazer.
      if (e.code === '23505') throw Object.assign(new Error('Celular ou email já cadastrado em outra conta.'), { duplicado: true, code: e.code, constraint: e.constraint });
      console.error('[salvarUsuario PG]', e.message);
    }
  }
  const todos = lerJSON(usersPath(), []);
  const idx = todos.findIndex(u => u.id === user.id);
  if (idx >= 0) todos[idx] = { ...todos[idx], ...user };
  else todos.push(user);
  await salvarJSON(usersPath(), todos);
  return user;
}

async function salvarTodosUsuarios(users) {
  if (await dbOk()) {
    try {
      for (const u of users) await salvarUsuario(u);
      return users;
    } catch(e) {
      // Duplicado (celular/email já usado) tem que voltar pro chamador poder
      // avisar o usuário — cair no fallback de JSON abaixo escreveria a lista
      // inteira (incluindo o cadastro duplicado) num arquivo que ninguém lê
      // em produção, fazendo o cadastro parecer que deu certo sem ter sido
      // salvo de verdade no banco.
      if (e.duplicado) throw e;
      console.error('[salvarTodosUsuarios PG]', e.message);
    }
  }
  await salvarJSON(usersPath(), users);
  return users;
}

async function atualizarUsuario(id, campos) {
  if (await dbOk()) {
    try {
      const res = await query('SELECT * FROM usuarios WHERE id=$1', [id]);
      if (res.rows.length === 0) throw new Error('usuario nao encontrado');
      const atual = rowToUser(res.rows[0]);
      return await salvarUsuario({ ...atual, ...campos });
    } catch(e) { console.error('[atualizarUsuario PG]', e.message); }
  }
  const todos = lerJSON(usersPath(), []);
  const idx = todos.findIndex(u => u.id === id);
  if (idx >= 0) { todos[idx] = { ...todos[idx], ...campos }; await salvarJSON(usersPath(), todos); return todos[idx]; }
  return null;
}

module.exports = { lerUsuarios, salvarUsuario, salvarTodosUsuarios, atualizarUsuario, rowToUser };
