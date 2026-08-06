const { workerData, parentPort } = require('worker_threads');
const { buscarCampanha, atualizarCampanha, incrementarContador, proximoLotePendente, marcarContato } = require('../services/salvarDisparo');
const { enviarTemplate, _normalizarTelefone } = require('../services/metaWhatsapp');

const MAX_TENTATIVAS = 3;

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function enviarComRetry(contato, campanha) {
  const parametros = (campanha.mapeamento_variaveis || []).map(campo => {
    const v = contato.variaveis ? contato.variaveis[campo] : '';
    return v == null ? '' : v;
  });
  // Só o botão de índice 0 é do tipo URL dinâmica no template — o índice 1
  // (resposta rápida) não aceita parâmetro de URL — mandar os dois dava erro
  // 132018 (parâmetro de template inválido). Duas campanhas usam esse botão de
  // formas diferentes: captação de imóvel aponta pra /captar/{corretor}?tel=...;
  // aquisição de conta nova (usar_contato_id_botao) aponta pra /entrar/{id da
  // linha de disparos_contatos}, que cria a conta na hora do clique.
  const botoesUrl = campanha.corretor_user_id
    ? [{ index: 0, valor: `${campanha.corretor_user_id}?tel=${_normalizarTelefone(contato.telefone)}` }]
    : campanha.usar_contato_id_botao
      ? [{ index: 0, valor: contato.id }]
      : undefined;
  for (let tentativa = 1; tentativa <= MAX_TENTATIVAS; tentativa++) {
    try {
      await enviarTemplate({
        telefone: contato.telefone,
        templateNome: campanha.template_nome,
        templateIdioma: campanha.template_idioma,
        parametros,
        botoesUrl
      });
      return { ok: true };
    } catch (e) {
      if (!e.transitorio || tentativa === MAX_TENTATIVAS) {
        return { ok: false, erro: e.message };
      }
      await sleep(1500 * tentativa);
    }
  }
  return { ok: false, erro: 'Falha desconhecida' };
}

async function run() {
  const { campanhaId } = workerData;
  try {
    await atualizarCampanha(campanhaId, { status: 'enviando', pausado: false, erro_geral: null });
    parentPort.postMessage({ tipo: 'log', msg: `[WORKER DISPARO] iniciando | campanha: ${campanhaId}` });

    let enviadosLote = 0, errosLote = 0;

    while (true) {
      const campanha = await buscarCampanha(campanhaId);
      if (!campanha) throw new Error('Campanha não encontrada');
      if (campanha.pausado) {
        await atualizarCampanha(campanhaId, { status: 'pausado' });
        parentPort.postMessage({ tipo: 'pausado' });
        return;
      }

      const [contato] = await proximoLotePendente(campanhaId, 1);
      if (!contato) break;

      const resultado = await enviarComRetry(contato, campanha);
      if (resultado.ok) {
        await marcarContato(contato.id, { status: 'enviado' });
        await incrementarContador(campanhaId, 'enviados');
        enviadosLote++;
      } else {
        await marcarContato(contato.id, { status: 'erro', erro: resultado.erro });
        await incrementarContador(campanhaId, 'erros');
        errosLote++;
      }

      parentPort.postMessage({ tipo: 'progresso', enviados: enviadosLote, erros: errosLote });
      await sleep(campanha.delay_ms || 2500);
    }

    await atualizarCampanha(campanhaId, { status: 'concluido' });
    parentPort.postMessage({ tipo: 'concluido' });
  } catch (e) {
    await atualizarCampanha(campanhaId, { status: 'erro', erro_geral: e.message }).catch(() => {});
    parentPort.postMessage({ tipo: 'erro', msg: e.message });
  }
}

run().catch(console.error);
