/**
 * services/jobCreditos.js
 * Job diário: debita créditos por lead ativo (lead_ativo_dia) + alertas de saldo baixo
 * + e-mail de recarga (vendas) pra quem tá com saldo baixo.
 */

const { lerUsuarios, salvarTodosUsuarios, atualizarUsuario } = require('./salvarUsuario');
const { lerLeads } = require('./salvarLead');
const { criarNotificacao } = require('./salvarNotificacao');
const { CUSTO } = require('./creditos');
const { enviarEmail } = require('./email');

const CUSTO_LEAD_DIA = CUSTO.lead_ativo_dia;

// Mesma tabela de PLANOS_LEADS de server.js (rota /pagamento/criar-plano) —
// duplicada aqui de propósito (mesmo padrão já usado no resto do repo pra
// listas pequenas e estáveis compartilhadas entre server.js e services/*,
// ex: lista de cidades QuintoAndar) pra não criar um require circular ou
// exportar server.js como módulo. Se o valor de um combo mudar lá, mudar aqui
// também.
const _PLANOS_RECARGA = {
  r200: { qtd: 50, valor: 200, creditos: 5000, label: '50 leads/mês' },
  '100': { qtd: 100, valor: 400, creditos: 10800, label: '100 leads/mês' },
  '200': { qtd: 200, valor: 700, creditos: 18900, label: '200 leads/mês' },
  '300': { qtd: 300, valor: 1000, creditos: 27000, label: '300 leads/mês' },
};
const BASE_URL_RECARGA = 'https://www.matchimoveis.ia.br';

async function debitarLeadsAtivos() {
  try {
    const hoje = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' }); // 'YYYY-MM-DD'
    const users = await lerUsuarios();
    let alterou = false;

    for (let i = 0; i < users.length; i++) {
      const u = users[i];
      const uid = u.id || u.userId;
      if (!uid) continue;

      // Idempotência: já debitado hoje? pula. Evita cobrar de novo se o
      // servidor reiniciar mais de uma vez no mesmo dia (o job roda no boot).
      if (u.ultimoDebitoLeadsAtivos === hoje) continue;
      users[i].ultimoDebitoLeadsAtivos = hoje;
      alterou = true;

      const leads = await lerLeads(uid);
      const ativos = leads.filter(l =>
        l.status !== 'arquivado' &&
        l.status !== 'fechado' &&
        l.status !== 'perdido' &&
        !(l.leadOculta === true && !((l.matches||[]).length || (l.matchesBase||[]).length))
      );

      if (ativos.length === 0) continue;

      const custo = ativos.length * CUSTO_LEAD_DIA;
      const saldoAtual = users[i].matchCoins || 0;
      const debitado = Math.min(custo, saldoAtual);
      const novoSaldo = Math.max(0, saldoAtual - custo);

      users[i].matchCoins = novoSaldo;
      if (!users[i].matchCoinsTransacoes) users[i].matchCoinsTransacoes = [];
      users[i].matchCoinsTransacoes.push({
        data: new Date().toISOString(),
        motivo: `${ativos.length} leads ativos`,
        quantidade: -debitado,
        saldoApos: novoSaldo
      });

      // salvarUsuario() ignora match_coins de propósito no upsert (evita
      // sobrescrever saldo real com dado desatualizado) — precisa de UPDATE
      // direto, mesmo padrão usado em services/creditos.js
      try {
        const { query: _qJobCred } = require('./db');
        await _qJobCred('UPDATE usuarios SET match_coins = $1, atualizado_em=NOW() WHERE codigo_usuario = $2', [novoSaldo, uid]);
      } catch(e2) { console.error('[jobCreditos] erro PG débito:', e2.message); }

      if (novoSaldo === 0 && saldoAtual > 0) {
        const { _desconectarWhatsappSeZerado } = require('./creditos');
        _desconectarWhatsappSeZerado(uid).catch(()=>{});
      }

      console.log(`[jobCreditos] ${u.nome || uid}: -${debitado} créditos (${ativos.length} leads) → saldo: ${novoSaldo}`);
      alterou = true;
    }

    if (alterou) await salvarTodosUsuarios(users);
  } catch(e) {
    console.error('[jobCreditos] Erro débito:', e.message);
  }
}

