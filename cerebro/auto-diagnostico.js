'use strict';

function diagnosticar(userId, leads, imoveis, visitas) {
  var alertas = [];
  var agora = Date.now();
  var bl = {}, bi = {};
  leads.forEach(function(l){ if(l.bairro) bl[l.bairro]=(bl[l.bairro]||0)+1; });
  imoveis.filter(function(i){return i.status!=='inativo';}).forEach(function(i){ if(i.bairro) bi[i.bairro]=(bi[i.bairro]||0)+1; });

  // Bairros sem cobertura
  var semCob = Object.entries(bl).filter(function(e){return e[1]>=3&&!bi[e[0]];}).sort(function(a,b){return b[1]-a[1];});
  if (semCob.length > 0) alertas.push({ tipo:'OPORTUNIDADE', gravidade:'alta', msg:'🚨 ' + semCob[0][0] + ' tem ' + semCob[0][1] + ' leads mas nenhum imóvel seu! Capte lá.', acao:'oportunidade de captacao' });

  // Taxa de match muito baixa
  var comMatch = leads.filter(function(l){return l.matchesBase&&l.matchesBase.length>0;}).length;
  var taxa = leads.length > 0 ? Math.round(comMatch/leads.length*100) : 0;
  if (taxa < 20 && leads.length > 10) alertas.push({ tipo:'MATCH', gravidade:'alta', msg:'⚠️ Taxa de match muito baixa (' + taxa + '%). Seus imóveis não cobrem os bairros das leads.', acao:'demanda por bairro' });

  // Leads quentes paradas
  var quentesParadas = leads.filter(function(l){
    var temMatch = l.matchesBase&&l.matchesBase.length>0;
    var semVisita = !visitas.some(function(v){return String(v.leadId||'')===String(l.id||'');});
    var dias = l.createdAt?(agora-new Date(l.createdAt).getTime())/86400000:0;
    return temMatch && semVisita && dias > 5;
  });
  if (quentesParadas.length > 0) alertas.push({ tipo:'LEAD', gravidade:'media', msg:'🔥 ' + quentesParadas.length + ' lead(s) com match paradas há 5+ dias sem vitrine enviada!', acao:'leads com match' });

  // Visitas pendentes antigas
  var visitasAntigas = visitas.filter(function(v){
    var dias = v.createdAt?(agora-new Date(v.createdAt).getTime())/86400000:0;
    return (v.status==='pendente'||v.status==='solicitada') && dias > 3;
  });
  if (visitasAntigas.length > 0) alertas.push({ tipo:'VISITA', gravidade:'media', msg:'⏳ ' + visitasAntigas.length + ' visita(s) pendente(s) há 3+ dias sem confirmação do proprietário.', acao:'visitas pendentes' });

  // Imóveis sem foto
  var semFoto = imoveis.filter(function(i){return i.status!=='inativo'&&(!i.fotos||i.fotos.length===0);}).length;
  if (semFoto > 0) alertas.push({ tipo:'IMOVEL', gravidade:'baixa', msg:'📸 ' + semFoto + ' imóvel(is) sem foto — portais como VivaReal rejeitam.', acao:'meus imoveis' });

  // Leads antigas sem match
  var antigas = leads.filter(function(l){ var dias=l.createdAt?(agora-new Date(l.createdAt).getTime())/86400000:0; return dias>30&&(!l.matchesBase||!l.matchesBase.length); });
  if (antigas.length > 5) alertas.push({ tipo:'LEAD', gravidade:'baixa', msg:'🥶 ' + antigas.length + ' leads sem match há 30+ dias. Risco de perder esses clientes.', acao:'leads frias' });

  return alertas;
}

function responder(mNorm, userId, leads, imoveis, visitas, btn, chip) {
  if (!/diagnostico|analise|problema|o que ta errado|o que ha de errado|verificar conta|inspecionar/.test(mNorm)) return null;
  var alertas = diagnosticar(userId, leads, imoveis, visitas);
  if (!alertas.length) return '✅ <strong>Diagnóstico completo:</strong> Nenhum problema crítico encontrado! Sua conta está saudável.<br><br>' + chip('Resumo geral','resumo do dia') + chip('Oportunidades','oportunidade de captacao');
  var html = '🔍 <strong>Diagnóstico automático da sua conta:</strong><br><br>';
  var alta = alertas.filter(function(a){return a.gravidade==='alta';});
  var media = alertas.filter(function(a){return a.gravidade==='media';});
  var baixa = alertas.filter(function(a){return a.gravidade==='baixa';});
  if (alta.length) { html += '<strong>🔴 Crítico:</strong><br>'; alta.forEach(function(a){ html += '<div style="background:#fee2e2;border-radius:8px;padding:8px 12px;margin:4px 0">' + a.msg + '<br>' + chip('Ver',''+a.acao) + '</div>'; }); html += '<br>'; }
  if (media.length) { html += '<strong>🟡 Atenção:</strong><br>'; media.forEach(function(a){ html += '<div style="background:#fef9c3;border-radius:8px;padding:8px 12px;margin:4px 0">' + a.msg + '<br>' + chip('Ver',''+a.acao) + '</div>'; }); html += '<br>'; }
  if (baixa.length) { html += '<strong>🟢 Melhoria:</strong><br>'; baixa.forEach(function(a){ html += '<div style="background:#f0fdf4;border-radius:8px;padding:8px 12px;margin:4px 0">' + a.msg + '</div>'; }); }
  return html;
}

module.exports = { diagnosticar, responder };
