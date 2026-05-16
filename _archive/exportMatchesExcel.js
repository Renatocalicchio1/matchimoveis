const fs = require('fs');
const XLSX = require('xlsx');

const data = JSON.parse(fs.readFileSync('data.json','utf8'));

let rows = [];

data.forEach((item, i) => {
  if (!item.matches || item.matches.length === 0) return;

  const o = item.origin || {};

  item.matches.slice(0,5).forEach((m, idx) => {
    rows.push({
      lead_id: i,
      tipo: o.tipo,
      bairro: o.bairro,
      quartos: o.quartos,
      valor_origem: o.valor_imovel,
      match_rank: idx + 1,
      match_valor: m.valor_imovel || m.valor,
      match_area: m.area_m2 || m.area,
      match_url: m.url
    });
  });
});

const ws = XLSX.utils.json_to_sheet(rows);
const wb = XLSX.utils.book_new();

XLSX.utils.book_append_sheet(wb, ws, 'Matches');

XLSX.writeFile(wb, 'matches.xlsx');

console.log('Excel gerado: matches.xlsx');
