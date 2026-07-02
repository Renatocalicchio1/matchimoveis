const { workerData, parentPort } = require('worker_threads');
const { atualizarJob } = require('../services/importJobs');

async function run() {
  const { jobId, xmlUrl, userId } = workerData;
  try {
    await atualizarJob(jobId, { status: 'processando', progresso: 0 });
    parentPort.postMessage({ tipo: 'log', msg: `[WORKER XML] iniciando | job: ${jobId}` });

    const { execSync } = require('child_process');
    const path = require('path');
    
    execSync(
      `node ${path.join(__dirname, '../importXMLCompleto.js')} "${xmlUrl}" "${userId}"`,
      { stdio: 'inherit', timeout: 300000, env: { ...process.env } }
    );

    await atualizarJob(jobId, { status: 'concluido', progresso: 100 });
    parentPort.postMessage({ tipo: 'concluido' });
  } catch(e) {
    await atualizarJob(jobId, { status: 'erro', erro: e.message });
    parentPort.postMessage({ tipo: 'erro', msg: e.message });
  }
}

run().catch(console.error);
