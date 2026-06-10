const fs = require('fs');
const { salvarImovel } = require('./services/salvarImovel');
const axios = require('axios');
const XLSX = require('xlsx');
const { XMLParser } = require('fast-xml-parser');

const XML_URL = process.argv[2];
const USER_ID = process.argv[3] || '';
const EXCEL_FILE = process.argv[4];

if (!XML_URL) {
  console.log('Uso: node importXMLCompleto.js URL_XML [arquivo.xlsx]');
  process.exit();
}

const path = require('path');
const DATA_DIR = process.env.RENDER ? '/opt/render/project/src/data' : __dirname;
const FILE = path.join(DATA_DIR, 'imoveis.json');
const { salvarTodosImoveis } = require('./services/salvarImovel');

function normalizeId(id) {
  return String(id || '').replace(/\D/g, '').trim();
}

function saveData(data) {
  // Fallback JSON — mantido para compatibilidade local
  try { fs.writeFileSync(FILE, JSON.stringify(data, null, 2)); } catch(e) {}
}
async function saveImovelPG(imovel) {
  try { await salvarImovel(imovel); } catch(e) { console.error('[PG]', e.message); }
}

function extractNumber(field) {
  if (!field && field !== 0) return 0;
  if (typeof field === 'number') return field;
  if (typeof field === 'string') return Number(field) || 0;
  if (typeof field === 'object') {
    const val = field['#text'] ?? field['@_value'] ?? '';
    return Number(val) || 0;
  }
  return 0;
}

function extractText(field) {
  if (!field) return '';
  if (typeof field === 'string') return field.trim();
  if (typeof field === 'object') {
    return String(field['#text'] ?? field['@_abbreviation'] ?? '').trim();
  }
  return '';
}

function normalizeTipo(raw) {
  const t = (raw || '').toLowerCase();
  if (t.includes('residential/condo') || t.includes('casa em condominio') || t.includes('casa condominio')) return 'Casa de Condomínio';
  if (t.includes('apartment') || t.includes('apartamento')) return 'Apartamento';
  if (t.includes('cobertura') || t.includes('penthouse')) return 'Cobertura';
  if (t.includes('sobrado')) return 'Sobrado';
  if (t.includes('loft')) return 'Loft';
  if (t.includes('duplex')) return 'Duplex';
  if (t.includes('kitnet') || t.includes('conjugado') || t.includes('quitinete')) return 'Kitnet / Conjugado';
  if (t.includes('studio')) return 'Studio / Flat';
  if (t.includes('flat') || t.includes('apart hotel') || t.includes('apart-hotel')) return 'Flat / Apart Hotel';
  if (t.includes('mansao') || t.includes('mansão')) return 'Mansão';
  if (t.includes('chacara') || t.includes('chácara')) return 'Chácara';
  if (t.includes('sitio') || t.includes('sítio')) return 'Sítio';
  if (t.includes('fazenda')) return 'Fazenda';
  if (t.includes('house') || t.includes('casa')) return 'Casa';
  if (t.includes('residential / agricultural') || t.includes('rural') || t.includes('area rural') || t.includes('área rural')) return 'Área Rural';
  if (t.includes('residential / farm') || t.includes('farm')) return 'Fazenda';
  if (t.includes('residential')) return 'Casa';
  if (t.includes('galpao') || t.includes('galpão') || t.includes('deposito') || t.includes('depósito') || t.includes('warehouse')) return 'Galpão / Depósito';
  if (t.includes('predio') || t.includes('prédio') || t.includes('building')) return 'Prédio Comercial';
  if (t.includes('conjunto')) return 'Conjunto Comercial';
  if (t.includes('hotel') || t.includes('pousada')) return 'Hotel / Pousada';
  if (t.includes('consultorio') || t.includes('consultório')) return 'Consultório';
  if (t.includes('restaurante') || t.includes('bar')) return 'Restaurante / Bar';
  if (t.includes('loja') || t.includes('shop') || t.includes('store')) return 'Loja';
  if (t.includes('sala') || t.includes('office') || t.includes('commercial') || t.includes('comercial')) return 'Sala Comercial';
  if (t.includes('terreno comercial') || t.includes('commercial land')) return 'Terreno Comercial';
  if (t.includes('land') || t.includes('terreno') || t.includes('lote')) return 'Terreno / Lote';
  if (t.includes('condo') || t.includes('condominio')) return 'Casa de Condomínio';
  return raw || '';
}


