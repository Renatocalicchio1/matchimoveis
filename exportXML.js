const fs = require('fs');

const portal = process.argv[2] || 'vivareal';
const ids = process.argv.slice(3);

const imoveis = JSON.parse(fs.readFileSync('imoveis.json','utf8'));

function esc(str){
  return String(str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;');
}

const lista = ids.length
  ? imoveis.filter(i => ids.includes(String(i.idExterno)))
  : imoveis;

let xml = `<?xml version="1.0" encoding="UTF-8"?>
<!-- Feed ${portal} -->
<ListingDataFeed>
<Listings>
`;

lista.forEach(i => {

xml += `
<Listing>
<ListingID>${esc(i.idExterno)}</ListingID>
<ListPrice>${i.valor_imovel || 0}</ListPrice>

<Details>
<PropertyType>${esc(i.tipo)}</PropertyType>
<Bedrooms>${i.quartos || 0}</Bedrooms>
<Bathrooms>${i.banheiros || 0}</Bathrooms>
<Suites>${i.suites || 0}</Suites>
<Garage>${i.vagas || 0}</Garage>
<LivingArea>${i.area_m2 || 0}</LivingArea>
</Details>

<Location>
<Country>BR</Country>
<State>${esc(i.estado)}</State>
<City>${esc(i.cidade)}</City>
<Neighborhood>${esc(i.bairro)}</Neighborhood>
</Location>

<Description>${esc(i.descricao)}</Description>

<Media>
`;

(i.fotos || []).forEach(f=>{
  xml += `<Item medium="image" url="${esc(f)}"/>`;
});

xml += `
</Media>

</Listing>
`;
});

xml += `
</Listings>
</ListingDataFeed>
`;

fs.writeFileSync(`feed-${portal}.xml`, xml);

console.log('Feed gerado:', `feed-${portal}.xml`);
