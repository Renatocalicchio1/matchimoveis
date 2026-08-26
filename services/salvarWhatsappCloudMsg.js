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
  // A Meta reenvia o mesmo evento de webhook às vezes (entrega "pelo menos uma
  // vez") — sem isso, cada reenvio virava uma mensagem duplicada na conversa.
  // Índice parcial (só quando tem message_id) porque as mensagens que a gente
  // manda de saída ainda não guardam um id pra comparar, e não podem colidir
  // umas com as outras por serem todas NULL.
  await query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_wa_cloud_msg_id_unico ON whatsapp_cloud_mensagens(message_id) WHERE message_id IS NOT NULL`);
  // Número legível (ex: "551130304050") de quem RECEBEU a mensagem — a Meta
  // manda em change.value.metadata.display_phone_number no webhook, junto
  // com o phone_number_id (esse aí é só um ID opaco, não dá pra reconhecer
  // de olho). Pedido do Renato (ago/2026): saber em qual dos nossos números
  // cada mensagem da inbox chegou, sem precisar decorar o ID.
  await query(`ALTER TABLE whatsapp_cloud_mensagens ADD COLUMN IF NOT EXISTS display_phone_number TEXT`);
}

// direcao: 'entrada' (do lead pra gente) ou 'saida' (nossa resposta)
async function salvarMensagem({ phoneNumberId, displayPhoneNumber, telefone, nome, direcao, tipo, texto, messageId, midiaUrl, midiaMime }) {
  await _inicializar();
  await query(
    `INSERT INTO whatsapp_cloud_mensagens (id, phone_number_id, display_phone_number, contato_telefone, contato_nome, direcao, tipo, texto, message_id, lida, midia_url, midia_mime)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
     ON CONFLICT (message_id) WHERE message_id IS NOT NULL DO NOTHING`,
    [uuidv4(), phoneNumberId || null, displayPhoneNumber || null, telefone, nome || null, direcao, tipo || 'texto', texto || '', messageId || null, direcao === 'saida', midiaUrl || null, midiaMime || null]
  );
}

// Uma linha por contato — última mensagem + quantas de entrada tão sem ler.
// phoneNumberId (opcional): filtra só as conversas cuja ÚLTIMA mensagem
// chegou/saiu por esse número nosso (pedido do Renato — filtrar a inbox por
// número quando tem mais de um configurado no WhatsApp Cloud).
async function listarConversas(phoneNumberId) {
  await _inicializar();
  const { rows } = await query(`
    SELECT DISTINCT ON (contato_telefone)
      contato_telefone, contato_nome, phone_number_id, display_phone_number, direcao, tipo, texto, criado_em
    FROM whatsapp_cloud_mensagens
    ORDER BY contato_telefone, criado_em DESC
  `);
  const filtradas = phoneNumberId ? rows.filter(r => r.phone_number_id === phoneNumberId) : rows;
  const { rows: naoLidas } = await query(`
    SELECT contato_telefone, COUNT(*) as total
    FROM whatsapp_cloud_mensagens
    WHERE direcao='entrada' AND lida=false
    GROUP BY contato_telefone
  `);
  const mapaNaoLidas = {};
  naoLidas.forEach(r => { mapaNaoLidas[r.contato_telefone] = parseInt(r.total); });
  return filtradas
    .map(r => ({ ...r, naoLidas: mapaNaoLidas[r.contato_telefone] || 0 }))
    .sort((a, b) => new Date(b.criado_em) - new Date(a.criado_em));
}

// Lista os números nossos que já receberam alguma mensagem — popula o
// filtro por número da inbox. Um por phone_number_id, com o
// display_phone_number mais recente visto pra esse ID (pode ter ficado NULL
// em mensagens antigas, salvas antes dessa coluna existir).
async function listarNumerosRecebidos() {
  await _inicializar();
  const { rows } = await query(`
    SELECT phone_number_id,
      (array_agg(display_phone_number ORDER BY criado_em DESC) FILTER (WHERE display_phone_number IS NOT NULL))[1] as display_phone_number,
      COUNT(*)::int as total
    FROM whatsapp_cloud_mensagens
    WHERE phone_number_id IS NOT NULL
    GROUP BY phone_number_id
    ORDER BY total DESC
  `);
  return rows;
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

module.exports = { salvarMensagem, listarConversas, listarNumerosRecebidos, listarMensagens, listarMensagensApos, marcarLidas };
