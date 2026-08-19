// Dispara o e-mail "indique e ganhe" (services/emailIndicacao.js) pra toda a
// base ativa de corretores AGORA, fora do ciclo automático de 15 dias
// (_agendarEmailIndicacao em server.js) — pedido do Renato (ago/2026) pra
// usar indicação como alavanca rápida de crescimento sem custo de mídia.
// Roda manual no Render Shell:
//   node disparar-email-indicacao-agora.js
const { enviarEmailIndicacao } = require('./services/emailIndicacao');

(async () => {
  console.log('Disparando e-mail de indicação pra toda a base ativa...');
  await enviarEmailIndicacao();
  console.log('Concluído.');
  process.exit(0);
})();
