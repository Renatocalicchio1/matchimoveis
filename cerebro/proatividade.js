'use strict';

function gerarAbertura(user, leads, imoveis, visitas, notificacoes) {
  const userId = String(user.id || user.codigoUsuario || '');
  const nome = user.nome || user.name || 'Corretor';
  const hora = new Date().getHours();
  const saudacao = hora < 12 ? 'Bom dia' : hora < 18 ? 'Boa tarde' : 'Boa noite';
  const hoje = new Date().toISOString().slice(0,10);
  const alertas = [];
  const acoes = [];

  const visitasHoje = (visitas||[]).filter(function(v){ return (v.dataVisita||'').slice(0,10) === hoje; });
  if (visitasHoje.length > 0)
    alertas.push('📅 <strong>' + visitasHoje.length + ' visita(s) hoje</strong> — ' + visitasHoje.slice(0,2).map(function(v){ return (v.nome||v.leadNome||'Lead') + ' às ' + (v.horaVisita||'?'); }).join(', '));

  const pendProp = (visitas||[]).filter(function(v){ return v.status === 'pendente' || v.status === 'solicitada'; });
  if (pendProp.length > 0)
    alertas.push('⚠️ <strong>' + pendProp.length + ' visita(s) aguardando</strong> confirmação do proprietário');

  const comMatchSemVisita = (leads||[]).filter(function(l){ return l.matchesBase && l.matchesBase.length > 0 && !(visitas||[]).some(function(v){ return String(v.leadId||'') === String(l.id||''); }); });
  if (comMatchSemVisita.length > 0)
    acoes.push('🎯 <strong>' + comMatchSemVisita.length + ' lead(s)</strong> com match prontas para receber vitrine');

  const semMatch = (leads||[]).filter(function(l){ return !l.matchesBase || l.matchesBase.length === 0; });
  if (semMatch.length > 5)
    acoes.push('❌ <strong>' + semMatch.length + ' leads</strong> ainda sem match — rode o match base interna');

  const semProp = (imoveis||[]).filter(function(i){ return i.status !== 'inativo' && String(i.userId||i.usuarioId||i.corretorId||'') === userId && (!i.proprietario || !i.proprietario.telefone); });
  if (semProp.length > 0)
    acoes.push('👤 <strong>' + semProp.length + ' imóvel(is)</strong> sem proprietário cadastrado');

  const notifs = (notificacoes||[]).filter(function(n){ return !n.lida && String(n.userId||n.usuarioId||n.corretorId||'') === userId; });
  if (notifs.length > 0)
    alertas.push('🔔 <strong>' + notifs.length + ' notificação(ões)</strong> não lida(s)');

  const chipBtn = function(label, msg){ return '<button onclick="enviarMsg(' + "'" + msg + "'" + ')" style="background:#f3f4f6;border:none;border-radius:20px;padding:8px 14px;margin:4px;cursor:pointer;font-weight:600;font-size:13px">' + label + '</button>'; };
  const chipRed = function(label, msg){ return '<button onclick="enviarMsg(' + "'" + msg + "'" + ')" style="background:#ff385c;color:white;border:none;border-radius:20px;padding:8px 14px;margin:4px;cursor:pointer;font-weight:600;font-size:13px">' + label + '</button>'; };

  if (!alertas.length && !acoes.length) {
    return saudacao + ', <strong>' + nome + '</strong>! 👋 Tudo em dia por aqui. O que posso fazer por você?<br><br>' +
      chipBtn('📊 Resumo do dia', 'resumo do dia') +
      chipBtn('🔥 Leads quentes', 'leads quentes') +
      chipBtn('📍 Mercado', 'demanda por bairro');
  }

  var html = saudacao + ', <strong>' + nome + '</strong>! 👋<br><br>';

  if (alertas.length) {
    html += '<strong>⚠️ Atenção agora:</strong><br>';
    alertas.forEach(function(a){ html += '<div style="background:#fff8f0;border-left:3px solid #f59e0b;border-radius:8px;padding:8px 12px;margin:4px 0">' + a + '</div>'; });
    html += '<br>';
  }

  if (acoes.length) {
    html += '<strong>✅ Para fazer hoje:</strong><br>';
    acoes.forEach(function(a){ html += '<div style="background:#f0f9ff;border-left:3px solid #3b82f6;border-radius:8px;padding:8px 12px;margin:4px 0">' + a + '</div>'; });
    html += '<br>';
  }

  html += chipRed('🧠 Plano do dia', 'o que devo fazer hoje') +
    chipBtn('🔥 Leads quentes', 'leads quentes') +
    chipBtn('📍 Mercado', 'demanda por bairro');

  return html;
}

module.exports = { gerarAbertura };
