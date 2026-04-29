const { searchQuintoAndar } = require('./services/quintoandar');
const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const { parseWorkbook, removeDuplicates } = require('./services/parser');
const { createOriginFromRow } = require('./services/providers');
const { findTopMatches } = require('./services/matcher');
const { extractProperty } = require('./services/extractor');

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
  const fs = require('fs');
  fs.writeFileSync('data.json', JSON.stringify(data, null, 2));
}

function loadFromFile() {
  const fs = require('fs');
  if (!fs.existsSync('data.json')) return [];
  return JSON.parse(fs.readFileSync('data.json'));
}


app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.urlencoded({ extended: true }));


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

  if (!result && globalResults.length) {
    const sortedResults = globalResults.sort((a, b) => (b.bestScore || 0) - (a.bestScore || 0));

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
        console.log('MATCH:', property.tipo, property.bairro, property.quartos, property.valor_imovel);

        const results = await searchQuintoAndar(property);
        const matches = findTopMatches(property, results, 5);

        item.matches = matches;
        item.bestScore = matches.length ? matches[0].score : 0;
        item.matchCount = matches.length;
        item.leadScore =
          item.bestScore >= 80 ? 'quente' :
          item.bestScore >= 50 ? 'morno' :
          'frio';
      }
    }

    globalResults.sort((a, b) => (b.bestScore || 0) - (a.bestScore || 0));
    saveToFile(globalResults);
    res.redirect('/');
  } catch (e) {
    res.status(500).send('Erro ao fazer match: ' + e.message);
  }
});



app.listen(port, () => {
  console.log(`MatchImoveis rodando em http://localhost:${port}`);
});
