const { query } = require('./db');
const { enviarEmail } = require('./email');

const BASE_URL = process.env.RENDER ? 'https://www.matchimoveis.ia.br' : 'http://localhost:3000';

async function importarContatos(contatos) {
  let importados = 0, duplicados = 0;
  for (const c of contatos) {
    try {
      await query(
        `INSERT INTO campanha_contatos (nome, email, celular) VALUES ($1,$2,$3) ON CONFLICT (email) DO NOTHING`,
        [c.nome||'', c.email.toLowerCase().trim(), c.celular||'']
      );
      importados++;
    } catch(e) { duplicados++; }
  }
  return { importados, duplicados };
}

async function statsBase() {
  const { rows } = await query(`SELECT status, COUNT(*) as total FROM campanha_contatos GROUP BY status`);
  return rows;
}

async function statsTracking() {
  const { rows } = await query(`SELECT tipo, COUNT(*) as total FROM campanha_tracking GROUP BY tipo`);
  return rows;
}

async function statsCadastrados() {
  const { rows } = await query(`
    SELECT COUNT(*) as total FROM campanha_contatos cc
    WHERE LOWER(cc.email) IN (SELECT LOWER(email) FROM usuarios WHERE email IS NOT NULL AND email != '')
    AND cc.status = 'enviado'
  `);
  return rows[0]?.total || 0;
}

async function proximoLote(limite) {
  const { rows } = await query(`
    SELECT cc.id, cc.nome, cc.email, cc.celular
    FROM campanha_contatos cc
    WHERE cc.status = 'pendente'
    AND LOWER(cc.email) NOT IN (SELECT LOWER(email) FROM usuarios WHERE email IS NOT NULL AND email != '')
    ORDER BY cc.criado_em ASC
    LIMIT $1
  `, [limite]);
  return rows;
}

async function marcarEnviado(id, erro) {
  if (erro) {
    await query(`UPDATE campanha_contatos SET status='erro', erro=$1, enviado_em=NOW() WHERE id=$2`, [erro, id]);
  } else {
    await query(`UPDATE campanha_contatos SET status='enviado', enviado_em=NOW() WHERE id=$2`, [id]);
  }
}

function gerarHTML(mensagem, contato, assunto) {
  const trackPixel = `${BASE_URL}/campanha/track/open/${contato.id || 0}`;
  const trackLink = `${BASE_URL}/campanha/track/click/${contato.id || 0}`;
  const msgFinal = mensagem
    .replace(/{nome}/g, contato.nome || 'Corretor')
    .replace('https://www.matchimoveis.ia.br', trackLink);
  return `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:32px;color:#222">
    <pre style="font-family:Arial,sans-serif;white-space:pre-wrap;font-size:15px;line-height:1.7">${msgFinal}</pre>
    <p style="margin-top:8px;font-size:13px;color:#888">Para não receber mais emails, responda com CANCELAR.</p>
    <img src="${trackPixel}" width="1" height="1" style="display:none">
  </div>`;
}

async function dispararLote(lote, { assunto, mensagem }) {
  let enviados = 0, erros = 0;
  for (const c of lote) {
    try {
      const msgPersonalizada = mensagem.replace(/\{nome\}/g, c.nome || 'Corretor');
      const html = gerarHTML(msgPersonalizada, c, assunto);
      await enviarEmail({ para: c.email, assunto, html, texto: assunto });
      await marcarEnviado(c.id, null);
      enviados++;
      console.log(`[CAMPANHA] enviado: ${c.email} (${enviados}/${lote.length})`);
      await new Promise(r => setTimeout(r, 1100));
    } catch(e) {
      await marcarEnviado(c.id, e.message);
      erros++;
      console.error(`[CAMPANHA] erro: ${c.email}`, e.message);
    }
  }
  return { enviados, erros };
}

async function enviarTeste(emailTeste, { assunto, mensagem }) {
  const html = gerarHTML(mensagem.replace(/\{nome\}/g, 'Corretor Teste'), { id: 'teste' }, assunto);
  await enviarEmail({ para: emailTeste, assunto: '[TESTE] ' + assunto, html, texto: assunto });
}

module.exports = { importarContatos, statsBase, statsTracking, statsCadastrados, proximoLote, dispararLote, enviarTeste };
