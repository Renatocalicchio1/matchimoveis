const { extrairPerfil } = require('./cerebro/extrator-perfil');
const msgs = [{ de: 'cliente', texto: 'Olá! Quero ser contatado sobre este imóvel em venda que vi em Imovelweb.' }];
const perfil = extrairPerfil(msgs);
console.log(JSON.stringify(perfil, null, 2));