async function verificarAlertas() {
  try {
    const hoje = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
    const users = await lerUsuarios();
    let alterou = false;

    for (let i = 0; i < users.length; i++) {
      const u = users[i];
      const uid = u.id || u.userId;
      const saldo = u.matchCoins || 0;

      // Idempotência: não repete o mesmo alerta mais de 1x por dia (evita spam
      // se o servidor reiniciar varias vezes, e nao faz sentido lembrar de hora em hora)
      if (u.ultimoAlertaSaldoEm === hoje) continue;

      // Limiar por saldo absoluto, não percentual do total historico comprado
      // (matchCoinsTotal cresce pra sempre a cada recarga -- usar % dele fazia
      // contas antigas com muitas recargas disparar "acabando" com saldo alto)
      let alerta = null;
      if (saldo === 0) {
        alerta = { tipo: 'conta_pausada', titulo: 'Conta pausada', mensagem: '⛔ Seus créditos acabaram. Adicione créditos para reativar sua conta.' };
      } else if (saldo <= 200) {
        alerta = { tipo: 'creditos_criticos', titulo: 'Créditos quase zerados', mensagem: '🔴 Créditos quase zerados! Recarregue agora para não pausar sua conta.' };
      } else if (saldo <= 1000) {
        alerta = { tipo: 'creditos_baixos', titulo: 'Créditos acabando', mensagem: '⚠️ Seus créditos estão acabando. Considere recarregar.' };
      }

      if (!alerta) continue;

      users[i].ultimoAlertaSaldoEm = hoje;
      alterou = true;

      await criarNotificacao({
        id: Date.now().toString() + '_' + uid,
        tipo: alerta.tipo,
        titulo: alerta.titulo,
        mensagem: alerta.mensagem,
        usuarioId: uid, lida: false,
        criadaEm: new Date().toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo'})
      });
    }

    if (alterou) await salvarTodosUsuarios(users);
  } catch(e) {
    console.error('[jobCreditos] Erro alertas:', e.message);
  }
}

// 3 níveis de urgência — mesmos limiares de saldo já usados em
// verificarAlertas() (conta_pausada/creditos_criticos/creditos_baixos), só
// que aqui viram copy de e-mail escalonada em vez de notificação de sino.
// Antes o e-mail sempre dizia "seus créditos tão acabando", mesmo pra quem
// tava com saldo zerado — mesma cara pra situação bem diferente.
function _nivelUrgenciaSaldo(saldo) {
  if (saldo <= 0) return 'zerado';
  if (saldo <= 200) return 'critico';
  return 'baixo';
}
const _COPY_URGENCIA = {
  zerado: {
    assunto: nome => '⛔ Sua conta pausou — recarregue pra voltar a receber leads',
    titulo: nome => nome + ', sua conta pausou.',
    corpo: 'Sem créditos, sua conta parou de qualificar lead, gerar match e responder no WhatsApp automaticamente — toda lead nova fica parada, esperando, sem ninguém tocar nela. Recarregue agora pra reativar tudo na hora.'
  },
  critico: {
    assunto: nome => '🔴 Créditos quase zerados, ' + nome,
    titulo: nome => nome + ', seus créditos tão quase no fim.',
    corpo: 'Faltam poucos créditos pra sua conta pausar de vez. Enquanto isso, cada lead nova que chega tem menos tempo de resposta automática — é questão de dias, não de semanas. Recarregue agora e evite a conta parar no meio de um atendimento.'
  },
  baixo: {
    assunto: nome => '⚠️ Seus créditos tão acabando, ' + nome,
    titulo: nome => nome + ', seus créditos tão acabando.',
    corpo: 'Enquanto seu saldo fica baixo, sua conta para de qualificar lead, gerar match e responder no WhatsApp automaticamente — cada dia sem crédito é lead esfriando sem ninguém tocar. Recarregue agora e sua carteira volta a rodar sozinha.'
  }
};

