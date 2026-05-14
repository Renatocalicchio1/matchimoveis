'use strict';

function fmt(v) { return 'R$ ' + Number(v).toLocaleString('pt-BR'); }
function pct(a, b) { return b > 0 ? Math.round(a/b*100) : 0; }

function gerarResumoConta(d, leads, imoveis, visitas, perfil) {
  var taxa = pct(d.comMatch, d.leads);
  var avaliacao = taxa >= 70 ? 'excelente' : taxa >= 40 ? 'razoável' : 'baixa';
  var bl = {}, tipos = {};
  leads.forEach(function(l){ if(l.bairro) bl[l.bairro]=(bl[l.bairro]||0)+1; if(l.tipo) tipos[l.tipo]=(tipos[l.tipo]||0)+1; });
  var topBairro = Object.entries(bl).sort(function(a,b){return b[1]-a[1];})[0];
  var topTipo = Object.entries(tipos).sort(function(a,b){return b[1]-a[1];})[0];
  var vals = leads.filter(function(l){return l.valor_imovel>0;}).map(function(l){return Number(l.valor_imovel);});
  var ticketMedio = vals.length ? Math.round(vals.reduce(function(a,b){return a+b;},0)/vals.length) : 0;
  var semFoto = imoveis.filter(function(i){return i.status!=='inativo'&&(!i.fotos||i.fotos.length===0);}).length;
  var semProp = imoveis.filter(function(i){return i.status!=='inativo'&&(!i.proprietario||!i.proprietario.telefone);}).length;
  var visitasHoje = visitas.filter(function(v){return (v.dataVisita||'').slice(0,10)===new Date().toISOString().slice(0,10);}).length;

  var r = '';
  r += '📊 <strong>Resumo da sua conta:</strong><br><br>';
  r += '🏠 <strong>' + d.ativos + ' imóveis ativos</strong> · ' + d.inativos + ' inativos<br>';
  r += '👥 <strong>' + d.leads + ' leads</strong> · 🎯 ' + d.comMatch + ' com match (' + taxa + '% — ' + avaliacao + ')<br>';
  r += '📅 <strong>' + d.visitas + ' visitas</strong> · ' + d.confirmadas + ' confirmadas · ' + d.pendentes + ' pendentes<br>';
  if (visitasHoje > 0) r += '⚠️ <strong>' + visitasHoje + ' visita(s) hoje!</strong><br>';
  r += '<br>';
  if (topBairro) r += '📍 Bairro mais demandado: <strong>' + topBairro[0] + '</strong> (' + topBairro[1] + ' leads)<br>';
  if (topTipo) r += '🏠 Tipo mais pedido: <strong>' + topTipo[0] + '</strong><br>';
  if (ticketMedio > 0) r += '💰 Ticket médio das leads: <strong>' + fmt(ticketMedio) + '</strong><br>';
  r += '<br>';
  if (semFoto > 0) r += '⚠️ ' + semFoto + ' imóvel(is) sem foto — portais rejeitam<br>';
  if (semProp > 0) r += '⚠️ ' + semProp + ' imóvel(is) sem proprietário<br>';
  return r;
}

function gerarDiagnostico(d, leads, imoveis) {
  var problemas = [], solucoes = [];
  var taxa = pct(d.comMatch, d.leads);
  var bl = {}, bi = {};
  leads.forEach(function(l){ if(l.bairro) bl[l.bairro]=(bl[l.bairro]||0)+1; });
  imoveis.filter(function(i){return i.status!=='inativo';}).forEach(function(i){ if(i.bairro) bi[i.bairro]=(bi[i.bairro]||0)+1; });
  var semCobertura = Object.entries(bl).filter(function(e){return !bi[e[0]];}).sort(function(a,b){return b[1]-a[1];}).slice(0,3);
  var semExtracao = leads.filter(function(l){return l.extractionStatus!=='ok';}).length;
  var semFoto = imoveis.filter(function(i){return i.status!=='inativo'&&(!i.fotos||i.fotos.length===0);}).length;
  var semDesc = imoveis.filter(function(i){return i.status!=='inativo'&&(!i.descricao||i.descricao.length<50);}).length;

  if (taxa < 30 && d.leads > 5) { problemas.push('Taxa de match muito baixa: apenas ' + taxa + '%'); solucoes.push('Importe imóveis nos bairros mais demandados'); }
  if (semCobertura.length > 0) { problemas.push('Bairros sem cobertura: ' + semCobertura.map(function(e){return e[0]+' ('+e[1]+' leads)';}).join(', ')); solucoes.push('Capte imóveis nesses bairros para fechar mais negócios'); }
  if (semExtracao > 0) { problemas.push(semExtracao + ' leads sem extração de dados — não fazem match'); solucoes.push('Aguarde a extração automática ou reimporte as leads'); }
  if (semFoto > 0) { problemas.push(semFoto + ' imóveis sem foto — portais rejeitem'); solucoes.push('Adicione pelo menos 3 fotos por imóvel'); }
  if (semDesc > 0) { problemas.push(semDesc + ' imóveis com descrição fraca'); solucoes.push('Melhore as descrições para atrair mais leads'); }
  if (d.pendentes > 3) { problemas.push(d.pendentes + ' visitas pendentes há muito tempo'); solucoes.push('Confirme ou reagende as visitas paradas'); }

  if (!problemas.length) return '✅ <strong>Diagnóstico: conta saudável!</strong><br>Nenhum problema crítico identificado. Continue assim!';

  var r = '🔍 <strong>Diagnóstico da sua conta:</strong><br><br>';
  r += '<strong>❌ Problemas encontrados:</strong><br>';
  problemas.forEach(function(p,i){ r += (i+1)+'. '+p+'<br>'; });
  r += '<br><strong>✅ Como resolver:</strong><br>';
  solucoes.forEach(function(s,i){ r += (i+1)+'. '+s+'<br>'; });
  return r;
}

