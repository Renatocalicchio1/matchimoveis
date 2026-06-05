const { query } = require('./services/db');
const userId = 'REN-HUH6';
const leads = [
  { nome: 'Ana Paula Ferreira',  telefone: '0011999010001', origem: 'planilha',    tipo: 'apartamento', intencao: 'comprar', cidade: 'Balneário Camboriú', bairro: 'Centro',       quartos: 2, valorMax: 600000  },
  { nome: 'Carlos Mendes',       telefone: '0021988020002', origem: 'planilha',    tipo: 'apartamento', intencao: 'comprar', cidade: 'Itajaí',             bairro: 'São João',     quartos: 3, valorMax: 450000  },
  { nome: 'Fernanda Lima',       telefone: '0047977030003', origem: 'planilha',    tipo: 'casa',        intencao: 'alugar',  cidade: 'Camboriú',           bairro: 'Tabuleiro',    quartos: 3, valorMax: 3500    },
  { nome: 'Roberto Alves',       telefone: '0051966040004', origem: 'planilha',    tipo: 'cobertura',   intencao: 'comprar', cidade: 'Balneário Camboriú', bairro: 'Barra Sul',    quartos: 4, valorMax: 2500000 },
  { nome: 'Juliana Costa',       telefone: '0031955050005', origem: 'planilha',    tipo: 'apartamento', intencao: 'comprar', cidade: 'Itajaí',             bairro: 'Fazenda',      quartos: 2, valorMax: 380000  },
  { nome: 'Marcelo Souza',       telefone: '0041944060006', origem: 'planilha',    tipo: 'sala',        intencao: 'alugar',  cidade: 'Balneário Camboriú', bairro: 'Centro',       quartos: 0, valorMax: 5000    },
  { nome: 'Patrícia Oliveira',   telefone: '0062933070007', origem: 'planilha',    tipo: 'terreno',     intencao: 'comprar', cidade: 'Porto Belo',         bairro: 'Centro',       quartos: 0, valorMax: 280000  },
  { nome: 'Diego Ramos',         telefone: '0085922080008', origem: 'VivaReal',    tipo: 'apartamento', intencao: 'comprar', cidade: 'Balneário Camboriú', bairro: 'Centro',       quartos: 2, valorMax: 520000  },
  { nome: 'Camila Torres',       telefone: '0011911090009', origem: 'ZAP Imóveis', tipo: 'casa',        intencao: 'comprar', cidade: 'Itapema',            bairro: 'Meia Praia',   quartos: 3, valorMax: 900000  },
  { nome: 'Leonardo Bastos',     telefone: '0021900100010', origem: 'ImovelWeb',   tipo: 'apartamento', intencao: 'alugar',  cidade: 'Itajaí',             bairro: 'Centro',       quartos: 1, valorMax: 2200    },
  { nome: 'Aline Martins',       telefone: '0047899110011', origem: 'OLX',         tipo: 'kitnet',      intencao: 'alugar',  cidade: 'Balneário Camboriú', bairro: 'Centro',       quartos: 1, valorMax: 1800    },
  { nome: 'Thiago Pereira',      telefone: '0051888120012', origem: 'ZAP Imóveis', tipo: 'cobertura',   intencao: 'comprar', cidade: 'Balneário Camboriú', bairro: 'Barra Norte',  quartos: 3, valorMax: 1800000 },
  { nome: 'Bruna Carvalho',      telefone: '0031877130013', origem: 'VivaReal',    tipo: 'apartamento', intencao: 'comprar', cidade: 'Camboriú',           bairro: 'Praia Alegre', quartos: 2, valorMax: 420000  },
  { nome: 'Felipe Nascimento',   telefone: '0041866140014', origem: 'ImovelWeb',   tipo: 'casa',        intencao: 'comprar', cidade: 'Porto Belo',         bairro: 'Perequê',      quartos: 4, valorMax: 1200000 },
  { nome: 'Vanessa Rocha',       telefone: '0062855150015', origem: 'whatsapp',    tipo: 'apartamento', intencao: 'comprar', cidade: 'Balneário Camboriú', bairro: 'Centro',       quartos: 2, valorMax: 700000  },
  { nome: 'Anderson Lima',       telefone: '0085844160016', origem: 'whatsapp',    tipo: 'casa',        intencao: 'alugar',  cidade: 'Itajaí',             bairro: 'Cordeiros',    quartos: 3, valorMax: 4000    },
  { nome: 'Tatiane Freitas',     telefone: '0011833170017', origem: 'whatsapp',    tipo: 'apartamento', intencao: 'comprar', cidade: 'Itapema',            bairro: 'Centro',       quartos: 2, valorMax: 550000  },
  { nome: 'Bruno Cavalcante',    telefone: '0021822180018', origem: 'whatsapp',    tipo: '',            intencao: 'comprar', cidade: 'Balneário Camboriú', bairro: 'Centro',       quartos: 0, valorMax: 0       },
  { nome: 'Isabela Moreira',     telefone: '0047811190019', origem: 'whatsapp',    tipo: 'apartamento', intencao: '',        cidade: '',                   bairro: 'Barra Sul',    quartos: 2, valorMax: 0       },
  { nome: 'Gustavo Pinto',       telefone: '0051800200020', origem: 'whatsapp',    tipo: '',            intencao: '',        cidade: '',                   bairro: '',             quartos: 0, valorMax: 0       },
];
async function inserir() {
  let ok = 0, err = 0;
  for (const l of leads) {
    const id = (Date.now() + Math.floor(Math.random()*1000)).toString();
    const pf = {};
    if (l.tipo)     pf.tipo     = l.tipo;
    if (l.intencao) pf.intencao = l.intencao;
    if (l.cidade)   pf.cidade   = l.cidade;
    if (l.bairro)   pf.bairro   = l.bairro;
    if (l.quartos)  pf.quartos  = l.quartos;
    if (l.valorMax) pf.valorMax = l.valorMax;
    try {
      await query(`INSERT INTO leads (id,nome,telefone,whatsapp,contato,origem,status,user_id,codigo_usuario,perfil_ia,matches,matches_auto,dados,criado_em,atualizado_em) VALUES ($1,$2,$3,$3,$3,$4,'novo',$5,$5,$6,'[]','[]','{}',NOW(),NOW()) ON CONFLICT (id) DO NOTHING`, [id,l.nome,l.telefone,l.origem,userId,JSON.stringify(pf)]);
      console.log('✅', l.nome, '|', l.origem, '|', Object.keys(pf).length, 'campos');
      ok++;
    } catch(e) { console.error('❌', l.nome, e.message); err++; }
    await new Promise(r => setTimeout(r, 50));
  }
  console.log(`\n${ok} inseridos, ${err} erros`);
  process.exit(0);
}
inserir();
