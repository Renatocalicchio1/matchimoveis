const axios = require('axios');

const API_BASE = 'https://api.cloudflare.com/client/v4';

function _config() {
  const token = process.env.CLOUDFLARE_API_TOKEN || '';
  const zoneId = process.env.CLOUDFLARE_ZONE_ID || '';
  if (!token || !zoneId) {
    throw new Error('CLOUDFLARE_API_TOKEN / CLOUDFLARE_ZONE_ID não configurados no ambiente');
  }
  return { token, zoneId };
}

function _headers(token) {
  return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
}

async function criarCustomHostname(dominio) {
  const { token, zoneId } = _config();
  try {
    const { data } = await axios.post(
      `${API_BASE}/zones/${zoneId}/custom_hostnames`,
      { hostname: dominio, ssl: { method: 'http', type: 'dv' } },
      { headers: _headers(token), timeout: 15000 }
    );
    return data.result;
  } catch (e) {
    const erros = e.response?.data?.errors;
    const mensagem = (erros && erros.length ? erros.map(x => x.message).join('; ') : null) || e.message;
    throw new Error(mensagem);
  }
}

async function buscarCustomHostname(hostnameId) {
  const { token, zoneId } = _config();
  try {
    const { data } = await axios.get(
      `${API_BASE}/zones/${zoneId}/custom_hostnames/${hostnameId}`,
      { headers: _headers(token), timeout: 15000 }
    );
    return data.result;
  } catch (e) {
    const erros = e.response?.data?.errors;
    const mensagem = (erros && erros.length ? erros.map(x => x.message).join('; ') : null) || e.message;
    throw new Error(mensagem);
  }
}

async function deletarCustomHostname(hostnameId) {
  const { token, zoneId } = _config();
  try {
    await axios.delete(
      `${API_BASE}/zones/${zoneId}/custom_hostnames/${hostnameId}`,
      { headers: _headers(token), timeout: 15000 }
    );
  } catch (e) {
    // Hostname já pode ter sido removido do lado da Cloudflare — não é erro fatal pro fluxo de troca de domínio
    console.error('[cloudflareDominio] erro ao deletar custom hostname:', e.message);
  }
}

// Traduz o status bruto da Cloudflare pro nosso enum simples + mensagem amigável
function interpretarStatus(customHostname) {
  const sslStatus = customHostname?.ssl?.status || '';
  const status = customHostname?.status || '';
  if (sslStatus === 'active' && (status === 'active' || status === 'active_redeploying')) {
    return { dominioStatus: 'verificado', mensagem: 'Domínio verificado e ativo — HTTPS funcionando.' };
  }
  if (['initializing_timed_out', 'validation_timed_out', 'issuance_timed_out', 'deployment_timed_out', 'expired'].includes(sslStatus) || status === 'pending_blocked') {
    return { dominioStatus: 'erro', mensagem: 'Não conseguimos validar o domínio. Confira se o CNAME está apontado corretamente e tente de novo.' };
  }
  return { dominioStatus: 'aguardando_dns', mensagem: 'Aguardando o DNS propagar e o certificado ser emitido — isso pode levar de alguns minutos a algumas horas.' };
}

module.exports = { criarCustomHostname, buscarCustomHostname, deletarCustomHostname, interpretarStatus };
