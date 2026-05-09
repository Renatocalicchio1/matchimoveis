'use strict';
const nlp = require('./nlp');
const PADROES = [
  {id:'cliente_busca',regex:/(?:tenho|meu|um|uma|o)?\s*(?:cliente|comprador|interessado)\s*(?:que\s*)?(?:quer|querendo|procura|procurando|busca|buscando|precisa|interessad)/,handler:'buscar_imovel'},
  {id:'cliente_nao_gostou',regex:/cliente\s*(?:nao\s*gostou|nao\s*curtiu|nao\s*aprovou|nao\s*quis|recusou)/,handler:'cliente_nao_gostou'},
  {id:'cliente_gostou',regex:/cliente\s*(?:gostou|aprovou|curtiu|adorou|quer\s*fechar|topou)/,handler:'cliente_gostou'},
  {id:'enviei_vitrine',regex:/(?:ja\s*)?enviei\s*(?:a\s*)?vitrine|mandei\s*(?:a\s*)?vitrine/,handler:'enviei_vitrine'},
  {id:'proxima_visita',regex:/proxima\s*visita|quando\s*(?:e|é|sera)\s*(?:a\s*)?visita|visita\s*(?:e|é)\s*quando/,handler:'proxima_visita'},
  {id:'mais_barato',regex:/mais\s*barato|valor\s*menor|algo\s*mais\s*em\s*conta|menos\s*caro/,handler:'busca_mais_barato'},
  {id:'tem_imovel',regex:/tem\s*(?:algum|algo|imovel|apartamento|casa|cobertura)\s*(?:em|no|na|para|disponivel)?/,handler:'buscar_imovel'},
  {id:'nao_consigo',regex:/nao\s*consigo|nao\s*funciona|esta\s*dando\s*erro|nao\s*aparece/,handler:'problema'},
];
function extrairEntidades(mNorm, bairros) {
  const e={};
  const bNorm=mNorm.replace(/[̀-ͯ]/g,"");const b=(bairros||[]).find(b=>bNorm.includes(b.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'')));
  if(b)e.bairro=b; else { const bairroMatch=mNorm.match(/ems+([a-z]+(?:s+[a-z]+)?)/); if(bairroMatch)e.bairroTexto=bairroMatch[1]; }
  const tipos=['apartamento','apto','casa','cobertura','terreno','sobrado','studio'];
  const t=tipos.find(t=>mNorm.includes(t));
  if(t)e.tipo=t==='apto'?'apartamento':t;
  const q=mNorm.match(/(\d+)\s*(?:quarto|dorm)/);
  if(q)e.quartos=parseInt(q[1]);
  const v=mNorm.match(/(\d+(?:[.,]\d+)?)\s*(mil|k)?/);
  if(v){let val=parseFloat(v[1].replace(',','.'));if(v[2])val*=1000;if(val>10000)e.valorMax=val;}
  return e;
}
function gerarResposta(handler, e, d, imoveis, leads, visitas, btn, chip) {
  if(handler==='buscar_imovel'){
    let r=imoveis.filter(i=>i.status!=='inativo');
    if(e.tipo)r=r.filter(i=>i.tipo&&i.tipo.toLowerCase().includes(e.tipo));
    if(e.bairro)r=r.filter(i=>i.bairro&&i.bairro.toLowerCase().includes(e.bairro.toLowerCase()));
    if(e.quartos)r=r.filter(i=>i.quartos&&parseInt(i.quartos)>=e.quartos);
    if(e.valorMax)r=r.filter(i=>i.valor&&parseFloat(i.valor)<=e.valorMax);
    if(!r.length)return 'Nao encontrei imoveis'+(e.tipo?' do tipo '+e.tipo:'')+(e.bairro?' em '+e.bairro:'')+' na carteira.<br><br>'+chip('Ver demanda','demanda por bairro')+btn('Ver imoveis','/app/imoveis');
    return 'Encontrei <strong>'+r.length+' imovel(is)</strong>'+(e.bairro?' em '+e.bairro:'')+':<br>'+r.slice(0,5).map(i=>'- '+(i.tipo||'Imovel')+(i.quartos?' '+i.quartos+'q':'')+' em '+(i.bairro||'-')+(i.valor?' R$'+Number(i.valor).toLocaleString('pt-BR'):'')).join('<br>')+'<br><br>'+btn('Ver todos','/app/imoveis')+chip('Enviar vitrine','enviar vitrine');
  }
  if(handler==='cliente_nao_gostou')return 'Sem problema! Temos outras opcoes.<br><br>'+chip('Buscar outro','meus imoveis')+btn('Ver imoveis','/app/imoveis');
  if(handler==='cliente_gostou')return 'Otimo! Proximo passo: agendar a visita.<br><br>'+btn('Ver visitas','/app/visitas');
  if(handler==='enviei_vitrine')return 'Vitrine enviada! Aguarde o cliente escolher e solicitar visita.<br><br>'+btn('Ver visitas','/app/visitas');
  if(handler==='proxima_visita'){
    if(d.hoje>0)return 'Voce tem <strong>'+d.hoje+' visita(s) hoje</strong>.<br><br>'+btn('Ver visitas','/app/visitas');
    if(d.confirmadas>0)return 'Voce tem <strong>'+d.confirmadas+' visita(s) confirmada(s)</strong>.<br><br>'+btn('Ver visitas','/app/visitas');
    return 'Nenhuma visita agendada ainda.<br><br>'+btn('Ver visitas','/app/visitas');
  }
  if(handler==='busca_mais_barato'){
    const r=imoveis.filter(i=>i.status!=='inativo'&&i.valor).sort((a,b)=>a.valor-b.valor).slice(0,5);
    if(!r.length)return 'Sem imoveis com valor cadastrado.';
    return 'Opcoes mais em conta:<br>'+r.map(i=>'- '+(i.tipo||'Imovel')+' em '+(i.bairro||'-')+' R$'+Number(i.valor).toLocaleString('pt-BR')).join('<br>')+'<br><br>'+btn('Ver todos','/app/imoveis');
  }
  if(handler==='problema')return 'Entendi que algo nao esta funcionando.<br><br>'+chip('XML nao atualizou','meu xml nao atualizou')+chip('Portal rejeitou','portal rejeitou imovel')+chip('Sem match','por que nao deu match');
  return null;
}
function interpretar(mensagem, d, imoveis, leads, visitas, btn, chip) {
  const mNorm=nlp.normalizar(mensagem);
  const padrao=PADROES.find(p=>p.regex.test(mNorm));
  if(!padrao)return null;
  const e=extrairEntidades(mNorm,d.bairros||[]);
  return gerarResposta(padrao.handler,e,d,imoveis,leads,visitas,btn,chip);
}
module.exports={interpretar,PADROES};
