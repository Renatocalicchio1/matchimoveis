// OAuth 2.1 (Authorization Code + PKCE) pro conector MCP (ago/2026, pedido
// explícito do Renato) — o app do Claude, na tela "Adicionar conector
// personalizado", só oferece autenticação via login OAuth de verdade (toggle
// "Requer login" + ID/Segredo do cliente), não um cabeçalho customizado
// simples. O token pessoal estático de /app/perfil (ver server.js,
// _mcpResolverConta) continua funcionando em paralelo pra outros usos — esse
// arquivo é só o fluxo OAuth pra encaixar na tela nativa do Claude.
//
// Clientes são "públicos" (sem client_secret, token_endpoint_auth_method:
// 'none') — segurança vem de PKCE (RFC 7636), não de segredo compartilhado.
// É o padrão certo pra esse tipo de app (o Claude registra a si mesmo via
// Dynamic Client Registration, RFC 7591, não tem como guardar segredo).
const crypto = require('crypto');
const { query } = require('./db');

async function criarTabelasOAuth() {
  try {
    await query(`
      CREATE TABLE IF NOT EXISTS mcp_oauth_clients (
        client_id TEXT PRIMARY KEY,
        client_name TEXT,
        redirect_uris TEXT[] NOT NULL,
        criado_em TIMESTAMP DEFAULT NOW()
      )
    `);
    await query(`
      CREATE TABLE IF NOT EXISTS mcp_oauth_codes (
        code TEXT PRIMARY KEY,
        client_id TEXT NOT NULL,
        redirect_uri TEXT NOT NULL,
        code_challenge TEXT NOT NULL,
        code_challenge_method TEXT NOT NULL,
        codigo_usuario TEXT NOT NULL,
        expira_em TIMESTAMP NOT NULL,
        usado BOOLEAN DEFAULT FALSE,
        criado_em TIMESTAMP DEFAULT NOW()
      )
    `);
    await query(`
      CREATE TABLE IF NOT EXISTS mcp_oauth_tokens (
        access_token TEXT PRIMARY KEY,
        refresh_token TEXT UNIQUE NOT NULL,
        client_id TEXT NOT NULL,
        codigo_usuario TEXT NOT NULL,
        expira_em TIMESTAMP NOT NULL,
        criado_em TIMESTAMP DEFAULT NOW()
      )
    `);
    // Índices pra achar rápido pelo caminho quente (validar token a cada
    // chamada MCP) e limpar código/token expirado.
    await query(`CREATE INDEX IF NOT EXISTS idx_mcp_oauth_codes_expira ON mcp_oauth_codes(expira_em)`);
    await query(`CREATE INDEX IF NOT EXISTS idx_mcp_oauth_tokens_expira ON mcp_oauth_tokens(expira_em)`);
  } catch (e) { console.error('[mcpOAuth] erro criar tabelas:', e.message); }
}

async function registrarCliente({ redirectUris, clientName }) {
  const clientId = 'mcpc_' + crypto.randomBytes(16).toString('hex');
  await query(
    `INSERT INTO mcp_oauth_clients (client_id, client_name, redirect_uris) VALUES ($1,$2,$3)`,
    [clientId, clientName || '', redirectUris]
  );
  return clientId;
}

async function buscarCliente(clientId) {
  if (!clientId) return null;
  const { rows } = await query(`SELECT * FROM mcp_oauth_clients WHERE client_id=$1`, [clientId]);
  return rows[0] || null;
}

// PKCE: verifica code_verifier contra o code_challenge salvo na hora do
// /oauth/authorize. S256 é o único método realmente seguro (o outro,
// 'plain', existe só pra cliente que não consiga hashear — aceito mas
// desencorajado, mesmo padrão de qualquer provedor OAuth público).
function _pkceValido(codeVerifier, codeChallenge, method) {
  if (!codeVerifier || !codeChallenge) return false;
  if (method === 'plain') return codeVerifier === codeChallenge;
  const hash = crypto.createHash('sha256').update(codeVerifier).digest('base64url');
  return hash === codeChallenge;
}

