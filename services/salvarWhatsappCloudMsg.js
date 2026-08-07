const { query } = require('./db');
const { v4: uuidv4 } = require('uuid');

let _iniciado = false;
async function _inicializar() {
  if (_iniciado) return;
  _iniciado = true;
  await query(`
    CREATE TABLE IF NOT EXISTS whatsapp_cloud_mensagens (
      id UUID PRIMARY KEY,
      phone_number_id TEXT,
      contato_telefone TEXT NOT NULL,
      contato_nome TEXT,
      direcao TEXT NOT NULL,
      tipo TEXT DEFAULT 'texto',
      texto TEXT,
      message_id TEXT,
      lida BOOLEAN DEFAULT false,
      criado_em TIMESTAMP DEFAULT NOW()
    )
  `);
  await query(`CREATE INDEX IF NOT EXISTS idx_wa_cloud_msg_telefone ON whatsapp_cloud_mensagens(contato_telefone, criado_em)`);
  // Áudio (recebido do lead ou enviado pelo admin) — guarda uma cópia local
  // servida por /data-uploads pra tocar no navegador (mídia da Meta expira e
  // exige token pra baixar, não dá pra apontar direto pro id/link deles).
  await query(`ALTER TABLE whatsapp_cloud_mensagens ADD COLUMN IF NOT EXISTS midia_url TEXT`);
  await query(`ALTER TABLE whatsapp_cloud_mensagens ADD COLUMN IF NOT EXISTS midia_mime TEXT`);
}

// direcao: 'entrada' (do lead pra gente) ou 'saida' (nossa resposta)
async function salvarMensagem({ phoneNumberId, telefone, nome, direcao, tipo, texto, messageId, midiaUrl, midiaMime }) {
  await _inicializar();
  await query(
    `INSERT INTO whatsapp_cloud_mensagens (id, phone_number_id, contato_telefone, contato_nome, direcao, tipo, texto, message_id, lida, midia_url, midia_mime)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
    [uuidv4(), phoneNumberId || null, telefone, nome || null, direcao, tipo || 'texto', texto || '', messageId || null, direcao === 'saida', midiaUrl || null, midiaMime || null]
  );
}

// Uma linha por contato — última mensagem + quantas de entrada tão sem ler.
async function listarConversas() {
  await _inicializar();
  const { rows } = await query(`
    SELECT DISTINCT ON (contato_telefone)
      contato_telefone, contato_nome, phone_number_id, direcao, tipo, texto, criado_em
    FROM whatsapp_cloud_mensagens
    ORDER BY contato_telefone, criado_em DESC
  `);
  const { rows: naoLidas } = await query(`
    SELECT contato_telefone, COUNT(*) as total
    FROM whatsapp_cloud_mensagens
    WHERE direcao='entrada' AND lida=false
    GROUP BY contato_telefone
  `);
  const mapaNaoLidas = {};
  naoLidas.forEach(r => { mapaNaoLidas[r.contato_telefone] = parseInt(r.total); });
  return rows
    .map(r => ({ ...r, naoLidas: mapaNaoLidas[r.contato_telefone] || 0 }))
    .sort((a, b) => new Date(b.criado_em) - new Date(a.criado_em));
}

async function listarMensagens(telefone) {
  await _inicializar();
  const { rows } = await query(
    `SELECT * FROM whatsapp_cloud_mensagens WHERE contato_telefone=$1 ORDER BY criado_em ASC`,
    [telefone]
  );
  return rows;
}

async function marcarLidas(telefone) {
  await _inicializar();
  await query(`UPDATE whatsapp_cloud_mensagens SET lida=true WHERE contato_telefone=$1 AND direcao='entrada'`, [telefone]);
}

// Usado pelo polling da tela de conversa — só as mensagens depois do horário
// que o navegador já tem renderizado, pra não reconstruir o chat inteiro a
// cada atualização.
async function listarMensagensApos(telefone, desde) {
  await _inicializar();
  const { rows } = await query(
    `SELECT * FROM whatsapp_cloud_mensagens WHERE contato_telefone=$1 AND criado_em > $2 ORDER BY criado_em ASC`,
    [telefone, desde]
  );
  return rows;
}

module.exports = { salvarMensagem, listarConversas, listarMensagens, listarMensagensApos, marcarLidas };
