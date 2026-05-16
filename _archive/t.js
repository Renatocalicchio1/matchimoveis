const cerebro = require('./cerebro/index');
const fs = require('fs');
const imoveis = JSON.parse(fs.readFileSync('imoveis.json','utf8')).filter(i=>i.userId==='imobiliaria-47991919191').slice(0,50);
const leads = JSON.parse(fs.readFileSync('data.json','utf8')).slice(0,50);
const visitas = fs.existsSync('visitas.json') ? JSON.parse(fs.readFileSync('visitas.json','utf8')).slice(0,20) : [];
const d = {
  ativos:imoveis.filter(i=>i.status!=='inativo').length,
  inativos:imoveis.filter(i=>i.status==='inativo').length,
  bairros:[...new Set(imoveis.map(i=>i.bairro).filter(Boolean))],
  tipos:[...new Set(imoveis.map(i=>i.tipo).filter(Boolean))],
  leads:leads.length, organicas:0, importadas:0,
  comMatch:leads.filter(l=>l.matchesBase&&l.matchesBase.length>0).length,
  semMatch:leads.filter(l=>!(l.matchesBase&&l.matchesBase.length>0)).length,
  visitas:visitas.length, hoje:0,
  pendentes:visitas.filter(v=>v.status==='solicitada').length,
  confirmadas:visitas.filter(v=>v.status==='confirmada').length
};
const user = {id:'imobiliaria-47991919191',nome:'Renato',tipo:'corretor'};
const testes = ['oi','meus imoveis','leads com match','visitas hoje','tipo mais buscado','quartos mais pedidos','faixa de valor','casas disponiveis','cliente quer casa com 3 quartos','primeiros passos','enviar vitrine para cliente','gerar xml vivareal','ver portais','o que devo fazer hoje','quem nao respondeu','avisar proprietario','como funciona o match','blablabla xpto nada'];
let ok=0,falhou=0;
testes.forEach(p => {
  try {
    const r = cerebro.responder(p,d,user,imoveis,leads,visitas,{}).replace(/<[^>]+>/g,'').replace(/\s+/g,' ').trim().slice(0,70);
    const status = (r.includes('nao entendi')||r.includes('reformular')||r.length<10)?'FALHOU':'OK';
    if(status==='OK') ok++; else falhou++;
    console.log('['+status+'] '+p+'\n     => '+r+'\n');
  } catch(e){ falhou++; console.log('[ERRO] '+p+'\n     => '+e.message.slice(0,50)+'\n'); }
});
console.log('TOTAL: '+ok+' OK | '+falhou+' FALHOU');
