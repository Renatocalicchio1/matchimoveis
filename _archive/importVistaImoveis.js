const fs = require('fs');
const https = require('http');

const KEY = '9bc249c7e7e72ef840e2c556025a214b';
const BASE_URL = 'http://cli21379-rest.vistahost.com.br';

async function fetchPagina(pagina) {
  const pesquisa = JSON.stringify({
    fields: ["Codigo","Cidade","Bairro","Categoria","ValorVenda","AreaTotal","Dormitorios","Vagas","Endereco","FotoDestaque","Proprietario"],
    paginacao: { pagina, quantidade: 50 }
  });

  const url = `${BASE_URL}/imoveis/listar?key=${KEY}&pesquisa=${encodeURIComponent(pesquisa)}`;

  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers: { 'Accept': 'application/json' } }, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch(e) { reject(e); }
      });
    });
    req.on('error', reject);
  });
}

async function main() {
  const todos = [];
  let pagina = 1;

  while(true) {
    console.log(`Buscando página ${pagina}...`);
    const result = await fetchPagina(pagina);

    if (!result || result.status === 400 || result.status === 404) break;

    const imoveis = Object.values(result);
    if (imoveis.length === 0) break;

    imoveis.forEach(i => {
      todos.push({
        idExterno: i.Codigo,
        cidade: i.Cidade,
        bairro: i.Bairro,
        tipo: i.Categoria,
        valor_imovel: Number(i.ValorVenda) || 0,
        area_m2: Number(i.AreaTotal) || 0,
        quartos: Number(i.Dormitorios) || 0,
        vagas: Number(i.Vagas) || 0,
        endereco: i.Endereco,
        fotos: i.FotoDestaque ? [i.FotoDestaque] : [],
        proprietario: i.Proprietario || null,
        source: 'vista'
      });
    });

    console.log(`  ${imoveis.length} imóveis nessa página. Total: ${todos.length}`);
    if (imoveis.length < 50) break;
    pagina++;
    await new Promise(r => setTimeout(r, 300));
  }

  fs.writeFileSync('./vista_imoveis.json', JSON.stringify(todos, null, 2));
  console.log(`\n✅ ${todos.length} imóveis salvos em vista_imoveis.json`);
}

main().catch(console.error);
