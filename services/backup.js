const fs = require('fs');
const path = require('path');
const { query, dbOk } = require('./db');

const BACKUP_DIR = process.env.RENDER 
  ? '/opt/render/project/src/data/backups' 
  : path.join(__dirname, '..', 'backups');

async function fazerBackup() {
  try {
    if (!await dbOk()) { console.log('[BACKUP] banco offline, pulando'); return; }
    
    if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR, { recursive: true });

    const ts = new Date().toISOString().replace(/[:.]/g, '-').substring(0, 19);
    
    const tabelas = ['leads', 'visitas', 'usuarios', 'imoveis', 'notificacoes'];
    const backup = {};
    
    for (const tabela of tabelas) {
      const res = await query(`SELECT * FROM ${tabela}`);
      backup[tabela] = res.rows;
    }
    
    backup.timestamp = new Date().toISOString();
    backup.totais = {};
    tabelas.forEach(t => backup.totais[t] = backup[t].length);
    
    const arquivo = path.join(BACKUP_DIR, `backup-${ts}.json`);
    fs.writeFileSync(arquivo, JSON.stringify(backup, null, 2));
    
    console.log(`[BACKUP] ✅ ${ts} | leads:${backup.totais.leads} | imoveis:${backup.totais.imoveis} | users:${backup.totais.usuarios}`);
    
    // Mantém apenas os últimos 48 backups (24h)
    const arquivos = fs.readdirSync(BACKUP_DIR)
      .filter(f => f.startsWith('backup-') && f.endsWith('.json'))
      .sort();
    
    if (arquivos.length > 48) {
      const paraApagar = arquivos.slice(0, arquivos.length - 48);
      paraApagar.forEach(f => {
        fs.unlinkSync(path.join(BACKUP_DIR, f));
        console.log('[BACKUP] apagado backup antigo:', f);
      });
    }
  } catch(e) {
    console.error('[BACKUP] erro:', e.message);
  }
}

function iniciarBackup() {
  console.log('[BACKUP] ⏱️ Backup automático iniciado — a cada 30 minutos');
  // Primeiro backup após 1 minuto do boot
  setTimeout(fazerBackup, 60 * 1000);
  // Depois a cada 30 minutos
  setInterval(fazerBackup, 30 * 60 * 1000);
}

module.exports = { fazerBackup, iniciarBackup };
