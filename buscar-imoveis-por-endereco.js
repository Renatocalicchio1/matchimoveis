// Script utilitário — não gera rota, roda manual: node buscar-imoveis-por-endereco.js
// Pra imóveis que não bateram por código, tenta achar por rua (parcial) + número
// (exato), com fallback por bairro + número. Imprime todos os candidatos achados
// pra cada código — pode achar 0, 1 ou mais (checar manualmente qual é o certo).
const { query } = require('./services/db');

const alvos = [
  {codigo:"MI-1784492339436",rua:"Escola Politécnica",numero:"942",bairro:"Rio Pequeno",complemento:"Apto 282"},
  {codigo:"MI-1784492339624",rua:"Francisco Pessoa",numero:"491",bairro:"Vila Andrade",complemento:"Apto 123"},
  {codigo:"MI-1784492338530",rua:"Doutor Bacelar",numero:"395",bairro:"Vila Clementino",complemento:"Apto 144"},
  {codigo:"MI-1784492338963",rua:"Baluarte",numero:"230",bairro:"Itaim Bibi",complemento:"Apto 152"},
  {codigo:"MI-1784492338573",rua:"Norma Pieruccini Giannotti",numero:"665",bairro:"Barra Funda",complemento:"Apto 63"},
  {codigo:"MI-1784492338430",rua:"dos Guaiós",numero:"250",bairro:"Indianópolis",complemento:"Apto 81"},
  {codigo:"MI-1784492341065",rua:"Raul Pompéia",numero:"75",bairro:"Perdizes",complemento:"Apto 102"},
  {codigo:"MI-1784492340739",rua:"Artur de Azevedo",numero:"1649",bairro:"Pinheiros",complemento:"Apto 81"},
  {codigo:"MI-1784492338601",rua:"Glicério",numero:"114",bairro:"Liberdade",complemento:"Apto 309"},
  {codigo:"MI-1784492341005",rua:"Coriolano",numero:"231",bairro:"Vila Romana",complemento:"Apto 51"},
  {codigo:"MI-1784492340218",rua:"Unknown",numero:"906",bairro:"Moema",complemento:"171"},
  {codigo:"MI-1784492340804",rua:"Alsácia",numero:"280",bairro:"Jardim Aeroporto",complemento:"Apto 605"},
  {codigo:"MI-1784492339171",rua:"Miguel Sevílio",numero:"70",bairro:"Rio Pequeno",complemento:"Apto 58"},
  {codigo:"MI-1784492338400",rua:"Antônio das Chagas",numero:"162",bairro:"Chácara Santo Antônio (Zona Sul)",complemento:"Apto 115"},
  {codigo:"MI-1784492339073",rua:"Doutor José de Andrade Figueira",numero:"385",bairro:"Vila Suzana",complemento:"Apto 62"},
  {codigo:"MI-1784492340443",rua:"Marcos Lopes",numero:"272",bairro:"Vila Nova Conceição",complemento:"Apto 31"},
  {codigo:"MI-1784492340213",rua:"Doutor Francisco José Longo",numero:"281",bairro:"Chácara Inglesa",complemento:"Apto 11"},
  {codigo:"MI-1784492338433",rua:"Ministro Godói",numero:"657",bairro:"Perdizes",complemento:"Apto 122"},
  {codigo:"DMYCAP346",rua:"Peixoto Gomide",numero:"366",bairro:"Bela Vista",complemento:"Apto 71"},
  {codigo:"CAPRAFA292",rua:"das Palmeiras",numero:"283",bairro:"Vila Buarque",complemento:"Apto 96"},
  {codigo:"CAPRAFA111",rua:"Vereador José Diniz",numero:"599",bairro:"Santo Amaro",complemento:"Apto 1113"},
  {codigo:"CAPRAFA303",rua:"Osório Duque Estrada",numero:"40",bairro:"Ibirapuera",complemento:"Apto 208"},
  {codigo:"CAPRAFA119",rua:"Giovanni Gronchi",numero:"6829",bairro:"Vila Andrade",complemento:"Apto 72"},
  {codigo:"CAPLHP168",rua:"Celso Ramos",numero:"32",bairro:"Vila Andrade",complemento:"Apto 188"},
  {codigo:"DMYCAP90",rua:"Lino Coutinho",numero:"1360",bairro:"Ipiranga",complemento:"Casa"},
  {codigo:"CAPRAFA341",rua:"Ribeirão Preto",numero:"145",bairro:"Bela Vista",complemento:"Apto 66"},
  {codigo:"DREA46",rua:"Francisco Pessoa",numero:"491",bairro:"Vila Andrade",complemento:"Apto 123"},
  {codigo:"CAPRAFA312",rua:"Helvétia",numero:"981",bairro:"Campos Elíseos",complemento:"Apto 906"},
  {codigo:"CAPRAFA336",rua:"Dom Pedro I",numero:"920",bairro:"Vila Monumento",complemento:"Apto 164"},
  {codigo:"CAPRAFA244",rua:"Borges Lagoa",numero:"688",bairro:"Vila Clementino",complemento:"5"},
  {codigo:"CAPRAFA236",rua:"Loefgren",numero:"2527",bairro:"Vila Clementino",complemento:"Apto 93"},
  {codigo:"CAPRAFA157",rua:"Bandeira Paulista",numero:"1140",bairro:"Itaim Bibi",complemento:"Apto 21"},
  {codigo:"CAPRAFA368",rua:"Luciano Silva",numero:"219",bairro:"Vila das Belezas",complemento:"Apto 204"},
  {codigo:"CAPRAFA305",rua:"Artur de Azevedo",numero:"2395",bairro:"Pinheiros",complemento:"Apto 92"},
  {codigo:"DMYCAP341",rua:"Senador Casemiro da Rocha",numero:"900",bairro:"Mirandópolis",complemento:"1"},
  {codigo:"DMYCAP328",rua:"Artur de Azevedo",numero:"897",bairro:"Pinheiros",complemento:"Apto 51"},
  {codigo:"CAPRAFA202",rua:"Tucuna",numero:"304",bairro:"Pompeia",complemento:"Apto 134"},
  {codigo:"DMYCAP5",rua:"Josefina Álvares de Azevedo",numero:"146",bairro:"Fazenda Morumbi",complemento:"Casa"},
  {codigo:"CAPRAFA191",rua:"Cayowaá",numero:"604",bairro:"Perdizes",complemento:"Apto 32"},
  {codigo:"CAPRAFA146",rua:"Bernardino de Campos",numero:"925",bairro:"Campo Belo",complemento:"1"},
  {codigo:"CAPRAFA380",rua:"dos Piratinins",numero:"263",bairro:"Planalto Paulista",complemento:"1"},
  {codigo:"CAPRAFA362",rua:"Teresina",numero:"86",bairro:"Vila Bertioga",complemento:"Apto 184"},
  {codigo:"CAPRAFA163",rua:"Joaquim Floriano",numero:"152",bairro:"Itaim Bibi",complemento:"Apto 1004"},
  {codigo:"CAPRAFA124",rua:"Helena",numero:"120",bairro:"Vila Olímpia",complemento:"Apto 52"},
  {codigo:"CAPLHP124",rua:"do Estilo Barroco",numero:"648",bairro:"Santo Amaro",complemento:"Apto 22"},
  {codigo:"CAPRAFA370",rua:"Gabriele D'annunzio",numero:"1422",bairro:"Campo Belo",complemento:"Apto 94"},
  {codigo:"DMYCAP22",rua:"Sebastião de Andrade",numero:"586",bairro:"Vila Matilde",complemento:"Apto 5"},
  {codigo:"DMYCAP11",rua:"Alberto Augusto Alves",numero:"270",bairro:"Vila Andrade",complemento:"Apto 32"},
  {codigo:"DMYCAP238",rua:"Artur de Azevedo",numero:"186",bairro:"Pinheiros",complemento:"121"},
  {codigo:"CAPRAFA352",rua:"Clemente Pereira",numero:"183",bairro:"Ipiranga",complemento:"Apto 21"},
  {codigo:"DMYCAP76",rua:"Peixoto Gomide",numero:"581",bairro:"Jardim Paulista",complemento:"Apto 92"},
  {codigo:"DMYCAP307",rua:"Cotoxó",numero:"190",bairro:"Pompeia",complemento:"Apto 109"},
  {codigo:"DMYCAP124",rua:"Marie Nader Calfat",numero:"279",bairro:"Morumbi",complemento:"Apto 81"},
  {codigo:"DMYCAP140",rua:"Doutor Albuquerque Lins",numero:"801",bairro:"Santa Cecilia",complemento:"Apto 51"},
  {codigo:"DMYCAP198",rua:"Zacarias de Gois",numero:"2011",bairro:"Campo Belo",complemento:"1"},
  {codigo:"DMYCAP185",rua:"Itacema",numero:"275",bairro:"Itaim Bibi",complemento:"Apto 124"},
  {codigo:"CAPRAFA257",rua:"Doutor Francisco José Longo",numero:"251",bairro:"Chácara Inglesa",complemento:"1"},
  {codigo:"CAPRAFA566",rua:"Baluarte",numero:"231",bairro:"Itaim Bibi",complemento:"Apto 152"},
  {codigo:"CAPRAFA238",rua:"Leonardo Nunes",numero:"36",bairro:"Vila Clementino",complemento:"Apto 142"},
  {codigo:"CAPRAFA323",rua:"Artur de Azevedo",numero:"986",bairro:"Pinheiros",complemento:"Apto 1306"},
  {codigo:"CAPRAFA182",rua:"Doutor Cardoso de Melo",numero:"122",bairro:"Vila Olímpia",complemento:"Apto 31"},
  {codigo:"CAPRAFA253",rua:"Thomas Edison",numero:"934",bairro:"Parque Industrial Tomas Edson",complemento:"Apto 85"},
  {codigo:"CAPRAFA195",rua:"Flórida",numero:"1901",bairro:"Cidade Monções",complemento:"71"},
  {codigo:"CAPRAFA186",rua:"Monte Alegre",numero:"90",bairro:"Perdizes",complemento:"Apto 61"},
  {codigo:"CAPRAFA213",rua:"Miguel Estefno",numero:"2800",bairro:"Vila da Saúde",complemento:"Apto 154"},
  {codigo:"CAPLHP159",rua:"José Maria Pinto Zilli",numero:"720",bairro:"Jardim das Palmas",complemento:"Apto 51"},
  {codigo:"CAPJUJU010",rua:"Artur de Azevedo",numero:"300",bairro:"Pinheiros",complemento:"Apto 42"},
  {codigo:"MI-1784492340000",rua:"Monte Alegre",numero:"1457",bairro:"Perdizes",complemento:"Apto 94"},
  {codigo:"MI-1784492339759",rua:"Francisco Matarazzo",numero:"156",bairro:"Agua Branca",complemento:"Apto 23"},
  {codigo:"MI-1784492337473",rua:"Piratininga",numero:"201",bairro:"Brás",complemento:"Apto 1101"},
  {codigo:"MI-1784492338384",rua:"Professor José Maria Calazans Nogueira",numero:"232",bairro:"Parque Sao Domingos",complemento:"Apto 1"},
  {codigo:"MI-1784492339340",rua:"Maria Figueiredo",numero:"527",bairro:"Paraíso",complemento:"Apto 41"},
  {codigo:"MI-1784492339283",rua:"Capital Federal",numero:"208",bairro:"Pompeia",complemento:"Apto 5"},
  {codigo:"MI-1784492337993",rua:"Desembargador do Vale",numero:"81",bairro:"Pompeia",complemento:"Apto 92"},
  {codigo:"MI-1784492340518",rua:"Gregório Serrão",numero:"232",bairro:"Vila Mariana",complemento:"Apto 112"},
  {codigo:"MI-1784492339586",rua:"Nazira Carone",numero:"9",bairro:"Jardim Ampliacao",complemento:"Apto 82"},
  {codigo:"MI-1784492341032",rua:"Belarmino Matos",numero:"14",bairro:"Belenzinho",complemento:"Casa"},
  {codigo:"MI-1784492339475",rua:"Ipiranga",numero:"895",bairro:"República",complemento:"Apto 142"},
  {codigo:"MI-1784492340910",rua:"Araguari",numero:"536",bairro:"Vila Uberabinha",complemento:"Apto 82"},
  {codigo:"MI-1784492338537",rua:"Baronesa de Itu",numero:"722",bairro:"Santa Cecilia",complemento:"Apto 101"},
  {codigo:"MI-1784492338485",rua:"Paula Ney",numero:"357",bairro:"Centro Histórico de São Paulo",complemento:"Apto 101"},
  {codigo:"MI-1784492338525",rua:"Bandeira Paulista",numero:"65",bairro:"Itaim Bibi",complemento:"Apto 134"},
  {codigo:"MI-1784492338544",rua:"Cotoxó",numero:"961",bairro:"Pompeia",complemento:"Apto 112"},
  {codigo:"MI-1784492338546",rua:"Pedroso Alvarenga",numero:"345",bairro:"Itaim Bibi",complemento:"Apto 171"},
  {codigo:"MI-1784492339997",rua:"Doutor Elísio de Castro",numero:"787",bairro:"Vila Dom Pedro I",complemento:"Casa"},
  {codigo:"MI-1784492340222",rua:"Santo Albano",numero:"516",bairro:"Vila Vera",complemento:"162"},
  {codigo:"CAPRAFA169",rua:"Urimonduba",numero:"111",bairro:"Itaim Bibi",complemento:"Apto 72"},
  {codigo:"CAPRAFA126",rua:"Fiandeiras",numero:"90",bairro:"Itaim Bibi",complemento:"Apto 113"},
  {codigo:"CAPRAFA234",rua:"Borges Lagoa",numero:"380",bairro:"Vila Clementino",complemento:"Apto 607"},
  {codigo:"CAPLHP163",rua:"Castro Alves",numero:"778",bairro:"Cerâmica",complemento:"Apto 131"},
  {codigo:"CAPRAFA166",rua:"Romilda Margarida Gabriel",numero:"178",bairro:"Itaim Bibi",complemento:"Apto 201"},
  {codigo:"CAPRAFA346",rua:"São Carlos do Pinhal",numero:"322",bairro:"Bela Vista",complemento:"Apto 51"},
  {codigo:"CAPRAFA350",rua:"Itapicuru",numero:"643",bairro:"Perdizes",complemento:"Apto 63"},
  {codigo:"DMYCAP52",rua:"Doutor Elísio de Castro",numero:"787",bairro:"Vila Dom Pedro I",complemento:"Casa"},
  {codigo:"DMYCAP45",rua:"Belarmino Matos",numero:"14",bairro:"Belenzinho",complemento:"Casa"},
  {codigo:"CAPRAFA241",rua:"Doutor Diogo de Faria",numero:"422",bairro:"Vila Clementino",complemento:"Apto 35"},
  {codigo:"CAPRAFA148",rua:"Gabriele D'annunzio",numero:"226",bairro:"Campo Belo",complemento:"Apto 263"},
  {codigo:"CAPRAFA381",rua:"Forte William",numero:"151",bairro:"Jardim Fonte do Morumbi",complemento:"Apto 111"},
  {codigo:"CAPRAFA210",rua:"Ituxi",numero:"104",bairro:"Vila da Saúde",complemento:"Apto 26"},
  {codigo:"CAPLHP153",rua:"Celso Ramos",numero:"32",bairro:"Vila Andrade",complemento:"Apto 144"},
  {codigo:"CAPVAZ011",rua:"Trajano Reis",numero:"185",bairro:"Jardim das Vertentes",complemento:"Apto 133"},
  {codigo:"CAPRAFA214",rua:"Guilherme Barbosa de Melo",numero:"84",bairro:"Itaim Bibi",complemento:"Apto 34"},
  {codigo:"CAPLHP157",rua:"da Chibata",numero:"128",bairro:"Vila Andrade",complemento:"Apto 41"},
  {codigo:"CAPRAFA354",rua:"da Chibata",numero:"161",bairro:"Vila Andrade",complemento:"Apto 16"},
  {codigo:"DMYCAP21",rua:"Unknown",numero:"943",bairro:"Jardim Paulista",complemento:"Apto 11"},
  {codigo:"CAPRAFA224",rua:"André Mendes",numero:"208",bairro:"Jardim da Saúde",complemento:"Apto 52"},
  {codigo:"CAPRAFA372",rua:"Teresina",numero:"86",bairro:"Vila Bertioga",complemento:"Apto 14"},
  {codigo:"CAPRAFA145",rua:"Vieira de Morais",numero:"79",bairro:"Campo Belo",complemento:"Apto 23"},
  {codigo:"CAPLHP162",rua:"Abdo Ambuba",numero:"280",bairro:"Vila Andrade",complemento:"Apto 73"},
  {codigo:"CAPRAFA152",rua:"Gabriele D'annunzio",numero:"624",bairro:"Campo Belo",complemento:"Apto 198"},
  {codigo:"DMYCAP555",rua:"Gabriele D'annunzio",numero:"624",bairro:"Campo Belo",complemento:"Apto 198"},
  {codigo:"DMYCAP638",rua:"Lauro Müller",numero:"12",bairro:"Vila Leopoldina",complemento:"Apto 84"},
  {codigo:"CAP#RAF002",rua:"Alcino Braga",numero:"120",bairro:"Paraíso",complemento:"Apto 1"},
  {codigo:"DMYCAP244",rua:"João Gomes Júnior",numero:"307",bairro:"Jardim Bonfiglioli",complemento:"1"},
  {codigo:"DMYCAP305",rua:"Doutor Veiga Filho",numero:"477",bairro:"Santa Cecilia",complemento:"Apto 142"},
  {codigo:"DMYCAP330",rua:"Vereador José Diniz",numero:"599",bairro:"Santo Amaro",complemento:"Apto 1515"},
  {codigo:"DMYCAP326",rua:"Urimonduba",numero:"195",bairro:"Itaim Bibi",complemento:"Apto 122"},
  {codigo:"DMYCAP255",rua:"dos Guaramomis",numero:"815",bairro:"Planalto Paulista",complemento:"Apto 131"},
  {codigo:"DMYCAP10",rua:"Malvina Ferrara Samarone",numero:"195",bairro:"Ipiranga",complemento:"Apto 308"},
  {codigo:"DMYCAP130",rua:"Chapada de Minas",numero:"210",bairro:"Parque Reboucas",complemento:"Apto 55"},
  {codigo:"DMYCAP210",rua:"Otávio Tarquínio de Sousa",numero:"555",bairro:"Campo Belo",complemento:"Casa"},
  {codigo:"CAPRAFA382",rua:"das Azaléas",numero:"40",bairro:"Mirandópolis",complemento:"1"},
  {codigo:"DMYCAP158",rua:"Antônio Júlio dos Santos",numero:"201",bairro:"Fazenda Morumbi",complemento:"Apto 10"},
  {codigo:"CAPRAFA314",rua:"Maratona",numero:"285",bairro:"Vila Alexandria",complemento:"Apto 123"},
  {codigo:"CAPRAFA378",rua:"Paulista",numero:"688",bairro:"Bela Vista",complemento:"Apto 153"},
  {codigo:"CAPRAFA299",rua:"Flor de Vila Formosa",numero:"553",bairro:"Vila Formosa",complemento:"Apto 62"},
  {codigo:"CAPRAFA258",rua:"das Aningas",numero:"2",bairro:"Jardim Oriental",complemento:"Apto 51"},
  {codigo:"CAPRAFA371",rua:"Doutor Seng",numero:"120",bairro:"Bela Vista",complemento:"1"},
  {codigo:"CAPRAFA167",rua:"Urussuí",numero:"352",bairro:"Itaim Bibi",complemento:"Apto 92"},
  {codigo:"CAPLHP219",rua:"Huitacá",numero:"51",bairro:"Jardim Marajoara",complemento:"Apto 14"},
  {codigo:"CAPRAFA120",rua:"Alvorada",numero:"303",bairro:"Vila Olímpia",complemento:"Apto 83"},
  {codigo:"CAPLHP173",rua:"Giovanni Gronchi",numero:"4720",bairro:"Vila Andrade",complemento:"Apto 142"},
  {codigo:"CAPLHP158",rua:"Dom Salomão Ferraz",numero:"80",bairro:"Vila Andrade",complemento:"Apto 134"},
  {codigo:"CAPLHP188",rua:"General Eldes de Sousa Guedes",numero:"74",bairro:"Jardim Colombo",complemento:"Apto 22"},
  {codigo:"CAPLHP180",rua:"Alba",numero:"2088",bairro:"Parque Jabaquara",complemento:"Apto 35"},
  {codigo:"CAPLHP160",rua:"José Arzão",numero:"73",bairro:"Vila Andrade",complemento:"Apto 95"}
];

