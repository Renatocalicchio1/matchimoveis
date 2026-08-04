const axios = require('axios');

const API_VERSION = 'v21.0';

function _config() {
  const token = process.env.META_WA_TOKEN || '';
  const phoneNumberId = process.env.META_WA_PHONE_NUMBER_ID || '';
  if (!token || !phoneNumberId) {
    throw new Error('META_WA_TOKEN / META_WA_PHONE_NUMBER_ID não configurados no ambiente');
  }
  return { token, phoneNumberId };
}

function _normalizarTelefone(telefone) {
  let t = String(telefone || '').replace(/\D/g, '');
  if (!t.startsWith('55') && (t.length === 10 || t.length === 11)) t = '55' + t;
  return t;
}

async function enviarTemplate({ telefone, templateNome, templateIdioma, parametros, botoesUrl }) {
  const { token, phoneNumberId } = _config();
  const numero = _normalizarTelefone(telefone);
  if (!numero) throw new Error('Telefone inválido');

  const components = [];
  if (parametros && parametros.length) {
    components.push({ type: 'body', parameters: parametros.map(p => ({ type: 'text', text: String(p == null ? '' : p) })) });
  }
  // botoesUrl: array de { index, valor } — valor é o texto dinâmico que o Meta
  // concatena depois do prefixo fixo configurado no botão do template (ex: prefixo
  // "https://matchimoveis.ia.br/captar/" + valor "REN-G9K6?tel=5511999999999").
  if (botoesUrl && botoesUrl.length) {
    for (const b of botoesUrl) {
      components.push({
        type: 'button',
        sub_type: 'url',
        index: String(b.index),
        parameters: [{ type: 'text', text: String(b.valor == null ? '' : b.valor) }]
      });
    }
  }

  try {
    const { data } = await axios.post(
      `https://graph.facebook.com/${API_VERSION}/${phoneNumberId}/messages`,
      {
        messaging_product: 'whatsapp',
        to: numero,
        type: 'template',
        template: {
          name: templateNome,
          language: { code: templateIdioma || 'pt_BR' },
          components
        }
      },
      { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, timeout: 15000 }
    );
    return { ok: true, messageId: data?.messages?.[0]?.id || null };
  } catch (e) {
    const status = e.response?.status || 0;
    const corpo = e.response?.data?.error || {};
    const mensagem = corpo.message || e.message;
    const codigo = corpo.code;
    // Transitório: timeout, 429 (rate limit) ou 5xx — vale retry.
    // Permanente: número inválido, template não aprovado, erro de parâmetro etc — não retry.
    const transitorio = !status || status === 429 || status >= 500;
    const err = new Error(mensagem);
    err.transitorio = transitorio;
    err.statusCode = status;
    err.codigoMeta = codigo;
    throw err;
  }
}

module.exports = { enviarTemplate, _normalizarTelefone };
