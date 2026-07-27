const { Worker } = require('worker_threads');
const path = require('path');

function dispararWorkerXml(jobId, xmlUrl, userId) {
  const worker = new Worker(path.join(__dirname, '../workers/importXmlWorker.js'), {
    workerData: { jobId, xmlUrl, userId }
  });
  worker.on('message', msg => console.log('[WORKER XML]', msg));
  worker.on('error', e => console.error('[WORKER XML] erro:', e.message));
  worker.on('exit', code => console.log('[WORKER XML] exit:', code));
  return worker;
}

function dispararWorkerLeads(jobId, filePath, userId) {
  const worker = new Worker(path.join(__dirname, '../workers/importLeadsWorker.js'), {
    workerData: { jobId, filePath, userId }
  });
  worker.on('message', msg => console.log('[WORKER LEADS]', msg));
  worker.on('error', e => console.error('[WORKER LEADS] erro:', e.message));
  worker.on('exit', code => console.log('[WORKER LEADS] exit:', code));
  return worker;
}

function dispararWorkerDisparo(campanhaId) {
  const worker = new Worker(path.join(__dirname, '../workers/disparoWhatsappWorker.js'), {
    workerData: { campanhaId }
  });
  worker.on('message', msg => console.log('[WORKER DISPARO]', msg));
  worker.on('error', e => console.error('[WORKER DISPARO] erro:', e.message));
  worker.on('exit', code => console.log('[WORKER DISPARO] exit:', code));
  return worker;
}

module.exports = { dispararWorkerXml, dispararWorkerLeads, dispararWorkerDisparo };
