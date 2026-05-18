const fs = require('fs');
const path = require('path');
const { lerJSON, salvarJSON } = require('./storage');
const { query, dbOk } = require('./db');

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

module.exports = { lerUsuarios, salvarUsuario, salvarTodosUsuarios };