// E-mail de venda (copy direta, com urgência e benefício concreto — nada de
// "confira nossas opções") oferecendo os combos de recarga pra quem tá com
// saldo baixo. Link de cada combo já cai comprando: /app/perfil?combo=X (+
// ?ref= do sub-admin responsável) — a página dispara o checkout sozinha
// (ver script em views/app-perfil.ejs), sem precisar caçar o botão certo.
function _montarHtmlRecarga(nome, refUsado, saldo) {
  const primeiroNome = (nome || '').trim().split(' ')[0] || 'tudo bem';
  const nivel = _nivelUrgenciaSaldo(saldo || 0);
  const copy = _COPY_URGENCIA[nivel];
  const linkCombo = (chave) => BASE_URL_RECARGA + '/app/perfil?combo=' + chave + (refUsado ? '&ref=' + encodeURIComponent(refUsado) : '');
  const cardsHtml = Object.entries(_PLANOS_RECARGA).map(([chave, p]) => (
    '<tr><td style="padding:14px 0;border-bottom:1px solid #f3f4f6">'
    + '<div style="display:flex;justify-content:space-between;align-items:center;gap:12px">'
    + '<div><div style="font-weight:700;font-size:15px;color:#111827">' + p.label + '</div>'
    + '<div style="font-size:12.5px;color:#6b7280;margin-top:2px">' + p.creditos.toLocaleString('pt-BR') + ' créditos por R$ ' + p.valor + '</div></div>'
    + '<a href="' + linkCombo(chave) + '" style="flex-shrink:0;display:inline-block;padding:10px 20px;background:#FF385C;color:#fff;text-decoration:none;border-radius:8px;font-weight:700;font-size:13.5px;white-space:nowrap">Recarregar →</a>'
    + '</div></td></tr>'
  )).join('');
  return '<div style="font-family:Arial,sans-serif;max-width:600px;padding:32px">'
    + '<h2 style="color:#FF385C;margin:0 0 14px 0">' + copy.titulo(primeiroNome) + '</h2>'
    + '<p style="margin:0 0 16px 0;font-size:15px;line-height:1.7;color:#222">' + copy.corpo + '</p>'
    + '<table style="width:100%;border-collapse:collapse;margin:0 0 20px 0">' + cardsHtml + '</table>'
    + '<p style="margin:0;font-size:12.5px;color:#9ca3af">Clique em qualquer combo acima — a compra já abre pronta, sem precisar procurar nada na tela.</p>'
    + '</div>';
}

// Roda 1x por dia (ver iniciarJobCreditos): manda pra quem tem saldo < 500,
// conta ativa, e-mail cadastrado — no máximo 1x a cada 7 dias por conta
// (ultimoEmailRecargaEm), senão vira spam pra quem já viu o e-mail e ainda
// não recarregou. Sub-admin: só usa o ref se a conta JÁ tinha um
// atendidoPorAdmin genuíno (veio pelo link dele no cadastro, ou foi atribuído
// num clique de campanha de verdade) — NUNCA inventa um sub-admin aqui só
// pra mandar e-mail. Atribuir comissão pra alguém que nunca de fato trouxe
// esse corretor pra plataforma é errado, mesmo que pareça "ajudar a
// distribuir trabalho" — regra confirmada pelo Renato: só fica setado se
// realmente veio pelo link daquele sub-admin.
async function enviarEmailsRecarga() {
  try {
    const hoje = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
    const users = await lerUsuarios();

    for (const u of users) {
      const uid = u.id || u.userId;
      if (!uid || u.ativo === false) continue;
      const saldo = u.matchCoins || 0;
      if (saldo >= 500) continue;
      const email = (u.email || '').trim();
      if (!email) continue;

      const ultimoEnvio = u.ultimoEmailRecargaEm ? new Date(u.ultimoEmailRecargaEm) : null;
      if (ultimoEnvio && (Date.now() - ultimoEnvio.getTime()) < 7 * 24 * 60 * 60 * 1000) continue;

      const ref = u.atendidoPorAdmin || '';

      try {
        const primeiroNome = (u.nome || '').trim().split(' ')[0] || 'tudo bem';
        await enviarEmail({
          para: email,
          assunto: _COPY_URGENCIA[_nivelUrgenciaSaldo(saldo)].assunto(primeiroNome),
          html: _montarHtmlRecarga(u.nome, ref, saldo),
          texto: 'Seus créditos estão baixos. Recarregue em: ' + BASE_URL_RECARGA + '/app/perfil',
          tipo: 'recarga_saldo_baixo',
          variante: _nivelUrgenciaSaldo(saldo),
          botaoTexto: 'Recarregar →',
          userId: uid
        });
        await atualizarUsuario(uid, { ultimoEmailRecargaEm: new Date().toISOString() });
        console.log('[jobCreditos/recarga] e-mail enviado:', email, '| saldo:', saldo, '| ref:', ref || '(sem sub-admin)');
      } catch (eEnvio) {
        console.error('[jobCreditos/recarga] erro ao enviar pra', email, ':', eEnvio.message);
      }
    }
  } catch (e) {
    console.error('[jobCreditos/recarga] Erro geral:', e.message);
  }
}

