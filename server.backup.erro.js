
const fs = require('fs');

function readData() {
  try {
    return JSON.parse(fs.readFileSync('data.json', 'utf8'));
  } catch {
    return [];
  }
}

function writeData(data) {
  fs.writeFileSync('data.json', JSON.stringify(data, null, 2));
}

const { searchQuintoAndar } = require('./services/quintoandar');
const express = require('express');
const multer = require('multer');
const path = require('path');

const { parseWorkbook, removeDuplicates } = require('./services/parser');
const { createOriginFromRow } = require('./services/providers');
const { findTopMatches } = require('./services/matcher');
const { extractProperty } = require('./services/extractor');



const VISITAS_FILE = 'visitas.json';

function loadVisitas() {
  try {
    if (!fs.existsSync(VISITAS_FILE)) return [];
    return JSON.parse(fs.readFileSync(VISITAS_FILE, 'utf8'));
  } catch (err) {
    return [];
  }
}

function saveVisita(visita) {
  const visitas = loadVisitas();
  visitas.push({
    ...visita,
    status: visita.status || 'pendente_confirmacao_proprietario',
    createdAt: new Date().toISOString(),
    lastUpdate: new Date().toISOString(),
    source: 'manual'
  });
  fs.writeFileSync(VISITAS_FILE, JSON.stringify(visitas, null, 2));
}

const EVENTS_FILE = 'events.json';

function loadEvents() {
  try {
    if (!fs.existsSync(EVENTS_FILE)) return [];
    return JSON.parse(fs.readFileSync(EVENTS_FILE, 'utf8'));
  } catch (err) {
    return [];
  }
}

function saveEvent(event) {
  const events = loadEvents();
  events.push({
    ...event,
    at: new Date().toISOString()
  });
  fs.writeFileSync(EVENTS_FILE, JSON.stringify(events, null, 2));
}



const path = require('path');

function getUserDir(telefone) {
  const dir = path.join('data', 'corretores', telefone || 'default');
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

function saveUserFile(telefone, file, data) {
  const dir = getUserDir(telefone);
  fs.writeFileSync(require('path').join(dir, file), JSON.stringify(data, null, 2));
}
  const dir = getUserDir(telefone);
  fs.writeFileSync(require('path').join(dir, file), JSON.stringify(data, null, 2));
}
  const dir = getUserDir(telefone);
  fs.writeFileSync(path.join(dir, file), JSON.stringify(data, null, 2));
}

function loadUserFile(telefone, file) {
  const dir = getUserDir(telefone);
  const filePath = path.join(dir, file);
  if (!fs.existsSync(filePath)) return [];
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}


const app = express();
const port = process.env.PORT || 3000;
const upload = multer({
  dest: path.join(__dirname, 'uploads'),
  fileFilter: (req, file, cb) => {
    const allowed = ['.xlsx', '.xls', '.csv', '.numbers'];
    const ext = path.extname(file.originalname || '').toLowerCase();
    if (!allowed.includes(ext)) {
      return cb(new Error('Envie um arquivo Excel (.xlsx/.xls), CSV ou Numbers (.numbers).'));
    }
    cb(null, true);
  }
});

let globalResults = loadFromFile();

function saveToFile(data) {
  fs.writeFileSync('data.json', JSON.stringify(data, null, 2));
}

function loadFromFile() {
  if (!fs.existsSync('data.json')) return [];
  return JSON.parse(fs.readFileSync('data.json'));
}


app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());


function isDuplicateGlobal(newItem, existingItems) {
  return existingItems.some((item) =>
    item.clientName === newItem.clientName &&
    item.listingId === newItem.listingId &&
    item.listingUrl === newItem.listingUrl
  );
}

function emptyResult() {
  return null;
}

function clearUploadsDir() {
  const uploadsDir = path.join(__dirname, 'uploads');
  if (!fs.existsSync(uploadsDir)) return;
  for (const file of fs.readdirSync(uploadsDir)) {
    const filePath = path.join(uploadsDir, file);
    try {
      fs.unlinkSync(filePath);
    } catch (_) {
      // ignore
    }
  }
}

