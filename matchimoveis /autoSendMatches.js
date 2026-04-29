require('dotenv').config();
const fs = require('fs');
const { sendWhatsApp } = require('./services/twilioWhats');
const { logEvent } = require('./services/memory');

const FILE = 'data.json';
const TO = process.env.TEST_CORRETOR_WHATSAPP;

function readData() {
  try { return JSON.parse(fs.readFileSync(FILE, 'utf8')); }
  catch { return []; }
}

function saveData(data) {
  fs.writeFileSync(FILE, JSON.stringify(data, null, 2));
}

function resumo(item, idx) {
  const o = item.origin || {};
  const m = (item.matches || [])[0] || {};

  return `NOVO MATCH ENCONTRADO 🚀

Lead #${idx}
Cliente: ${item.clientName || item.nome || 'Não informado'}

IMÓVEL ORIGEM:
${o.tipo || ''} - ${o.bairro || ''}
Valor: R$ ${o.valor_imovel || ''}
Quartos: ${o.quartos || ''}
Área: ${o.area_m2 || ''} m²

MATCH:
Fonte: ${m.fonte || 'QuintoAndar'}
Score: ${m.score || ''}
Link: ${m.url || ''}

Acesse o painel:
http://localhost:3000`;
}

(async () => {
  if (!TO) {
    console.log('Falta TEST_CORRETOR_WHATSAPP no .env');
    process.exit(1);
  }

  console.log('Robô WhatsApp ligado. Monitorando matches...');

  setInterval(async () => {
    const data = readData();
    let changed = false;

    for (let i = 0; i < data.length; i++) {
      const item = data[i];

      if (item.whatsSent) continue;
      if (!item.matches || item.matches.length === 0) continue;

      try {
        const body = resumo(item, i);
        const r = await sendWhatsApp(TO, body);

        item.whatsSent = true;
        item.whatsSentAt = new Date().toISOString();
        item.whatsSid = r.sid;
        changed = true;

        logEvent({
          type: 'whatsapp_match_sent',
          leadId: i,
          clientName: item.clientName || item.nome || null,
          propertyId: item.origin?.listingId || item.origin?.id_anuncio || null,
          matchId: item.matches?.[0]?.id_anuncio || null,
          source: item.matches?.[0]?.fonte || null,
          status: 'sent',
          meta: { sid: r.sid }
        });

        console.log('WhatsApp enviado para lead', i, r.sid);
      } catch (e) {
        console.log('Erro ao enviar lead', i, e.message);
      }
    }

    if (changed) saveData(data);
  }, 10000);
})();
