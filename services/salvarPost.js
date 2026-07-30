const { query, dbOk } = require('./db');

async function _criarTabelaPosts() {
  try {
    if (!await dbOk()) return;
    await query(`CREATE TABLE IF NOT EXISTS posts (
      id SERIAL PRIMARY KEY,
      user_id TEXT NOT NULL,
      url TEXT,
      titulo TEXT,
      descricao TEXT,
      valor TEXT,
      texto_bruto TEXT,
      imagens JSONB DEFAULT '[]',
      imagem_escolhida TEXT,
      legenda TEXT,
      status TEXT DEFAULT 'gerado',
      data_gerado TIMESTAMPTZ DEFAULT NOW(),
      data_agendada TIMESTAMPTZ,
      data_publicado TIMESTAMPTZ,
      data_ignorado TIMESTAMPTZ,
      resultado JSONB,
      erro TEXT
    )`);
  } catch(e) { console.error('[posts boot]', e.message); }
}
_criarTabelaPosts();

function rowToPost(r) {
  return {
    id: r.id,
    userId: r.user_id,
    url: r.url,
    titulo: r.titulo,
    descricao: r.descricao,
    valor: r.valor,
    textoBruto: r.texto_bruto,
    imagens: r.imagens || [],
    imagemEscolhida: r.imagem_escolhida,
    legenda: r.legenda,
    status: r.status,
    dataGerado: r.data_gerado,
    dataAgendada: r.data_agendada,
    dataPublicado: r.data_publicado,
    dataIgnorado: r.data_ignorado,
    resultado: r.resultado,
    erro: r.erro
  };
}

async function criarPost(post) {
  const r = await query(
    `INSERT INTO posts (user_id, url, titulo, descricao, valor, texto_bruto, imagens, imagem_escolhida, legenda, status)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'gerado') RETURNING *`,
    [post.userId, post.url||'', post.titulo||'', post.descricao||'', post.valor||'', post.textoBruto||'',
     JSON.stringify(post.imagens||[]), post.imagemEscolhida||'', post.legenda||'']
  );
  return rowToPost(r.rows[0]);
}

async function buscarPost(id, userId) {
  const r = await query('SELECT * FROM posts WHERE id=$1 AND user_id=$2', [id, userId]);
  return r.rows[0] ? rowToPost(r.rows[0]) : null;
}

async function atualizarPost(id, campos) {
  const mapaColunas = {
    legenda: 'legenda', imagemEscolhida: 'imagem_escolhida', status: 'status',
    dataAgendada: 'data_agendada', dataPublicado: 'data_publicado',
    dataIgnorado: 'data_ignorado', resultado: 'resultado', erro: 'erro'
  };
  const sets = []; const vals = []; let i = 1;
  for (const [k, v] of Object.entries(campos)) {
    const col = mapaColunas[k];
    if (!col) continue;
    sets.push(`${col}=$${i}`);
    vals.push(col === 'resultado' ? JSON.stringify(v) : v);
    i++;
  }
  if (!sets.length) return;
  vals.push(id);
  await query(`UPDATE posts SET ${sets.join(', ')} WHERE id=$${i}`, vals);
}

async function listarPosts(userId, status) {
  const r = await query(
    'SELECT * FROM posts WHERE user_id=$1 AND status=$2 ORDER BY id DESC',
    [userId, status]
  );
  return r.rows.map(rowToPost);
}

async function listarPostsAgendadosVencidos() {
  const r = await query(
    "SELECT * FROM posts WHERE status='agendado' AND data_agendada <= NOW() ORDER BY data_agendada ASC"
  );
  return r.rows.map(rowToPost);
}

async function excluirPost(id, userId) {
  await query('DELETE FROM posts WHERE id=$1 AND user_id=$2', [id, userId]);
}

module.exports = { criarPost, buscarPost, atualizarPost, listarPosts, listarPostsAgendadosVencidos, excluirPost };
