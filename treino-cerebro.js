'use strict';
/**
 * TREINO DO CÉREBRO — Usuários Sintéticos 24h
 * node treino-cerebro.js           — roda uma vez
 * node treino-cerebro.js --loop    — roda de hora em hora
 * node treino-cerebro.js --silent  — sem logs detalhados
 */

const fs      = require('fs');
const path    = require('path');
const cerebro = require('./cerebro/index');

const SILENT = process.argv.includes('--silent');
const LOOP   = process.argv.includes('--loop');
const log    = (...a) => { if (!SILENT) console.log(...a); };

const USUARIOS = [
  {
    id:'corretor-iniciante-001', nome:'Carlos', perfil:'iniciante',
    perguntas:[
      'oi','olá','bom dia','boa tarde','o que você faz?','me ajuda',
      'como cadastro um imóvel?','como importo leads?','o que é match?',
      'o que é vitrine?','como publico no portal?','primeiros passos',
      'o que é lead?','o que é score?','como começo?','não sei por onde começar',
    ]
  },
  {
    id:'corretor-experiente-002', nome:'Ana', perfil:'experiente',
    perguntas:[
      'minhas leads de hoje','leads quentes','quem pediu visita?',
      'visitas pendentes','visitas hoje','quem confirmou visita?',
      'meus imóveis','imóveis inativos','imóveis sem proprietário',
      'demanda por bairro','taxa de match','leads sem match',
      'resumo geral','o que devo fazer hoje?','gerar xml vivareal',
      'ver portais','meu relatório','leads com match','meus coins',
    ]
  },
  {
    id:'corretor-tecnico-003', nome:'Roberto', perfil:'tecnico',
    perguntas:[
      'meu xml não atualizou','portal rejeitou meu imóvel',
      'por que não deu match?','a extração falhou',
      'quais campos a planilha precisa?','como importar leads?',
      'como melhorar o match?','imóvel não apareceu no portal',
      'como adicionar fotos?','como inativar imóvel?',
      'como trocar senha?','leads duplicadas','xml não saiu no vivareal',
    ]
  },
  {
    id:'corretor-analista-004', nome:'Fernanda', perfil:'analista',
    perguntas:[
      'qual minha taxa de match?','quantas leads tenho?',
      'faixa de valor das leads','tipo mais buscado',
      'bairros mais demandados','quartos mais pedidos',
      'qual lead tem mais chance de fechar?','quem devo atender primeiro?',
      'leads frias','relatório semanal','oferta vs demanda',
      'imóveis parados','valor médio da carteira',
    ]
  },
  {
    id:'corretor-digitacao-005', nome:'Marcos', perfil:'digitacao_ruim',
    perguntas:[
      'meus imovei','ver lids','quantas vizitas tenho?','matsh',
      'meus conis','subir xml','imovéis inativos','lids sem matsh',
      'ver portias','commo importo lead?','quando tem vizita hj',
      'imovel paardos','meu relatorrio','dashbord','resomo geral',
      'lids quentes','taxa de matsh','notificaçoes',
    ]
  },
  {
    id:'corretor-busca-006', nome:'Paulo', perfil:'busca_ativa',
    perguntas:[
      'tem apartamento em Itajaí?','casa até 500mil',
      'apartamento 3 quartos','imóvel em Balneário Camboriú',
      'apto até 300mil 2 quartos','cobertura em Itapema',
      'imóvel até 800 mil','buscar lead João','cliente Maria',
      'quais clientes querem 3 quartos?','tem casa com 2 vagas?',
    ]
  },
  {
    id:'corretor-suporte-007', nome:'Juliana', perfil:'suporte',
    perguntas:[
      'como conectar whatsapp?','mandar mensagem para lead',
      'enviar vitrine para cliente','link do cliente',
      'como agendar visita?','avisar proprietário da visita',
      'como reativar leads frias?','leads para reativar',
      'quem não respondeu?','manda follow-up',
    ]
  },
];

const D = {
  ativos:45, inativos:8,
  bairros:['Itajaí','Balneário Camboriú','Itapema','Navegantes','Camboriú'],
  tipos:['Apartamento','Casa','Cobertura','Terreno','Sobrado'],
  leads:87, organicas:52, importadas:35,
  comMatch:41, semMatch:46,
  visitas:12, hoje:2, pendentes:3, confirmadas:7
};
const IMOVEIS = [
  {id:'im1',userId:'treino',status:'ativo',tipo:'Apartamento',bairro:'Itajaí',quartos:2,valor:350000,fotos:['f1.jpg'],descricao:'Apto moderno'},
  {id:'im2',userId:'treino',status:'ativo',tipo:'Casa',bairro:'Balneário Camboriú',quartos:3,valor:750000,fotos:['f1.jpg'],descricao:'Casa espaçosa'},
  {id:'im3',userId:'treino',status:'inativo',tipo:'Cobertura',bairro:'Itapema',quartos:4,valor:1200000,fotos:[],descricao:''},
  {id:'im4',userId:'treino',status:'ativo',tipo:'Apartamento',bairro:'Itajaí',quartos:1,valor:280000,fotos:['f1.jpg'],descricao:'Studio'},
];
const LEADS = [
  {id:'l1',userId:'treino',nome:'João Silva',bairro:'Itajaí',tipo:'Apartamento',quartos:2,valorMax:400000,matchesBase:[{id:'im1'}],dataCriacao:new Date().toISOString()},
  {id:'l2',userId:'treino',nome:'Maria Santos',bairro:'Balneário Camboriú',tipo:'Casa',quartos:3,valorMax:800000,matchesBase:[{id:'im2'}]},
  {id:'l3',userId:'treino',nome:'Pedro Costa',bairro:'Florianópolis',tipo:'Apartamento',quartos:2,valorMax:500000,matchesBase:[]},
  {id:'l4',userId:'treino',nome:'Ana Lima',bairro:'Itajaí',tipo:'Apartamento',quartos:3,valorMax:600000,matchesBase:[],dataCriacao:new Date(Date.now()-20*24*60*60*1000).toISOString()},
  {id:'l5',userId:'treino',nome:'Carlos Mendes',bairro:'Itapema',tipo:'Cobertura',quartos:4,valorMax:1500000,matchesBase:[{id:'im3'}]},
];
const VISITAS = [
  {id:'v1',userId:'treino',leadId:'l1',status:'confirmada',dataVisita:new Date().toLocaleDateString('pt-BR')},
  {id:'v2',userId:'treino',leadId:'l2',status:'solicitada',dataVisita:new Date().toLocaleDateString('pt-BR')},
];

