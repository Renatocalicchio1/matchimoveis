const { workerData, parentPort } = require('worker_threads');
const { buscarCampanha, atualizarCampanha, incrementarContador, proximoLotePendente, marcarContato, dentroDaJanelaDisparo } = require('../services/salvarDisparo');
const { enviarTemplate, _normalizarTelefone, _telefoneValido } = require('../services/metaWhatsapp');

const MAX_TENTATIVAS = 3;

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function enviarComRetry(contato, campanha) {
  // Rede de segurança pra campanhas criadas antes da validação de telefone
  // existir (ou qualquer linha que tenha entrado torta na tabela) — barra
  // aqui em vez de gastar uma tentativa de verdade contra a API da Meta.
  if (!_telefoneValido(contato.telefone)) {
    return { ok: false, erro: 'Número de telefone inválido' };
  }
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
  // refAdmin (quando presente): sub-admin dono desse contato, atribuído em
  // round-robin na criação da campanha — vai como querystring pra /entrar/:id
  // marcar o atendente assim que a conta é criada (ver rota /entrar/:contatoId).
  const _refAdmin = contato.variaveis && contato.variaveis.refAdmin;
  const botoesUrl = campanha.corretor_user_id
    ? [{ index: 0, valor: `${campanha.corretor_user_id}?tel=${_normalizarTelefone(contato.telefone)}` }]
    : campanha.usar_contato_id_botao
      ? [{ index: 0, valor: _refAdmin ? `${contato.id}?ref=${_refAdmin}` : contato.id }]
      : undefined;
  // Teste A/B: se esse contato sorteou um template na criação da campanha
  // (inserirContatos, quando campanha.templates tem 2+), usa ele — senão
  // cai no template único da campanha (caso normal, sem A/B).
  const _templateNome = contato.template_nome_usado || campanha.template_nome;
  const _templateIdioma = contato.template_idioma_usado || campanha.template_idioma;
  for (let tentativa = 1; tentativa <= MAX_TENTATIVAS; tentativa++) {
    try {
      const resultado = await enviarTemplate({
        telefone: contato.telefone,
        templateNome: _templateNome,
        templateIdioma: _templateIdioma,
        parametros,
        botoesUrl,
        phoneNumberId: campanha.phone_number_id || undefined
      });
      return { ok: true, messageId: resultado.messageId };
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

      // Campanha restrita a janela de horário (ex: só 12h-13h/20h-21h Brasília)
      // — fora da janela, encerra o worker sem erro e deixa marcado
      // 'aguardando_janela'; o JOB_JOBS_TRAVADOS (roda a cada 5min) relança
      // sozinho assim que a janela abrir de novo.
      if (campanha.restringir_horario && !dentroDaJanelaDisparo()) {
        await atualizarCampanha(campanhaId, { status: 'aguardando_janela' });
        parentPort.postMessage({ tipo: 'aguardando_janela' });
        return;
      }

      const [contato] = await proximoLotePendente(campanhaId, 1);
      if (!contato) break;

      // "Reivindica" o contato ANTES de mandar pra Meta — se o processo morrer
      // logo depois do envio (ex: Render reinicia o container no meio, o que
      // acontece toda vez que uma env var muda) mas antes de marcar 'enviado',
      // o job que relança campanha travada não pode achar esse contato como
      // 'pendente' de novo, senão manda a mesma mensagem pro lead outra vez.
      // Fica em 'enviando' esperando revisão manual em vez de arriscar duplicar.
      await marcarContato(contato.id, { status: 'enviando' });

      const resultado = await enviarComRetry(contato, campanha);
      if (resultado.ok) {
        await marcarContato(contato.id, { status: 'enviado', messageId: resultado.messageId });
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
