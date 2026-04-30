const fs = require('fs');
const imoveis = JSON.parse(fs.readFileSync('imoveis.json','utf8'));

function esc(s) {
  return String(s||'')
    .replace(/&/g,'&amp;')
    .replace(/</g,'&lt;')
    .replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;');
}

function tipoVivaReal(tipo) {
  const t = (tipo||'').toLowerCase();
  if (t.includes('apart')) return 'Apartamento';
  if (t.includes('casa')) return 'Casa';
  if (t.includes('comer')) return 'Comercial';
  if (t.includes('terreno')) return 'Terreno';
  if (t.includes('sala')) return 'Sala Comercial';
  return 'Apartamento';
}

function transacaoVivaReal(t) {
  return (t||'').toLowerCase() === 'venda' ? 'Venda' : 'Aluguel';
}

let xml = `<?xml version="1.0" encoding="UTF-8"?>
<ListingDataFeed xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <Header>
    <PublisherName>MatchImoveis</PublisherName>
    <PublisherEmail>contato@matchimoveis.com.br</PublisherEmail>
  </Header>
  <Listings>
`;

imoveis.forEach(im => {
  const fotos = (im.fotos||[]).slice(0,20);
  const corretor = im.corretor || {};
  const transacao = transacaoVivaReal(im.transacao);
  const tipo = tipoVivaReal(im.tipo);

  xml += `    <Listing>
      <ListingID>${esc(im.idExterno||im.idOriginal)}</ListingID>
      <Title>${esc(im.titulo)}</Title>
      <TransactionType>${transacao}</TransactionType>
      <PropertyType>${tipo}</PropertyType>
      <Description>${esc(im.descricao)}</Description>
      <ListPrice>${im.valor_imovel||0}</ListPrice>
      <MonthlyCondoFee>${im.condominio||0}</MonthlyCondoFee>
      <YearlyTax>${im.iptu||0}</YearlyTax>
      <Details>
        <LivingArea unit="square metres">${im.area_m2||0}</LivingArea>
        <LotArea unit="square metres">${im.area_total||im.area_m2||0}</LotArea>
        <Bedrooms>${im.quartos||0}</Bedrooms>
        <Suites>${im.suites||0}</Suites>
        <Bathrooms>${im.banheiros||0}</Bathrooms>
        <Garage>${im.vagas||0}</Garage>
      </Details>
      <Address>
        <Country>Brasil</Country>
        <State>${esc(im.estado||'SP')}</State>
        <City>${esc(im.cidade||'São Paulo')}</City>
        <Neighborhood>${esc(im.bairro||'')}</Neighborhood>
        <StreetAddress>${esc(im.endereco||'')}</StreetAddress>
        <PostalCode>${esc(im.cep||'')}</PostalCode>
        <Latitude>${im.latitude||''}</Latitude>
        <Longitude>${im.longitude||''}</Longitude>
      </Address>
      <ContactInfo>
        <Name>${esc(corretor.nome||'')}</Name>
        <Email>${esc(corretor.email||'')}</Email>
        <Phone>${esc(corretor.telefone||'')}</Phone>
      </ContactInfo>
      <Media>
${fotos.map(f => `        <Item medium="image"><![CDATA[${f}]]></Item>`).join('\n')}
      </Media>
    </Listing>
`;
});

xml += `  </Listings>
</ListingDataFeed>`;

fs.writeFileSync('imoveis-vivareal.xml', xml);
console.log('XML gerado: imoveis-vivareal.xml');
console.log('Total imoveis:', imoveis.length);
console.log('Tamanho:', (Buffer.byteLength(xml,'utf8')/1024/1024).toFixed(2)+'MB');
