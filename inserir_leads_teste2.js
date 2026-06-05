const { query } = require('./services/db');
const userId = 'REN-HUH6';
const portais = ['VivaReal','ZAP Imóveis','ImovelWeb','OLX','123i','Chaves na Mão','planilha','whatsapp'];
const leads = [
  // ── MATCH (perfil completo residencial) ──
  { nome: 'Marcos Andrade',   tel: '0011991110001', origem: portais[0], tipo: 'Apartamento',        int: 'comprar', cidade: 'Balneário Camboriú', bairro: 'Centro',                quartos: 3, val: 3000000 },
  { nome: 'Lucia Fonseca',    tel: '0021982220002', origem: portais[1], tipo: 'Apartamento',        int: 'comprar', cidade: 'Balneário Camboriú', bairro: 'Pioneiros',             quartos: 3, val: 2500000 },
  { nome: 'Paulo Teixeira',   tel: '0047973330003', origem: portais[2], tipo: 'Casa de Condomínio', int: 'comprar', cidade: 'Camboriú',           bairro: 'Santa Regina',          quartos: 3, val: 4000000 },
  { nome: 'Renata Borges',    tel: '0051964440004', origem: portais[3], tipo: 'Apartamento',        int: 'comprar', cidade: 'Itajaí',             bairro: 'São Judas',             quartos: 2, val: 1000000 },
  { nome: 'Sandro Melo',      tel: '0031955550005', origem: portais[4], tipo: 'Apartamento',        int: 'comprar', cidade: 'Balneário Camboriú', bairro: 'Praia dos Amores',      quartos: 3, val: 4000000 },
  { nome: 'Cristina Neves',   tel: '0041946660006', origem: portais[5], tipo: 'Apartamento',        int: 'comprar', cidade: 'Itajaí',             bairro: 'Praia Brava de Itajaí', quartos: 2, val: 1500000 },
  { nome: 'Rafael Cunha',     tel: '0011919990009', origem: portais[6], tipo: 'Apartamento',        int: 'comprar', cidade: 'Balneário Camboriú', bairro: 'Centro',                quartos: 4, val: 5000000 },
  { nome: 'Daniela Vieira',   tel: '0021901000010', origem: portais[7], tipo: 'Apartamento',        int: 'comprar', cidade: 'Balneário Camboriú', bairro: 'Centro',                quartos: 2, val: 1500000 },
  { nome: 'Mirela Santos',    tel: '0085928880008', origem: portais[1], tipo: 'Apartamento',        int: 'comprar', cidade: 'Camboriú',           bairro: 'Tabuleiro',             quartos: 3, val: 1300000 },
  { nome: 'Rodrigo Albuquerque', tel: '0062937770007', origem: portais[0], tipo: 'Apartamento',    int: 'comprar', cidade: 'Balneário Camboriú', bairro: 'Centro',                quartos: 2, val: 1300000 },
  // ── MATCH (perfil completo comercial) ──
  { nome: 'Eduardo Campos',   tel: '0062937770017', origem: portais[2], tipo: 'Terreno',            int: 'comprar', cidade: 'Itajaí',             bairro: 'São João',              quartos: 0, val: 800000  },
  { nome: 'Flávia Drummond',  tel: '0031874111011', origem: portais[3], tipo: 'Sala',               int: 'alugar',  cidade: 'Balneário Camboriú', bairro: 'Centro',                quartos: 0, val: 5000    },
  { nome: 'Igor Magalhães',   tel: '0041865222012', origem: portais[4], tipo: 'Loja',               int: 'alugar',  cidade: 'Itajaí',             bairro: 'Centro',                quartos: 0, val: 8000    },
  { nome: 'Nathalia Fontes',  tel: '0085856333013', origem: portais[5], tipo: 'Galpão',             int: 'comprar', cidade: 'Itajaí',             bairro: 'Cordeiros',             quartos: 0, val: 1200000 },
  { nome: 'Leandro Prado',    tel: '0011847444014', origem: portais[6], tipo: 'Terreno',            int: 'comprar', cidade: 'Balneário Camboriú', bairro: 'Centro',                quartos: 0, val: 4000000 },
  // ── QUALIFICANDO (residencial parcial) ──
  { nome: 'Henrique Lima',    tel: '0047892110021', origem: portais[0], tipo: 'Apartamento',        int: 'comprar', cidade: 'Balneário Camboriú', bairro: '',                      quartos: 2, val: 0       },
  { nome: 'Beatriz Castro',   tel: '0051883220022', origem: portais[1], tipo: '',                   int: 'comprar', cidade: 'Itajaí',             bairro: 'Centro',                quartos: 0, val: 500000  },
  { nome: 'Otávio Reis',      tel: '0031874330023', origem: portais[2], tipo: 'Apartamento',        int: '',        cidade: 'Balneário Camboriú', bairro: 'Pioneiros',             quartos: 3, val: 0       },
  { nome: 'Larissa Moura',    tel: '0041865440024', origem: portais[3], tipo: 'Casa de Condomínio', int: 'comprar', cidade: '',                   bairro: '',                      quartos: 3, val: 2000000 },
  { nome: 'Simone Barros',    tel: '0085847660025', origem: portais[4], tipo: '',                   int: 'comprar', cidade: 'Itajaí',             bairro: 'São Judas',             quartos: 2, val: 900000  },
  // ── QUALIFICANDO (comercial parcial) ──
  { nome: 'Tiago Correia',    tel: '0011838770026', origem: portais[5], tipo: 'Sala',               int: 'alugar',  cidade: 'Balneário Camboriú', bairro: '',                      quartos: 0, val: 0       },
  { nome: 'Vanilda Pires',    tel: '0021829880027', origem: portais[6], tipo: '',                   int: 'alugar',  cidade: 'Balneário Camboriú', bairro: 'Centro',                quartos: 0, val: 6000    },
  { nome: 'César Monteiro',   tel: '0047820990028', origem: portais[7], tipo: 'Loja',               int: '',        cidade: 'Itajaí',             bairro: 'Praia Brava de Itajaí', quartos: 0, val: 10000   },
  { nome: 'Priscila Aragão',  tel: '0051811000029', origem: portais[0], tipo: 'Terreno',            int: 'comprar', cidade: '',                   bairro: '',                      quartos: 0, val: 500000  },
  { nome: 'Jorge Meireles',   tel: '0031802110030', origem: portais[1], tipo: 'Galpão',             int: '',        cidade: 'Camboriú',           bairro: 'Tabuleiro',             quartos: 0, val: 0       },
  // ── NOVO (sem dados) ──
  { nome: 'Fábio Duarte',     tel: '0062856550031', origem: portais[2], tipo: '', int: '', cidade: '', bairro: '', quartos: 0, val: 0 },
  { nome: 'Aline Rocha',      tel: '0085793120032', origem: portais[3], tipo: '', int: '', cidade: '', bairro: '', quartos: 0, val: 0 },
  { nome: 'Bruno Lacerda',    tel: '0011784230033', origem: portais[4], tipo: '', int: '', cidade: '', bairro: '', quartos: 0, val: 0 },
  { nome: 'Carla Mendonça',   tel: '0021775340034', origem: portais[5], tipo: '', int: '', cidade: '', bairro: '', quartos: 0, val: 0 },
  { nome: 'Diego Evangelista',tel: '0047766450035', origem: portais[6], tipo: '', int: '', cidade: '', bairro: '', quartos: 0, val: 0 },
];
async function inserir() {
  let ok = 0, err = 0;
  for (const l of leads) {
    const id = (Date.now() + Math.floor(Math.random()*9999)).toString();
    const pf = {};
    if (l.tipo)    pf.tipo     = l.tipo;
    if (l.int)     pf.intencao = l.int;
    if (l.cidade)  pf.cidade   = l.cidade;
    if (l.bairro)  pf.bairro   = l.bairro;
    if (l.quartos) pf.quartos  = l.quartos;
    if (l.val)     pf.valorMax = l.val;
    try {
      await query(`INSERT INTO leads (id,nome,telefone,whatsapp,contato,origem,status,user_id,codigo_usuario,perfil_ia,matches,matches_auto,dados,criado_em,atualizado_em) VALUES ($1,$2,$3,$3,$3,$4,'novo',$5,$5,$6,'[]','[]','{}',NOW(),NOW()) ON CONFLICT (id) DO NOTHING`,
        [id,l.nome,l.tel,l.origem,userId,JSON.stringify(pf)]);
      console.log('✅', l.nome, '|', l.origem, '|', Object.keys(pf).length, 'campos');
      ok++;
    } catch(e) { console.error('❌', l.nome, e.message); err++; }
    await new Promise(r => setTimeout(r, 50));
  }
  console.log(`\n${ok} inseridos, ${err} erros`);
  process.exit(0);
}
inserir();
