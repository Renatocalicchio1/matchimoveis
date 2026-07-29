const path = require('path');
const fs = require('fs');
const { execFile } = require('child_process');

function rodarImportXml(url) {
  return new Promise((resolve) => {
    // execFile roda o import como processo filho de forma assíncrona (não trava
    // a thread principal do servidor/health-check, diferente de execSync)
    execFile('node', ['importXMLCompleto.js', url], {
      cwd: path.join(__dirname, '..'),
      timeout: 3 * 60 * 1000,
      maxBuffer: 20 * 1024 * 1024
    }, (err, stdout, stderr) => {
      if (stdout) console.log(stdout.toString());
      if (stderr) console.error(stderr.toString());
      if (err) console.error('[xmlSync] erro ao importar', url, ':', err.message);
      resolve();
    });
  });
}
function getDataDir() {
  return process.env.RENDER ? '/opt/render/project/src/data' : path.join(__dirname, '..');
}

function readJson(file, fallback) {
  try {
    const full = path.join(getDataDir(), file); return fs.existsSync(full) ? JSON.parse(fs.readFileSync(full, "utf8")) : fallback;
  } catch (e) {
    return fallback;
  }
}

function writeJson(file, data) {
  fs.writeFileSync(path.join(getDataDir(), file), JSON.stringify(data, null, 2));
}

function getId(imovel) {
  return String(imovel.idExterno || imovel.idOriginal || imovel.id || imovel.codigo || '').trim();
}

function valorComparavel(v) {
  if (v === undefined || v === null) return '';
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v).trim();
}

function houveMudanca(antigo, novo) {
  const campos = [
    'titulo',
    'tipo',
    'bairro',
    'cidade',
    'estado',
    'valor_imovel',
    'area_m2',
    'quartos',
    'suites',
    'banheiros',
    'vagas',
    'descricao',
    'url',
    'fotos'
  ];

  return campos.some(campo => valorComparavel(antigo[campo]) !== valorComparavel(novo[campo]));
}

function mergeImovelAtualizado(antigo, novo) {
  const mudou = houveMudanca(antigo, novo);
  const agora = new Date().toISOString();

  // Campos manuais do corretor — nunca sobrescrever
  const camposPreservados = {
    proprietario: antigo.proprietario,
    proprietarioNome: antigo.proprietarioNome,
    proprietarioTelefone: antigo.proprietarioTelefone,
    proprietarioEmail: antigo.proprietarioEmail,
    destaque: antigo.destaque,
    observacoes: antigo.observacoes,
    statusManual: antigo.statusManual,
    userId: antigo.userId,
    codigoUsuario: antigo.codigoUsuario,
    inativo: antigo.inativo,
    descricao: antigo.descricao
  };
  // Remove campos undefined para nao sobrescrever com undefined
  Object.keys(camposPreservados).forEach(k => camposPreservados[k] === undefined && delete camposPreservados[k]);
  return {
    ...antigo,
    ...novo,
    ...camposPreservados,
    ativo: true,
    statusDisponibilidade: 'ativo',
    removedFromXmlAt: '',
    createdAt: antigo.createdAt || antigo.importedAt || antigo.lastUpdate || agora,
    importedAt: antigo.importedAt || antigo.createdAt || agora,
    updatedAt: mudou ? agora : (antigo.updatedAt || antigo.lastUpdate || antigo.createdAt || antigo.importedAt || agora),
    lastXmlSyncAt: agora
  };
}

async function syncXmlFeeds() {
  const feeds = readJson('xml-feeds.json', []);
  if (!feeds.length) return;

  const agora = Date.now();
  const { query, dbOk } = require('./db');
  let imoveisAtuais = [];
  if (await dbOk()) {
    try { const r = await query('SELECT dados FROM imoveis'); imoveisAtuais = r.rows.map(r=>r.dados); } catch(e) { console.error('[xmlSync] erro lendo imoveis PG:', e.message); }
  }

  for (const feed of feeds) {
    const ultima = new Date(feed.lastSyncAt || 0).getTime();
    const passou24h = (agora - ultima) >= (24 * 60 * 60 * 1000);

    if (!passou24h) continue;

    console.log('🔄 Sincronizando XML:', feed.url);

    await rodarImportXml(feed.url);

    let importados = [];
    if (await dbOk()) {
      try { const r2 = await query("SELECT dados FROM imoveis WHERE dados->>'userId'=$1", [feed.userId||'default']); importados = r2.rows.map(r=>r.dados); } catch(e) { console.error('[xmlSync] erro lendo importados PG:', e.message); }
    }
    const mapaImportados = new Map();

    for (const imovel of importados) {
      const id = getId(imovel);
      if (id) mapaImportados.set(id, imovel);
    }

    imoveisAtuais = imoveisAtuais.map(imovel => {
      const pertenceAoFeed =
        String(imovel.userId || imovel.usuarioId || imovel.corretorId || '') === String(feed.userId || 'default') ||
        String(feed.userId || 'default') === 'default';

      if (!pertenceAoFeed) return imovel;

      const id = getId(imovel);
      const novo = mapaImportados.get(id);

      if (novo) {
        return mergeImovelAtualizado(imovel, novo);
      }

      return {
        ...imovel,
        ativo: false,
        statusDisponibilidade: 'removido_xml',
        removedFromXmlAt: imovel.removedFromXmlAt || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        lastXmlSyncAt: new Date().toISOString()
      };
    });

    for (const novo of importados) {
      const idNovo = getId(novo);
      if (!idNovo) continue;

      const existe = imoveisAtuais.some(i => getId(i) === idNovo);
      if (!existe) {
        imoveisAtuais.push({
          ...novo,
          userId: feed.userId || 'default',
          ativo: true,
          statusDisponibilidade: 'ativo',
          createdAt: new Date().toISOString(),
          importedAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          lastXmlSyncAt: new Date().toISOString()
        });
      }
    }

    feed.lastSyncAt = new Date().toISOString();
    feed.lastResult = {
      ok: true,
      totalImportados: importados.length,
      syncedAt: new Date().toISOString()
    };

    writeJson('xml-feeds.json', feeds);
    // imoveis já salvos no PG via importXMLCompleto.js

    try { const { consumir } = require('./creditos'); consumir(feed.userId, 'sync_xml_24h').catch(()=>{}); } catch(e) {}
    console.log('✅ XML sincronizado:', feed.url);
  }
}

function startXmlSyncScheduler() {
  console.log('⏱️ Sync XML 24h ativado');
  setInterval(() => {
    syncXmlFeeds().catch(err => console.error('Erro sync XML:', err.message));
  }, 60 * 60 * 1000);
}

module.exports = { syncXmlFeeds, startXmlSyncScheduler };
