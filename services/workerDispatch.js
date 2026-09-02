const { Worker } = require('worker_threads');
const path = require('path');

// XML e planilha de leads sobem worker_thread + um processo Node filho
// completo cada um (workers/importXmlWorker.js e importLeadsWorker.js
// chamam execSync('node importXMLCompleto.js ...') / processLeads.js) — sem
// limite, uploads simultâneos (de contas diferentes, ou o job de retry de
// jobs travados a cada 5min, ver server.js JOB_JOBS_TRAVADOS) empilhavam N
// processos Node completos disputando a mesma memória do container. Fila
// simples: só MAX_IMPORTS_CONCORRENTES rodam ao mesmo tempo, o resto espera
// a vez e dispara assim que uma vaga libera. dispararWorkerDisparo (envio de
// WhatsApp em massa) não passa por aqui — não sobe processo filho, só faz
// chamadas HTTP, bem mais leve.
const MAX_IMPORTS_CONCORRENTES = 2;
let _importsEmExecucao = 0;
const _filaImports = [];

function _processarFilaImports() {
  if (_importsEmExecucao >= MAX_IMPORTS_CONCORRENTES || _filaImports.length === 0) return;
  const { workerPath, workerData, tag } = _filaImports.shift();
  _importsEmExecucao++;
  const worker = new Worker(workerPath, { workerData });
  worker.on('message', msg => console.log(`[${tag}]`, msg));
  worker.on('error', e => console.error(`[${tag}] erro:`, e.message));
  worker.on('exit', code => {
    console.log(`[${tag}] exit:`, code);
    _importsEmExecucao--;
    _processarFilaImports();
  });
}

function dispararWorkerXml(jobId, xmlUrl, userId) {
  _filaImports.push({
    workerPath: path.join(__dirname, '../workers/importXmlWorker.js'),
    workerData: { jobId, xmlUrl, userId },
    tag: 'WORKER XML'
  });
  _processarFilaImports();
}

function dispararWorkerLeads(jobId, filePath, userId) {
  _filaImports.push({
    workerPath: path.join(__dirname, '../workers/importLeadsWorker.js'),
    workerData: { jobId, filePath, userId },
    tag: 'WORKER LEADS'
  });
  _processarFilaImports();
}

// Trava contra worker duplicado pra mesma campanha (set/2026, achado
// investigando bloqueio "Business Account locked" da Meta) — diferente dos
// workers de importação (fila com limite acima), dispararWorkerDisparo()
// nunca teve nenhuma proteção: se chamado 2x pra mesma campanha (ex: clique
// manual "Iniciar campanha" + JOB_JOBS_TRAVADOS relançando por achar a
// campanha "sem atualização há 10+min" quase ao mesmo tempo), sobem 2
// worker_threads mandando mensagem em paralelo pro mesmo lote de contatos —
// rajada de envio que pode disparar proteção anti-abuso da própria Meta,
// além de risco de mensagem duplicada pro cliente.
const _disparosAtivos = new Set();

function dispararWorkerDisparo(campanhaId) {
  if (_disparosAtivos.has(campanhaId)) {
    console.log('[WORKER DISPARO] já tem worker ativo pra essa campanha, ignorando disparo duplicado:', campanhaId);
    return null;
  }
  _disparosAtivos.add(campanhaId);
  const worker = new Worker(path.join(__dirname, '../workers/disparoWhatsappWorker.js'), {
    workerData: { campanhaId }
  });
  worker.on('message', msg => console.log('[WORKER DISPARO]', msg));
  worker.on('error', e => console.error('[WORKER DISPARO] erro:', e.message));
  worker.on('exit', code => {
    console.log('[WORKER DISPARO] exit:', code);
    _disparosAtivos.delete(campanhaId);
  });
  return worker;
}

module.exports = { dispararWorkerXml, dispararWorkerLeads, dispararWorkerDisparo };
