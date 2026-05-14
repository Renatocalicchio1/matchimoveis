'use strict';
// Chain of Thought — raciocina sobre o contexto antes de responder

function raciocinar(mensagem, dados, historico) {
  var d = dados || {};
  var leads = d.leads || [];
  var imoveis = d.imoveis || [];
  var visitas = d.visitas || [];
  var userId = d.userId || '';
  var t = String(mensagem).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
  var conclusoes = [];
  var acaoSugerida = null;
  var prioridade = 'normal';

  // Analisa contexto completo
  var comMatch = leads.filter(function(l){ return l.matchesBase && l.matchesBase.length > 0; });
  var semMatch = leads.filter(function(l){ return !l.matchesBase || l.matchesBase.length === 0; });
  var visitasHoje = visitas.filter(function(v){ return (v.dataVisita||'').slice(0,10) === new Date().toISOString().slice(0,10); });
  var visitasPend = visitas.filter(function(v){ return v.status === 'pendente' || v.status === 'solicitada'; });
  var leadsQuentes = comMatch.filter(function(l){ return l.matchesBase && l.matchesBase.length >= 3; });
  var semFoto = imoveis.filter(function(i){ return i.status !== 'inativo' && (!i.fotos || i.fotos.length === 0); });
  var semProp = imoveis.filter(function(i){ return i.status !== 'inativo' && (!i.proprietario || !i.proprietario.telefone); });
  var agora = Date.now();
  var leadsAntigas = leads.filter(function(l){ return l.createdAt && (agora - new Date(l.createdAt).getTime()) > 30*86400000 && (!l.matchesBase||!l.matchesBase.length); });

  // Cadeia de raciocínio
  if (visitasHoje.length > 0) { conclusoes.push('tem ' + visitasHoje.length + ' visita(s) hoje — prioridade máxima'); prioridade = 'urgente'; }
  if (visitasPend.length > 0) { conclusoes.push(visitasPend.length + ' visita(s) aguardando proprietário'); if (prioridade !== 'urgente') prioridade = 'alta'; }
  if (leadsQuentes.length > 0) { conclusoes.push(leadsQuentes.length + ' lead(s) quente(s) com 3+ matches prontas para fechar'); }
  if (semMatch.length > leads.length * 0.6) { conclusoes.push('taxa de match baixa (' + Math.round(comMatch.length/Math.max(leads.length,1)*100) + '%) — carteira pode estar desatualizada'); }
  if (semFoto.length > 0) { conclusoes.push(semFoto.length + ' imóvel(is) sem foto — portais vão rejeitar'); }
  if (semProp.length > 5) { conclusoes.push(semProp.length + ' imóveis sem proprietário — visitas vão travar'); }
  if (leadsAntigas.length > 0) { conclusoes.push(leadsAntigas.length + ' leads antigas sem match há 30+ dias — risco de perda'); }

  // Detecta intenção real da mensagem
  if (/travado|nao sei|o que fazer|me ajuda|me orienta|perdido/.test(t)) { acaoSugerida = 'plano_do_dia'; prioridade = 'alta'; conclusoes.push('corretor precisa de direção — sugerir plano de ação'); }
  if (/sumiu|nao respondeu|nao retornou|cadê|sem resposta/.test(t)) { acaoSugerida = 'followup'; conclusoes.push('lead sem resposta — sugerir follow-up imediato'); }
  if (/nao gostou|nao curtiu|nao quis|recusou|nao quer/.test(t)) { acaoSugerida = 'nova_opcao'; conclusoes.push('cliente rejeitou opção — sugerir alternativas'); }
  if (/gostou|adorou|curtiu|topou|quer fechar|quer comprar/.test(t)) { acaoSugerida = 'agendar_visita'; prioridade = 'urgente'; conclusoes.push('cliente interessado — agir agora antes de esfriar'); }
  if (/caro|caro demais|nao cabe|acima do valor|fora do orcamento/.test(t)) { acaoSugerida = 'busca_barata'; conclusoes.push('cliente achou caro — buscar opções mais baratas'); }
  if (/visita amanha|visita hoje|tenho visita|visita marcada/.test(t)) { acaoSugerida = 'preparar_visita'; prioridade = 'alta'; conclusoes.push('visita próxima — preparar corretor'); }

  return { conclusoes: conclusoes, acaoSugerida: acaoSugerida, prioridade: prioridade, contexto: { comMatch: comMatch.length, semMatch: semMatch.length, visitasHoje: visitasHoje.length, visitasPend: visitasPend.length, leadsQuentes: leadsQuentes.length } };
}

function gerarContextoRico(raciocinio, btn, chip) {
  if (!raciocinio.conclusoes.length) return null;
  var html = '';
  if (raciocinio.prioridade === 'urgente') html += '<div style="background:#fee2e2;border-left:3px solid #ef4444;border-radius:8px;padding:8px 12px;margin-bottom:8px">🚨 <strong>Atenção urgente!</strong> ' + raciocinio.conclusoes[0] + '</div>';
  return html;
}

module.exports = { raciocinar, gerarContextoRico };
