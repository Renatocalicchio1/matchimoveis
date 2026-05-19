const fs = require('fs');
const path = require('path');
const { lerJSON, salvarJSON } = require('./storage');
const { query, dbOk } = require('./db');


// Auto-cria tabela e migra users.json no boot
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
    // Migra users.json se tabela vazia
    const count = await _q('SELECT COUNT(*) as c FROM usuarios');
    if (parseInt(count.rows[0].c) === 0) {
      const _fs = require('fs'), _path = require('path');
      const _dir = process.env.RENDER ? '/opt/render/project/src/data' : _path.join(__dirname, '..');
      const _file = _path.join(_dir, 'users.json');
      if (_fs.existsSync(_file)) {
        const _users = JSON.parse(_fs.readFileSync(_file, 'utf8'));
        if (_users.length > 0) {
          console.log('[usuarios] migrando', _users.length, 'users do JSON...');
          const { salvarTodosUsuarios: _stu } = require('./salvarUsuario');
          await _stu(_users);
          console.log('[usuarios] ✅ migração automática concluída');
        }
      }
    }
  } catch(e) { console.error('[usuarios boot]', e.message); }
}
_inicializarUsuarios();

function usersPath() {
  const DIR = process.env.RENDER ? '/opt/render/project/src/data' : path.join(__dirname, '..');
  return path.join(DIR, 'users.json');
}

function rowToUser(r) {
  return {
    id: r.id,
    nome: r.nome,
    email: r.email,
    senha: r.senha,
    telefone: r.telefone,
    tipo: r.tipo,
    ativo: r.ativo,
    creditos: r.creditos,
    whatsappInstance: r.whatsapp_instance,
    whatsappStatus: r.whatsapp_status,
    whatsappNumero: r.whatsapp_numero,
    bloqueados: r.bloqueados || [],
    plano: r.plano,
    criadoEm: r.criado_em,
    ...(r.dados || {})
  };
}

function userToRow(user) {
  const dados = { ...user };
  ['id','nome','email','senha','telefone','tipo','ativo','creditos','whatsappInstance','whatsappStatus','whatsappNumero','bloqueados','plano','criadoEm'].forEach(k => delete dados[k]);
  return {
    id: user.id,
    nome: user.nome || '',
    email: user.email || '',
    senha: user.senha || '',
    telefone: user.telefone || '',
    tipo: user.tipo || 'corretor',
    ativo: user.ativo !== false,
    creditos: user.creditos || 0,
    whatsapp_instance: user.whatsappInstance || null,
    whatsapp_status: user.whatsappStatus || null,
    whatsapp_numero: user.whatsappNumero || null,
    bloqueados: JSON.stringify(user.bloqueados || []),
    plano: user.plano || 'basico',
    dados: JSON.stringify(dados)
  };
}

async function lerUsuarios() {
  if (await dbOk()) {
    try {
      const res = await query(`SELECT * FROM users ORDER BY criado_em ASC`);
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
        INSERT INTO users (id,nome,email,senha,telefone,tipo,ativo,creditos,whatsapp_instance,whatsapp_status,whatsapp_numero,bloqueados,plano,dados)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
        ON CONFLICT (id) DO UPDATE SET
          nome=EXCLUDED.nome, email=EXCLUDED.email, senha=EXCLUDED.senha,
          telefone=EXCLUDED.telefone, tipo=EXCLUDED.tipo, ativo=EXCLUDED.ativo,
          creditos=EXCLUDED.creditos, whatsapp_instance=EXCLUDED.whatsapp_instance,
          whatsapp_status=EXCLUDED.whatsapp_status, whatsapp_numero=EXCLUDED.whatsapp_numero,
          bloqueados=EXCLUDED.bloqueados, plano=EXCLUDED.plano,
          dados=EXCLUDED.dados, atualizado_em=NOW()
      `, [r.id,r.nome,r.email,r.senha,r.telefone,r.tipo,r.ativo,r.creditos,r.whatsapp_instance,r.whatsapp_status,r.whatsapp_numero,r.bloqueados,r.plano,r.dados]);
      return user;
    } catch(e) {
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

module.exports = { lerUsuarios, salvarUsuario, salvarTodosUsuarios, atualizarUsuario };