function mockExtractProperty(row, origin) {
  const catalog = {
    'https://www.imovelweb.com.br/propiedades/-3001522092.html': {
      tipo: 'Apartamento', titulo: 'Apartamento à venda Vila Maria Alta 70m²', logradouro: 'Avenida Belisário Pena', bairro: 'Vila Maria Alta', cidade: 'São Paulo', estado: 'SP', area_m2: 70, valor_m2: 7000, quartos: 3, suites: 1, banheiros: 2, vagas: 1, valor_imovel: 490000
    },
    'https://www.imovelweb.com.br/propiedades/-3015570366.html': {
      tipo: 'Apartamento', titulo: 'Apartamento à venda em Sé com 29 m²', logradouro: 'Rua Helena Zerrener', bairro: 'Sé', cidade: 'São Paulo', estado: 'SP', area_m2: 29, valor_m2: 4482, quartos: 1, suites: 0, banheiros: 1, vagas: 0, valor_imovel: 130000
    },
    'https://www.imovelweb.com.br/propiedades/-3029588019.html': {
      tipo: 'Apartamento', titulo: 'Apartamento para venda em Consolação com 53m²', logradouro: 'Rua Bela Cintra', bairro: 'Consolação', cidade: 'São Paulo', estado: 'SP', area_m2: 53, valor_m2: 14528, quartos: 2, suites: 1, banheiros: 2, vagas: 1, valor_imovel: 770000
    },
    'https://www.imovelweb.com.br/propiedades/-3026770158.html': {
      tipo: 'Casa', titulo: 'Sobrado para venda na Penha com 220m²', logradouro: 'Rua Aquilino Vidal', bairro: 'Penha', cidade: 'São Paulo', estado: 'SP', area_m2: 220, valor_m2: 3591, quartos: 3, suites: 1, banheiros: 2, vagas: 5, valor_imovel: 790000
    },
    'https://www.imovelweb.com.br/propiedades/-3026768552.html': {
      tipo: 'Casa', titulo: 'Sobrado para venda no Jardim Monte Santo com 112m²', logradouro: 'Rua Plácido Martinez', bairro: 'Jardim Monte Santo', cidade: 'São Paulo', estado: 'SP', area_m2: 112, valor_m2: 3125, quartos: 2, suites: 1, banheiros: 2, vagas: 2, valor_imovel: 350000
    },
    'https://loft.com.br/imovel/apartamento-rua-do-lago-ipiranga-sao-paulo-3-quartos-44m2/1vdj2fk?tipoTransacao=venda': {
      tipo: 'Apartamento', titulo: 'Apartamento à venda em Ipiranga com 44 m²', logradouro: 'Rua do Lago', bairro: 'Ipiranga', cidade: 'São Paulo', estado: 'SP', area_m2: 44, valor_m2: 8893, quartos: 3, suites: 1, banheiros: 1, vagas: 0, valor_imovel: 391320
    }
  };

  const sourceUrl = row.listingUrl || '';
  const data = catalog[sourceUrl];
  if (!data) {
    return {
      ...origin,
      extractionStatus: origin.needsBaseUrl ? 'aguardando_url_base' : 'pendente_configuracao',
      url: row.listingUrl || '',
      titulo: '',
      logradouro: '',
      bairro: '',
      cidade: '',
      estado: '',
      area_m2: '',
      valor_m2: '',
      quartos: '',
      suites: '',
      banheiros: '',
      vagas: '',
      valor_imovel: ''
    };
  }

  return {
    ...origin,
    extractionStatus: 'ok',
    url: row.listingUrl || '',
    ...data
  };
}

function buildFilters(processed) {
  const collect = (getter) => [...new Set(processed.map(getter).filter(Boolean))].sort((a, b) => String(a).localeCompare(String(b), 'pt-BR'));
  return {
    cities: collect((item) => item.origin?.cidade),
    neighborhoods: collect((item) => item.origin?.bairro),
    matchStatuses: [
      { value: 'all', label: 'Todos' },
      { value: 'with_matches', label: 'Com match' },
      { value: 'without_matches', label: 'Sem match' },
      { value: 'pending', label: 'Pendentes' },
      { value: 'ignored', label: 'Ignorados' }
    ]
  };
}

function renderHome(res, extra = {}) {
  let result = extra.result ?? null;

  if (!result) {
    const data = readData();
    const sortedResults = data.sort((a, b) => (b.bestScore || 0) - (a.bestScore || 0));

    result = {
      processed: sortedResults,
      stats: {
        original: sortedResults.length,
        unique: sortedResults.length,
        duplicates: 0,
        processed: sortedResults.length,
        withMatches: sortedResults.filter((item) => item.matches && item.matches.length > 0).length,
        pending: sortedResults.filter((item) => item.origin?.extractionStatus !== 'ok').length,
        ignored: sortedResults.filter((item) => item.ignored).length
      },
      duplicates: [],
      filters: buildFilters(sortedResults)
    };
  }

  res.render('index', {
    result: result ?? emptyResult(),
    flash: extra.flash || null
  });
}