(async () => {
  let comCandidato = 0, semCandidato = 0;
  for (const alvo of alvos) {
    let r = await query(
      `SELECT id,id_externo,id_interno,codigo_imovel,endereco,numero,bairro,proprietario
       FROM imoveis WHERE numero=$1 AND endereco ILIKE $2 LIMIT 5`,
      [alvo.numero, '%' + alvo.rua + '%']
    );
    if (r.rows.length === 0) {
      r = await query(
        `SELECT id,id_externo,id_interno,codigo_imovel,endereco,numero,bairro,proprietario
         FROM imoveis WHERE numero=$1 AND bairro ILIKE $2 LIMIT 5`,
        [alvo.numero, '%' + alvo.bairro + '%']
      );
    }
    if (r.rows.length === 0) {
      semCandidato++;
      console.log('SEM CANDIDATO |', alvo.codigo, '|', alvo.rua, alvo.numero, '-', alvo.bairro);
      continue;
    }
    comCandidato++;
    for (const row of r.rows) {
      const p = row.proprietario || {};
      console.log(
        alvo.codigo, '(buscado: ' + alvo.rua + ' ' + alvo.numero + ')', '|~|',
        'candidato:', row.id_externo || row.id_interno || row.codigo_imovel || row.id,
        '|~|', row.endereco, row.numero, '-', row.bairro,
        '|~|', p.nome || '', p.telefone || p.celular || '', p.email || ''
      );
    }
  }
  console.log('--- RESUMO: com candidato:', comCandidato, '| sem candidato:', semCandidato, '| total:', alvos.length, '---');
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
