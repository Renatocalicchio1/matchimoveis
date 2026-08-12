/**
 * services/topupPlanoLeads.js
 *
 * Combo comprado via /demanda entrega até `qtd` leads na hora (webhook do
 * Mercado Pago). Se a busca encontrou mais leads do que o combo cobre, o
 * restante não fica de fora: esse job roda 1x por dia, refaz a mesma busca
 * pra cada conta com plano pendente (planoLeadsCriterios) e entrega as leads
 * novas que aparecerem — cobrando o custo normal de `nova_lead` em créditos
 * por cada uma, igual qualquer outra lead nova na plataforma.
 *
 * Não é uma cota fixa: continua entregando enquanto a conta tiver crédito
 * suficiente, dentro do prazo de 30 dias da compra (planoLeadsExpiraEm).
 * Acabou o crédito, para — o corretor precisa comprar mais créditos ou
 * outro combo pra voltar a receber. Não bloqueia a conta nem o resto da
 * plataforma, só essa entrega extra específica.
 *
 * Idempotente: o id da lead é sempre 'DEMANDA-' + rowId + '-' + userId, e
 * salvarLead() faz UPSERT (ON CONFLICT DO UPDATE) — rodar de novo sobre uma
 * lead já entregue não duplica nem conta/cobra de novo.
 */
const { query } = require('./db');

async function _leadJaExiste(id) {
  try {
    const { rows } = await query('SELECT 1 FROM leads WHERE id=$1', [id]);
    return rows.length > 0;
  } catch (e) {
    return false;
  }
}

async function rodarTopupPlanoLeads() {
  const { lerUsuarios, atualizarUsuario } = require('./salvarUsuario');
  const { buscarDemandaParaEntrega, montarPerfilEMapaDemanda } = require('./buscaDemanda');
  const { salvarLead } = require('./salvarLead');
  const { consumir, temSaldo } = require('./creditos');
  const matchCoreTopup = require('../cerebro/match-core');

  const usuarios = await lerUsuarios();
  const agora = Date.now();
  let contasProcessadas = 0;
  let leadsEntreguesTotal = 0;

  for (const u of usuarios) {
    if (!u.planoLeadsCriterios || !u.planoLeadsExpiraEm) continue;
    if (new Date(u.planoLeadsExpiraEm).getTime() < agora) continue; // passou dos 30 dias da compra

    const { estado, pares, transacoes } = u.planoLeadsCriterios;
    if (!estado || !Array.isArray(pares) || !pares.length) continue;

    // Checagem barata antes de buscar: sem crédito nenhum, nem vale rodar a busca.
    if (!(await temSaldo(u.id))) continue;

    try {
      const encontrados = await buscarDemandaParaEntrega({
        estado, pares, transacoes: transacoes || [], horas: 720, limite: 0 // 0 = sem teto, pega tudo que bater
      });

      let novos = 0;
      for (const l of encontrados) {
        const id = 'DEMANDA-' + l._rowId + '-' + u.id;
        const jaExistia = await _leadJaExiste(id);
        if (jaExistia) continue; // já foi entregue antes (na compra ou num topup anterior)

        const conseguiuDebitar = await consumir(u.id, 'nova_lead');
        if (!conseguiuDebitar) break; // acabou o crédito — para por aqui, precisa recarregar

        try {
          const { perfilIA, mapaIntencao } = montarPerfilEMapaDemanda(l);
          const leadTopup = {
            id,
            nome: l.Nome || 'Interessado', telefone: l.Telefone, whatsapp: l.Telefone, email: l.Email,
            user_id: u.id, userId: u.id, codigoUsuario: u.id,
            origem: 'compra_demanda', status: 'novo', faseFunil: 'novo', fase_funil: 'novo',
            perfilIA, mapaIntencao,
            matches: [], matchesAuto: [], matchesBase: [], mensagens: [],
            dados: { origemCompraDemanda: true, dataOriginalPortal: l.criadoEm, entregueViaTopup: true },
            _lote: true
          };
          await salvarLead(leadTopup);
          // Match roda na hora, igual todo outro canal de entrada — não
          // depende do job das 6h pra gerar o 1º match (esse job só tenta
          // de novo quem ainda ficou sem nenhum).
          try {
            await matchCoreTopup.processar({ lead: leadTopup, mensagem: '', canal: 'compra_demanda', userId: u.id });
          } catch (eMatch) { console.error('[topupPlanoLeads] erro ao rodar match da lead', u.id, eMatch.message); }
          novos++;
        } catch (eLead) { console.error('[topupPlanoLeads] erro ao salvar lead', u.id, eLead.message); }
      }

      if (novos > 0) {
        const entreguesAtual = parseInt(u.planoLeadsEntreguesQtd) || 0;
        await atualizarUsuario(u.id, { planoLeadsEntreguesQtd: entreguesAtual + novos });
        leadsEntreguesTotal += novos;
        console.log('[topupPlanoLeads]', u.id, '+', novos, 'lead(s) nova(s), debitadas em créditos');
      }
      contasProcessadas++;
    } catch (e) {
      console.error('[topupPlanoLeads] erro na conta', u.id, e.message);
    }
  }

  console.log('[topupPlanoLeads] rodada concluída —', contasProcessadas, 'conta(s) processada(s),', leadsEntreguesTotal, 'lead(s) entregue(s)');
  return { contasProcessadas, leadsEntreguesTotal };
}

function iniciarTopupPlanoLeads() {
  console.log('[topupPlanoLeads] job diário iniciado — completa leads de /demanda além do combo, cobrando em créditos, por até 30 dias da compra');
  setInterval(() => {
    rodarTopupPlanoLeads().catch(e => console.error('[topupPlanoLeads] erro na rodada:', e.message));
  }, 24 * 60 * 60 * 1000);
}

module.exports = { iniciarTopupPlanoLeads, rodarTopupPlanoLeads };