async function criarCodigoAutorizacao({ clientId, redirectUri, codeChallenge, codeChallengeMethod, codigoUsuario }) {
  const code = 'mcpac_' + crypto.randomBytes(32).toString('hex');
  await query(
    `INSERT INTO mcp_oauth_codes (code, client_id, redirect_uri, code_challenge, code_challenge_method, codigo_usuario, expira_em)
     VALUES ($1,$2,$3,$4,$5,$6, NOW() + INTERVAL '5 minutes')`,
    [code, clientId, redirectUri, codeChallenge, codeChallengeMethod || 'S256', codigoUsuario]
  );
  return code;
}

async function _emitirToken(clientId, codigoUsuario) {
  const accessToken = 'mcpat_' + crypto.randomBytes(32).toString('hex');
  const refreshToken = 'mcprt_' + crypto.randomBytes(32).toString('hex');
  const expiresIn = 3600; // 1h — cliente renova via refresh_token, mesmo padrão de qualquer provedor OAuth
  await query(
    `INSERT INTO mcp_oauth_tokens (access_token, refresh_token, client_id, codigo_usuario, expira_em)
     VALUES ($1,$2,$3,$4, NOW() + INTERVAL '1 hour')`,
    [accessToken, refreshToken, clientId, codigoUsuario]
  );
  return { accessToken, refreshToken, expiresIn };
}

// Troca código de autorização por token — código de uso único (marca
// usado=true), expira em 5min, valida client_id/redirect_uri batendo com o
// que foi usado no /authorize (evita um client_id roubar código de outro) e
// PKCE (evita interceptação do código em trânsito virar token de verdade).
async function trocarCodigoPorToken({ code, clientId, redirectUri, codeVerifier }) {
  const { rows } = await query(
    `SELECT * FROM mcp_oauth_codes WHERE code=$1 AND usado=false AND expira_em > NOW()`,
    [code]
  );
  const registro = rows[0];
  if (!registro) return null;
  if (registro.client_id !== clientId || registro.redirect_uri !== redirectUri) return null;
  if (!_pkceValido(codeVerifier, registro.code_challenge, registro.code_challenge_method)) return null;
  await query(`UPDATE mcp_oauth_codes SET usado=true WHERE code=$1`, [code]);
  return await _emitirToken(clientId, registro.codigo_usuario);
}

// Refresh token é rotacionado a cada uso (o antigo é apagado, um novo par é
// emitido) — reduz o estrago se um refresh token vazar (só serve 1 vez).
async function renovarToken({ refreshToken, clientId }) {
  const { rows } = await query(
    `SELECT * FROM mcp_oauth_tokens WHERE refresh_token=$1 AND client_id=$2`,
    [refreshToken, clientId]
  );
  const registro = rows[0];
  if (!registro) return null;
  await query(`DELETE FROM mcp_oauth_tokens WHERE refresh_token=$1`, [refreshToken]);
  return await _emitirToken(clientId, registro.codigo_usuario);
}

// Usado a cada chamada no /mcp — resolve access_token -> codigo_usuario, ou
// null se não existe/expirou (nunca lança, chamador trata como "não achou").
async function resolverAccessToken(token) {
  if (!token) return null;
  try {
    const { rows } = await query(
      `SELECT codigo_usuario FROM mcp_oauth_tokens WHERE access_token=$1 AND expira_em > NOW()`,
      [token]
    );
    return rows[0] ? rows[0].codigo_usuario : null;
  } catch (e) { console.error('[mcpOAuth] erro resolver token:', e.message); return null; }
}

criarTabelasOAuth();

module.exports = {
  registrarCliente, buscarCliente,
  criarCodigoAutorizacao, trocarCodigoPorToken, renovarToken, resolverAccessToken
};
