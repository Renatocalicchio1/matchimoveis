require('dotenv').config();
const fs = require('fs');
const { sendWhatsApp } = require('./services/twilioWhats');

const id = Number(process.argv[2] || 0);
const data = JSON.parse(fs.readFileSync('data.json', 'utf8'));
const item = data[id];

if (!item) {
  console.log('Lead não encontrado');
  process.exit(1);
}

const origin = item.origin || {};
const matches = item.matches || [];

let msg = `🚀 Novo lead com match\n\n`;
msg += `Cliente: ${item.clientName || item.nome || 'N/A'}\n`;
msg += `Telefone: ${item.phone || item.telefone || item.contato || 'N/A'}\n`;
msg += `Email: ${item.email || 'N/A'}\n\n`;
msg += `Imóvel buscado:\n`;
msg += `Bairro: ${origin.bairro || 'N/A'}\n`;
msg += `Valor: ${origin.valor_imovel || origin.valor || 'N/A'}\n`;
msg += `Área: ${origin.area_m2 || origin.area || 'N/A'}\n`;
msg += `Quartos: ${origin.quartos || 'N/A'}\n\n`;

if (matches.length) {
  msg += `Matches encontrados:\n`;
  matches.slice(0, 5).forEach((m, i) => {
    msg += `${i + 1}) ${m.url || m.cleanUrl || m.link || 'sem URL'}\n`;
  });
} else {
  msg += `Sem matches ainda.`;
}

sendWhatsApp(process.env.TEST_CORRETOR_WHATSAPP, msg)
  .then(sid => console.log('ENVIADO:', sid))
  .catch(err => console.error('ERRO:', err.message));
