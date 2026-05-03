const fs = require('fs');
const https = require('https');

function getXML() {
  return new Promise((resolve, reject) => {
    https.get('https://sistema.rankim.com.br/integration/39c160cc462c6d690e3433feaf038a23966c241b/vivareal.xml', res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => resolve(data));
    }).on('error', reject);
  });
}

function getTag(xml, tag) {
  const m = xml.match(new RegExp(`<${tag}[^>]*>([^<]*)<\/${tag}>`));
  return m ? m[1].trim() : '';
}

function getAllTags(xml, tag) {
  return [...xml.matchAll(new RegExp(`<${tag}[^>]*>([^<]*)<\/${tag}>`, 'g'))].map(m => m[1].trim());
}

async function main() {
  console.log('Baixando XML...');
  const xml = await getXML();
  
  const listings = xml.split('<Listing>').slice(1);
  console.log(`Total listings: ${listings.length}`);

  const imoveis = listings.map(l => {
    const fotos = getAllTags(l, 'Item').filter(f => f.startsWith('http'));
    return {
      idExterno: getTag(l, 'ListingID'),
      titulo: getTag(l, 'Title'),
      transacao: getTag(l, 'TransactionType') === 'For Sale' ? 'venda' : 'aluguel',
      tipo: getTag(l, 'PropertyType').includes('Home') ? 'Casa' : 
            getTag(l, 'PropertyType').includes('Condo') ? 'Apartamento' : 
            getTag(l, 'PropertyType').includes('Apartment') ? 'Apartamento' : 'Imóvel',
      bairro: getTag(l, 'Neighborhood'),
      cidade: getTag(l, 'City'),
      estado: getTag(l, 'State'),
      endereco: getTag(l, 'Address'),
      cep: getTag(l, 'PostalCode'),
      latitude: parseFloat(getTag(l, 'Latitude')) || 0,
      longitude: parseFloat(getTag(l, 'Longitude')) || 0,
      valor_imovel: parseFloat(getTag(l, 'ListPrice')) || 0,
      area_m2: parseFloat(getTag(l, 'LivingArea')) || parseFloat(getTag(l, 'LotArea')) || 0,
      quartos: parseInt(getTag(l, 'Bedrooms')) || 0,
      banheiros: parseInt(getTag(l, 'Bathrooms')) || 0,
      vagas: parseInt(getTag(l, 'Garage')) || 0,
      suites: parseInt(getTag(l, 'Suites')) || 0,
      descricao: getTag(l, 'Description'),
      fotos: fotos,
      corretor: {
        nome: getTag(l, 'Name'),
        email: getTag(l, 'Email'),
        telefone: getTag(l, 'Telephone')
      },
      source: 'xml',
      lastUpdate: new Date().toISOString()
    };
  });

  // Stats
  const cidades = {};
  imoveis.forEach(i => { cidades[i.cidade] = (cidades[i.cidade]||0)+1; });
  console.log('Top cidades:');
  Object.entries(cidades).sort((a,b)=>b[1]-a[1]).slice(0,5).forEach(([c,n]) => console.log(' ',n,c));

  fs.writeFileSync('./imoveis.json', JSON.stringify(imoveis, null, 2));
  console.log(`\n✅ ${imoveis.length} imóveis salvos em imoveis.json`);
}

main().catch(console.error);
