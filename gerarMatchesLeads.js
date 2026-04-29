const fs = require('fs');

const leads = fs.existsSync('leads.json') ? JSON.parse(fs.readFileSync('leads.json','utf8')) : [];
const imoveis = fs.existsSync('data.json') ? JSON.parse(fs.readFileSync('data.json','utf8')) : [];

function n(v){return String(v||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim();}
function num(v){return Number(String(v||'').replace(/\D/g,''))||0;}
function setEtapa(lead, etapa){
  lead.etapaAtual = etapa;
  lead.jornada = lead.jornada || [];
  const item = lead.jornada.find(j=>j.etapa===etapa);
  if(item){ item.feito = true; item.data = new Date().toISOString(); }
  else lead.jornada.push({etapa, feito:true, data:new Date().toISOString()});
}

let totalMatches = 0;

for(const lead of leads){
  const base = imoveis.find(i => i.listingId === lead.imovelId || i.referencia === lead.imovelReferencia);
  if(!base) continue;

  const baseValor = num(base.valor_imovel);
  const baseQuartos = num(base.quartos);

  const matches = imoveis
    .filter(i => i.listingId !== base.listingId)
    .filter(i => n(i.cidade) === n(base.cidade))
    .filter(i => n(i.estado) === n(base.estado))
    .filter(i => n(i.tipo) === n(base.tipo))
    .filter(i => !base.bairro || n(i.bairro) === n(base.bairro))
    .map(i=>{
      let score = 0;
      const valor = num(i.valor_imovel);
      if(baseValor && valor){
        const dif = Math.abs(valor-baseValor)/baseValor;
        if(dif <= .2) score += 35;
        else if(dif <= .35) score += 15;
      }
      if(baseQuartos && num(i.quartos) === baseQuartos) score += 25;
      if(n(i.bairro) === n(base.bairro)) score += 20;
      if(num(i.vagas) === num(base.vagas)) score += 10;
      if(num(i.suites) === num(base.suites)) score += 10;

      return {
        id:i.listingId,
        referencia:i.referencia,
        tipo:i.tipo,
        bairro:i.bairro,
        cidade:i.cidade,
        estado:i.estado,
        valor:i.valor_imovel,
        area:i.area_m2,
        quartos:i.quartos,
        suites:i.suites,
        banheiros:i.banheiros,
        vagas:i.vagas,
        descricao:i.descricao,
        score,
        fonte:'Carteira MatchImoveis'
      };
    })
    .filter(m=>m.score>=45)
    .sort((a,b)=>b.score-a.score)
    .slice(0,8);

  lead.matches = matches;
  lead.linkCliente = `/cliente/oferta/${lead.leadId}`;
  if(matches.length){
    setEtapa(lead,'Sistema buscar match');
    setEtapa(lead,'Cards enviados ao cliente');
  }
  totalMatches += matches.length;
}

fs.writeFileSync('leads.json', JSON.stringify(leads,null,2));

console.log('==============================');
console.log('LEADS PROCESSADOS:', leads.length);
console.log('TOTAL MATCHES GERADOS:', totalMatches);
console.log('ARQUIVO ATUALIZADO: leads.json');
console.log('==============================');
