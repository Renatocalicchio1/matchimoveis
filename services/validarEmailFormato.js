// Validação leve de email (formato + MX do domínio) — compartilhada entre
// services/campanha.js e services/campanhaCaptacao.js pra não duplicar a
// mesma checagem/cache em dois lugares.
const dns = require('dns').promises;

const REGEX_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const _cacheMx = new Map(); // domínio -> boolean (tem MX válido)

async function dominioTemMx(dominio) {
  if (_cacheMx.has(dominio)) return _cacheMx.get(dominio);
  let ok = false;
  try {
    const registros = await dns.resolveMx(dominio);
    ok = Array.isArray(registros) && registros.length > 0;
  } catch (e) { ok = false; }
  _cacheMx.set(dominio, ok);
  return ok;
}

async function emailValido(email) {
  const e = String(email || '').trim();
  if (!REGEX_EMAIL.test(e)) return false;
  const dominio = e.split('@')[1].toLowerCase();
  return dominioTemMx(dominio);
}

module.exports = { REGEX_EMAIL, dominioTemMx, emailValido };
