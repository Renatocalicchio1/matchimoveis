// Preenche o perfil do imóvel (tipo, transação, bairro, cidade, estado,
// quartos, suítes, vagas, banheiros, área, valor) + mapaIntencao das leads
// de /demanda ("DEMANDA-*") e /admin/interesados ("INT-*") que ainda estão
// paradas nas colunas Novo/Qualificando do kanban (ver getColuna() em
// views/app-leads.ejs) — mesmo bug nas duas origens: o fluxo de
// importação monta o perfilIA sem quartos/suites/vagas/banheiros/area e
// sem mapaIntencao nenhum, então essas leads nunca chegam a gerar match.
//
// Sobrepõe/substitui os dois scripts anteriores (preencherPerfilDemandaPendentes.js
// e preencherPerfilInteresadosPendentes.js): mesma lógica de casamento
// (id da lead -> linha de interessados_portal; fallback nome+email+telefone,
// nome+email, nome+telefone), mas agora:
//   - cobre as DUAS origens numa passada só (id LIKE 'DEMANDA-%' OR 'INT-%')
//   - filtro é por ESTÁGIO no funil (Novo/Qualificando), não por data
//   - NÃO roda rematch no final — só preenche o perfil (pedido explícito, ago/2026)
//
// "Novo/Qualificando" replica a regra de getColuna() em app-leads.ejs:
// fase_funil ausente/'novo'/'qualificado' (não 'decidido' nem 'captacao'),
// sem match ainda, sem vitrine enviada, sem visita agendada. Não mexe em
// leads que já avançaram (podem ter perfil enriquecido via conversa, não é
// pra sobrescrever com o dado mais pobre do portal).
//
// Rodar no Render Shell: node preencherPerfilLeadsPendentes.js
const { query } = require('./services/db');
const { atualizarLead } = require('./services/salvarLead');
const { montarPerfilEMapaDemanda } = require('./services/buscaDemanda');

function normTexto(s) {
  return (s || '').toString().trim();
}
function normTelefone(v) {
  let d = (v || '').toString().replace(/\D/g, '');
  if (d.startsWith('55') && d.length >= 12) d = d.slice(2);
  return d;
}
function normEmail(v) {
  return (v || '').toString().trim().toLowerCase();
}

// Extrai o "meio" do id da lead (DEMANDA-<meio>-<userId> ou INT-<meio>-<userId>)
// usando o userId real da lead (evita ambiguidade com userId que já tem hífen,
// ex: JAN-MGF9).
function _meioDoId(lead) {
  const userId = lead.user_id || lead.codigo_usuario;
  const id = String(lead.id || '');
  if (!userId) return null;
  const suffix = '-' + userId;
  if (!id.endsWith(suffix)) return null;
  let prefixo = null;
  if (id.startsWith('DEMANDA-')) prefixo = 'DEMANDA-';
  else if (id.startsWith('INT-')) prefixo = 'INT-';
  if (!prefixo) return null;
  const meio = id.slice(prefixo.length, id.length - suffix.length);
  return meio || null;
}

async function buscarPorId(lead) {
  const meio = _meioDoId(lead);
  if (!meio) return null;
  const { rows } = await query(
    `SELECT * FROM interessados_portal WHERE id::text = $1 OR id_anuncio = $1`,
    [meio]
  );
  return rows.length === 1 ? { row: rows[0], tier: 'id' } : null;
}

async function buscarPorNomeContato(lead) {
  const nome = normTexto(lead.nome);
  if (!nome) return null;
  const { rows: porNome } = await query(
    `SELECT * FROM interessados_portal WHERE lower(btrim(nome)) = lower(btrim($1))`,
    [nome]
  );
  if (porNome.length === 0) return null;
  if (porNome.length === 1) return { row: porNome[0], tier: 'nome' };

  const tel = normTelefone(lead.telefone || lead.whatsapp);
  const email = normEmail(lead.email);

  if (tel && email) {
    const comAmbos = porNome.filter(r => normTelefone(r.telefone) === tel && normEmail(r.email) === email);
    if (comAmbos.length === 1) return { row: comAmbos[0], tier: 'nome+email+telefone' };
  }
  if (email) {
    const comEmail = porNome.filter(r => normEmail(r.email) === email);
    if (comEmail.length === 1) return { row: comEmail[0], tier: 'nome+email' };
  }
  if (tel) {
    const comTel = porNome.filter(r => normTelefone(r.telefone) === tel);
    if (comTel.length === 1) return { row: comTel[0], tier: 'nome+telefone' };
  }
  return null; // mais de 1 linha e não deu pra desempatar por email/telefone
}

function linhaParaFormatoDemanda(o) {
  return {
    Tipo: o.tipo || '', Transacao: o.transacao || '',
    Bairro: o.bairro || '', Cidade: o.cidade || '', Estado: o.estado || '',
    Quartos: o.quartos || '', Suites: o.suites || '', Vagas: o.vagas || '', Banheiros: o.banheiros || '',
    Area_max: o.area_max || '', Valor_max: o.valor_max || ''
  };
}

async function run() {
  const { rows: leads } = await query(`
    SELECT id, nome, telefone, whatsapp, user_id, codigo_usuario, dados->>'email' AS email
    FROM leads
    WHERE (id LIKE 'DEMANDA-%' OR id LIKE 'INT-%')
      AND (fase_funil IS NULL OR fase_funil IN ('novo', 'qualificado'))
      AND COALESCE(vitrine_enviada, false) = false
      AND COALESCE(visita_agendada, false) = false
      AND jsonb_array_length(COALESCE(matches, '[]'::jsonb)) = 0
      AND jsonb_array_length(COALESCE(matches_auto, '[]'::jsonb)) = 0
  `);
  console.log(`[preencher-perfil-leads] ${leads.length} lead(s) em Novo/Qualificando (DEMANDA-* ou INT-*)`);

  let porId = 0, porNomeContato = 0, ambigua = 0, semCorrespondencia = 0, erros = 0;
  const ambiguas = [], semMatch = [];

  for (const lead of leads) {
    try {
      const achado = (await buscarPorId(lead)) || (await buscarPorNomeContato(lead));
      if (!achado) {
        const { rows: candidatos } = await query(
          `SELECT COUNT(*)::int AS n FROM interessados_portal WHERE lower(btrim(nome)) = lower(btrim($1))`,
          [normTexto(lead.nome)]
        );
        if (candidatos[0].n > 1) { ambigua++; ambiguas.push(lead.id); }
        else { semCorrespondencia++; semMatch.push(lead.id); }
        continue;
      }
      const { perfilIA, mapaIntencao } = montarPerfilEMapaDemanda(linhaParaFormatoDemanda(achado.row));
      await atualizarLead(lead.id, { perfilIA, mapaIntencao });
      if (achado.tier === 'id') porId++; else porNomeContato++;
    } catch (e) {
      erros++;
      console.error(`[preencher-perfil-leads] erro na lead ${lead.id}:`, e.message);
    }
  }

  console.log(`[preencher-perfil-leads] preenchidas por id: ${porId} | por nome+contato: ${porNomeContato} | ambíguas (mais de 1 linha, sem desempate): ${ambigua} | sem correspondência: ${semCorrespondencia} | erros: ${erros}`);
  if (ambiguas.length) console.log('[preencher-perfil-leads] ids ambíguos:', ambiguas.join(', '));
  if (semMatch.length) console.log('[preencher-perfil-leads] ids sem correspondência:', semMatch.join(', '));
}

run()
  .then(() => process.exit(0))
  .catch(e => { console.error('[preencher-perfil-leads] erro fatal:', e.message); process.exit(1); });
