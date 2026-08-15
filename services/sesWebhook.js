// Recebe as notificações que a AWS manda via SNS quando um email enviado
// pelo SES tem bounce (endereço não existe/rejeitou) ou complaint (pessoa
// marcou como spam) — sem isso a plataforma não tinha nenhuma visão desses
// dois números, que são exatamente o que a AWS usa pra decidir pausar a
// conta (bounce >5%, reclamação >0.1% — jul/2026 a conta já estava em
// 1.99% e 0.05%, perto do limite).
//
// Verifica a assinatura RSA da SNS antes de processar qualquer coisa —
// sem isso, qualquer um que descobrisse a URL do webhook poderia mandar
// aviso de bounce falso e suprimir email de gente que nunca rejeitou nada.
const https = require('https');
const crypto = require('crypto');
const { descadastrarEmail } = require('./email');

let _certCache = {}; // url -> certificado PEM (evita buscar de novo a cada notificação)

function _fetchCert(url) {
  return new Promise((resolve, reject) => {
    if (_certCache[url]) return resolve(_certCache[url]);
    https.get(url, res => {
      if (res.statusCode !== 200) return reject(new Error('cert HTTP ' + res.statusCode));
      let data = '';
      res.on('data', d => data += d);
      res.on('end', () => { _certCache[url] = data; resolve(data); });
    }).on('error', reject);
  });
}

// Campos e ordem exatos exigidos pelo protocolo SNS pra montar o
// "string to sign" — https://docs.aws.amazon.com/sns/latest/dg/sns-verify-signature-of-message.html
function _montarStringParaAssinar(msg) {
  const campos = msg.Type === 'Notification'
    ? ['Message', 'MessageId', 'Subject', 'Timestamp', 'TopicArn', 'Type']
    : ['Message', 'MessageId', 'SubscribeURL', 'Timestamp', 'Token', 'TopicArn', 'Type'];
  let s = '';
  for (const campo of campos) {
    if (msg[campo] === undefined || msg[campo] === null) continue; // ex: Subject é opcional
    s += campo + '\n' + msg[campo] + '\n';
  }
  return s;
}

async function _assinaturaValida(msg) {
  try {
    if (!msg.SigningCertURL || !/^https:\/\/sns\.[a-z0-9-]+\.amazonaws\.com\//.test(msg.SigningCertURL)) {
      console.error('[ses-webhook] SigningCertURL fora do domínio esperado da AWS:', msg.SigningCertURL);
      return false;
    }
    const cert = await _fetchCert(msg.SigningCertURL);
    const algoritmo = msg.SignatureVersion === '2' ? 'RSA-SHA256' : 'RSA-SHA1';
    const verificador = crypto.createVerify(algoritmo);
    verificador.update(_montarStringParaAssinar(msg), 'utf8');
    return verificador.verify(cert, msg.Signature, 'base64');
  } catch (e) {
    console.error('[ses-webhook] erro ao verificar assinatura:', e.message);
    return false;
  }
}

// SNS manda a confirmação de inscrição do tópico uma única vez, na hora que
// o Topic é configurado no console AWS pra apontar pra essa URL — só
// "aceita" o tópico visitando o SubscribeURL (GET simples).
function _confirmarInscricao(url) {
  return new Promise((resolve) => {
    https.get(url, res => { res.resume(); resolve(res.statusCode === 200); })
      .on('error', e => { console.error('[ses-webhook] erro ao confirmar inscrição SNS:', e.message); resolve(false); });
  });
}

async function processarNotificacaoSES(msgBruta) {
  let msg;
  try { msg = typeof msgBruta === 'string' ? JSON.parse(msgBruta) : msgBruta; }
  catch (e) { console.error('[ses-webhook] payload não é JSON válido'); return { ok: false }; }

  if (!(await _assinaturaValida(msg))) {
    console.error('[ses-webhook] assinatura inválida, ignorando notificação');
    return { ok: false, motivo: 'assinatura_invalida' };
  }

  if (msg.Type === 'SubscriptionConfirmation') {
    const confirmado = await _confirmarInscricao(msg.SubscribeURL);
    console.log('[ses-webhook] inscrição SNS confirmada:', confirmado);
    return { ok: confirmado };
  }

  if (msg.Type !== 'Notification') return { ok: true }; // UnsubscribeConfirmation etc — nada a fazer

  let conteudo;
  try { conteudo = JSON.parse(msg.Message); }
  catch (e) { console.error('[ses-webhook] Message não é JSON válido'); return { ok: false }; }

  if (conteudo.notificationType === 'Bounce' || conteudo.eventType === 'Bounce') {
    const bounce = conteudo.bounce || {};
    // Só suprime bounce PERMANENTE (endereço não existe de fato) — bounce
    // transiente (caixa cheia, servidor fora do ar temporariamente) é
    // esperado acontecer de vez em quando com endereço válido, suprimir de
    // primeira seria bloquear gente real à toa.
    if (bounce.bounceType !== 'Permanent') return { ok: true, ignorado: 'bounce_transiente' };
    const destinatarios = bounce.bouncedRecipients || [];
    for (const r of destinatarios) {
      await descadastrarEmail(r.emailAddress, 'bounce').catch(e => console.error('[ses-webhook] erro ao suprimir', r.emailAddress, e.message));
    }
    console.log('[ses-webhook] bounce permanente, suprimidos:', destinatarios.map(r => r.emailAddress));
    return { ok: true, suprimidos: destinatarios.length };
  }

  if (conteudo.notificationType === 'Complaint' || conteudo.eventType === 'Complaint') {
    const complaint = conteudo.complaint || {};
    const destinatarios = complaint.complainedRecipients || [];
    for (const r of destinatarios) {
      await descadastrarEmail(r.emailAddress, 'reclamacao').catch(e => console.error('[ses-webhook] erro ao suprimir', r.emailAddress, e.message));
    }
    console.log('[ses-webhook] reclamação de spam, suprimidos:', destinatarios.map(r => r.emailAddress));
    return { ok: true, suprimidos: destinatarios.length };
  }

  return { ok: true }; // Delivery e outros tipos — não precisa de ação
}

module.exports = { processarNotificacaoSES };