const mapaFeatures = {
  'furnished': 'mobiliado', 'semi-furnished': 'semi_mobiliado',
  'bbq': 'churrasqueira', 'pool': 'piscina', 'gym': 'academia',
  'party room': 'salao_festas', 'playground': 'playground',
  'toys place': 'playground', 'sauna': 'sauna',
  'movie theater': 'cinema', 'media room': 'cinema',
  'close to schools': 'escola', 'close to shopping centers': 'shopping',
  'close to subway': 'metro', 'close to bus': 'onibus',
  'elevator': 'elevador', 'doorman': 'portaria_24h',
  'gated community': 'condominio_fechado', 'balcony': 'varanda',
  'garden': 'jardim', 'pet friendly': 'pet_friendly',
  'solar energy': 'solar', 'air conditioning': 'ar_condicionado',
  'sea view': 'vista_mar', 'alarm': 'alarme',
  'intercom': 'interfone', 'electric gate': 'portao_eletronico',
  'cameras': 'cameras', 'storage': 'deposito',
  'backyard': 'quintal', 'rooftop': 'rooftop',
  'coworking': 'coworking', 'sports court': 'quadra',
  'fenced yard': 'condominio_fechado', 'kitchen': '',
};
function parseListing(l) {
  try {
    const idRaw = l.ListingID || l.ListingId || l.Id;
    const details = l.Details || {};
    const location = l.Location || {};
    const media = l.Media || {};
    const ownerInfo = l.OwnerInfo || {};

    let fotos = [];
    let tourVirtual = '';
    if (media.Item) {
      const items = Array.isArray(media.Item) ? media.Item : [media.Item];
      items.forEach(i => {
        const url = typeof i === 'string' ? i : (i['#text'] || i.MediaURL || i.url || '');
        if (!url) return;
        const type = (typeof i === 'object' && (i['@_medium'] || i['@_type'] || i.medium || i.type || '')).toUpperCase();
        if (type === 'VIDEO' || /youtube|vimeo|\.mp4/.test(url)) {
          if (!tourVirtual) tourVirtual = url;
        } else {
          fotos.push(url);
        }
      });
    }
    if (!tourVirtual) tourVirtual = l.VirtualTourLink || '';

    return {
      id: 'MI-' + Date.now() + '-' + Math.random().toString(36).substr(2,6).toUpperCase(),
      idExterno: idRaw,
      idOriginal: idRaw,
      idInterno: 'MI-' + Date.now() + '-' + Math.random().toString(36).substr(2,9).toUpperCase(),
      titulo: l.Title || '',
      transacao: l.TransactionType === 'For Sale' ? 'venda' : 'aluguel',
      tipo: normalizeTipo(extractText(details.PropertyType)),
      categoria: extractText(details.UsageType),
      condicao: (() => {
        const cat = (extractText(details.UsageType) || '').toLowerCase();
        const tit = (l.Title || '').toLowerCase();
        const desc = (l.Description || '').toLowerCase();
        if (cat.includes('launch') || cat.includes('lancamento') || tit.includes('lançamento') || tit.includes('lancamento') || desc.includes('lançamento')) return 'lancamento';
        if (cat.includes('new') || cat.includes('novo') || tit.includes('novo') || tit.includes(' na planta') || desc.includes('na planta')) return 'novo';
        return 'usado';
      })(),
      fase: (() => {
        const _desc = (l.Description || '').toLowerCase();
        const _tit = (l.Title || '').toLowerCase();
        const _txt = _desc + ' ' + _tit;
        if (_txt.includes('pronto para morar') || _txt.includes('pronto pra morar') || _txt.includes('entregue') || _txt.includes('pronto p/ morar')) return 'pronto';
        if (_txt.includes('lançamento') || _txt.includes('lancamento')) return 'lancamento';
        if (_txt.includes('na planta') || _txt.includes('apartamento na planta')) return 'na_planta';
        if (_txt.includes('em construção') || _txt.includes('em construcao') || _txt.includes('em obras')) return 'em_construcao';
        return '';
      })(),
      bairro: extractText(location.Neighborhood),
      cidade: extractText(location.City),
      estado: (() => {
        const _map = {'SP':'São Paulo','SC':'Santa Catarina','BA':'Bahia','RJ':'Rio de Janeiro','MG':'Minas Gerais','PR':'Paraná','RS':'Rio Grande do Sul','GO':'Goiás','DF':'Distrito Federal','PE':'Pernambuco','CE':'Ceará','AM':'Amazonas','PA':'Pará','MT':'Mato Grosso','MS':'Mato Grosso do Sul','ES':'Espírito Santo','RN':'Rio Grande do Norte','PB':'Paraíba','AL':'Alagoas','PI':'Piauí','MA':'Maranhão','SE':'Sergipe','TO':'Tocantins','RO':'Rondônia','AC':'Acre','RR':'Roraima','AP':'Amapá'};
        const _e = extractText(location.State) || '';
        return _map[_e.trim().toUpperCase()] || _e;
      })(),
      endereco: extractText(location.Address),
      numero: extractText(location.StreetNumber),
      complemento: extractText(location.Complement),
      cep: extractText(location.PostalCode),
      latitude: Number(location.Latitude) || null,
      longitude: Number(location.Longitude) || null,
      valor_imovel: extractNumber(details.ListPrice),
      condominio: extractNumber(details.PropertyAdministrationFee),
      iptu: extractNumber(details.Iptu) || extractNumber(details.YearlyTax) || 0,
      area_m2: extractNumber(details.LivingArea),
      area_total: extractNumber(details.LotArea),
      quartos: Number(details.Bedrooms) || 0,
      suites: Number(details.Suites) || 0,
      banheiros: Number(details.Bathrooms) || 0,
      vagas: extractNumber(details.Garage) || 0,
      diferenciais: (() => {
        const feats = details.Features?.Feature || [];
        const arr = Array.isArray(feats) ? feats : [feats];
        return arr.map(f => {
          const key = (typeof f === 'string' ? f : f['#text'] || f._text || '').toLowerCase().trim();
          return mapaFeatures[key] || null;
        }).filter(Boolean);
      })(),
      anoContrucao: details.YearBuilt || '',
      descricao: (() => {
        let d = l.Description || extractText(details.Description) || '';
        // remover chamadas para visita com nome do corretor
        d = d.replace(/Agende\s+j[aá]\s+as\s+suas\s+visitas[^.]*\./gi, '').trim();
        d = d.replace(/Agende\s+suas\s+visitas[^.]*\./gi, '').trim();
        d = d.replace(/s{2,}/g, ' ').trim();
        // desescapa HTML
        d = d.replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&#39;/g,"'");
        // remove tags br
        d = d.replace(/<br\s*\/?>/gi,' ').replace(/\s{2,}/g,' ').trim();
        return d;
      })(),
      fotos,
      tourVirtual,
      corretor: {
        nome: extractText(ownerInfo.Name),
        email: extractText(ownerInfo.Email),
        telefone: extractText(ownerInfo.Telephone),
      },
      fonte: extractText(l.ContactInfo?.Name || l.ContactInfo?.name) || 'XML',
      source: 'xml',
      userId: USER_ID,
      usuarioId: USER_ID,
      xmlUrl: XML_URL,
      xml_url: XML_URL,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      _camposDesconhecidos: (() => {
        // Detecta campos do XML que não estão mapeados
        const camposMapeados = new Set([
          'ListingID','ListingId','Id','Title','TransactionType','DetailViewUrl',
          'PublicationType','Description','PropertyType','UsageType','ListPrice',
          'PropertyAdministrationFee','Iptu','YearlyTax','LotArea','LivingArea',
          'Bedrooms','Bathrooms','Suites','Garage','YearBuilt','Features',
          'Address','StreetNumber','PostalCode','State','City','Neighborhood',
          'Latitude','Longitude','Complement','Floor','Tower','Unit'
        ]);
        const desconhecidos = {};
        // Verifica campos em Details
        Object.keys(details || {}).forEach(k => {
          if (!camposMapeados.has(k)) desconhecidos['Details.'+k] = details[k];
        });
        // Verifica campos em Location
        Object.keys(location || {}).forEach(k => {
          if (!camposMapeados.has(k)) desconhecidos['Location.'+k] = location[k];
        });
        if (Object.keys(desconhecidos).length > 0) {
          const logPath = require('path').join(process.env.RENDER ? '/opt/render/project/src/data' : require('path').join(__dirname), 'campos-desconhecidos.json');
          try {
            const log = require('fs').existsSync(logPath) ? JSON.parse(require('fs').readFileSync(logPath,'utf8')) : {};
            Object.keys(desconhecidos).forEach(k => {
              if (!log[k]) log[k] = { exemplo: JSON.stringify(desconhecidos[k]).slice(0,100), count: 0, descoberto: new Date().toISOString() };
              log[k].count++;
            });
            require('fs').writeFileSync(logPath, JSON.stringify(log, null, 2));
          } catch(e) {}
        }
        return Object.keys(desconhecidos);
      })(),
      lastCheckedAt: new Date().toISOString(),
      proprietario: {
        nome: '',
        telefone: '',
        email: '',
        status: 'pendente'
      }
    };
  } catch (e) {
    console.error('Erro ao parsear listing:', e.message);
    return null;
  }
}