app.get('/', (req, res) => {
  renderHome(res);
});

app.post('/reset', (req, res) => {
  lastResult = null;
  clearUploadsDir();
  renderHome(res, { flash: 'Base local zerada. Agora você pode subir uma nova planilha.' });
});

app.post('/process', upload.single('spreadsheet'), async (req, res) => {
  if (!req.file) {
    return res.status(400).render('index', {
      result: { error: 'Envie um arquivo Excel ou CSV para continuar.' },
      flash: null
    });
}
  try {
    const ext = path.extname(req.file.originalname || '').toLowerCase();
    const filePathForParsing = ext ? `${req.file.path}${ext}` : req.file.path;
    if (ext) fs.renameSync(req.file.path, filePathForParsing);

    const rows = parseWorkbook(filePathForParsing);
    const validRows = rows.filter((row) => row.clientName || row.contact || row.email || row.listingId || row.listingUrl);
    const { unique, duplicates } = removeDuplicates(validRows);

    const processed = [];
for (let i = 0; i < unique.length; i += 5) {
  const batch = unique.slice(i, i + 5);

  const results = await Promise.all(batch.map(async (row) => {
      const origin = createOriginFromRow(row);
      let property = await extractProperty(row, origin);

      if (property.bairro && (property.bairro.length > 40 || /guias|comprar|alugar|anunciar|aprenda/i.test(property.bairro))) {
        property.bairro = "";
        property.extractionStatus = "bairro_invalido";
      }
      const isValidLocation = property.extractionStatus === 'ok' && property.cidade === 'São Paulo' && property.estado === 'SP';
      let matches = [];

      const bestScore = null;

      return {
        clientName: row.clientName,
        contact: row.contact,
        email: row.email,
        listingId: row.listingId,
        listingUrl: row.listingUrl,
        processedAt: new Date().toISOString(),
        origin: property,
        ignored: property.extractionStatus === 'ok' && !isValidLocation,
        matches,
        bestScore,
        matchCount: matches.length,
        leadScore:
          bestScore >= 80 ? 'quente' :
          bestScore >= 50 ? 'morno' :
          'frio'
      };
    }));

  processed.push(...results);
}

    const visibleProcessed = processed;

    if (fs.existsSync(filePathForParsing)) fs.unlinkSync(filePathForParsing);

    const newResult = {
      stats: {
        original: validRows.length,
        unique: unique.length,
        duplicates: duplicates.length,
        processed: visibleProcessed.length,
        withMatches: processed.filter((item) => item.matches.length > 0).length,
        pending: processed.filter((item) => item.origin.extractionStatus !== 'ok').length,
        ignored: processed.filter((item) => item.ignored).length
      },
      processed: visibleProcessed,
      duplicates,
      filters: buildFilters(visibleProcessed)
    };

    newResult.processed.forEach(item => {
  if (!isDuplicateGlobal(item, globalResults)) {
    globalResults.push(item);
    globalResults.sort((a, b) => (b.bestScore || 0) - (a.bestScore || 0));
    saveToFile(globalResults);
  }
});

const mergedResult = {
  ...newResult,
  processed: globalResults.sort((a, b) => (b.bestScore || 0) - (a.bestScore || 0))
};

renderHome(res, { result: mergedResult, flash: 'Planilha adicionada com sucesso.' });
  } catch (error) {
    if (req.file) {
      const ext = path.extname(req.file.originalname || '').toLowerCase();
      const cleanupPath = ext ? `${req.file.path}${ext}` : req.file.path;
      if (fs.existsSync(cleanupPath)) fs.unlinkSync(cleanupPath);
      else if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
    }
    res.status(500).render('index', { result: { error: `Erro ao processar arquivo: ${error.message}` }, flash: null });
  }
});