function gerarMensagemVitrine(lead, urlVitrine) {
  var nome = lead.nome || lead.name || '';
  var bairro = lead.bairro || '';
  var tipo = lead.tipo || 'imóvel';
  var qtd = (lead.matchesBase || []).length;
  return 'Olá ' + nome + '! 😊 Encontrei ' + qtd + ' ' + tipo + (qtd>1?'s':'') + (bairro?' em '+bairro:'') + ' que combinam exatamente com o que você procura! Acesse sua seleção exclusiva: ' + urlVitrine + ' Qualquer dúvida estou à disposição!';
}

function gerarMensagemFollowUp(lead, diasSemContato) {
  var nome = lead.nome || lead.name || '';
  var bairro = lead.bairro || '';
  var tipo = lead.tipo || 'imóvel';
  if (diasSemContato > 30) return 'Olá ' + nome + '! Ainda está procurando ' + tipo + (bairro?' em '+bairro:'') + '? Tenho novidades que podem te interessar!';
  if (diasSemContato > 15) return 'Olá ' + nome + '! Tudo bem? Estava pensando em você — surgiram ótimas opções de ' + tipo + (bairro?' em '+bairro:'') + '. Posso te mostrar?';
  return 'Olá ' + nome + '! Alguma novidade? Estou aqui para ajudar na sua busca por ' + tipo + (bairro?' em '+bairro:'') + '!';
}

function gerarMensagemProprietario(visita) {
  var nome = visita.proprietarioNome || 'Proprietário';
  var cliente = visita.nome || visita.leadNome || 'cliente';
  var imovel = visita.imovelTitulo || visita.imovelBairro || 'imóvel';
  var data = visita.dataVisita || '';
  var hora = visita.horaVisita || '';
  return 'Olá ' + nome + '! Sou corretor parceiro e tenho um cliente interessado no seu ' + imovel + '. Gostaria de agendar uma visita' + (data?' no dia '+data:'') + (hora?' às '+hora:'') + '. Pode confirmar sua disponibilidade?';
}

function gerarRelatorioRapido(d, leads, imoveis, visitas) {
  var taxa = pct(d.comMatch, d.leads);
  var agora = Date.now();
  var semana = new Date(agora - 7*86400000);
  var leadsNovas = leads.filter(function(l){ var dt=l.createdAt||l.dataCriacao||''; return dt&&new Date(dt)>=semana; }).length;
  var visitasConf = visitas.filter(function(v){ return v.status==='confirmada'; }).length;
  var potencial = leads.filter(function(l){ return l.matchesBase&&l.matchesBase.length>0&&!visitas.some(function(v){return String(v.leadId||'')===String(l.id||'');}); }).length;
  var r = '📈 <strong>Relatório rápido:</strong><br><br>';
  r += '• Leads novas esta semana: <strong>' + leadsNovas + '</strong><br>';
  r += '• Taxa de match: <strong>' + taxa + '%</strong><br>';
  r += '• Visitas confirmadas: <strong>' + visitasConf + '</strong><br>';
  r += '• Leads prontas para vitrine: <strong>' + potencial + '</strong><br>';
  r += '• Imóveis ativos: <strong>' + d.ativos + '</strong><br>';
  return r;
}

module.exports = { gerarResumoConta, gerarDiagnostico, gerarMensagemVitrine, gerarMensagemFollowUp, gerarMensagemProprietario, gerarRelatorioRapido, fmt, pct };
