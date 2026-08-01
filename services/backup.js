const fs = require('fs');
const path = require('path');
const { query, dbOk } = require('./db');

async function _criarTabelaBackup() {
  try {
    await query(`CREATE TABLE IF NOT EXISTS backups (
      id SERIAL PRIMARY KEY,
      timestamp TIMESTAMPTZ DEFAULT NOW(),
      totais JSONB DEFAULT '{}',
      dados JSONB DEFAULT '{}'
    )`);
  } catch(e) { console.error('[BACKUP] erro criar tabela:', e.message); }
}
_criarTabelaBackup();

let _backupEmExecucao = false;
async function fazerBackup() {
  if (_backupEmExecucao) { console.log('[BACKUP] execução anterior ainda rodando, pulando esta'); return; }
  _backupEmExecucao = true;
  try {
    if (!await dbOk()) { console.log('[BACKUP] banco offline, pulando'); return; }

    const ts = new Date().toISOString();
    const tabelas = ['leads', 'visitas', 'usuarios', 'imoveis', 'notificacoes'];
    const backup = {};

    for (const tabela of tabelas) {
      const res = await query('SELECT * FROM ' + tabela);
      backup[tabela] = res.rows;
    }

    const totais = {};
    tabelas.forEach(t => totais[t] = backup[t].length);

    // Salva no PostgreSQL
    await query(
      'INSERT INTO backups (timestamp, totais, dados) VALUES ($1, $2, $3)',
      [ts, JSON.stringify(totais), JSON.stringify(backup)]
    );

    // Mantém só os últimos 48 backups
    await query(`
      DELETE FROM backups WHERE id NOT IN (
        SELECT id FROM backups ORDER BY timestamp DESC LIMIT 3
      )
    `);

    console.log('[BACKUP] ✅ ' + ts + ' | leads:' + totais.leads + ' | imoveis:' + totais.imoveis + ' | users:' + totais.usuarios);
  } catch(e) {
    console.error('[BACKUP] erro:', e.message);
  } finally {
    _backupEmExecucao = false;
  }
}

async function listarBackups() {
  const res = await query('SELECT id, timestamp, totais FROM backups ORDER BY timestamp DESC LIMIT 10');
  return res.rows;
}

async function restaurarBackup(id) {
  const res = await query('SELECT dados FROM backups WHERE id=$1', [id]);
  if (!res.rows.length) throw new Error('Backup nao encontrado');
  return res.rows[0].dados;
}

function iniciarBackup() {
  console.log('[BACKUP] Backup automatico iniciado — a cada 5 minutos, mantendo 3 copias');
  setTimeout(fazerBackup, 5 * 60 * 1000);
  setInterval(fazerBackup, 5 * 60 * 1000);
}

module.exports = { fazerBackup, iniciarBackup, listarBackups, restaurarBackup };
