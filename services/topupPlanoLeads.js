/**
 * services/topupPlanoLeads.js
 *
 * Combo comprado via /demanda entrega até `qtd` leads na hora (webhook do
 * Mercado Pago). Se a busca encontrou mais leads do que o combo cobre, o
 * restante não é perdido: fica guardado nos critérios da compra
 * (planoLeadsCriterios) com prazo de 30 dias (planoLeadsExpiraEm). Esse job
 * roda 1x por dia, refaz a mesma busca pra cada conta com plano pendente e
 * entrega as leads novas que aparecerem (mesmo critério, mesma base), até
 * completar a qtd do combo ou vencer os 30 dias — o que vier primeiro.
 *
 * Idempotente: o id da lead é sempre 'DEMANDA-' + rowId + '-' + userId, e
 * salvarLead() faz UPSERT (ON CONFLICT DO UPDATE) — rodar de novo sobre uma
 * lead já entregue não duplica nem conta como nova.
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
  const { buscarDemandaParaEntrega } = require('./buscaDemanda');
  const { salvarLead } = require('./salvarLead');

  const usuarios = await lerUsuarios();
  const agora = Date.now();
  let contasProcessadas = 0;
  let leadsEntreguesTotal = 0;

  for (const u of usuarios) {
    if (!u.planoLeadsCriterios || !u.planoLeadsExpiraEm) continue;
    if (new Date(u.planoLeadsExpiraEm).getTime() < agora) continue; // passou dos 30 dias da compra

    const qtd = parseInt(u.planoLeadsQtd) || 0; // 0 = ilimitado, sem teto
    const entreguesAtual = parseInt(u.planoLeadsEntreguesQtd) || 0;
    if (qtd > 0 && entreguesAtual >= qtd) continue; // combo já completo, nada a fazer

    const { estado, pares, transacoes } = u.planoLeadsCriterios;
    if (!estado || !Array.isArray(pares) || !pares.length) continue;

    try {
      const restante = qtd > 0 ? (qtd - entreguesAtual) : 0;
      const encontrados = await buscarDemandaParaEntrega({
        estado, pares, transacoes: transacoes || [], horas: 720, limite: restante
      });

      let novos = 0;
      for (const l of encontrados) {
        const id = 'DEMANDA-' + l._rowId + '-' + u.id;
        const jaExistia = await _leadJaExiste(id);
        if (jaExistia) continue; // já foi entregue antes (na compra ou num topup anterior)
        try {
          await salvarLead({
            id,
            nome: l.Nome || 'Interessado', telefone: l.Telefone, whatsapp: l.Telefone, email: l.Email,
            user_id: u.id, userId: u.id, codigoUsuario: u.id,
            origem: 'compra_demanda', status: 'novo', faseFunil: 'novo', fase_funil: 'novo',
            perfilIA: {
              tipo: l.Tipo || '', intencao: l.Transacao === 'aluguel' ? 'alugar' : 'comprar',
              cidade: l.Cidade, estado: l.Estado, bairro: l.Bairro, valorMax: l.Valor_max || undefined
            },
            dados: { origemCompraDemanda: true, dataOriginalPortal: l.criadoEm, entregueViaTopup: true },
            _lote: true
          });
          novos++;
        } catch (eLead) { console.error('[topupPlanoLeads] erro ao salvar lead', u.id, eLead.message); }
      }

      if (novos > 0) {
        await atualizarUsuario(u.id, { planoLeadsEntreguesQtd: entreguesAtual + novos });
        leadsEntreguesTotal += novos;
        console.log('[topupPlanoLeads]', u.id, '+', novos, 'lead(s) nova(s) —', entreguesAtual + novos, '/', qtd || '∞');
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
  console.log('[topupPlanoLeads] job diário iniciado — completa combos de /demanda que não cobriram tudo, dentro dos 30 dias da compra');
  setInterval(() => {
    rodarTopupPlanoLeads().catch(e => console.error('[topupPlanoLeads] erro na rodada:', e.message));
  }, 24 * 60 * 60 * 1000);
}

module.exports = { iniciarTopupPlanoLeads, rodarTopupPlanoLeads };