const metricas = { total:0, ok:0, falhou:0, naoEntendeu:0, porPerfil:{}, falhas:[], tempos:[], naoEntendidas:[] };

function testar(usuario, pergunta) {
  const t0 = Date.now();
  let resposta = '', status = 'ok';
  try {
    resposta = cerebro.responder(
      pergunta, D,
      {nome:usuario.nome, id:usuario.id, userId:usuario.id},
      IMOVEIS, LEADS, VISITAS, {}
    );
  } catch(e) {
    status = 'erro';
    metricas.falhas.push({usuario:usuario.nome, pergunta, erro:e.message});
  }
  const tempo = Date.now() - t0;
  metricas.tempos.push(tempo);
  const naoEnt = resposta.includes('não entendi')||resposta.includes('não captei')||resposta.includes('Tente:');
  if (naoEnt) { status='nao_entendeu'; metricas.naoEntendeu++; metricas.naoEntendidas.push({perfil:usuario.perfil,pergunta}); }
  else if (status==='ok') metricas.ok++;
  else metricas.falhou++;
  metricas.total++;
  const p = metricas.porPerfil;
  p[usuario.perfil] = p[usuario.perfil]||{ok:0,naoEntendeu:0,falhou:0};
  p[usuario.perfil][status==='ok'?'ok':status==='nao_entendeu'?'naoEntendeu':'falhou']++;
  return {status,tempo,texto:resposta.replace(/<[^>]+>/g,'').substring(0,70)};
}

async function rodar(rodada=1) {
  log(`\n${'═'.repeat(55)}`);
  log(`🧠 TREINO CÉREBRO — Rodada ${rodada} — ${new Date().toLocaleTimeString('pt-BR')}`);
  log(`${'═'.repeat(55)}`);

  for (const u of USUARIOS) {
    log(`\n👤 ${u.nome} (${u.perfil})`);
    for (const p of u.perguntas) {
      const r = testar(u, p);
      const e = r.status==='ok'?'✅':r.status==='nao_entendeu'?'❓':'❌';
      log(`  ${e} "${p}"`);
      if (r.status !== 'ok') log(`     → ${r.texto}`);
      await new Promise(res=>setTimeout(res,5));
    }
  }

  const cob = Math.round(metricas.ok/metricas.total*100);
  const tmed = Math.round(metricas.tempos.reduce((a,b)=>a+b,0)/metricas.tempos.length);

  log(`\n${'═'.repeat(55)}`);
  log(`📊 RESULTADO — Rodada ${rodada}`);
  log(`${'═'.repeat(55)}`);
  log(`✅ Ok:           ${metricas.ok}/${metricas.total} (${cob}%)`);
  log(`❓ Não entendeu: ${metricas.naoEntendeu}`);
  log(`❌ Erros:        ${metricas.falhou}`);
  log(`⚡ Tempo médio:  ${tmed}ms`);
  log(`\n📈 Por perfil:`);
  for (const [perf, m] of Object.entries(metricas.porPerfil)) {
    const tot = m.ok+m.falhou+m.naoEntendeu;
    log(`   ${perf.padEnd(18)} ${Math.round(m.ok/tot*100)}% (${m.ok}/${tot})`);
  }
  if (metricas.naoEntendidas.length) {
    log(`\n💡 Não entendidas (candidatas a novas intenções):`);
    metricas.naoEntendidas.slice(0,10).forEach(n=>log(`   [${n.perfil}] "${n.pergunta}"`));
  }
  if (metricas.falhas.length) {
    log(`\n🔴 Erros:`);
    metricas.falhas.forEach(f=>log(`   [${f.usuario}] "${f.pergunta}" → ${f.erro}`));
  }

  fs.writeFileSync(
    path.join(__dirname,'cerebro','treino-relatorio.json'),
    JSON.stringify({rodada,geradoEm:new Date().toISOString(),cobertura:cob,tempoMedio:tmed,
      total:metricas.total,ok:metricas.ok,naoEntendeu:metricas.naoEntendeu,falhou:metricas.falhou,
      porPerfil:metricas.porPerfil,falhas:metricas.falhas,
      naoEntendidas:metricas.naoEntendidas,
      pesos:cerebro.pesosArvore?cerebro.pesosArvore():{}
    },null,2)
  );
  log(`\n📁 cerebro/treino-relatorio.json salvo`);

  // reset
  Object.assign(metricas,{total:0,ok:0,falhou:0,naoEntendeu:0,porPerfil:{},falhas:[],tempos:[],naoEntendidas:[]});

  if (LOOP) {
    log(`\n⏰ Próxima rodada em 1 hora...\n`);
    setTimeout(()=>rodar(rodada+1), 60*60*1000);
  }
}

rodar(1).catch(console.error);
