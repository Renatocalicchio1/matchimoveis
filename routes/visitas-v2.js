// ── ROTAS DE VISITA v2 — fluxo completo 3 casos ──────────────────────────────
const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');

const EVOLUTION_URL = process.env.EVOLUTION_URL || 'https://match-evolution-api.onrender.com';
const EVOLUTION_KEY = process.env.EVOLUTION_KEY || 'match2025evolution';
const BASE_URL = process.env.RENDER ? 'https://matchimoveis.onrender.com' : (process.env.BASE_URL || 'http://localhost:3000');

async function getVisita(id) {
  const { query } = require('../services/db');
  const r = await query('SELECT * FROM visitas WHERE id=$1', [id]);
  if (!r.rows.length) return null;
  return rowToVisita(r.rows[0]);
}

async function updateVisita(id, campos) {
  const { query } = require('../services/db');
  const keys = Object.keys(campos);
  const vals = Object.values(campos);
  const set = keys.map((k, i) => `${k}=$${i+1}`).join(', ');
  await query(`UPDATE visitas SET ${set}, atualizado_em=NOW() WHERE id=$${keys.length+1}`, [...vals, id]);
}

function rowToVisita(row) {
  return {
    id: row.id, leadId: row.lead_id, nome: row.nome, telefone: row.telefone,
    contato: row.contato, imovelId: row.imovel_id, imovelTitulo: row.imovel_titulo,
    imovelBairro: row.imovel_bairro, dataVisita: row.data_visita, horaVisita: row.hora_visita,
    status: row.status, origem: row.origem, userId: row.user_id, corretorId: row.corretor_id,
    ownerUserId: row.owner_user_id, imovelUsuarioId: row.imovel_usuario_id,
    proprietarioNome: row.proprietario_nome, proprietarioTelefone: row.proprietario_telefone,
    respostaProprietario: row.resposta_proprietario,
    confirmacaoClienteStatus: row.confirmacao_cliente_status,
    obs: row.obs, ...(row.dados || {})
  };
}

function dataPath(f) {
  if (process.env.RENDER) return path.join('/opt/render/project/src/data', f);
  return path.join(__dirname, '..', f);
}
function lerUsers() { try { return JSON.parse(fs.readFileSync(dataPath('users.json'),'utf8')); } catch(e) { return []; } }

async function lerLeadsByTel(tel) {
  try {
    const { query } = require('../services/db');
    const t = tel.replace(/\D/g,'').slice(-8);
    const r = await query("SELECT * FROM leads WHERE RIGHT(regexp_replace(telefone,'[^0-9]','','g'),8)=$1", [t]);
    return r.rows;
  } catch(e) { return []; }
}