function loadExcel(file) {
  const wb = XLSX.readFile(file);
  const sheet = wb.Sheets[wb.SheetNames[0]];
  return XLSX.utils.sheet_to_json(sheet);
}

function findOwner(imovelId, rows) {
  return rows.find(r => {
    const possibleIds = [r.id, r.ID, r.codigo, r.codigo_imovel, r.ListingID, r.listing_id];
    return possibleIds.some(pid =>
      normalizeId(pid).includes(imovelId) || imovelId.includes(normalizeId(pid))
    );
  });
}

async function run() {
  let xml;
  if(XML_URL.startsWith('http://') || XML_URL.startsWith('https://')){
    console.log('⬇️  Baixando XML da URL...');
    const res = await axios.get(XML_URL);
    xml = res.data;
  } else {
    console.log('📂 Lendo XML do arquivo local:', XML_URL);
    if(!fs.existsSync(XML_URL)){
      console.error('❌ Arquivo não encontrado:', XML_URL);
      process.exit(1);
    }
    xml = fs.readFileSync(XML_URL, 'utf8');
    console.log('✅ Arquivo lido, tamanho:', xml.length, 'bytes');
  }

  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    textNodeName: '#text',
    parseAttributeValue: true,
    removeNSPrefix: true,
    allowBooleanAttributes: true,
  });

  const json = parser.parse(xml);

  const listings =
    json?.ListingDataFeed?.Listings?.Listing ||
    json?.Listings?.Listing ||
    [];

  const arr = Array.isArray(listings) ? listings : [listings];
  console.log('🏠 Imóveis no XML:', arr.length);

  const novos = arr.map(parseListing).filter(Boolean);

  if (EXCEL_FILE) {
    console.log('📊 Carregando Excel...');
    const rows = loadExcel(EXCEL_FILE);
    let vinculados = 0;
    novos.forEach(n => {
      const owner = findOwner(n.idExterno, rows);
      if (owner) {
        n.proprietario = {
          nome: owner.nome || owner.Nome || '',
          telefone: owner.telefone || owner.Telefone || '',
          email: owner.email || owner.Email || '',
          status: 'vinculado'
        };
        vinculados++;
      }
    });
    console.log('🔗 Proprietários vinculados:', vinculados);
  }

  // Busca imóveis antigos do PostgreSQL em vez do JSON
  let atuais = [];
  try {
    const { query: _qAnt } = require('./services/db');
    // busca por codigo_usuario atual E user_id legado
    const _uRes = await _qAnt("SELECT dados->>'user_id_legado' as legado FROM usuarios WHERE codigo_usuario=$1", [USER_ID]);
    const _legadoId = _uRes.rows[0]?.legado || null;
    const _res = _legadoId
      ? await _qAnt('SELECT * FROM imoveis WHERE user_id=$1 OR user_id=$2', [USER_ID, _legadoId])
      : await _qAnt('SELECT * FROM imoveis WHERE user_id=$1', [USER_ID]);
    atuais = _res.rows.map(r => ({
      ...r,
      idExterno: r.id_externo,
      idInterno: r.id_interno,
      userId: r.user_id,
      proprietario: r.proprietario || {},
      descricao: r.descricao,
      descricaoEditada: r.descricao_editada,
      fotos: r.fotos || [],
      status: r.status
    }));
    console.log('[importXML] Carregados', atuais.length, 'imóveis antigos do PostgreSQL');
  } catch(e) {
    console.error('[importXML] Erro ao carregar antigos:', e.message);
    atuais = fs.existsSync(FILE) ? JSON.parse(fs.readFileSync(FILE,'utf8')) : [];
  }
  // REMOVE todos os imóveis antigos desse usuário