app.post('/match-pending', async (req, res) => {
  try {
    const data = readData();

    for (let i = 0; i < data.length; i++) {
      const item = data[i];

      if (!item.origin) continue;
      if (item.matches && item.matches.length > 0) continue;
      if (item.ignored) continue;

      const property = item.origin;

      console.log('MATCH PERFIL:', i, property.tipo, property.bairro, property.quartos, property.valor_imovel);

      let candidatos = [];

      try {
        console.log('BUSCANDO QUINTOANDAR PERFIL:', i);
        const candidatosQA = await searchQuintoAndar(property);
        candidatos = candidatos.concat(candidatosQA || []);
      } catch (e) {
        console.log('ERRO QUINTOANDAR PERFIL', i, e.message);
      }

      try {
        console.log('BUSCANDO REMAX PERFIL:', i);
        const { searchRemax } = require('./services/remax');
        const candidatosRemax = await searchRemax(property);
        candidatos = candidatos.concat(candidatosRemax || []);
      } catch (e) {
        console.log('ERRO REMAX PERFIL', i, e.message);
      }

      const matches = findTopMatches(property, candidatos);
      if (matches.length > 0) {
        item.matches = matches;
        item.matchCount = matches.length;
        item.bestScore = matches[0]?.score || null;
        item.matchedAt = new Date().toISOString();
      }
      item.matchCount = matches.length;
      item.bestScore = matches[0]?.score || null;
      item.matchedAt = new Date().toISOString();

      writeData(data);

      console.log('MATCHES PERFIL', i, matches.length);
    }

    res.redirect('/');
  } catch (e) {
    console.error('Erro ao fazer match:', e);
    res.status(500).send('Erro ao fazer match: ' + e.message);
  }
});

app.get('/live-status', (req, res) => {
  res.json(liveStatus);
});

app.post('/process-live', upload.single('spreadsheet'), async (req, res) => {
  if (!req.file) return res.status(400).json({ ok: false, error: 'Envie uma planilha.' });

  liveStatus = {
    processing: true,
    matching: false,
    message: 'Processando planilha...',
    processed: 0,
    matched: 0,
    total: 0
  };

  res.json({ ok: true });

  (async () => {
    try {
      const ext = path.extname(req.file.originalname || '').toLowerCase();
      const filePathForParsing = ext ? `${req.file.path}${ext}` : req.file.path;
      if (ext) fs.renameSync(req.file.path, filePathForParsing);

      const rows = parseWorkbook(filePathForParsing);
      const validRows = rows.filter((row) => row.clientName || row.contact || row.email || row.listingId || row.listingUrl);
      const { unique } = removeDuplicates(validRows);

      liveStatus.total = unique.length;

      for (const row of unique) {
        const origin = createOriginFromRow(row);
        let property = await extractProperty(row, origin);

        if (property.bairro && (property.bairro.length > 40 || /guias|comprar|alugar|anunciar|aprenda/i.test(property.bairro))) {
          property.bairro = "";
          property.extractionStatus = "bairro_invalido";
        }

        const isValidLocation = property.extractionStatus === 'ok' && property.cidade === 'São Paulo' && property.estado === 'SP';

        const item = {
          clientName: row.clientName,
          contact: row.contact,
          email: row.email,
          listingId: row.listingId,
          listingUrl: row.listingUrl,
          processedAt: new Date().toISOString(),
          origin: property,
          ignored: property.extractionStatus === 'ok' && !isValidLocation,
          matches: [],
          bestScore: 0,
          matchCount: 0,
          matchedAt: null,
          leadScore: 'frio'
        };

        if (!isDuplicateGlobal(item, globalResults)) {
          globalResults.push(item);
          globalResults.sort((a, b) => (b.bestScore || 0) - (a.bestScore || 0));
          saveToFile(globalResults);
        }

        liveStatus.processed++;
        liveStatus.message = `Processados ${liveStatus.processed} de ${liveStatus.total}`;
      }

      if (fs.existsSync(filePathForParsing)) fs.unlinkSync(filePathForParsing);

      liveStatus.processing = false;
      liveStatus.message = 'Processamento concluído.';
    } catch (error) {
      liveStatus.processing = false;
      liveStatus.message = 'Erro ao processar: ' + error.message;
    }
  })();
});

