/**
 * services/storage.js
 * Núcleo de I/O — toda leitura/escrita de JSON passa por aqui.
 * Resolve concorrência com fila por arquivo.
 */

const fs   = require('fs');
const path = require('path');

const _filas = {};

async function _comLock(filePath, fn) {
  const anterior = _filas[filePath] || Promise.resolve();
  const atual = anterior.then(fn).catch(fn);
  _filas[filePath] = atual.then(() => {
    if (_filas[filePath] === atual) delete _filas[filePath];
  });
  return atual;
}

function lerJSON(filePath, padrao = []) {
  try {
    if (!fs.existsSync(filePath)) return padrao;
    const raw = fs.readFileSync(filePath, 'utf8').trim();
    if (!raw) return padrao;
    return JSON.parse(raw);
  } catch (e) {
    console.error(`[storage] Erro ao ler ${filePath}:`, e.message);
    return padrao;
  }
}

async function salvarJSON(filePath, dados) {
  return _comLock(filePath, () => {
    try {
      const dir = path.dirname(filePath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(filePath, JSON.stringify(dados, null, 2), 'utf8');
    } catch (e) {
      console.error(`[storage] Erro ao salvar ${filePath}:`, e.message);
      throw e;
    }
  });
}

function salvarJSONSync(filePath, dados) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(dados, null, 2), 'utf8');
}

module.exports = { lerJSON, salvarJSON, salvarJSONSync };
