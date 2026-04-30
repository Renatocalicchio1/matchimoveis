const fs = require('fs');

const imoveis = JSON.parse(fs.readFileSync('imoveis.json', 'utf8'));
const comProp = imoveis.filter(im => im.proprietario && im.proprietario.telefone);

console.log('Gerando XML com', comProp.length, 'imóveis...');

function esc(s) {
  return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function precoNum(im) {
  return im.valor_imovel || im.preco || 0;
}

let xml = `<?xml version="1.0" encoding="UTF-8"?>
<ListingDataFeed xmlns="http://www.vivareal.com/schemas/1.0/VRSync"
  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
  xsi:schemaLocation="http://www.vivareal.com/schemas/1.0/VRSync http://xml.vivareal.com/vrsync.xsd">
  <Header>
    <Provider>Rankim</Provider>
    <Email>renato@rankim.com.br</Email>
    <ContactName>Rankim</ContactName>
    <Phone>47992010888</Phone>
  </Header>
  <Listings>\n`;

for (const im of comProp) {
  const fotos = (im.fotos || []).slice(0, 20);
  const preco = precoNum(im);
  const transacao = String(im.transacao||'').toLowerCase().includes('aluguel') ? 'RentalTotal' : 'Sale';
  const tipo = String(im.tipo||'Apartamento');

  xml += `    <Listing>
      <ListingID>${esc(im.idExterno || im.referencia || im.id)}</ListingID>
      <Title>${esc(im.titulo || tipo + ' em ' + im.bairro)}</Title>
      <TransactionType>${transacao}</TransactionType>
      <PropertyType>${esc(tipo)}</PropertyType>
      <Details>
        <ListPrice currency="BRL">${preco}</ListPrice>
        <Bedrooms>${im.quartos || 0}</Bedrooms>
        <Suites>${im.suites || 0}</Suites>
        <Bathrooms>${im.banheiros || 0}</Bathrooms>
        <Garage>${im.vagas || 0}</Garage>
        <Area unit="square metres">
          <TotalArea>${im.area_m2 || im.area || 0}</TotalArea>
          <UsableArea>${im.area_m2 || im.area || 0}</UsableArea>
        </Area>
        <Description>${esc(im.descricao || '')}</Description>
      </Details>
      <ContactInfo>
        <Name>${esc(im.proprietario.corretor || 'Rankim')}</Name>
        <Email>renato@rankim.com.br</Email>
        <Phone>47992010888</Phone>
        <AgentName>${esc(im.proprietario.nome)}</AgentName>
        <AgentPhone>${esc(im.proprietario.telefone)}</AgentPhone>
      </ContactInfo>
      <Location>
        <Country>Brasil</Country>
        <State>${esc(im.estado || 'SP')}</State>
        <City>${esc(im.cidade || 'São Paulo')}</City>
        <Neighborhood>${esc(im.bairro || '')}</Neighborhood>
        <Address>${esc(im.endereco || '')}</Address>
        <Latitude>${im.latitude || im.lat || ''}</Latitude>
        <Longitude>${im.longitude || im.lng || ''}</Longitude>
      </Location>
      <Media>${fotos.map(f => `
        <Item medium="image"><![CDATA[${f}]]></Item>`).join('')}
      </Media>
    </Listing>\n`;
}

xml += `  </Listings>
</ListingDataFeed>`;

fs.writeFileSync('feed-vivareal.xml', xml, 'utf8');
console.log('✅ XML gerado: feed-vivareal.xml');
console.log('📦 Total imóveis:', comProp.length);