const restantes = atuais.filter(i => {
  const dono = String(i.userId || i.usuarioId || i.corretorId || '');
  return dono !== String(USER_ID);
});

// ADICIONA os novos já limpos
const novosFormatados = novos.map(n => ({
  ...n,
  userId: USER_ID,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  lastCheckedAt: new Date().toISOString()
}));

// IDS que vieram no XML
const idsNovos = new Set(novos.map(n => String(n.idExterno)));

// Imóveis antigos desse usuário
const antigosDoUsuario = atuais.filter(i => {
  const dono = String(i.userId || i.usuarioId || i.corretorId || '');
  return dono === String(USER_ID);
});

// Marca como inativo quem não veio no XML (só se USER_ID válido e mesma fonte/xml_url)
const inativos = USER_ID ? antigosDoUsuario
  .filter(i => {
    if(idsNovos.has(String(i.idExterno))) return false; // ainda existe no XML
    if(XML_URL && i.xml_url && String(i.xml_url).trim() !== String(XML_URL).trim()) return false; // veio de outra fonte
    return true;
  })
  .map(i => ({
    ...i,
    status: 'inativo',
    updatedAt: new Date().toISOString()
  })) : [];

// Novos ativos (reativa se estava inativo, preserva proprietario vinculado)
const novosFormatadosComStatus = novos.map(n => {
  const antigo = antigosDoUsuario.find(a => String(a.idExterno) === String(n.idExterno));
  // Preservar proprietario se foi vinculado via CRM ou tem telefone cadastrado
  const temProprietarioVinculado = antigo && antigo.proprietario && (
    antigo.proprietario.status === 'vinculado_crm' ||
    antigo.proprietario.telefone ||
    antigo.proprietario.fonteVinculo
  );
  const proprietarioPreservado = temProprietarioVinculado
    ? antigo.proprietario
    : n.proprietario;
  // Preservar descrição editada manualmente
  const descricaoPreservada = antigo && antigo.descricaoEditada
    ? antigo.descricao
    : n.descricao;
  return {
    ...antigo,
    ...n,
    descricao: descricaoPreservada,
    proprietario: proprietarioPreservado,
    userId: USER_ID,
    status: 'ativo',
    createdAt: antigo ? antigo.createdAt : new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    lastCheckedAt: new Date().toISOString()
  };
});

