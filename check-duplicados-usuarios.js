// Diagnóstico de contas duplicadas — roda manual no Render Shell:
//   node check-duplicados-usuarios.js
// Lista todo grupo de usuários que compartilham o mesmo celular (dígitos)
// ou o mesmo email (case-insensitive) — usado pra achar as duplicatas já
// existentes antes dos índices únicos (idx_usuarios_telefone_unico,
// idx_usuarios_email_unico, ver services/salvarUsuario.js) conseguirem
// travar de vez. Enquanto existir duplicata na base, a criação desses
// índices falha silenciosamente no boot (só loga, não derruba o servidor) —
// esse script existe pra dar visibilidade do que precisa ser resolvido
// manualmente (decidir qual conta manter, mesclar/excluir a outra) antes da
// trava do banco funcionar de verdade.
const { query, dbOk } = require('./services/db');

(async () => {
  const ok = await dbOk();
  if (!ok) { console.log('PG offline'); process.exit(0); }

  const porTelefone = await query(`
    SELECT regexp_replace(telefone,'\\D','','g') as tel, array_agg(codigo_usuario) as contas, array_agg(nome) as nomes, count(*) as total
    FROM usuarios
    WHERE telefone IS NOT NULL AND telefone <> ''
    GROUP BY regexp_replace(telefone,'\\D','','g')
    HAVING count(*) > 1
    ORDER BY total DESC
  `);
  console.log('=== Duplicatas por celular ===');
  if (!porTelefone.rows.length) console.log('Nenhuma.');
  porTelefone.rows.forEach(r => console.log(`  ${r.tel} -> ${r.total}x: ${r.contas.map((c,i)=>c+' ('+r.nomes[i]+')').join(', ')}`));

  const porEmail = await query(`
    SELECT lower(trim(email)) as email, array_agg(codigo_usuario) as contas, array_agg(nome) as nomes, count(*) as total
    FROM usuarios
    WHERE email IS NOT NULL AND trim(email) <> ''
    GROUP BY lower(trim(email))
    HAVING count(*) > 1
    ORDER BY total DESC
  `);
  console.log('\n=== Duplicatas por email ===');
  if (!porEmail.rows.length) console.log('Nenhuma.');
  porEmail.rows.forEach(r => console.log(`  ${r.email} -> ${r.total}x: ${r.contas.map((c,i)=>c+' ('+r.nomes[i]+')').join(', ')}`));

  console.log('\nPra decidir qual manter: ver /admin/usuario/:codigo de cada uma (imóveis/leads/coins) antes de excluir a duplicata em /admin/deletar/:codigo.');
  process.exit(0);
})();
