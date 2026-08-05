// Script utilitário — não gera rota, roda manual: node bloquear-excluir-numero.js
// Bloqueia um número (some() sobre bloqueados de qualquer usuário já barra o
// webhook do WhatsApp pra esse número — ver server.js, bloco VERIFICAR BLOQUEADOS)
// e exclui todas as leads da plataforma com esse número (qualquer conta).
const { query } = require('./services/db');

const ALVO = '5511911914744';
const SEM_DDI = ALVO.replace(/^55/, '');

(async () => {
  const r = await query(
    `SELECT id, nome, telefone, whatsapp, contato, user_id FROM leads
     WHERE regexp_replace(COALESCE(telefone,''),'\\D','','g') IN ($1,$2)
        OR regexp_replace(COALESCE(whatsapp,''),'\\D','','g') IN ($1,$2)
        OR regexp_replace(COALESCE(contato,''),'\\D','','g') IN ($1,$2)`,
    [ALVO, SEM_DDI]
  );
  console.log('--- LEADS ENCONTRADAS (' + r.rows.length + ') ---');
  const usersAfetados = new Set();
  for (const row of r.rows) {
    console.log(row.id, '|', row.nome, '|', row.telefone || row.whatsapp || row.contato, '| user:', row.user_id);
    if (row.user_id) usersAfetados.add(row.user_id);
  }

  for (const uid of usersAfetados) {
    await query(
      "UPDATE usuarios SET dados = jsonb_set(COALESCE(dados,'{}'), '{bloqueados}', COALESCE(dados->'bloqueados','[]')::jsonb || $1::jsonb) WHERE id=$2 OR codigo_usuario=$2",
      [JSON.stringify([ALVO]), uid]
    );
  }
  console.log('--- BLOQUEADO NAS CONTAS:', [...usersAfetados].join(', ') || '(nenhuma)', '---');

  const ids = r.rows.map(row => row.id);
  if (ids.length) {
    const del = await query('DELETE FROM leads WHERE id = ANY($1)', [ids]);
    console.log('--- LEADS EXCLUIDAS:', del.rowCount, '---');
  } else {
    console.log('--- NENHUMA LEAD PRA EXCLUIR ---');
  }
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
