// Diagnóstico: por que o link mostrado pro sub-admin numa captação aponta
// pro imóvel errado? Roda manual no Render Shell, passando 1+ ids de imóvel:
//   node check-captacao-vinculo.js MI-1786144257402-GFEXN2 MI-1786399924166-0YQGV1
// Pra cada imóvel, mostra: dados do imóvel, a lead que ele diz ter originado
// (dados->>'leadOrigemId'), se essa lead tem sub-admin atribuído
// (dados->>'atendidoPorAdminCaptacao'), e se esse imóvel também está linkado
// numa linha de campanha_captacao_envios (campanha de e-mail em massa) — pra
// achar se são 2 fontes de distribuição pisando na mesma captação/pessoa.
const { query, dbOk } = require('./services/db');

const ids = process.argv.slice(2);
if (!ids.length) { console.log('Uso: node check-captacao-vinculo.js <id1> [id2] ...'); process.exit(1); }

(async () => {
  const ok = await dbOk();
  if (!ok) { console.log('PG offline'); process.exit(0); }

  for (const id of ids) {
    console.log('\n=== IMÓVEL', id, '===');
    const rIm = await query(
      `SELECT id, id_interno, status, valor_imovel, criado_em, atualizado_em,
              jsonb_array_length(COALESCE(fotos,'[]'::jsonb)) as total_fotos,
              dados->>'leadOrigemId' as lead_origem_id
       FROM imoveis WHERE id=$1 OR id_interno=$1 OR id_externo=$1 OR codigo_imovel=$1`,
      [id]
    );
    if (!rIm.rows.length) { console.log('  imóvel não encontrado'); continue; }
    const im = rIm.rows[0];
    console.log('  imovel:', JSON.stringify(im, null, 2));

    if (im.lead_origem_id) {
      const rLead = await query(
        `SELECT id, nome, telefone, whatsapp, criado_em,
                dados->>'atendidoPorAdminCaptacao' as atendido_por_admin,
                dados->>'transacaoCaptar' as transacao_captar
         FROM leads WHERE id=$1`,
        [im.lead_origem_id]
      );
      console.log('  lead de origem:', JSON.stringify(rLead.rows[0] || null, null, 2));
    } else {
      console.log('  lead de origem: (sem leadOrigemId no imóvel)');
    }

    const rEnvio = await query(
      `SELECT id, email, nome, telefone, atendido_por, atendido_por_nome, imovel_captado_id
       FROM campanha_captacao_envios WHERE imovel_captado_id=$1`,
      [im.id]
    );
    console.log('  linha(s) em campanha_captacao_envios com esse imovel_captado_id:', JSON.stringify(rEnvio.rows, null, 2));

    // Outras leads/imóveis diretos com o MESMO telefone (pra achar duplicata
    // de antes do fix de dedup por telefone em /captar/iniciar)
    if (im.lead_origem_id) {
      const rLeadTel = await query(`SELECT telefone, whatsapp FROM leads WHERE id=$1`, [im.lead_origem_id]);
      const tel = (rLeadTel.rows[0] && (rLeadTel.rows[0].telefone || rLeadTel.rows[0].whatsapp) || '').replace(/\D/g, '');
      if (tel) {
        const rOutras = await query(
          `SELECT id, nome, telefone, criado_em, dados->>'atendidoPorAdminCaptacao' as atendido_por_admin
           FROM leads
           WHERE user_id='REN-G9K6' AND origem='captacao_link'
             AND RIGHT(regexp_replace(COALESCE(telefone,''),'\\D','','g'), 8) = $1
           ORDER BY criado_em ASC`,
          [tel.slice(-8)]
        );
        console.log('  outras leads de captação direta com telefone parecido:', JSON.stringify(rOutras.rows, null, 2));
      }
    }
  }
  process.exit(0);
})();