async function rodarJob() {
  console.log('[jobCreditos] 🔄 Rodando job diário...');
  await debitarLeadsAtivos();
  await verificarAlertas();
  await enviarEmailsRecarga();
  console.log('[jobCreditos] ✅ Job concluído');
}

// Próxima ocorrência de HH:MM no horário de Brasília — usado pra ancorar os
// 3 jobs diários abaixo num horário fixo de madrugada (2h-7h), em vez de
// "a cada 24h a partir do boot": esse segundo padrão faz o job pesado cair
// em qualquer hora do dia (inclusive horário de pico) dependendo de quando
// o servidor foi reiniciado no Render — bug real corrigido jul/2026.
function _proximoHorarioBR(hh, mm, agora) {
  const hojeSP = agora.toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
  const hhStr = String(hh).padStart(2, '0'), mmStr = String(mm).padStart(2, '0');
  let alvo = new Date(hojeSP + 'T' + hhStr + ':' + mmStr + ':00-03:00');
  if (alvo <= agora) {
    const amanhaSP = new Date(alvo.getTime() + 24*60*60*1000).toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
    alvo = new Date(amanhaSP + 'T' + hhStr + ':' + mmStr + ':00-03:00');
  }
  return alvo;
}

function iniciarJobCreditos() {
  console.log('[jobCreditos] ⏱️ Job diário de créditos iniciado');

  // Débito de leads ativos: 2h da madrugada (horário de Brasília), uma vez por
  // dia (era 23:59). A trava de idempotência em debitarLeadsAtivos() garante
  // que reinícios do servidor no mesmo dia não disparem a cobrança de novo.
  const _agora = new Date();
  setTimeout(() => {
    debitarLeadsAtivos();
    setInterval(debitarLeadsAtivos, 24 * 60 * 60 * 1000);
  }, _proximoHorarioBR(2, 0, _agora) - _agora);
  // Roda uma vez no boot também — se o servidor tiver ficado fora do ar
  // durante a janela das 2h, isso evita pular o dia inteiro sem cobrar.
  // debitarLeadsAtivos() é idempotente (chave por data), sem risco de cobrar 2x.
  setTimeout(debitarLeadsAtivos, 10000);

  // Alertas de saldo baixo — 2h20 da madrugada + 1x no boot (idem abaixo)
  setTimeout(() => {
    verificarAlertas();
    setInterval(verificarAlertas, 24 * 60 * 60 * 1000);
  }, _proximoHorarioBR(2, 20, _agora) - _agora);
  setTimeout(verificarAlertas, 15000);

  // E-mail de recarga (vendas) — 2h40 da madrugada + 1x no boot, atraso maior
  // que os alertas pra não competir com eles pela mesma rajada de envio de SES.
  setTimeout(() => {
    enviarEmailsRecarga();
    setInterval(enviarEmailsRecarga, 24 * 60 * 60 * 1000);
  }, _proximoHorarioBR(2, 40, _agora) - _agora);
  setTimeout(enviarEmailsRecarga, 30000);
}

module.exports = { iniciarJobCreditos, rodarJob, debitarLeadsAtivos, verificarAlertas, enviarEmailsRecarga };
