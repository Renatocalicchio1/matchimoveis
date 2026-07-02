const { workerData, parentPort } = require('worker_threads');
const { atualizarJob } = require('../services/importJobs');

async function run() {
  const { jobId, filePath, userId } = workerData;
  try {
    await atualizarJob(jobId, { status: 'processando', progresso: 0 });
    parentPort.postMessage({ tipo: 'log', msg: `[WORKER LEADS] iniciando | job: ${jobId}` });

    const { execSync } = require('child_process');
    const path = require('path');

    execSync(
      `node ${path.join(__dirname, '../processLeads.js')} "${filePath}" "${userId}"`,
      { stdio: 'inherit', timeout: 180000, env: { ...process.env }, cwd: path.join(__dirname, '..') }
    );

    await atualizarJob(jobId, { status: 'concluido', progresso: 100 });
    parentPort.postMessage({ tipo: 'concluido' });
  } catch(e) {
    await atualizarJob(jobId, { status: 'erro', erro: e.message });
    parentPort.postMessage({ tipo: 'erro', msg: e.message });
  }
}

run().catch(console.error);
