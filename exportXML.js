const fs = require('fs');

const portal = process.argv[2] || 'vivareal';
const ids = process.argv.slice(3);

const imoveis = JSON.parse(fs.readFileSync('imoveis.json','utf8'));

function esc(str){
  return String(str || '')
    .replace(/&/g,'&amp;')
    .replace(/</g,'&lt;')
    .replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;');
}

function onlyNumber(v){
  return String(v || '').replace(/\D/g,'');
}

const lista = ids.length
  ? imoveis.filter(i => ids.includes(String(i.idExterno)))
  : imoveis;

function gerarPadraoAtual(){
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

  return xml;
}

function gerarPadraoQuintoAndar(){
  let xml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<ListingDataFeed>
  <Header>
    <Provider>Rankim</Provider>
    <Email>renato@rankim.com.br</Email>
    <BatchId>matchimoveis-${Date.now()}</BatchId>
    <BatchName>MatchImoveis QuintoAndar ${new Date().toISOString()}</BatchName>
  </Header>
  <Listings>
`;

  lista.forEach(i => {
    const proprietario = i.proprietario || {};
    const fotos = Array.isArray(i.fotos) ? i.fotos : [];

    xml += `
    <Listing>
      <ListingID>${esc(i.idExterno || i.idOriginal || i.id)}</ListingID>
      <Title>${esc(i.titulo || `${i.tipo || 'Imóvel'} em ${i.bairro || ''}`)}</Title>
      <TransactionType>For Sale</TransactionType>
      <PublicationType>STANDARD</PublicationType>
      <Created_at>${esc(i.createdAt || i.dataCadastro || '')}</Created_at>
      <Updated_at>${esc(i.lastUpdate || i.updatedAt || i.ultimaAtualizacao || '')}</Updated_at>
      <DetailViewUrl>${esc(i.url || i.link || '')}</DetailViewUrl>
      <VirtualTourLink>${esc(i.tourVirtual || '')}</VirtualTourLink>

      <Details>
        <UsageType>Residential</UsageType>
        <PropertyType>${esc(i.tipo || 'Residential / Apartment')}</PropertyType>
        <Description>${esc(i.descricao || '')}</Description>
        <ListPrice currency="BRL">${i.valor_imovel || i.valor || 0}</ListPrice>
        <LotArea unit="square metres">${i.area_total || i.area_m2 || 0}</LotArea>
        <UnitFloor>${esc(i.andar || '')}</UnitFloor>
        <LivingArea unit="square metres">${i.area_m2 || i.area || 0}</LivingArea>
        <PropertyAdministrationFee currency="BRL">${i.condominio || 0}</PropertyAdministrationFee>
        <YearlyTax currency="BRL">${i.iptu || 0}</YearlyTax>
        <Bedrooms>${i.quartos || 0}</Bedrooms>
        <Bathrooms>${i.banheiros || 0}</Bathrooms>
        <Room>${i.salas || i.rooms || 1}</Room>
        <Suites>${i.suites || 0}</Suites>
        <Garage>${i.vagas || 0}</Garage>
      </Details>

      <Media>
`;

    fotos.forEach((f, idx) => {
      xml += `        <Item primary="${idx === 0 ? 'true' : 'false'}" type="IMAGE">${esc(typeof f === 'string' ? f : f.url)}</Item>
`;
    });

    xml += `      </Media>

      <Location>
        <Country abbreviation="BR">Brasil</Country>
        <State abbreviation="${esc(typeof i.estado === 'object' ? (i.estado['@_abbreviation'] || i.estado.abbreviation || i.estado['#text'] || 'SP') : (i.estado || 'SP'))}">${esc(typeof i.estado === 'object' ? (i.estado['#text'] || 'São Paulo') : (i.estado === 'SP' ? 'São Paulo' : i.estado || 'São Paulo'))}</State>
        <City>${esc(i.cidade || 'São Paulo')}</City>
        <Neighborhood>${esc(i.bairro || '')}</Neighborhood>
        <Address>${esc(i.endereco || i.logradouro || '')}</Address>
        <StreetNumber>${esc(i.numero || '')}</StreetNumber>
        <Complement>${esc(i.complemento || '')}</Complement>
        <PostalCode>${esc(onlyNumber(i.cep || ''))}</PostalCode>
        <Latitude>${esc(i.latitude || '')}</Latitude>
        <Longitude>${esc(i.longitude || '')}</Longitude>
        <AddresType>Rua</AddresType>
        <Floor>${esc(i.andar || '')}</Floor>
        <Tower>${esc(i.torre || '')}</Tower>
        <Unity>${esc(i.unidade || '')}</Unity>
        <CondominiumName>${esc(i.condominioNome || i.condominio_name || '')}</CondominiumName>
      </Location>

      <ContactInfo>
        <Name>Rankim</Name>
        <Email>renato@rankim.com.br</Email>
        <Website></Website>
        <Logo></Logo>
        <OfficeName>Rankim</OfficeName>
        <Telephone></Telephone>
        <Location>
          <Country>Brasil</Country>
          <State>São Paulo</State>
          <City>São Paulo</City>
        </Location>
      </ContactInfo>

      <OwnerInfo>
        <Name>${esc(proprietario.nome || i.proprietarioNome || '')}</Name>
        <Email>${esc(proprietario.email || i.proprietarioEmail || '')}</Email>
        <Telephone>${esc(proprietario.telefone || i.proprietarioTelefone || '')}</Telephone>
      </OwnerInfo>

      <Broker>
        <BrokerName>${esc(i.corretorNome || '')}</BrokerName>
        <BrokerEmail>${esc(i.corretorEmail || '')}</BrokerEmail>
        <BrokerTelephone>${esc(i.corretorTelefone || i.corretorCelular || '')}</BrokerTelephone>
      </Broker>
    </Listing>
`;
  });

  xml += `  </Listings>
</ListingDataFeed>
`;

  return xml;
}

const xml = portal === 'quintoandar'
  ? gerarPadraoQuintoAndar()
  : gerarPadraoAtual();

fs.writeFileSync(`feed-${portal}.xml`, xml);

console.log('Feed gerado:', `feed-${portal}.xml`);
