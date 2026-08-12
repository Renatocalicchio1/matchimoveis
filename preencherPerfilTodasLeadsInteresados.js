// Varre TODA a tabela interessados_portal (planilha de /admin/interesados) e,
// pra cada linha, procura lead(s) com o mesmo telefone/whatsapp ou email em
// QUALQUER conta (sem depender do padrão do id nem do campo origem — já
// visto que os dois são inconsistentes) e preenche perfilIA+mapaIntencao com
// o dado real da linha. Generaliza o teste pontual feito manualmente (Joao,
// José Carlos) pra rodar em cima da planilha inteira de uma vez.
//
// Linhas com importado_em NULL não têm lead nenhuma ainda (nunca passaram
// por importarInteresados()) — ficam contadas à parte como "sem lead
// (não importada)", não é erro, só não tem o que preencher ainda.
//
// Não sobrescreve lead que já tem match (matches/matches_auto não vazios) —
// essas podem ter tido o perfil enriquecido por conversa depois da importação
// original, sobrescrever com só o dado do portal seria regressão.
//
// Não roda rematch no final — só preenche o perfil.
//
// Rodar no Render Shell: node preencherPerfilTodasLeadsInteresados.js
const { query } = require('./services/db');
const { atualizarLead } = require('./services/salvarLead');
const { montarPerfilEMapaDemanda } = require('./services/buscaDemanda');

function linhaParaFormatoDemanda(o) {
  return {
    Tipo: o.tipo || '', Transacao: o.transacao || '',
    Bairro: o.bairro || '', Cidade: o.cidade || '', Estado: o.estado || '',
    Quartos: o.quartos || '', Suites: o.suites || '', Vagas: o.vagas || '', Banheiros: o.banheiros || '',
    Area_max: o.area_max || '', Valor_max: o.valor_max || ''
  };
}

function semMatchAinda(lead) {
  const m = (lead.matches && lead.matches.length) ? lead.matches.length : 0;
  const ma = (lead.matches_auto && lead.matches_auto.length) ? lead.matches_auto.length : 0;
  return m === 0 && ma === 0;
}

async function buscarLeadsParaLinha(o) {
  const tel = (o.telefone || '').toString().trim();
  const email = (o.email || '').toString().trim().toLowerCase();
  if (!tel && !email) return [];
  const { rows } = await query(
    `SELECT id, nome, telefone, whatsapp, user_id, codigo_usuario, matches, matches_auto
     FROM leads
     WHERE ($1 <> '' AND (telefone = $1 OR whatsapp = $1))
        OR ($2 <> '' AND lower(dados->>'email') = $2)`,
    [tel, email]
  );
  return rows;
}

async function run() {
  const { rows: totalRow } = await query('SELECT COUNT(*)::int AS n FROM interessados_portal');
  console.log(`[preencher-perfil-todas] ${totalRow[0].n} linha(s) em interessados_portal`);

  const { rows: linhas } = await query('SELECT * FROM interessados_portal');

  let leadsAtualizadas = 0, leadsProtegidas = 0, linhasSemLead = 0, linhasNaoImportadas = 0, erros = 0;
  const idsAtualizados = [];

  for (const o of linhas) {
    try {
      const leadsAchadas = await buscarLeadsParaLinha(o);
      if (!leadsAchadas.length) {
        if (!o.importado_em) linhasNaoImportadas++; else linhasSemLead++;
        continue;
      }
      const { perfilIA, mapaIntencao } = montarPerfilEMapaDemanda(linhaParaFormatoDemanda(o));
      for (const lead of leadsAchadas) {
        if (!semMatchAinda(lead)) { leadsProtegidas++; continue; }
        await atualizarLead(lead.id, { perfilIA, mapaIntencao });
        leadsAtualizadas++;
        idsAtualizados.push(lead.id);
      }
    } catch (e) {
      erros++;
      console.error(`[preencher-perfil-todas] erro na linha ${o.id}:`, e.message);
    }
  }

  console.log(`[preencher-perfil-todas] leads atualizadas: ${leadsAtualizadas} | leads protegidas (já tinham match): ${leadsProtegidas} | linhas sem lead nenhuma (não importadas ainda): ${linhasNaoImportadas} | linhas sem lead (importadas mas não achou): ${linhasSemLead} | erros: ${erros}`);
}

run()
  .then(() => process.exit(0))
  .catch(e => { console.error('[preencher-perfil-todas] erro fatal:', e.message); process.exit(1); });
