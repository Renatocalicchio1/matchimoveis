// Preenche retroativamente o perfil completo (quartos, suítes, vagas,
// banheiros, área) + mapaIntencao das leads geradas via /admin/interesados
// (ver services/interesadosPortal.js) — mesma causa raiz do bug já
// corrigido pras leads de /demanda (ver preencherPerfilDemandaPendentes.js):
// importarInteresados() monta o perfilIA só com
// tipo/intencao/cidade/estado/bairro/valorMax, sem
// quartos/suites/vagas/banheiros/area e sem mapaIntencao nenhum — essas
// leads nunca batem os critérios mínimos de match.
//
// Diferente do script de /demanda: NÃO roda rematch no final, só preenche
// o perfil (pedido explícito, ago/2026).
//
// Casamento lead -> linha de interessados_portal, em 2 passos:
// 1) Pelo id da lead ("INT-<idAnuncio ou id>-<userId>") — exato, sem
//    ambiguidade (usa id_anuncio ou id da tabela).
// 2) Se não achar (ex: interessados_portal foi limpa/reimportada depois -
//    ver limparTudo() - e o id de origem não existe mais), cai pra
//    nome+email+telefone, senão nome+email, senão nome+telefone, conforme
//    o que a lead tiver. Só aplica quando sobra EXATAMENTE 1 linha — a
//    mesma pessoa pode ter se interessado por mais de 1 imóvel (mais de 1
//    linha real); ambíguo fica de fora, sem chute.
//
// Escopo: leads com origem='interesados_portal' criadas nos últimos 4 dias.
//
// Rodar no Render Shell: node preencherPerfilInteresadosPendentes.js
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

async function buscarPorId(lead) {
  const userId = lead.user_id || lead.codigo_usuario;
  if (!userId || !lead.id || !String(lead.id).startsWith('INT-')) return null;
  const suffix = '-' + userId;
  if (!String(lead.id).endsWith(suffix)) return null;
  const meio = String(lead.id).slice('INT-'.length, String(lead.id).length - suffix.length);
  if (!meio) return null;
  const { rows } = await query(
    `SELECT * FROM interessados_portal WHERE id_anuncio = $1 OR id::text = $1`,
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
  const { rows: leads } = await query(
    `SELECT id, nome, telefone, whatsapp, user_id, codigo_usuario, dados->>'email' AS email
     FROM leads
     WHERE origem = 'interesados_portal' AND criado_em >= NOW() - INTERVAL '4 days'`
  );
  console.log(`[preencher-perfil-interesados] ${leads.length} lead(s) de interesados_portal nos últimos 4 dias`);

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
      console.error(`[preencher-perfil-interesados] erro na lead ${lead.id}:`, e.message);
    }
  }

  console.log(`[preencher-perfil-interesados] preenchidas por id: ${porId} | por nome+contato: ${porNomeContato} | ambíguas (mais de 1 linha, sem desempate): ${ambigua} | sem correspondência: ${semCorrespondencia} | erros: ${erros}`);
  if (ambiguas.length) console.log('[preencher-perfil-interesados] ids ambíguos:', ambiguas.join(', '));
  if (semMatch.length) console.log('[preencher-perfil-interesados] ids sem correspondência:', semMatch.join(', '));
}

run()
  .then(() => process.exit(0))
  .catch(e => { console.error('[preencher-perfil-interesados] erro fatal:', e.message); process.exit(1); });
