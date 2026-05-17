// ── ROTAS DE VISITA v2 — fluxo completo 3 casos ──────────────────────────────
const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');

const EVOLUTION_URL = process.env.EVOLUTION_URL || 'https://match-evolution-api.onrender.com';
const EVOLUTION_KEY = process.env.EVOLUTION_KEY || 'match2025evolution';
const BASE_URL = process.env.RENDER ? 'https://matchimoveis.onrender.com' : (process.env.BASE_URL || 'http://localhost:3000');

function dataPath(f) {
  if (process.env.RENDER) return path.join('/opt/render/project/src', f);
  return path.join(__dirname, '..', f);
}
function lerVisitas() { try { return JSON.parse(fs.readFileSync(dataPath('visitas.json'),'utf8')); } catch(e) { return []; } }
function salvarVisitas(v) { fs.writeFileSync(dataPath('visitas.json'), JSON.stringify(v,null,2)); }
function lerUsers() { try { return JSON.parse(fs.readFileSync(dataPath('users.json'),'utf8')); } catch(e) { return []; } }
function lerLeads() { try { return JSON.parse(fs.readFileSync(dataPath('data.json'),'utf8')); } catch(e) { return []; } }
function lerImoveis() { try { return JSON.parse(fs.readFileSync(dataPath('imoveis.json'),'utf8')); } catch(e) { return []; } }