async function notificar(userId, tipo, titulo, mensagem) {
  try {
    const { criarNotificacao } = require('../services/salvarNotificacao');
    await criarNotificacao({ id: Date.now().toString(), tipo, titulo, mensagem, usuarioId: userId, lida: false, criadaEm: new Date().toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo'}) });
  } catch(e) { console.error('[notificar]', e.message); }
}

async function enviarWA(instancia, numero, texto) {
  try {
    const num = String(numero).replace(/\D/g,'');
    if (!num || !instancia) return;
    await fetch(`${EVOLUTION_URL}/message/sendText/${instancia}`, {
      method:'POST', headers:{'Content-Type':'application/json','apikey':EVOLUTION_KEY},
      body:JSON.stringify({number:num,text:texto})
    });
  } catch(e) { console.error('[VISITA WA]', e.message); }
}

function getInstancia(userId) {
  const users = lerUsers();
  const u = users.find(u => u.id === userId);
  return u?.whatsappInstance || 'match-corretor';
}

function detectarCaso(visita) {
  if (visita.proprietarioTelefone) return 'caso1';
  if (visita.imovelUsuarioId && visita.imovelUsuarioId !== visita.userId) return 'caso3';
  return 'caso2';
}

async function dispararProprietario(visita) {
  const linkProp = `${BASE_URL}/proprietario/visita/${visita.id}`;
  const msg = `Olá! Sou da MatchImóveis.\n\nTemos um cliente interessado em visitar o imóvel *${visita.imovelTitulo||'seu imóvel'}*.\n\nData solicitada: *${visita.dataVisita||'a combinar'}*${visita.horaVisita?' às '+visita.horaVisita:''}\nCliente: ${visita.nome||'não informado'}\n\nPor favor confirme:\n${linkProp}`;
  await enviarWA(getInstancia(visita.userId), visita.proprietarioTelefone, msg);
}

async function notificarCorretorManual(visita) {
  const users = lerUsers();
  const corretor = users.find(u => u.id === visita.userId);
  const telCorretor = (corretor?.celular||corretor?.telefone||'').replace(/\D/g,'');
  if (telCorretor) {
    const msg = `MatchImóveis 🏠\n\nNova solicitação de visita!\n\nCliente: *${visita.nome}*\nTelefone: ${visita.telefone}\nImóvel: ${visita.imovelTitulo||'não informado'}\nData: *${visita.dataVisita||'a combinar'}*\n\n${BASE_URL}/app/visitas`;
    await enviarWA(getInstancia(visita.userId), telCorretor, msg);
  }
  await notificar(visita.userId,'visita_manual','Nova visita — confirmar manualmente',`Visita de ${visita.nome} para ${visita.imovelTitulo} aguarda confirmação.`);
}

async function dispararParceiro(visita) {
  const users = lerUsers();
  const parceiro = users.find(u => u.id === visita.imovelUsuarioId);
  const telParceiro = (parceiro?.celular||parceiro?.telefone||'').replace(/\D/g,'');
  if (telParceiro) {
    const linkParceiro = `${BASE_URL}/parceiro/visita/${visita.id}`;
    const msg = `Olá ${parceiro?.nome||''}! Sou da MatchImóveis.\n\nTenho um cliente interessado no imóvel *${visita.imovelTitulo||''}*.\nData: *${visita.dataVisita||'a combinar'}*\nCliente: ${visita.nome||''}\n\nConfirme aqui:\n${linkParceiro}`;
    await enviarWA(getInstancia(visita.imovelUsuarioId), telParceiro, msg);
  }
  await notificar(visita.userId,'visita_parceiro','Aguardando confirmação do parceiro',`Visita de ${visita.nome} para ${visita.imovelTitulo}. Parceiro notificado.`);
}

async function dispararCliente(visita) {
  const linkCliente = `${BASE_URL}/cliente/visita/${visita.id}`;
  const tel = (visita.telefone||visita.contato||'').replace(/\D/g,'');
  if (!tel) return;
  const msg = `Olá *${visita.nome||''}*! Sua visita foi confirmada! 🎉\n\nImóvel: *${visita.imovelTitulo||''}*\nData: *${visita.dataVisita}*${visita.horaVisita?' às '+visita.horaVisita:''}\n\nConfirme sua presença:\n${linkCliente}`;
  await enviarWA(getInstancia(visita.userId), tel, msg);
}

async function dispararLembrete(visita) {
  const tel = (visita.telefone||visita.contato||'').replace(/\D/g,'');
  const instancia = getInstancia(visita.userId);
  const users = lerUsers();
  const corretor = users.find(u => u.id === visita.userId);
  const telCorretor = (corretor?.celular||corretor?.telefone||'').replace(/\D/g,'');
  if (tel) await enviarWA(instancia, tel, `Lembrete MatchImóveis 🏠\n\nSua visita ao *${visita.imovelTitulo||''}* é hoje!\n⏰ *${visita.horaVisita||'a combinar'}*`);
  if (visita.proprietarioTelefone) await enviarWA(instancia, visita.proprietarioTelefone, `Lembrete MatchImóveis 🏠\n\nA visita ao seu imóvel é hoje!\n⏰ *${visita.horaVisita||'a combinar'}*\nCliente: ${visita.nome||''}`);
  if (telCorretor) await enviarWA(instancia, telCorretor, `Lembrete MatchImóveis 🏠\n\nVisita hoje!\nCliente: *${visita.nome}*\nImóvel: ${visita.imovelTitulo||''}\n⏰ ${visita.horaVisita||'a combinar'}`);
}

function auth(req,res,next){ if(req.session&&req.session.user) return next(); res.redirect('/login'); }

// ── PROPRIETÁRIO ──────────────────────────────────────────────────────────────
router.get('/proprietario/visita/:id', async (req,res) => {
  try {
    const visita = await getVisita(req.params.id);
    if (!visita) return res.status(404).send('Visita não encontrada');
    res.render('proprietario-visita',{visita});
  } catch(e) { res.status(500).send('Erro: ' + e.message); }
});

router.post('/proprietario/visita/:id/responder', async (req,res) => {
  try {
    const visita = await getVisita(req.params.id);
    if (!visita) return res.status(404).send('Visita não encontrada');
    const {resposta, novadata, novaHora} = req.body;
    if (resposta === 'confirmar') {
      await updateVisita(visita.id, { status: 'prop_confirmou', resposta_proprietario: 'confirmar' });
      await notificar(visita.userId,'prop_confirmou','Proprietário confirmou!',`Proprietário confirmou visita de ${visita.nome} para ${visita.imovelTitulo}.`);
      setImmediate(()=>dispararCliente({...visita, status:'prop_confirmou'}));
    } else if (resposta === 'remarcar') {
      await updateVisita(visita.id, { status: 'prop_remarcou', resposta_proprietario: 'remarcar', data_visita: novadata||visita.dataVisita, hora_visita: novaHora||visita.horaVisita });
      await notificar(visita.userId,'prop_remarcou','Proprietário pediu remarcação',`Proprietário do ${visita.imovelTitulo} pediu nova data.`);
      const tel = (visita.telefone||visita.contato||'').replace(/\D/g,'');
      const linkRemarcar = `${BASE_URL}/cliente/visita/${visita.id}/remarcar`;
      setImmediate(()=>enviarWA(getInstancia(visita.userId), tel, `Olá *${visita.nome}*! O proprietário não pode receber você na data solicitada.\n\nEscolha uma nova data:\n${linkRemarcar}`));
    } else if (resposta === 'indisponivel') {
      await updateVisita(visita.id, { status: 'cancelada', resposta_proprietario: 'indisponivel' });
      await notificar(visita.userId,'imovel_indisponivel','Imóvel indisponível',`Proprietário informou que ${visita.imovelTitulo} está indisponível.`);
      const tel = (visita.telefone||visita.contato||'').replace(/\D/g,'');
      const leads = await lerLeadsByTel(tel);
      if (leads[0]) {
        const linkVitrine = `${BASE_URL}/cliente/oferta/${leads[0].id}?userId=${visita.userId}`;
        setImmediate(()=>enviarWA(getInstancia(visita.userId), tel, `Olá *${visita.nome}*! Infelizmente o imóvel não está mais disponível.\n\nMas separamos outras opções:\n${linkVitrine}`));
      }
    }
    const visitaAtualizada = await getVisita(req.params.id);
    res.render('proprietario-confirmado',{resposta, visita: visitaAtualizada||visita});
  } catch(e) { res.status(500).send('Erro: ' + e.message); }
});

// ── CLIENTE ───────────────────────────────────────────────────────────────────
router.get('/cliente/visita/:id', async (req,res) => {
  try {
    const visita = await getVisita(req.params.id);
    if (!visita) return res.status(404).send('Visita não encontrada');
    res.render('cliente-visita-confirmar', {visita, user: null});
  } catch(e) { res.status(500).send('Erro: ' + e.message); }
});

router.post('/cliente/visita/:id/confirmar', async (req,res) => {
  try {
    const visita = await getVisita(req.params.id);
    if (!visita) return res.status(404).send('Visita não encontrada');
    await updateVisita(visita.id, { status: 'confirmada', confirmacao_cliente_status: 'CONFIRMADO' });
    await notificar(visita.userId,'cliente_confirmou','🎉 Cliente confirmou!',`${visita.nome} confirmou presença na visita.`);
    try {
      const dataV = new Date(visita.dataVisita+'T'+(visita.horaVisita||'09:00')+':00').getTime();
      const diff = dataV - (8*60*60*1000) - Date.now();
      if (diff > 0) setTimeout(()=>dispararLembrete(visita), diff);
    } catch(e) {}
    res.render('cliente-confirmado',{visita:{...visita,status:'confirmada'},status:'confirmado'});
  } catch(e) { res.status(500).send('Erro: ' + e.message); }
});

router.post('/cliente/visita/:id/recusar', async (req,res) => {
  try {
    const visita = await getVisita(req.params.id);
    if (!visita) return res.status(404).send('Visita não encontrada');
    await updateVisita(visita.id, { status: 'cliente_nao_vai', confirmacao_cliente_status: 'RECUSADO' });
    await notificar(visita.userId,'cliente_recusou','Cliente não vai comparecer',`${visita.nome} não poderá comparecer à visita.`);
    const tel = (visita.telefone||visita.contato||'').replace(/\D/g,'');
    const leads = await lerLeadsByTel(tel);
    if (leads[0]) {
      const linkVitrine = `${BASE_URL}/cliente/oferta/${leads[0].id}?userId=${visita.userId}`;
      setImmediate(()=>enviarWA(getInstancia(visita.userId), tel, `Tudo bem *${visita.nome}*! Quando quiser, temos outras opções:\n${linkVitrine} 😊`));
    }
    res.render('cliente-confirmado',{visita:{...visita,status:'cliente_nao_vai'},status:'recusado'});
  } catch(e) { res.status(500).send('Erro: ' + e.message); }
});

router.get('/cliente/visita/:id/remarcar', async (req,res) => {
  try {
    const visita = await getVisita(req.params.id);
    if (!visita) return res.status(404).send('Visita não encontrada');
    res.render('cliente-remarcar',{visita});
  } catch(e) { res.status(500).send('Erro: ' + e.message); }
});

router.post('/cliente/visita/:id/remarcar', async (req,res) => {
  try {
    const visita = await getVisita(req.params.id);
    if (!visita) return res.status(404).send('Visita não encontrada');
    const {novaData, novaHora} = req.body;
    await updateVisita(visita.id, { status: 'cliente_nova_data', data_visita: novaData||visita.dataVisita, hora_visita: novaHora||visita.horaVisita });
    await notificar(visita.userId,'cliente_remarcou','Cliente solicitou nova data',`${visita.nome} solicitou nova data: ${novaData}.`);
    const visitaAtualizada = await getVisita(req.params.id);
    const caso = detectarCaso(visitaAtualizada);
    if (caso==='caso1') setImmediate(()=>dispararProprietario(visitaAtualizada));
    else if (caso==='caso3') setImmediate(()=>dispararParceiro(visitaAtualizada));
    res.render('cliente-confirmado',{visita:visitaAtualizada,status:'remarcado'});
  } catch(e) { res.status(500).send('Erro: ' + e.message); }
});

// ── APP — corretor ────────────────────────────────────────────────────────────
router.post('/app/visitas/confirmar/:id', auth, async (req,res) => {
  try {
    const visita = await getVisita(req.params.id);
    if (visita) { await updateVisita(visita.id, { status: 'prop_confirmou' }); setImmediate(()=>dispararCliente({...visita,status:'prop_confirmou'})); }
    res.redirect('/app/visitas');
  } catch(e) { res.redirect('/app/visitas'); }
});

router.post('/app/visitas/cancelar/:id', auth, async (req,res) => {
  try { await updateVisita(req.params.id, { status: 'cancelada' }); } catch(e) {}
  res.redirect('/app/visitas');
});

router.post('/app/visitas/concluir/:id', auth, async (req,res) => {
  try {
    const visita = await getVisita(req.params.id);
    if (visita) {
      await updateVisita(visita.id, { status: 'realizada' });
      const tel = (visita.telefone||visita.contato||'').replace(/\D/g,'');
      if (tel) setTimeout(()=>enviarWA(getInstancia(visita.userId), tel, `Olá *${visita.nome}*! Como foi a visita ao ${visita.imovelTitulo}? Gostou? 🏠`), 2*60*60*1000);
    }
  } catch(e) {}
  res.redirect('/app/visitas');
});

router.post('/app/visitas/remarcar/:id', auth, async (req,res) => {
  try {
    const visita = await getVisita(req.params.id);
    if (visita) {
      const {novaData, novaHora} = req.body;
      await updateVisita(visita.id, { status: 'remarcada', data_visita: novaData||visita.dataVisita, hora_visita: novaHora||visita.horaVisita });
      const v2 = await getVisita(req.params.id);
      const caso = detectarCaso(v2);
      if (caso==='caso1') setImmediate(()=>dispararProprietario(v2));
      else if (caso==='caso2') setImmediate(()=>notificarCorretorManual(v2));
      else if (caso==='caso3') setImmediate(()=>dispararParceiro(v2));
    }
  } catch(e) {}
  res.redirect('/app/visitas');
});

router.post('/app/visitas/parceiro-confirmou/:id', auth, async (req,res) => {
  try {
    const visita = await getVisita(req.params.id);
    if (visita) {
      await updateVisita(visita.id, { status: 'prop_confirmou' });
      await notificar(visita.userId,'parceiro_confirmou','Parceiro confirmou!',`Parceiro confirmou disponibilidade. Avise o cliente!`);
      setImmediate(()=>dispararCliente({...visita,status:'prop_confirmou'}));
    }
  } catch(e) {}
  res.redirect('/app/visitas');
});

// ── PARCEIRO ──────────────────────────────────────────────────────────────────
router.get('/parceiro/visita/:id', async (req, res) => {
  try {
    const visita = await getVisita(req.params.id);
    if (!visita) return res.status(404).send('Visita não encontrada');
    res.render('parceiro-visita', { visita });
  } catch(e) { res.status(500).send('Erro: ' + e.message); }
});

router.post('/parceiro/visita/:id/responder', async (req, res) => {
  try {
    const visita = await getVisita(req.params.id);
    if (!visita) return res.status(404).send('Visita não encontrada');
    const { resposta } = req.body;
    const users = lerUsers();
    const corretorDono = users.find(u => u.id === visita.userId);
    const telCorretorDono = (corretorDono?.celular || corretorDono?.telefone || '').replace(/\D/g, '');
    const instanciaDono = getInstancia(visita.userId);
    const parceiro = users.find(u => u.id === visita.imovelUsuarioId);
    if (resposta === 'confirmar') {
      await updateVisita(visita.id, { status: 'prop_confirmou' });
      if (telCorretorDono) setImmediate(()=>enviarWA(instanciaDono, telCorretorDono, `MatchImóveis 🏠\n\n✅ *${parceiro?.nome||'Parceiro'}* confirmou o imóvel!\n*${visita.imovelTitulo||''}*\nCliente: ${visita.nome||''}`));
      await notificar(visita.userId,'parceiro_confirmou','✅ Parceiro confirmou!',`${parceiro?.nome||'Parceiro'} confirmou disponibilidade do ${visita.imovelTitulo}.`);
      setImmediate(()=>dispararCliente({...visita,status:'prop_confirmou'}));
    } else if (resposta === 'indisponivel') {
      await updateVisita(visita.id, { status: 'cancelada' });
      if (telCorretorDono) setImmediate(()=>enviarWA(instanciaDono, telCorretorDono, `MatchImóveis 🏠\n\n❌ *${parceiro?.nome||'Parceiro'}* informou indisponibilidade do ${visita.imovelTitulo}.`));
      await notificar(visita.userId,'parceiro_indisponivel','❌ Parceiro indisponível',`${parceiro?.nome||'Parceiro'} informou indisponibilidade do ${visita.imovelTitulo}.`);
      const tel = (visita.telefone||visita.contato||'').replace(/\D/g,'');
      const leads = await lerLeadsByTel(tel);
      if (leads[0]) {
        const linkVitrine = `${BASE_URL}/cliente/oferta/${leads[0].id}?userId=${visita.userId}`;
        setImmediate(()=>enviarWA(instanciaDono, tel, `Olá *${visita.nome}*! Infelizmente o imóvel não está disponível nesta data.\n\nMas separamos outras opções:\n${linkVitrine}`));
      }
    }
    const visitaAtualizada = await getVisita(req.params.id);
    res.render('parceiro-confirmado', { resposta, visita: visitaAtualizada||visita, parceiro });
  } catch(e) { res.status(500).send('Erro: ' + e.message); }
});

// ── JOB lembrete 8h antes ─────────────────────────────────────────────────────
setInterval(async () => {
  try {
    const { query } = require('../services/db');
    const r = await query("SELECT * FROM visitas WHERE status='confirmada'");
    const agora = Date.now();
    const oitoH = 8*60*60*1000;
    const umaH = 60*60*1000;
    for (const row of r.rows) {
      const v = rowToVisita(row);
      if (!v.dataVisita) continue;
      const dataV = new Date(v.dataVisita+'T'+(v.horaVisita||'09:00')+':00').getTime();
      const diff = dataV - agora;
      if (diff > 0 && diff <= oitoH && diff >= (oitoH-umaH)) {
        await dispararLembrete(v);
      }
    }
  } catch(e) { console.error('[JOB LEMBRETE]', e.message); }
}, 60*60*1000);

module.exports = router;