app.post('/match-live', async (req, res) => {
  liveStatus.matching = true;
  liveStatus.processing = false;
  liveStatus.message = 'Fazendo match...';
  liveStatus.matched = 0;
  liveStatus.total = globalResults.filter(item => {
    const property = item.origin;
    const alreadyMatched = item.matches && item.matches.length > 0;
    return !alreadyMatched &&
      property &&
      property.extractionStatus === 'ok' &&
      property.cidade === 'São Paulo' &&
      property.estado === 'SP' &&
      property.bairro &&
      property.valor_imovel &&
      property.quartos;
  }).length;

  res.json({ ok: true });

  (async () => {
    try {
      function bairroValido(bairro) {
        if (!bairro) return false;
        if (String(bairro).trim().length < 3) return false;
        if (/^\d+$/.test(String(bairro).trim())) return false;
        if (String(bairro).trim().toLowerCase() === "são paulo") return false;
        if (String(bairro).trim().toLowerCase() === "sao paulo") return false;
        if (bairro.length > 40) return false;
        if (/guias|comprar|alugar|anunciar|aprenda/i.test(bairro)) return false;
        return true;
      }

      for (const item of globalResults) {
        const property = item.origin;
        const alreadyMatched = item.matches && item.matches.length > 0;

        if (alreadyMatched) continue;

        if (
          property &&
          property.extractionStatus === 'ok' &&
          property.cidade === 'São Paulo' &&
          property.estado === 'SP' &&
          bairroValido(property.bairro) &&
          property.valor_imovel &&
          property.quartos
        ) {
          console.log('MATCH LIVE:', property.tipo, property.bairro, property.quartos, property.valor_imovel);

          const results = await searchQuintoAndar(property);
          const matches = findTopMatches(property, results, 8);

          if (matches.length > 0) {
        item.matches = matches;
        item.matchCount = matches.length;
        item.bestScore = matches[0]?.score || null;
        item.matchedAt = new Date().toISOString();
      }
          item.matchedAt = new Date().toISOString();
          item.bestScore = matches.length ? matches[0].score : 0;
          item.matchCount = matches.length;
          item.leadScore =
            item.bestScore >= 80 ? 'quente' :
            item.bestScore >= 50 ? 'morno' :
            'frio';

          globalResults.sort((a, b) => (b.bestScore || 0) - (a.bestScore || 0));
          saveToFile(globalResults);

          liveStatus.matched++;
          liveStatus.message = `Match processado ${liveStatus.matched} de ${liveStatus.total}`;
        }
      }

      liveStatus.matching = false;
      liveStatus.message = 'Match concluído.';
    } catch (error) {
      liveStatus.matching = false;
      liveStatus.message = 'Erro no match: ' + error.message;
    }
  })();
});