function notificar(userId, tipo, titulo, mensagem) {
  try {
    const p = dataPath('notificacoes.json');
    const notifs = fs.existsSync(p) ? JSON.parse(fs.readFileSync(p,'utf8')) : [];
    notifs.push({ id: Date.now().toString(), tipo, titulo, mensagem, usuarioId: userId, lida: false, criadaEm: new Date().toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo'}) });
    fs.writeFileSync(p, JSON.stringify(notifs,null,2));
  } catch(e) {}
}

async function enviarWA(instancia, numero, texto) {
  try {
    const num = String(numero).replace(/\D/g,'');
    if (!num || !instancia) return;
    await fetch(`${EVOLUTION_URL}/message/sendText/${instancia}`, {
      method:'POST',
      headers:{'Content-Type':'application/json','apikey':EVOLUTION_KEY},
      body:JSON.stringify({number:num,text:texto})
    });
    console.log('[VISITA WA] enviado para',num,'via',instancia);
  } catch(e) { console.error('[VISITA WA] erro:',e.message); }
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
  const msg = `Olá! Sou da MatchImóveis.\n\nTemos um cliente interessado em visitar o imóvel *${visita.imovelTitulo||'seu imóvel'}*.\n\nData solicitada: *${visita.dataVisita||'a combinar'}*${visita.horaVisita?' às '+visita.horaVisita:''}\nCliente: ${visita.nome||'não informado'}\n\nPor favor confirme a disponibilidade:\n${linkProp}`;
  await enviarWA(getInstancia(visita.userId), visita.proprietarioTelefone, msg);
  try {
    const vs = lerVisitas();
    const idx = vs.findIndex(v=>v.id===visita.id);
    if(idx>=0){ vs[idx].waProprietarioEnviadoEm=new Date().toISOString(); salvarVisitas(vs); }
  } catch(e){}
}

async function notificarCorretorManual(visita) {
  const users = lerUsers();
  const corretor = users.find(u => u.id === visita.userId);
  const telCorretor = (corretor?.celular||corretor?.telefone||'').replace(/\D/g,'');
  if (telCorretor) {
    const msg = `MatchImóveis 🏠\n\nNova solicitação de visita!\n\nCliente: *${visita.nome}*\nTelefone: ${visita.telefone}\nImóvel: ${visita.imovelTitulo||'não informado'}\nData: *${visita.dataVisita||'a combinar'}*${visita.horaVisita?' às '+visita.horaVisita:''}\n\nImóvel sem proprietário cadastrado. Confirme manualmente.\n\n${BASE_URL}/app/visitas`;
    await enviarWA(getInstancia(visita.userId), telCorretor, msg);
  }
  notificar(visita.userId,'visita_manual','Nova visita — confirmar manualmente',`Visita de ${visita.nome} para ${visita.imovelTitulo} em ${visita.dataVisita} aguarda sua confirmação.`);
}

async function dispararParceiro(visita) {
  const users = lerUsers();
  const parceiro = users.find(u => u.id === visita.imovelUsuarioId);
  const telParceiro = (parceiro?.celular||parceiro?.telefone||'').replace(/\D/g,'');
  if (telParceiro) {
    const linkParceiro = `${BASE_URL}/parceiro/visita/${visita.id}`;
    const msg = `Olá ${parceiro?.nome||''}! Sou da MatchImóveis.\n\nTenho um cliente interessado no imóvel *${visita.imovelTitulo||''}*.\n\nData solicitada: *${visita.dataVisita||'a combinar'}*${visita.horaVisita?' às '+visita.horaVisita:''}\nCliente: ${visita.nome||''}\n\nPode verificar disponibilidade com o responsável e confirmar aqui:\n${linkParceiro}\n\nObrigado!`;
    await enviarWA(getInstancia(visita.imovelUsuarioId), telParceiro, msg);
    try {
      const vs = lerVisitas();
      const idx = vs.findIndex(v=>v.id===visita.id);
      if(idx>=0){ vs[idx].waParceiroEnviadoEm=new Date().toISOString(); salvarVisitas(vs); }
    } catch(e){}
  }
  notificar(visita.userId,'visita_parceiro','Aguardando confirmação do parceiro',`Visita de ${visita.nome} para ${visita.imovelTitulo}. Parceiro ${parceiro?.nome||''} foi notificado.`);
}

async function dispararCliente(visita) {
  const linkCliente = `${BASE_URL}/cliente/visita/${visita.id}`;
  const tel = (visita.telefone||visita.contato||'').replace(/\D/g,'');
  if (!tel) return;
  const msg = `Olá *${visita.nome||''}*! Sua visita foi confirmada! 🎉\n\nImóvel: *${visita.imovelTitulo||''}*\nData: *${visita.dataVisita}*${visita.horaVisita?' às '+visita.horaVisita:''}\n\nConfirme sua presença:\n${linkCliente}`;
  await enviarWA(getInstancia(visita.userId), tel, msg);
  try {
    const vs = lerVisitas();
    const idx = vs.findIndex(v=>v.id===visita.id);
    if(idx>=0){ vs[idx].waClienteEnviadoEm=new Date().toISOString(); salvarVisitas(vs); }
  } catch(e){}
}

async function dispararLembrete(visita) {
  const tel = (visita.telefone||visita.contato||'').replace(/\D/g,'');
  const instancia = getInstancia(visita.userId);
  const users = lerUsers();
  const corretor = users.find(u => u.id === visita.userId);
  const telCorretor = (corretor?.celular||corretor?.telefone||'').replace(/\D/g,'');
  if (tel) await enviarWA(instancia, tel, `Lembrete MatchImóveis 🏠\n\nSua visita ao *${visita.imovelTitulo||''}* é hoje!\n⏰ *${visita.horaVisita||'a combinar'}*\n📍 ${visita.imovelBairro||''}\n\nVocê confirma presença?`);
  if (visita.proprietarioTelefone) await enviarWA(instancia, visita.proprietarioTelefone, `Lembrete MatchImóveis 🏠\n\nA visita ao seu imóvel *${visita.imovelTitulo||''}* é hoje!\n⏰ *${visita.horaVisita||'a combinar'}*\nCliente: ${visita.nome||''}`);
  if (telCorretor) await enviarWA(instancia, telCorretor, `Lembrete MatchImóveis 🏠\n\nVisita hoje!\nCliente: *${visita.nome}*\nImóvel: ${visita.imovelTitulo||''}\n⏰ ${visita.horaVisita||'a combinar'}`);
}

function auth(req,res,next){ if(req.session&&req.session.user) return next(); res.redirect('/login'); }

// ── PROPRIETÁRIO ──────────────────────────────────────────────────────────────
router.get('/proprietario/visita/:id', (req,res) => {
  const visita = lerVisitas().find(v => v.id===req.params.id);
  if (!visita) return res.status(404).send('Visita não encontrada');
  res.render('proprietario-visita',{visita});
});

router.post('/proprietario/visita/:id/responder', async (req,res) => {
  const visitas = lerVisitas();
  const idx = visitas.findIndex(v => v.id===req.params.id);
  if (idx===-1) return res.status(404).send('Visita não encontrada');
  const {resposta,novadata,novaHora} = req.body;
  visitas[idx].respostaProprietario = resposta;
  visitas[idx].respostaProprietarioEm = new Date().toISOString();

  if (resposta==='confirmar') {
    visitas[idx].status = 'prop_confirmou';
    visitas[idx].proprietarioConfirmou = true;
    salvarVisitas(visitas);
    notificar(visitas[idx].userId,'prop_confirmou','Proprietário confirmou!',`Proprietário confirmou visita de ${visitas[idx].nome} para ${visitas[idx].imovelTitulo} em ${visitas[idx].dataVisita}.`);
    setImmediate(()=>dispararCliente(visitas[idx]));

  } else if (resposta==='remarcar') {
    visitas[idx].status = 'prop_remarcou';
    visitas[idx].proprietarioConfirmou = false;
    if (novadata) visitas[idx].dataVisitaSugerida = novadata;
    if (novaHora) visitas[idx].horaVisitaSugerida = novaHora;
    salvarVisitas(visitas);
    notificar(visitas[idx].userId,'prop_remarcou','Proprietário pediu remarcação',`Proprietário do ${visitas[idx].imovelTitulo} pediu nova data para visita de ${visitas[idx].nome}.`);
    const tel = (visitas[idx].telefone||visitas[idx].contato||'').replace(/\D/g,'');
    const linkRemarcar = `${BASE_URL}/cliente/visita/${visitas[idx].id}/remarcar`;
    setImmediate(()=>enviarWA(getInstancia(visitas[idx].userId), tel, `Olá *${visitas[idx].nome}*! O proprietário do *${visitas[idx].imovelTitulo}* não pode receber você na data solicitada.\n\nEscolha uma nova data:\n${linkRemarcar}`));

  } else if (resposta==='indisponivel') {
    visitas[idx].status = 'cancelada';
    visitas[idx].motivoCancelamento = 'proprietario_indisponivel';
    salvarVisitas(visitas);
    notificar(visitas[idx].userId,'imovel_indisponivel','Imóvel indisponível',`Proprietário informou que ${visitas[idx].imovelTitulo} está indisponível.`);
    try {
      const imoveis = lerImoveis();
      const ii = imoveis.findIndex(i => String(i.idExterno||i.id)===String(visitas[idx].imovelId));
      if (ii!==-1) { imoveis[ii].status='inativo'; imoveis[ii].inativadoEm=new Date().toISOString(); fs.writeFileSync(dataPath('imoveis.json'),JSON.stringify(imoveis,null,2)); }
    } catch(e) {}
    const tel = (visitas[idx].telefone||visitas[idx].contato||'').replace(/\D/g,'');
    const leads = lerLeads();
    const lead = leads.find(l => (l.telefone||l.contato||'').replace(/\D/g,'').slice(-8)===tel.slice(-8));
    if (lead) {
      const linkVitrine = `${BASE_URL}/cliente/oferta/${lead.id}?userId=${visitas[idx].userId}`;
      setImmediate(()=>enviarWA(getInstancia(visitas[idx].userId), tel, `Olá *${visitas[idx].nome}*! Infelizmente o imóvel *${visitas[idx].imovelTitulo}* não está mais disponível.\n\nMas separamos outras opções para você:\n${linkVitrine}`));
    }
  }

  salvarVisitas(visitas);
  res.render('proprietario-confirmado',{resposta,visita:visitas[idx]});
});

// ── CLIENTE ───────────────────────────────────────────────────────────────────
router.get('/cliente/visita/:id', (req,res) => {
  const visita = lerVisitas().find(v => v.id===req.params.id);
  if (!visita) return res.status(404).send('Visita não encontrada');
  res.render('cliente-visita',{visita});
});

router.post('/cliente/visita/:id/confirmar', async (req,res) => {
  const visitas = lerVisitas();
  const idx = visitas.findIndex(v => v.id===req.params.id);
  if (idx===-1) return res.status(404).send('Visita não encontrada');
  visitas[idx].clienteConfirmou = true;
  visitas[idx].confirmacaoClienteStatus = 'CONFIRMADO';
  visitas[idx].clienteConfirmouEm = new Date().toISOString();
  visitas[idx].status = 'confirmada';
  salvarVisitas(visitas);
  notificar(visitas[idx].userId,'cliente_confirmou','🎉 Cliente confirmou!',`${visitas[idx].nome} confirmou presença na visita ao ${visitas[idx].imovelTitulo} em ${visitas[idx].dataVisita}.`);
  // Agenda lembrete 8h antes
  try {
    const dataVisita = new Date(visitas[idx].dataVisita+'T'+(visitas[idx].horaVisita||'09:00')+':00').getTime();
    const diff = dataVisita - (8*60*60*1000) - Date.now();
    if (diff > 0) setTimeout(()=>dispararLembrete(visitas[idx]), diff);
  } catch(e) {}
  res.render('cliente-confirmado',{visita:visitas[idx],status:'confirmado'});
});

router.post('/cliente/visita/:id/recusar', async (req,res) => {
  const visitas = lerVisitas();
  const idx = visitas.findIndex(v => v.id===req.params.id);
  if (idx===-1) return res.status(404).send('Visita não encontrada');
  visitas[idx].clienteConfirmou = false;
  visitas[idx].confirmacaoClienteStatus = 'RECUSADO';
  visitas[idx].status = 'cliente_nao_vai';
  salvarVisitas(visitas);
  notificar(visitas[idx].userId,'cliente_recusou','Cliente não vai comparecer',`${visitas[idx].nome} não poderá comparecer à visita de ${visitas[idx].imovelTitulo}.`);
  const tel = (visitas[idx].telefone||visitas[idx].contato||'').replace(/\D/g,'');
  const leads = lerLeads();
  const lead = leads.find(l => (l.telefone||l.contato||'').replace(/\D/g,'').slice(-8)===tel.slice(-8));
  if (lead) {
    const linkVitrine = `${BASE_URL}/cliente/oferta/${lead.id}?userId=${visitas[idx].userId}`;
    setImmediate(()=>enviarWA(getInstancia(visitas[idx].userId), tel, `Tudo bem *${visitas[idx].nome}*! Quando quiser, temos outras opções:\n${linkVitrine} 😊`));
  }
  res.render('cliente-confirmado',{visita:visitas[idx],status:'recusado'});
});

router.get('/cliente/visita/:id/remarcar', (req,res) => {
  const visita = lerVisitas().find(v => v.id===req.params.id);
  if (!visita) return res.status(404).send('Visita não encontrada');
  res.render('cliente-remarcar',{visita});
});

router.post('/cliente/visita/:id/remarcar', async (req,res) => {
  const visitas = lerVisitas();
  const idx = visitas.findIndex(v => v.id===req.params.id);
  if (idx===-1) return res.status(404).send('Visita não encontrada');
  const {novaData,novaHora} = req.body;
  visitas[idx].dataVisita = novaData||visitas[idx].dataVisita;
  visitas[idx].horaVisita = novaHora||visitas[idx].horaVisita;
  visitas[idx].status = 'cliente_nova_data';
  visitas[idx].clienteRemarcouEm = new Date().toISOString();
  salvarVisitas(visitas);
  notificar(visitas[idx].userId,'cliente_remarcou','Cliente solicitou nova data',`${visitas[idx].nome} solicitou nova data: ${novaData} para ${visitas[idx].imovelTitulo}.`);
  const caso = detectarCaso(visitas[idx]);
  if (caso==='caso1') setImmediate(()=>dispararProprietario(visitas[idx]));
  else if (caso==='caso3') setImmediate(()=>dispararParceiro(visitas[idx]));
  res.render('cliente-confirmado',{visita:visitas[idx],status:'remarcado'});
});

// ── APP — corretor ────────────────────────────────────────────────────────────
router.post('/app/visitas/confirmar/:id', auth, async (req,res) => {
  const visitas = lerVisitas();
  const idx = visitas.findIndex(v => v.id===req.params.id);
  if (idx===-1) return res.redirect('/app/visitas');
  visitas[idx].status = 'prop_confirmou';
  visitas[idx].proprietarioConfirmou = true;
  visitas[idx].confirmadoManualEm = new Date().toISOString();
  salvarVisitas(visitas);
  setImmediate(()=>dispararCliente(visitas[idx]));
  res.redirect('/app/visitas');
});

router.post('/app/visitas/cancelar/:id', auth, (req,res) => {
  const visitas = lerVisitas();
  const idx = visitas.findIndex(v => v.id===req.params.id);
  if (idx===-1) return res.redirect('/app/visitas');
  visitas[idx].status = 'cancelada';
  visitas[idx].canceladaEm = new Date().toISOString();
  salvarVisitas(visitas);
  res.redirect('/app/visitas');
});

router.post('/app/visitas/concluir/:id', auth, async (req,res) => {
  const visitas = lerVisitas();
  const idx = visitas.findIndex(v => v.id===req.params.id);
  if (idx===-1) return res.redirect('/app/visitas');
  visitas[idx].status = 'realizada';
  visitas[idx].realizadaEm = new Date().toISOString();
  salvarVisitas(visitas);
  const tel = (visitas[idx].telefone||visitas[idx].contato||'').replace(/\D/g,'');
  if (tel) setTimeout(()=>enviarWA(getInstancia(visitas[idx].userId), tel, `Olá *${visitas[idx].nome}*! Como foi a visita ao ${visitas[idx].imovelTitulo}? Gostou? 🏠\n\nPosso te ajudar com alguma dúvida ou mostrar outras opções?`), 2*60*60*1000);
  res.redirect('/app/visitas');
});

router.post('/app/visitas/remarcar/:id', auth, async (req,res) => {
  const visitas = lerVisitas();
  const idx = visitas.findIndex(v => v.id===req.params.id);
  if (idx===-1) return res.redirect('/app/visitas');
  const {novaData,novaHora} = req.body;
  visitas[idx].dataVisita = novaData||visitas[idx].dataVisita;
  visitas[idx].horaVisita = novaHora||visitas[idx].horaVisita;
  visitas[idx].status = 'remarcada';
  visitas[idx].remarcadaEm = new Date().toISOString();
  salvarVisitas(visitas);
  const caso = detectarCaso(visitas[idx]);
  if (caso==='caso1') setImmediate(()=>dispararProprietario(visitas[idx]));
  else if (caso==='caso2') setImmediate(()=>notificarCorretorManual(visitas[idx]));
  else if (caso==='caso3') setImmediate(()=>dispararParceiro(visitas[idx]));
  res.redirect('/app/visitas');
});

router.post('/app/visitas/parceiro-confirmou/:id', auth, async (req,res) => {
  const visitas = lerVisitas();
  const idx = visitas.findIndex(v => v.id===req.params.id);
  if (idx===-1) return res.redirect('/app/visitas');
  visitas[idx].status = 'prop_confirmou';
  visitas[idx].parceiroConfirmou = true;
  visitas[idx].parceiroConfirmouEm = new Date().toISOString();
  salvarVisitas(visitas);
  notificar(visitas[idx].userId,'parceiro_confirmou','Parceiro confirmou!',`Parceiro confirmou disponibilidade do ${visitas[idx].imovelTitulo}. Avise o cliente!`);
  setImmediate(()=>dispararCliente(visitas[idx]));
  res.redirect('/app/visitas');
});

// ── JOB lembrete 8h antes — verifica a cada hora ─────────────────────────────
setInterval(async () => {
  try {
    const visitas = lerVisitas();
    const agora = Date.now();
    const oitoH = 8*60*60*1000;
    const umaH = 60*60*1000;
    for (const v of visitas) {
      if (v.status!=='confirmada'||v.lembreteEnviado||!v.dataVisita) continue;
      const dataV = new Date(v.dataVisita+'T'+(v.horaVisita||'09:00')+':00').getTime();
      const diff = dataV - agora;
      if (diff>0 && diff<=oitoH && diff>=(oitoH-umaH)) {
        console.log('[JOB LEMBRETE] enviando para visita',v.id);
        await dispararLembrete(v);
        const vs2 = lerVisitas();
        const i = vs2.findIndex(x=>x.id===v.id);
        if (i>=0) { vs2[i].lembreteEnviado=true; vs2[i].lembreteEnviadoEm=new Date().toISOString(); salvarVisitas(vs2); }
      }
    }
  } catch(e) { console.error('[JOB LEMBRETE] erro:',e.message); }
}, 60*60*1000);

module.exports = router;

// ── PARCEIRO — confirmação via link ───────────────────────────────────────────
router.get('/parceiro/visita/:id', (req, res) => {
  const visitas = lerVisitas();
  const visita = visitas.find(v => v.id === req.params.id);
  if (!visita) return res.status(404).send('Visita não encontrada');
  res.render('parceiro-visita', { visita });
});

router.post('/parceiro/visita/:id/responder', async (req, res) => {
  const visitas = lerVisitas();
  const idx = visitas.findIndex(v => v.id === req.params.id);
  if (idx === -1) return res.status(404).send('Visita não encontrada');

  const { resposta } = req.body;
  const visita = visitas[idx];
  const users = lerUsers();
  const corretorDono = users.find(u => u.id === visita.userId);
  const telCorretorDono = (corretorDono?.celular || corretorDono?.telefone || '').replace(/\D/g, '');
  const instanciaDono = getInstancia(visita.userId);
  const parceiro = users.find(u => u.id === visita.imovelUsuarioId);

  if (resposta === 'confirmar') {
    visitas[idx].status = 'prop_confirmou';
    visitas[idx].parceiroConfirmou = true;
    visitas[idx].parceiroConfirmouEm = new Date().toISOString();
    salvarVisitas(visitas);

    // WA pro corretor dono da lead avisando que parceiro confirmou
    if (telCorretorDono) {
      const msg = `MatchImóveis 🏠\n\n✅ *${parceiro?.nome || 'Parceiro'}* confirmou disponibilidade do imóvel!\n\n*${visita.imovelTitulo || ''}*\nData: *${visita.dataVisita}*${visita.horaVisita ? ' às ' + visita.horaVisita : ''}\nCliente: ${visita.nome || ''}\n\nO cliente será avisado agora automaticamente!`;
      setImmediate(() => enviarWA(instanciaDono, telCorretorDono, msg));
    }

    notificar(visita.userId, 'parceiro_confirmou', '✅ Parceiro confirmou!', `${parceiro?.nome || 'Parceiro'} confirmou disponibilidade do ${visita.imovelTitulo}. Cliente sendo avisado!`);

    // Dispara WA pro cliente automaticamente
    setImmediate(() => dispararCliente(visitas[idx]));

  } else if (resposta === 'indisponivel') {
    visitas[idx].status = 'cancelada';
    visitas[idx].motivoCancelamento = 'parceiro_indisponivel';
    salvarVisitas(visitas);

    // WA pro corretor dono da lead
    if (telCorretorDono) {
      const msg = `MatchImóveis 🏠\n\n❌ *${parceiro?.nome || 'Parceiro'}* informou que o imóvel *${visita.imovelTitulo || ''}* não está disponível para ${visita.dataVisita}.\n\nOfereca outra opção ao cliente ${visita.nome || ''}.`;
      setImmediate(() => enviarWA(instanciaDono, telCorretorDono, msg));
    }

    notificar(visita.userId, 'parceiro_indisponivel', '❌ Parceiro indisponível', `${parceiro?.nome || 'Parceiro'} informou indisponibilidade do ${visita.imovelTitulo}.`);

    // Manda vitrine novamente pro cliente
    const tel = (visita.telefone || visita.contato || '').replace(/\D/g, '');
    const leads = lerLeads();
    const lead = leads.find(l => (l.telefone || l.contato || '').replace(/\D/g, '').slice(-8) === tel.slice(-8));
    if (lead) {
      const linkVitrine = `${BASE_URL}/cliente/oferta/${lead.id}?userId=${visita.userId}`;
      setImmediate(() => enviarWA(instanciaDono, tel, `Olá *${visita.nome}*! Infelizmente o imóvel *${visita.imovelTitulo}* não está disponível nesta data.\n\nMas separamos outras opções para você:\n${linkVitrine}`));
    }
  }

  salvarVisitas(visitas);
  res.render('parceiro-confirmado', { resposta, visita: visitas[idx], parceiro });
});
