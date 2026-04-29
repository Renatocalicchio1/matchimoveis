const XLSX = require('xlsx');
const fs = require('fs');

const excel = 'backup-28-11-25.06_22 (1) (1).xlsx';
const dataFile = 'data.json';

const data = JSON.parse(fs.readFileSync(dataFile,'utf8'));
const imoveis = Array.isArray(data) ? data : (data.results || []);

const wb = XLSX.readFile(excel);
const crm = XLSX.utils.sheet_to_json(wb.Sheets['CRM'] || {});

function clean(v){ return String(v || '').trim().toLowerCase(); }

let vinculados = 0;
let semVinculo = 0;

const leads = crm.map((l, idx) => {
  const ref = clean(l['Ref. do imóvel']);
  const imovel = imoveis.find(i =>
    clean(i.listingId) === ref ||
    clean(i.referencia) === ref ||
    clean(i.id) === ref ||
    clean(i.referencia || '').includes(ref) ||
    ref.includes(clean(i.referencia || '___'))
  );

  if (imovel) vinculados++;
  else semVinculo++;

  return {
    leadId: `LEAD-${idx + 1}`,
    corretorNome: l['Corretor'] || 'MARIO SERGIO DE SOUZA',
    corretorCelular: '11999965998',
    clienteNome: l['Cliente'] || '',
    clienteCelular: l['Celular'] || '',
    clienteEmail: l['E-mail'] || '',
    origem: l['Origem'] || '',
    referenciaImovel: l['Ref. do imóvel'] || '',
    tipo: l['Tipo'] || '',
    subtipo: l['Subtipo'] || '',
    transacao: l['Transação'] || '',
    preco: l['Preço'] || '',
    imovelVinculado: !!imovel,
    imovelId: imovel ? imovel.listingId : '',
    imovelResumo: imovel ? {
      tipo: imovel.tipo,
      bairro: imovel.bairro,
      cidade: imovel.cidade,
      estado: imovel.estado,
      valor: imovel.valor_imovel,
      quartos: imovel.quartos,
      suites: imovel.suites,
      banheiros: imovel.banheiros,
      vagas: imovel.vagas
    } : null,
    etapaAtual: imovel ? 'Lead recebido com imóvel vinculado' : 'Lead recebido sem imóvel vinculado',
    jornada: [
      { etapa: 'Lead recebido', feito: true, data: new Date().toISOString() },
      { etapa: 'Imóvel vinculado', feito: !!imovel, data: imovel ? new Date().toISOString() : null },
      { etapa: 'Sistema buscar match', feito: false, data: null },
      { etapa: 'Cards enviados ao cliente', feito: false, data: null },
      { etapa: 'Cliente visualizou', feito: false, data: null },
      { etapa: 'Cliente escolheu imóvel', feito: false, data: null },
      { etapa: 'Visita solicitada', feito: false, data: null },
      { etapa: 'Proprietário confirmou', feito: false, data: null },
      { etapa: 'Visita agendada', feito: false, data: null },
      { etapa: 'Visita realizada', feito: false, data: null },
      { etapa: 'Proposta enviada', feito: false, data: null }
    ]
  };
});

fs.writeFileSync('leads.json', JSON.stringify(leads, null, 2));

console.log('==============================');
console.log('LEADS IMPORTADOS:', leads.length);
console.log('LEADS VINCULADOS A IMÓVEL:', vinculados);
console.log('LEADS SEM VÍNCULO:', semVinculo);
console.log('ARQUIVO CRIADO: leads.json');
console.log('==============================');
