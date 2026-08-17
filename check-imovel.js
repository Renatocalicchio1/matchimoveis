// Diagnóstico rápido de 1 imóvel específico — roda manual no Render Shell:
//   node check-imovel.js MI-1786399924166-0YQGV1
// Mostra por que /imovel/:id pode estar dando "não encontrado": ou a linha
// não existe no banco, ou existe mas não passa em imovelVisivelPublico()
// (precisa ter pelo menos 1 foto e valor >= mínimo da transação).
const { query, dbOk } = require('./services/db');
const { imovelVisivelPublico } = require('./services/salvarImovel');

const id = process.argv[2];
if (!id) { console.log('Uso: node check-imovel.js <id>'); process.exit(1); }

(async () => {
  const ok = await dbOk();
  if (!ok) { console.log('PG offline'); process.exit(0); }
  const r = await query(
    `SELECT id, id_externo, id_interno, codigo_imovel, status, transacao, valor_imovel,
            jsonb_array_length(COALESCE(fotos,'[]'::jsonb)) as total_fotos,
            user_id, usuario_id, codigo_usuario, corretor_id,
            criado_em, atualizado_em
     FROM imoveis WHERE id=$1 OR id_externo=$1 OR id_interno=$1 OR codigo_imovel=$1`,
    [id]
  );
  if (!r.rows.length) { console.log('NÃO EXISTE no banco com esse id/id_externo/id_interno/codigo_imovel.'); process.exit(0); }
  console.log(JSON.stringify(r.rows, null, 2));
  process.exit(0);
})();
