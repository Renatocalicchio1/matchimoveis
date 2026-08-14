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
    // Email resumo do lote
    try {
      const { query } = require('../services/db');
      const _userR = await query('SELECT nome, email FROM usuarios WHERE codigo_usuario=$1 OR id=$1 LIMIT 1', [userId]);
      const _user = _userR.rows[0];
      if (_user && _user.email) {
        const { enviarEmail } = require('../services/email');
        await enviarEmail({
          para: _user.email,
          assunto: '✅ Importação de leads concluída — MatchImóveis',
          html: '<div style="font-family:Arial,sans-serif;max-width:600px;padding:32px"><h2 style="color:#FF385C">✅ Importação concluída!</h2><p>Sua planilha de leads foi importada com sucesso.</p><a href="https://matchimoveis.ia.br/app/leads" style="display:inline-block;margin-top:16px;padding:12px 24px;background:#FF385C;color:#fff;text-decoration:none;border-radius:8px;font-weight:bold">Ver leads →</a></div>',
          texto: 'Importação de leads concluída. Acesse: https://matchimoveis.ia.br/app/leads',
          tipo: 'importacao_leads_concluida',
          botaoTexto: 'Ver leads →',
          userId
        });
      }
    } catch(_eR){}
    parentPort.postMessage({ tipo: 'concluido' });
  } catch(e) {
    await atualizarJob(jobId, { status: 'erro', erro: e.message });
    parentPort.postMessage({ tipo: 'erro', msg: e.message });
  }
}

run().catch(console.error);
