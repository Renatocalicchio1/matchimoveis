// Script utilitário — não gera rota, roda manual: node excluir-imoveis-codigos.js
// Exclui imóveis (DELETE real, mesmo comportamento do botão "Excluir" de /app/imoveis)
// por código (id, id_externo, id_interno ou codigo_imovel). Imprime o que vai excluir
// (endereço/número) antes de excluir, pra auditoria, e reporta os códigos não encontrados.
const { query } = require('./services/db');

const codigos = [
  "MI-1784492340000","MI-1784492339759","MI-1784492337473","MI-1784492338384","MI-1784492339340",
  "MI-1784492339283","MI-1784492337993","MI-1784492340518","MI-1784492339586","MI-1784492341032",
  "MI-1784492339475","MI-1784492340910","MI-1784492338537","MI-1784492338485","MI-1784492338525",
  "MI-1784492338544","MI-1784492338546","MI-1784492339997","MI-1784492340222","DMYCAP385",
  "CAPRAFA526","CAPRAFA522","DMYCAP799","CAPVAZ026","CAPRAFA228","CAPRAFA169","CAPRAFA126",
  "CAPLHP203","CAPRAFA234","CAPLHP163","CAPRAFA166","CAPRAFA346","CAPRAFA350","CAPRAFA298",
  "DMYCAP52","DMYCAP45","CAPRAFA241","DMYCAP453","DAVRAF027","CAPRAFA366","CAPRAFA148",
  "DMYCAP793","DMYCAP630","DAVRAF004","DAVRAF013","DREA32","CAPFAFA549","CAPL7P238","CAPRAFA381",
  "CAPLHP166","CAPRAFA210","CAPLHP153","CAPVAZ037","CAPLHP092","CAPVAZ011","CAPRAFA214",
  "CAPRAFA358","CAPRAFA460","CAPLHP157","CAPJUJU014","CAPRAFA354","DMYCAP21","CAPRAFA224",
  "CAPRAFA507","DMYCAP471","CAPRAFA372","CAPRAFA145","CAPLHP162","CAPRAFA152","CAPLHP131",
  "DMYCAP555","DMYCAP791","DMYCAP638","DMYCAP658","DMYCAP751","DMYCAP774","DMYCAP711",
  "DMYCAP625","DMYCAP743","DMYCAP429","CAP#RAF002","DMYCAP371","DMYCAP244","DMYCAP305",
  "DMYCAP330","DMYCAP506","DMYCAP326","DMYCAP255","DMYCAP432","DMYCAP10","CAPRAFA569",
  "DMYCAP130","DMYCAP210","CAPRAFA382","CAPRAFA356","DMYCAP158","CAPRAFA314","CAPRAFA378",
  "CAPRAFA577","CAPRAFA299","CAPRAFA258","CAPRAFA371","CAPRAFA215","CAPLHP337","CAPRAFA167",
  "CAPLHP219","CAPLHP248","CAPRAFA103","CAPRAFA120","CAPRAFA155","CAPLHP152","CAPLHP086",
  "CAPLHP173","CAPLHP158","CAPLHP145","CAPLHP130","CAPLHP121","CAPJUJU032","CAPLHP188",
  "CAPLHP097","CAPLHP180","CAPLHP202","CAPLHP123","CAPLHP160","CAPLHP099","CAPJUJU035",
  "CAPALE02","CAPFAFA551","CAPJUJU041","CAPJUJU06","CAPFAFA554","CAPLHP070","CAPJUJU037",
  "AFS76LFT17"
];

(async () => {
  const r = await query(
    'SELECT id,id_externo,id_interno,codigo_imovel,endereco,numero,bairro,user_id FROM imoveis WHERE id=ANY($1) OR id_externo=ANY($1) OR id_interno=ANY($1) OR codigo_imovel=ANY($1)',
    [codigos]
  );
  const achados = new Set();
  console.log('--- IMOVEIS ENCONTRADOS (' + r.rows.length + ') ---');
  for (const row of r.rows) {
    [row.id_externo, row.id_interno, row.codigo_imovel, row.id].forEach(v => { if (v) achados.add(String(v)); });
    console.log(row.id_externo || row.id_interno || row.codigo_imovel || row.id, '|', row.endereco, row.numero, '-', row.bairro, '| user:', row.user_id, '| id real:', row.id);
  }

  const naoAchados = codigos.filter(c => !achados.has(c));
  console.log('--- NAO ENCONTRADOS (' + naoAchados.length + ') ---');
  console.log(naoAchados.join(', '));

  const ids = r.rows.map(row => row.id);
  if (ids.length) {
    const del = await query('DELETE FROM imoveis WHERE id = ANY($1)', [ids]);
    console.log('--- EXCLUIDOS:', del.rowCount, '---');
  } else {
    console.log('--- NADA PRA EXCLUIR ---');
  }
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
