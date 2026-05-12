'use strict';

const fs = require('fs');
const path = require('path');

function dataPath(file){
  const DATA_DIR =
    process.env.DATA_DIR ||
    path.join(process.cwd());

  return path.join(DATA_DIR, file);
}

function loadJSON(file, fallback=[]){
  try{
    const p = dataPath(file);
    if(!fs.existsSync(p)) return fallback;
    return JSON.parse(fs.readFileSync(p,'utf8'));
  }catch(e){
    return fallback;
  }
}

function normalizar(txt=''){
  return String(txt || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g,'')
    .trim();
}

function responder(mensagem='', user={}){

  const m = normalizar(mensagem);

  if(
    !/notificacao|notificacoes|avisos|alertas|pendencias|pendentes|novidades|novas visitas|quem pediu visita/.test(m)
  ){
    return null;
  }

  const notificacoes = loadJSON('notificacoes.json', []);
  const visitas = loadJSON('visitas.json', []);
  const leads = loadJSON('data.json', []);

  const userId =
    user.id ||
    user.userId ||
    '';

  const minhasNotificacoes = notificacoes.filter(n =>
    String(n.usuarioId || '') === String(userId)
  );

  const minhasVisitas = visitas.filter(v =>
    String(v.leadOwnerId || v.imovelOwnerId || v.userId || '') === String(userId)
  );

  const visitasPendentes = minhasVisitas.filter(v =>
    !v.status ||
    v.status === 'solicitada' ||
    v.status === 'pendente'
  );

  const ultimas = minhasNotificacoes
    .slice(-5)
    .reverse();

  let html = '';

  html += '🔔 <strong>Central de notificações</strong><br><br>';

  html +=
    '📬 Notificações: <strong>' + minhasNotificacoes.length + '</strong><br>' +
    '📅 Visitas pendentes: <strong>' + visitasPendentes.length + '</strong><br><br>';

  if(ultimas.length){

    html += '<strong>Últimos avisos:</strong><br><br>';

    ultimas.forEach((n,i)=>{

      html +=
        (i+1) + '. ' +
        (n.titulo || n.tipo || 'Notificação') +
        '<br>';

      if(n.imovelId){
        html += '🏠 ' + n.imovelId + '<br>';
      }

      if(n.leadId){

        const lead = leads.find(l =>
          String(l.id || l.leadId || '') === String(n.leadId)
        );

        if(lead){
          html += '👤 ' + (lead.nome || lead.email || 'Lead') + '<br>';
        }
      }

      html += '<br>';
    });

  } else {

    html += '✅ Nenhuma notificação pendente.<br><br>';
  }

  html +=
    '<a href="/app/visitas" style="color:#ff385c;font-weight:700">Abrir visitas →</a>';

  return html;
}

module.exports = {
  responder
};
