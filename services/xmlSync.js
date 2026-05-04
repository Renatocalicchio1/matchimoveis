const fs = require('fs');
const { execSync } = require('child_process');

function readJson(file, fallback) {
  try {
    return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : fallback;
  } catch (e) {
    return fallback;
  }
}

function writeJson(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
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

  return {
    ...antigo,
    ...novo,
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
  let imoveisAtuais = readJson('imoveis.json', []);

  for (const feed of feeds) {
    const ultima = new Date(feed.lastSyncAt || 0).getTime();
    const passou24h = (agora - ultima) >= (24 * 60 * 60 * 1000);

    if (!passou24h) continue;

    console.log('🔄 Sincronizando XML:', feed.url);

    const backupFile = `imoveis.backup-before-xmlsync-${Date.now()}.json`;
    writeJson(backupFile, imoveisAtuais);

    execSync(`node importXMLCompleto.js "${feed.url}"`, { stdio: 'inherit' });

    const importados = readJson('imoveis.json', []);
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

    writeJson('imoveis.json', imoveisAtuais);
    writeJson('xml-feeds.json', feeds);

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