// Calcula imóveis realmente novos (não existiam antes)
const idsAntigos = new Set(antigosDoUsuario.map(a => String(a.idExterno || '')).filter(Boolean));
const imoveisNovos = novosFormatadosComStatus.filter(n => !idsAntigos.has(String(n.idExterno || '')));
console.log('[importXML] Imóveis novos:', imoveisNovos.length, '| Já existiam:', novosFormatadosComStatus.length - imoveisNovos.length);
const final = [...restantes, ...novosFormatadosComStatus, ...inativos];
  // Salva no PostgreSQL
  try {
    await salvarTodosImoveis(final);
    console.log('[importXML] Salvo no PostgreSQL:', final.length, 'imóveis');
  } catch(e) {
    console.error('[importXML] Erro PostgreSQL:', e.message);
    saveData(final);
  }

  const comValor = novos.filter(n => n.valor_imovel > 0).length;
  const comArea = novos.filter(n => n.area_m2 > 0).length;
  const comFotos = novos.filter(n => n.fotos.length > 0).length;

  // Cobra créditos apenas pelos imóveis novos
  if (USER_ID && imoveisNovos.length > 0) {
    try {
      const { consumir } = require('./services/creditos');
      for (let _ic = 0; _ic < imoveisNovos.length; _ic++) {
        await consumir(USER_ID, 'importar_xml');
      }
      console.log('[importXML] Créditos consumidos:', imoveisNovos.length * 10, '(' + imoveisNovos.length + ' imóveis novos)');
    } catch(e) { console.error('[creditos]', e.message); }
  }
  console.log('✅ Total imóveis salvos:', novos.length);
  console.log('💰 Com valor:', comValor);
  console.log('📐 Com área:', comArea);
  console.log('📷 Com fotos:', comFotos);
}

run().catch(err => console.error('Erro:', err.message));