app.post('/track', express.json(), (req, res) => {
  try {
    saveEvent({
      type: req.body.type,
      offerToken: req.body.offerToken,
      matchIdx: req.body.matchIdx,
      url: req.body.url,
      userAgent: req.headers['user-agent'] || ''
    });

    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});


app.get('/login', (req, res) => {
  res.render('login');
});

app.post('/login', (req, res) => {
  const { perfil, nome, telefone, email } = req.body;
  const params = new URLSearchParams({ perfil, nome, telefone, email });
  res.redirect('/app?' + params.toString());
});



app.get('/app/imovel/novo', (req, res) => {
  res.render('imovel-form');
});

app.post('/app/imovel/novo', (req, res) => {
  const data = req.body;

  const imovel = {
    tipoCategoria: data.tipoCategoria,
    tipo: data.tipo,
    endereco: {
      bairro: data.bairro,
      cidade: data.cidade,
      estado: data.estado
    },
    preco: Number(data.preco || 0),
    area: Number(data.area || 0),
    quartos: Number(data.quartos || 0),
    suites: Number(data.suites || 0),
    banheiros: Number(data.banheiros || 0),
    vagas: Number(data.vagas || 0),
    descricao: data.descricao || '',

    proprietario: {
      nome: data.propNome,
      telefone: data.propTelefone,
      email: data.propEmail
    },

    createdAt: new Date().toISOString(),
    lastUpdate: new Date().toISOString(),
    source: 'manual'
  };

  let lista = [];
  try {
    lista = JSON.parse(require('fs').readFileSync('imoveis.json','utf8'));
  } catch(e){}

  lista.push(imovel);
  require('fs').writeFileSync('imoveis.json', JSON.stringify(lista,null,2));

  res.redirect('/app/corretor');
});


app.get('/app/imoveis', (req, res) => {
  let imoveis = [];
  try {
    imoveis = JSON.parse(require('fs').readFileSync('imoveis.json','utf8'));
  } catch(e){}

  res.render('app-imoveis', { imoveis });
});

app.get('/app/corretor', (req, res) => {
  const data = globalResults || [];

  const leads = data.map((item, idx) => ({
    idx,
    nome: item.clientName || '',
    contato: item.contact || '',
    matchCount: item.matches ? item.matches.length : 0,
    bestScore: item.bestScore || 0,
    offerToken: item.offerToken || ''
  }));

  res.render('app-corretor', { leads });
});

app.get('/app', (req, res) => {
  res.render('app-home', {
    perfil: req.query.perfil || '',
    nome: req.query.nome || '',
    telefone: req.query.telefone || '',
    email: req.query.email || ''
  });
});

app.get('/oferta/:id', (req, res) => {
  const id = req.params.id;

  let idx = Number(id);
  let item = Number.isInteger(idx) ? globalResults[idx] : null;

  if (!item) {
    idx = globalResults.findIndex(x => x.offerToken === id);
    item = idx >= 0 ? globalResults[idx] : null;
  }

  if (!item) return res.status(404).send('Oferta não encontrada');

  res.render('oferta', { item, idx });
});



app.get('/agendar/:token/:matchIdx', (req, res) => {
  const { token, matchIdx } = req.params;

  const item = globalResults.find(x => x.offerToken === token);
  if (!item) return res.status(404).send('Oferta não encontrada');

  const idx = Number(matchIdx);
  const match = item.matches && item.matches[idx];
  if (!match) return res.status(404).send('Imóvel não encontrado');

  res.render('agendar', { item, match, matchIdx: idx });
});

app.post('/agendar', (req, res) => {
  const { offerToken, matchIdx, nome, telefone, email, dataPreferida, horarioPreferido, observacao } = req.body;

  const item = globalResults.find(x => x.offerToken === offerToken);
  if (!item) return res.status(404).send('Oferta não encontrada');

  const idx = Number(matchIdx);
  const match = item.matches && item.matches[idx];
  if (!match) return res.status(404).send('Imóvel não encontrado');

  saveUserFile(telefone,'visitas.json',{
    offerToken,
    matchIdx: idx,
    cliente: {
      nome: nome || item.clientName || '',
      telefone: telefone || item.contact || '',
      email: email || item.email || ''
    },
    imovel: {
      fonte: match.fonte || match.source || '',
      url: match.url || '',
      tipo: match.tipo || '',
      bairro: match.bairro || '',
      cidade: match.cidade || 'São Paulo',
      estado: match.estado || 'SP',
      valor_imovel: match.valor_imovel || '',
      area_m2: match.area_m2 || '',
      quartos: match.quartos || '',
      suites: match.suites || '',
      banheiros: match.banheiros || '',
      vagas: match.vagas || ''
    },
    dataPreferida,
    horarioPreferido,
    observacao,
    status: 'pendente_confirmacao_proprietario'
  });

  saveEvent({
    type: 'visita_solicitada',
    offerToken,
    matchIdx: idx,
    url: match.url || '',
    userAgent: req.headers['user-agent'] || ''
  });

  res.render('agendamento-ok', { item, match });
});

app.get('/imovel/:token/:matchIdx', (req, res) => {
  const { token, matchIdx } = req.params;

  const item = globalResults.find(x => x.offerToken === token);
  if (!item) return res.status(404).send('Oferta não encontrada');

  const idx = Number(matchIdx);
  const match = item.matches && item.matches[idx];

  if (!match) return res.status(404).send('Imóvel não encontrado');

  res.render('imovel', { item, match, matchIdx: idx });
});

app.listen(port, () => {
  console.log(`MatchImoveis rodando em http://localhost:${port}`);
});


app.get('/enviar-lead/:id', async (req, res) => {
  try {
    const data = JSON.parse(fs.readFileSync('data.json','utf8'));
    const item = data[req.params.id];

    if (!item) return res.send('Lead não encontrado');

    const origin = item.origin || {};
    const matches = item.matches || [];

    let texto = '*NOVO LEAD COM MATCH*\\n\\n';
    texto += 'Tipo: ' + (origin.tipo || '-') + '\\n';
    texto += 'Bairro: ' + (origin.bairro || '-') + '\\n';
    texto += 'Quartos: ' + (origin.quartos || '-') + '\\n';
    texto += 'Valor: ' + (origin.valor_imovel || '-') + '\\n\\n';

    texto += '*MATCHES:*\\n';

    matches.slice(0,5).forEach((m, i) => {
      texto += '\\n' + (i+1) + '. R$ ' + (m.valor_imovel || m.valor || '-') +
               ' | ' + (m.area_m2 || m.area || '-') + 'm²\\n' +
               (m.url || '-') + '\\n';
    });

    const sid = await sendWhatsApp(process.env.TEST_CORRETOR_WHATSAPP, texto);

    res.send('ENVIADO: ' + sid);
  } catch (e) {
    console.error(e);
    res.send('Erro ao enviar');
  }
});
