require('dotenv').config();
const fs = require('fs');
const { sendWhatsApp } = require('./services/twilioWhats');

const id = process.argv[2];

(async () => {
  const data = JSON.parse(fs.readFileSync('data.json','utf8'));
  const item = data[id];

  if (!item) {
    console.log('Lead não encontrado');
    return;
  }

  const origin = item.origin || {};
  const matches = item.matches || [];

  let texto = '*NOVO LEAD COM MATCH*\\n\\n';
  texto += 'Tipo: ' + (origin.tipo || '-') + '\\n';
  texto += 'Bairro: ' + (origin.bairro || '-') + '\\n';
  texto += 'Quartos: ' + (origin.quartos || '-') + '\\n';
  texto += 'Valor: ' + (origin.valor_imovel || '-') + '\\n\\n';

  texto += '*MATCHES:*\\n';

  matches.slice(0,5).forEach((m, i) => {
    texto += '\\n' + (i+1) + '. R$ ' + (m.valor_imovel || m.valor || '-') +
             ' | ' + (m.area_m2 || m.area || '-') + 'm²\\n' +
             (m.url || '-') + '\\n';
  });

  const to = 'whatsapp:+554792010888';

  const sid = await sendWhatsApp(to, texto);

  console.log('ENVIADO:', sid);
})();
