const fs = require('fs');
const path = require('path');

function esc(v=''){return String(v??'').replace(/[<>&'"]/g,c=>({'<':'&lt;','>':'&gt;','&':'&amp;',"'":'&apos;','"':'&quot;'}[c]));}
function money(v){return String(v||'').replace(/\D/g,'') || '0';}
function get(i,k){return i?.[k] ?? i?.origin?.[k] ?? '';}

function buildVivaRealXML(items, portal='canalpro'){
  const listings = items.map((i,idx)=>{
    const id = get(i,'listingId') || get(i,'id') || get(i,'id_anuncio') || `MARIO-${idx+1}`;
    return `
    <Listing>
      <ListingID>${esc(id)}</ListingID>
      <Title>${esc(get(i,'titulo') || get(i,'title') || 'Imóvel Mario Sergio')}</Title>
      <TransactionType>For Sale</TransactionType>
      <PublicationType>STANDARD</PublicationType>
      <DetailViewUrl>${esc(get(i,'url') || get(i,'url_anuncio'))}</DetailViewUrl>
      <PropertyType>${esc(get(i,'tipo') || 'Residential / Apartment')}</PropertyType>
      <ListPrice currency="BRL">${money(get(i,'valor_imovel') || get(i,'valor'))}</ListPrice>
      <LivingArea unit="square metres">${esc(get(i,'area_m2') || get(i,'area'))}</LivingArea>
      <Bedrooms>${esc(get(i,'quartos'))}</Bedrooms>
      <Bathrooms>${esc(get(i,'banheiros'))}</Bathrooms>
      <Suites>${esc(get(i,'suites'))}</Suites>
      <Garage>${esc(get(i,'vagas'))}</Garage>
      <Location>
        <Country abbreviation="BR">Brasil</Country>
        <State abbreviation="${esc(get(i,'estado') || 'SP')}">${esc(get(i,'estado') || 'SP')}</State>
        <City>${esc(get(i,'cidade') || 'São Paulo')}</City>
        <Neighborhood>${esc(get(i,'bairro'))}</Neighborhood>
        <Address>${esc(get(i,'logradouro') || get(i,'endereco'))}</Address>
      </Location>
      <ContactInfo>
        <Name>Mario Sergio</Name>
        <Email>mario@matchimoveis.com.br</Email>
        <Website>https://matchimoveis.com.br</Website>
        <Telephone>11999965998</Telephone>
      </ContactInfo>
    </Listing>`;
  }).join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<Listings>
  <Header>
    <Provider>MatchImoveis</Provider>
    <Portal>${esc(portal)}</Portal>
    <Email>mario@matchimoveis.com.br</Email>
    <PublishDate>${new Date().toISOString()}</PublishDate>
  </Header>
  ${listings}
</Listings>`;
}

function savePortalXML(items, portal){
  const safe = String(portal).toLowerCase().replace(/[^a-z0-9]+/g,'-');
  const file = path.join(process.cwd(),'exports',`${safe}-mario-${Date.now()}.xml`);
  fs.writeFileSync(file, buildVivaRealXML(items, portal));
  return file;
}

module.exports={ buildVivaRealXML, savePortalXML };
