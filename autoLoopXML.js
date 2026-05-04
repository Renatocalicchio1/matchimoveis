setInterval(() => {
  console.log('⏱ Rodando verificação de XML...');
  require('./autoUpdateXML');
}, 10 * 60 * 1000); // 10 minutos
