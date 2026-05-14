'use strict';
var memoriaConversa = require('./memoria-conversa');

function resolverReferencia(userId, texto, leads, imoveis, visitas) {
  var t = String(texto).toLowerCase();
  var resultado = { lead: null, imovel: null, visita: null, resolveu: false };
  var pronomes = /\b(ele|ela|esse|essa|mesmo|mesma|o mesmo|a mesma|dele|dela|aquele|aquela|o cara|a menina|o cliente|a cliente|esse lead|essa lead)\b/;
  if (!pronomes.test(t)) return resultado;

  var ctx = memoriaConversa.contextoAtual(userId);
  resultado.resolveu = true;

  // Resolve lead pelo nome mencionado anteriormente
  if (ctx.nomeLead) {
    resultado.lead = leads.find(function(l){ return (l.nome||l.name||'').toLowerCase().includes(ctx.nomeLead.toLowerCase()); });
  }
  // Resolve lead pelo bairro mencionado
  if (!resultado.lead && ctx.bairro) {
    resultado.lead = leads.find(function(l){ return l.bairro && l.bairro.toLowerCase().includes(ctx.bairro.toLowerCase()) && l.matchesBase && l.matchesBase.length > 0; });
  }
  // Resolve imóvel
  if (ctx.bairro) {
    resultado.imovel = imoveis.find(function(i){ return i.status !== 'inativo' && i.bairro && i.bairro.toLowerCase().includes(ctx.bairro.toLowerCase()); });
  }
  // Resolve visita
  if (ctx.nomeLead) {
    resultado.visita = visitas.find(function(v){ return (v.nome||v.leadNome||'').toLowerCase().includes(ctx.nomeLead.toLowerCase()); });
  }

  return resultado;
}

function responderComContexto(userId, texto, ref, btn, chip) {
  if (!ref.resolveu) return null;
  var t = String(texto).toLowerCase();

  if (ref.lead) {
    var l = ref.lead;
    var tel = l.telefone || l.contato || l.celular || '';
    var qtdMatch = (l.matchesBase||[]).length;

    if (/vitrine|link|oferta|opcoes|imoveis/.test(t)) {
      var url = 'https://matchimoveis.onrender.com/cliente/oferta/' + (l.id||l._id);
      return '<div style="background:#f0fdf4;border-radius:10px;padding:14px">🔗 <strong>Vitrine de ' + (l.nome||l.name||'Lead') + '</strong><br><span style="color:#666;font-size:12px">' + (l.bairro||'') + ' · ' + (l.tipo||'') + ' · ' + qtdMatch + ' imóvel(is)</span><br><br><a href="' + url + '" target="_blank" style="background:#ff385c;color:white;padding:8px 16px;border-radius:8px;text-decoration:none;font-weight:700">🔗 Abrir vitrine</a></div>';
    }
    if (/whatsapp|ligar|contato|falar|numero|telefone/.test(t)) {
      if (!tel) return 'Não tenho telefone cadastrado para <strong>' + (l.nome||l.name) + '</strong>.<br><br>' + btn('Ver lead','/app/leads');
      return '<div style="background:#f9f9f9;border-radius:10px;padding:12px">📱 <strong>' + (l.nome||l.name) + '</strong><br>' + tel + (l.bairro?' · '+l.bairro:'') + '<br><br><a href="https://wa.me/55' + String(tel).replace(/\D/g,'') + '" target="_blank" style="background:#25d366;color:white;padding:8px 16px;border-radius:8px;text-decoration:none;font-weight:700">📱 WhatsApp</a></div>';
    }
    if (/match|combinou|imovel|opcao/.test(t)) {
      if (qtdMatch === 0) return '<strong>' + (l.nome||l.name) + '</strong> ainda não tem match. Rode o match base interna.<br><br>' + chip('Fazer match','fazer match agora');
      return '<strong>' + (l.nome||l.name) + '</strong> tem <strong>' + qtdMatch + ' imóvel(is)</strong> em match!<br><br>' + btn('Ver vitrine','/cliente/oferta/'+(l.id||l._id));
    }
    // Resposta geral sobre a lead
    return '<div style="background:#f9f9f9;border-radius:10px;padding:12px">👤 <strong>' + (l.nome||l.name||'Lead') + '</strong><br>📍 ' + (l.bairro||'—') + ' · 🏠 ' + (l.tipo||'—') + ' · 🎯 ' + qtdMatch + ' match(es)<br>' + (tel?'📱 '+tel+'<br>':'') + '<br>' + btn('Ver lead','/app/leads') + '</div>';
  }

  if (ref.imovel) {
    var i = ref.imovel;
    return '<div style="background:#f9f9f9;border-radius:10px;padding:12px">🏠 <strong>' + (i.tipo||'Imóvel') + '</strong> — ' + (i.bairro||'—') + '<br>' + (i.quartos?i.quartos+' quartos · ':'') + (i.valor_imovel?'R$ '+Number(i.valor_imovel).toLocaleString('pt-BR'):'') + '<br><br>' + btn('Ver imóvel','/app/imovel/'+(i.id||i._id)) + '</div>';
  }

  return null;
}

module.exports = { resolverReferencia, responderComContexto };
