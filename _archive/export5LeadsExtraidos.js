const fs = require('fs');
const XLSX = require('xlsx');
const { extractProperty } = require('./services/extractor');

(async () => {
  const data = JSON.parse(fs.readFileSync('data.json','utf8'));
  const leads = data.slice(0, 5);
  const linhas = [];

  for (const lead of leads) {
    console.log('\nExtraindo:', lead.id, lead.url);

    const origin = await extractProperty(
      { listingUrl: lead.url, listingId: lead.id },
      lead
    );

    console.log('Resultado:', origin.bairro, origin.tipo, origin.valor_imovel, origin.area_m2, origin.quartos);

    linhas.push({
      Nome: lead.nome || '',
      Email: lead.email || '',
      Contato: lead.contato || '',
      Telefone2: lead.telefone2 || '',
      ID_Anuncio: lead.id || '',
      URL: lead.url || '',
      Status: origin.extractionStatus || '',
      Fonte: origin.fonte || 'ImovelWeb',
      Tipo: origin.tipo || lead.tipo || '',
      Bairro: origin.bairro || lead.bairro || '',
      Cidade: origin.cidade || lead.cidade || '',
      Estado: origin.estado || lead.estado || '',
      Valor: origin.valor_imovel || lead.valor_imovel || 0,
      Area_m2: origin.area_m2 || lead.area_m2 || 0,
      Quartos: origin.quartos || lead.quartos || 0,
      Suites: origin.suites || lead.suites || 0,
      Banheiros: origin.banheiros || lead.banheiros || 0,
      Vagas: origin.vagas || lead.vagas || 0,
      Logradouro: origin.logradouro || '',
      Titulo: origin.titulo || lead.titulo || ''
    });
  }

  const ws = XLSX.utils.json_to_sheet(linhas);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Leads Extraidos');

  XLSX.writeFile(wb, 'leads-extraidos-5.xlsx');

  console.log('\nEXPORTADO: leads-extraidos-5.xlsx');
})();
