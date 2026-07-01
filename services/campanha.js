const { query } = require('./db');
const { enviarEmail } = require('./email');

async function processarCampanha(contatos, { assunto, html, texto }) {
  // Buscar emails já cadastrados
  const emails = contatos.map(c => c.email.toLowerCase().trim()).filter(Boolean);
  const { rows } = await query(
    `SELECT email FROM usuarios WHERE LOWER(email) = ANY($1)`,
    [emails]
  );
  const jasCadastrados = new Set(rows.map(r => r.email.toLowerCase()));

  const novos = contatos.filter(c => c.email && !jasCadastrados.has(c.email.toLowerCase().trim()));
  const duplicados = contatos.filter(c => c.email && jasCadastrados.has(c.email.toLowerCase().trim()));

  console.log(`[CAMPANHA] total: ${contatos.length} | já cadastrados: ${duplicados.length} | novos: ${novos.length}`);

  return { novos, duplicados, total: contatos.length };
}

async function dispararCampanha(novos, { assunto, html }) {
  let enviados = 0, erros = 0;
  for (const c of novos) {
    try {
      const htmlPersonalizado = html.replace(/\{nome\}/g, c.nome || 'Corretor');
      await enviarEmail({ para: c.email, assunto, html: htmlPersonalizado, texto: assunto });
      enviados++;
      console.log(`[CAMPANHA] enviado: ${c.email} (${enviados}/${novos.length})`);
      await new Promise(r => setTimeout(r, 1100)); // respeita limite 1/s do SES
    } catch(e) {
      erros++;
      console.error(`[CAMPANHA] erro: ${c.email}`, e.message);
    }
  }
  return { enviados, erros };
}

module.exports = { processarCampanha, dispararCampanha };
