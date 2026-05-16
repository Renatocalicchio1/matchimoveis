const fs = require('fs');

async function bairroPorLogradouro(logradouro) {
  if (!logradouro) return '';
  const rua = encodeURIComponent(logradouro.replace(/\(.*?\)/g, '').trim());
  const url = 'https://viacep.com.br/ws/SP/S%C3%A3o%20Paulo/' + rua + '/json/';
  try {
    const res = await fetch(url);
    const data = await res.json();
    if (Array.isArray(data) && data.length > 0 && data[0].bairro) return data[0].bairro;
  } catch(e) {}
  return '';
}

const logradouros = [
  'Rua Ilha da Juventude',
  'Rua Mário Regallo Pereira',
  'Avenida Bosque da Saúde'
];

async function main() {
  for (const l of logradouros) {
    const bairro = await bairroPorLogradouro(l);
    console.log(l, '->', bairro || 'NAO ENCONTRADO');
  }
}
main();
