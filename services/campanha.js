const { query } = require('./db');
const { enviarEmail } = require('./email');

async function importarContatos(contatos) {
  let importados = 0, duplicados = 0;
  for (const c of contatos) {
    try {
      await query(
        `INSERT INTO campanha_contatos (nome, email, celular) VALUES ($1,$2,$3) ON CONFLICT (email) DO NOTHING`,
        [c.nome||'', c.email.toLowerCase().trim(), c.celular||'']
      );
      importados++;
    } catch(e) { duplicados++; }
  }
  return { importados, duplicados };
}

async function statsBase() {
  const { rows } = await query(`SELECT status, COUNT(*) as total FROM campanha_contatos GROUP BY status`);
  return rows;
}

async function proximoLote(limite) {
  // Filtra quem não tem cadastro no MatchImóveis e ainda não recebeu
  const { rows } = await query(`
    SELECT cc.id, cc.nome, cc.email, cc.celular
    FROM campanha_contatos cc
    WHERE cc.status = 'pendente'
    AND LOWER(cc.email) NOT IN (SELECT LOWER(email) FROM usuarios WHERE email IS NOT NULL AND email != '')
    ORDER BY cc.criado_em ASC
    LIMIT $1
  `, [limite]);
  return rows;
}

async function marcarEnviado(id, erro) {
  if (erro) {
    await query(`UPDATE campanha_contatos SET status='erro', erro=$1, enviado_em=NOW() WHERE id=$2`, [erro, id]);
  } else {
    await query(`UPDATE campanha_contatos SET status='enviado', enviado_em=NOW() WHERE id=$2`, [id]);
  }
}

async function dispararLote(lote, { assunto, html }) {
  let enviados = 0, erros = 0;
  for (const c of lote) {
    try {
      const htmlPersonalizado = html.replace(/\{nome\}/g, c.nome || 'Corretor');
      await enviarEmail({ para: c.email, assunto, html: htmlPersonalizado, texto: assunto });
      await marcarEnviado(c.id, null);
      enviados++;
      console.log(`[CAMPANHA] enviado: ${c.email} (${enviados}/${lote.length})`);
      await new Promise(r => setTimeout(r, 1100));
    } catch(e) {
      await marcarEnviado(c.id, e.message);
      erros++;
      console.error(`[CAMPANHA] erro: ${c.email}`, e.message);
    }
  }
  return { enviados, erros };
}

module.exports = { importarContatos, statsBase, proximoLote, dispararLote };
