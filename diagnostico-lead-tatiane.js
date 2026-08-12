// Diagnóstico pontual (debug, dados hardcoded) — mesmo padrão de check_lead.js.
// Objetivo: confirmar se a lead "Tatiane Costa da Silva" (11994711744) foi
// coberta pelo preencherPerfilInteresadosPendentes.js. Suspeita: essa lead
// aparece com origem='manual' na tela, mas os dados dela (Apartamento/
// Comprar/Ipiranga-São Paulo/R$229.900, sem quartos) batem com o formato
// incompleto que importarInteresados() gera — mesmo problema de origem não
// confiável já visto nas leads DEMANDA-* (ver preencherPerfilDemandaPendentes.js).
//
// Rodar no Render Shell: node diagnostico-lead-tatiane.js
const { query } = require('./services/db');

async function run() {
  const { rows: leads } = await query(
    `SELECT id, nome, telefone, whatsapp, origem, criado_em, perfil_ia, mapa_intencao, user_id, codigo_usuario
     FROM leads
     WHERE lower(nome) LIKE '%tatiane%costa%' OR telefone = $1 OR whatsapp = $1`,
    ['11994711744']
  );
  console.log(`[diagnostico-tatiane] ${leads.length} lead(s) encontradas:`);
  for (const l of leads) {
    console.log(JSON.stringify({
      id: l.id, nome: l.nome, telefone: l.telefone, whatsapp: l.whatsapp,
      origem: l.origem, criado_em: l.criado_em, user_id: l.user_id, codigo_usuario: l.codigo_usuario,
      perfil_ia: l.perfil_ia, mapa_intencao: l.mapa_intencao
    }, null, 2));
  }

  const { rows: origemRows } = await query(
    `SELECT id, id_anuncio, nome, telefone, email, tipo, transacao, bairro, cidade, estado,
            quartos, suites, vagas, banheiros, area_max, valor_max, importado_em
     FROM interessados_portal
     WHERE lower(nome) LIKE '%tatiane%costa%' OR telefone = $1`,
    ['11994711744']
  );
  console.log(`\n[diagnostico-tatiane] ${origemRows.length} linha(s) correspondente(s) em interessados_portal:`);
  for (const o of origemRows) console.log(JSON.stringify(o, null, 2));
}

run()
  .then(() => process.exit(0))
  .catch(e => { console.error('[diagnostico-tatiane] erro fatal:', e.message); process.exit(1); });
