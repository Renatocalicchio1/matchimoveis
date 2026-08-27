const axios = require('axios');

const API_VERSION = 'v21.0';

function _config(phoneNumberIdOverride) {
  const token = process.env.META_WA_TOKEN || '';
  const phoneNumberId = phoneNumberIdOverride || process.env.META_WA_PHONE_NUMBER_ID || '';
  if (!token || !phoneNumberId) {
    throw new Error('META_WA_TOKEN / META_WA_PHONE_NUMBER_ID não configurados no ambiente');
  }
  return { token, phoneNumberId };
}

// Números conhecidos da WABA 1788702312291804 — usados pra escolher de qual
// número uma campanha de disparo envia (cadastro de conta vs. captação de
// proprietário são públicos-alvo diferentes, cada um com seu próprio número).
const NUMEROS_DISPARO = {
  usuarios_sistema: { id: '1210590465475893', label: '+55 11 97860-0214 — Usuários do sistema' },
  captacao_proprietarios: { id: '1234898449710364', label: '+55 11 95665-5428 — Captação de proprietários' }
};

function _normalizarTelefone(telefone) {
  let t = String(telefone || '').replace(/\D/g, '');
  if (!t.startsWith('55') && (t.length === 10 || t.length === 11)) t = '55' + t;
  return t;
}

// 55 + DDD (2) + número (8 ou 9 dígitos) = 12 ou 13 dígitos no total. Qualquer
// coisa fora disso (célula vazia, texto lixo, número faltando dígito etc) não
// é um telefone de verdade — usado pra barrar antes de gastar tentativa de
// envio (e limpar a lista já na hora de criar a campanha).
function _telefoneValido(telefone) {
  return /^55\d{10,11}$/.test(_normalizarTelefone(telefone));
}

async function enviarTemplate({ telefone, templateNome, templateIdioma, parametros, headerParametro, botoesUrl, phoneNumberId: phoneNumberIdOverride }) {
  const { token, phoneNumberId } = _config(phoneNumberIdOverride);
  const numero = _normalizarTelefone(telefone);
  if (!numero) throw new Error('Telefone inválido');

  const components = [];
  // headerParametro: variável do CABEÇALHO (ex: "Feliz Dia do Corretor,
  // {{1}}!") — diferente de `parametros`, que é sempre CORPO. Componente
  // separado porque a Meta rejeita o envio (erro 132000) se vier component
  // 'header' pra template sem variável no cabeçalho, então só entra quando
  // o chamador manda esse valor de propósito (ver campanha.usar_nome_header).
  if (headerParametro != null) {
    components.push({ type: 'header', parameters: [{ type: 'text', text: String(headerParametro) }] });
  }
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

  console.log('[enviarTemplate] phoneNumberId:', phoneNumberId, '| template:', templateNome, '| components:', JSON.stringify(components));

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

// Texto livre — só funciona dentro da janela de 24h aberta por uma mensagem
// do próprio contato (ex: clique de botão), diferente de enviarTemplate que
// pode iniciar conversa fora da janela.
async function enviarTexto({ telefone, texto, phoneNumberId: phoneNumberIdOverride }) {
  const { token, phoneNumberId } = _config(phoneNumberIdOverride);
  const numero = _normalizarTelefone(telefone);
  if (!numero) throw new Error('Telefone inválido');
  try {
    const { data } = await axios.post(
      `https://graph.facebook.com/${API_VERSION}/${phoneNumberId}/messages`,
      { messaging_product: 'whatsapp', to: numero, type: 'text', text: { body: texto } },
      { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, timeout: 15000 }
    );
    return { ok: true, messageId: data?.messages?.[0]?.id || null };
  } catch (e) {
    const corpo = e.response?.data?.error || {};
    throw new Error(corpo.message || e.message);
  }
}

// Baixa um áudio (ou qualquer mídia) recebido no webhook — a Meta só manda o
// ID da mídia na mensagem, é preciso resolver a URL temporária e baixar com o
// mesmo token de acesso (a URL sozinha não é pública).
async function baixarMedia(mediaId, phoneNumberIdOverride) {
  const { token } = _config(phoneNumberIdOverride);
  const { data: meta } = await axios.get(
    `https://graph.facebook.com/${API_VERSION}/${mediaId}`,
    { headers: { Authorization: `Bearer ${token}` }, timeout: 15000 }
  );
  const { data: buffer } = await axios.get(meta.url, {
    headers: { Authorization: `Bearer ${token}` },
    responseType: 'arraybuffer',
    timeout: 30000
  });
  return { buffer: Buffer.from(buffer), mimeType: meta.mime_type || 'application/octet-stream' };
}

// Envia áudio: primeiro sobe o binário pro "media library" da própria Meta
// (obrigatório pra mensagem de mídia — não dá pra mandar por link externo
// direto no /messages), depois manda a mensagem referenciando o id retornado.
async function enviarAudio({ telefone, buffer, mimeType, nomeArquivo, phoneNumberId: phoneNumberIdOverride }) {
  const { token, phoneNumberId } = _config(phoneNumberIdOverride);
  const numero = _normalizarTelefone(telefone);
  if (!numero) throw new Error('Telefone inválido');
  const FormData = require('form-data');
  const form = new FormData();
  form.append('messaging_product', 'whatsapp');
  form.append('type', mimeType || 'audio/ogg');
  form.append('file', buffer, { filename: nomeArquivo || 'audio.ogg', contentType: mimeType || 'audio/ogg' });
  try {
    const { data: up } = await axios.post(
      `https://graph.facebook.com/${API_VERSION}/${phoneNumberId}/media`,
      form,
      { headers: { Authorization: `Bearer ${token}`, ...form.getHeaders() }, timeout: 30000 }
    );
    const mediaId = up.id;
    const { data } = await axios.post(
      `https://graph.facebook.com/${API_VERSION}/${phoneNumberId}/messages`,
      { messaging_product: 'whatsapp', to: numero, type: 'audio', audio: { id: mediaId } },
      { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, timeout: 15000 }
    );
    return { ok: true, messageId: data?.messages?.[0]?.id || null };
  } catch (e) {
    const corpo = e.response?.data?.error || {};
    throw new Error(corpo.message || e.message);
  }
}

module.exports = { enviarTemplate, enviarTexto, enviarAudio, baixarMedia, _normalizarTelefone, _telefoneValido, NUMEROS_DISPARO };
