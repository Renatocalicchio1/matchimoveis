const fs = require('fs');
const XLSX = require('xlsx');

const data = JSON.parse(fs.readFileSync('data.json','utf8'));

const rows = [];

function money(v) {
  if (!v) return '-';
  return 'R$ ' + Number(v).toLocaleString('pt-BR');
}

function dt(v) {
  if (!v) return '-';
  return new Date(v).toLocaleString('pt-BR');
}

data.forEach((item, idx) => {
  if (!item.matches || !item.matches.length) return;

  const o = item.origin || {};

  rows.push({
    Linha: 'ORIGEM',
    Card: idx,
    Cliente: item.clientName || 'Cliente sem nome',
    Celular: item.contact || 'Sem contato',
    Email: item.email || '-',
    Processado: dt(item.processedAt),
    Match: dt(item.matchedAt),
    Fonte: 'ImovelWeb',
    Rank: 'Origem',
    Score: '-',
    ID: o.listingId || item.listingId || '-',
    Tipo: o.tipo || '-',
    Bairro: o.bairro || '-',
    Cidade: o.cidade || '-',
    UF: o.estado || '-',
    Valor: money(o.valor_imovel),
    Area: (o.area_m2 || '-') + ' m²',
    Quartos: o.quartos ?? '-',
    Suites: o.suites ?? '-',
    Banheiros: o.banheiros ?? '-',
    Vagas: o.vagas ?? '-',
    URL: o.url || item.listingUrl || '-'
  });

  item.matches.forEach((m) => {
    rows.push({
      Linha: 'MATCH',
      Card: idx,
      Cliente: item.clientName || 'Cliente sem nome',
      Celular: item.contact || 'Sem contato',
      Email: item.email || '-',
      Processado: dt(item.processedAt),
      Match: dt(item.matchedAt),
      Fonte: m.fonte || (m.id_anuncio_remax ? 'REMAX' : 'QuintoAndar'),
      Rank: '#' + (m.rank || '-'),
      Score: m.score ?? '-',
      ID: m.id_anuncio_quintoandar || m.id_anuncio_remax || m.id_anuncio || '-',
      Tipo: m.tipo || '-',
      Bairro: m.bairro || o.bairro || '-',
      Cidade: m.cidade || '-',
      UF: m.estado || '-',
      Valor: money(m.valor_imovel || m.valor),
      Area: (m.area_m2 || m.area || '-') + ' m²',
      Quartos: m.quartos ?? '-',
      Suites: m.suites ?? '-',
      Banheiros: m.banheiros ?? '-',
      Vagas: m.vagas ?? '-',
      URL: m.url || '-'
    });
  });

  rows.push({});
});

const ws = XLSX.utils.json_to_sheet(rows);
const wb = XLSX.utils.book_new();

ws['!cols'] = [
  {wch:10},{wch:8},{wch:24},{wch:18},{wch:28},{wch:22},{wch:22},
  {wch:16},{wch:10},{wch:8},{wch:18},{wch:14},{wch:22},{wch:16},
  {wch:8},{wch:16},{wch:12},{wch:8},{wch:8},{wch:10},{wch:8},{wch:70}
];

XLSX.utils.book_append_sheet(wb, ws, 'Cards com Match');
XLSX.writeFile(wb, 'cards-matches.xlsx');

console.log('Novo Excel gerado: cards-matches.xlsx');
