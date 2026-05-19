const fs = require('fs');
const path = require('path');
const { lerJSON, salvarJSON } = require('./storage');
const { query, dbOk } = require('./db');

function dataPath() {
  const DIR = process.env.RENDER ? '/opt/render/project/src/data' : path.join(__dirname, '..');
  return path.join(DIR, 'imoveis.json');
}

function dataFile() {
  const DIR = process.env.RENDER ? '/opt/render/project/src' : path.join(__dirname, '..');
  return path.join(DIR, 'imoveis.json');
}

async function criarTabelaImoveis() {
  try {
    await query(`
      CREATE TABLE IF NOT EXISTS imoveis (
        id TEXT PRIMARY KEY,
        id_externo TEXT,
        id_original TEXT,
        id_interno TEXT,
        codigo_imovel TEXT,
        titulo TEXT,
        tipo TEXT,
        categoria TEXT,
        transacao TEXT,
        condicao TEXT,
        status TEXT DEFAULT 'ativo',
        bairro TEXT,
        cidade TEXT,
        estado TEXT,
        endereco TEXT,
        numero TEXT,
        complemento TEXT,
        cep TEXT,
        latitude DOUBLE PRECISION,
        longitude DOUBLE PRECISION,
        andar TEXT,
        torre TEXT,
        unidade TEXT,
        condominio_nome TEXT,
        valor_imovel NUMERIC,
        condominio NUMERIC,
        iptu NUMERIC,
        area_m2 NUMERIC,
        area_total NUMERIC,
        quartos INTEGER,
        suites INTEGER,
        banheiros INTEGER,
        vagas INTEGER,
        salas INTEGER,
        descricao TEXT,
        descricao_editada BOOLEAN DEFAULT false,
        fotos JSONB DEFAULT '[]',
        proprietario JSONB DEFAULT '{}',
        portais JSONB DEFAULT '{}',
        corretor JSONB DEFAULT '{}',
        fonte TEXT,
        source TEXT,
        user_id TEXT,
        usuario_id TEXT,
        codigo_usuario TEXT,
        usuario_nome TEXT,
        usuario_perfil TEXT,
        usuario_telefone TEXT,
        corretor_id TEXT,
        corretor_nome TEXT,
        corretor_email TEXT,
        corretor_telefone TEXT,
        url TEXT,
        url_publica TEXT,
        tour_virtual TEXT,
        inativado_em TIMESTAMPTZ,
        inativado_por TEXT,
        xml_url TEXT,
        last_update TIMESTAMPTZ,
        criado_em TIMESTAMPTZ DEFAULT NOW(),
        atualizado_em TIMESTAMPTZ DEFAULT NOW(),
        dados JSONB DEFAULT '{}'
      )
    `);
    await query(`CREATE INDEX IF NOT EXISTS idx_imoveis_user_id ON imoveis(user_id)`);
    await query(`CREATE INDEX IF NOT EXISTS idx_imoveis_bairro ON imoveis(bairro)`);
    await query(`CREATE INDEX IF NOT EXISTS idx_imoveis_tipo ON imoveis(tipo)`);
    console.log('[imoveis] tabela criada/verificada');
  } catch(e) {
    console.error('[imoveis] erro criar tabela:', e.message);
  }
}
criarTabelaImoveis();

function rowToImovel(r) {
  return {
    id: r.id,
    idExterno: r.id_externo,
    idOriginal: r.id_original,
    idInterno: r.id_interno,
    codigoImovel: r.codigo_imovel,
    titulo: r.titulo,
    tipo: r.tipo,
    categoria: r.categoria,
    transacao: r.transacao,
    condicao: r.condicao,
    status: r.status,
    bairro: r.bairro,
    cidade: r.cidade,
    estado: r.estado,
    endereco: r.endereco,
    numero: r.numero,
    complemento: r.complemento,
    cep: r.cep,
    latitude: r.latitude,
    longitude: r.longitude,
    andar: r.andar,
    torre: r.torre,
    unidade: r.unidade,
    condominioNome: r.condominio_nome,
    valor_imovel: r.valor_imovel,
    condominio: r.condominio,
    iptu: r.iptu,
    area_m2: r.area_m2,
    area_total: r.area_total,
    quartos: r.quartos,
    suites: r.suites,
    banheiros: r.banheiros,
    vagas: r.vagas,
    salas: r.salas,
    descricao: r.descricao,
    descricaoEditada: r.descricao_editada,
    fotos: r.fotos || [],
    proprietario: r.proprietario || {},
    portais: r.portais || {},
    corretor: r.corretor || {},
    fonte: r.fonte,
    source: r.source,
    userId: r.user_id,
    usuarioId: r.usuario_id,
    codigoUsuario: r.codigo_usuario,
    usuarioNome: r.usuario_nome,
    usuarioPerfil: r.usuario_perfil,
    usuarioTelefone: r.usuario_telefone,
    corretorId: r.corretor_id,
    corretorNome: r.corretor_nome,
    corretorEmail: r.corretor_email,
    corretorTelefone: r.corretor_telefone,
    url: r.url,
    urlPublica: r.url_publica,
    tourVirtual: r.tour_virtual,
    inativadoEm: r.inativado_em,
    inativadoPor: r.inativado_por,
    xmlUrl: r.xml_url,
    lastUpdate: r.last_update,
    criadoEm: r.criado_em,
    ...(r.dados || {})
  };
}

function imovelToRow(i) {
  const dados = { ...i };
  const campos = ['id','idExterno','idOriginal','idInterno','codigoImovel','titulo','tipo','categoria','transacao','condicao','status','bairro','cidade','estado','endereco','numero','complemento','cep','latitude','longitude','andar','torre','unidade','condominioNome','valor_imovel','condominio','iptu','area_m2','area_total','quartos','suites','banheiros','vagas','salas','descricao','descricaoEditada','fotos','proprietario','portais','corretor','fonte','source','userId','usuarioId','codigoUsuario','usuarioNome','usuarioPerfil','usuarioTelefone','corretorId','corretorNome','corretorEmail','corretorTelefone','url','urlPublica','tourVirtual','inativadoEm','inativadoPor','xmlUrl','lastUpdate','criadoEm'];
  campos.forEach(k => delete dados[k]);
  return {
    id: String(i.id || i.idExterno || i.idOriginal || i.codigoImovel || Date.now()),
    id_externo: i.idExterno || i.idOriginal || '',
    id_original: i.idOriginal || i.idExterno || '',
    id_interno: i.idInterno || '',
    codigo_imovel: i.codigoImovel || '',
    titulo: i.titulo || '',
    tipo: i.tipo || '',
    categoria: i.categoria || '',
    transacao: i.transacao || 'venda',
    condicao: i.condicao || '',
    status: i.status || 'ativo',
    bairro: i.bairro || '',
    cidade: i.cidade || '',
    estado: typeof i.estado === 'object' ? (i.estado?.abbreviation || i.estado?.['#text'] || '') : (i.estado || ''),
    endereco: i.endereco || '',
    numero: i.numero || '',
    complemento: i.complemento || '',
    cep: String(i.cep || '').replace(/\D/g, ''),
    latitude: parseFloat(i.latitude || i.lat || 0) || null,
    longitude: parseFloat(i.longitude || i.lng || 0) || null,
    andar: i.andar || '',
    torre: i.torre || '',
    unidade: i.unidade || '',
    condominio_nome: i.condominioNome || '',
    valor_imovel: parseFloat(i.valor_imovel || i.valor || 0) || 0,
    condominio: parseFloat(i.condominio || 0) || 0,
    iptu: parseFloat(i.iptu || 0) || 0,
    area_m2: parseFloat(i.area_m2 || i.area || 0) || 0,
    area_total: parseFloat(i.area_total || i.area_m2 || 0) || 0,
    quartos: parseInt(i.quartos || 0) || 0,
    suites: parseInt(i.suites || 0) || 0,
    banheiros: parseInt(i.banheiros || 0) || 0,
    vagas: parseInt(i.vagas || 0) || 0,
    salas: parseInt(i.salas || i.rooms || 0) || 0,
    descricao: i.descricao || '',
    descricao_editada: i.descricaoEditada || false,
    fotos: JSON.stringify(i.fotos || []),
    proprietario: JSON.stringify(i.proprietario || {}),
    portais: JSON.stringify(i.portais || {}),
    corretor: JSON.stringify(i.corretor || {}),
    fonte: i.fonte || i.source || '',
    source: i.source || i.fonte || '',
    user_id: i.userId || i.usuarioId || i.codigoUsuario || i.corretorId || null,
    usuario_id: i.usuarioId || i.userId || null,
    codigo_usuario: i.codigoUsuario || i.userId || null,
    usuario_nome: i.usuarioNome || '',
    usuario_perfil: i.usuarioPerfil || '',
    usuario_telefone: i.usuarioTelefone || '',
    corretor_id: i.corretorId || i.userId || null,
    corretor_nome: i.corretorNome || '',
    corretor_email: i.corretorEmail || '',
    corretor_telefone: i.corretorTelefone || '',
    url: i.url || i.link || '',
    url_publica: i.urlPublica || '',
    tour_virtual: i.tourVirtual || '',
    inativado_em: i.inativadoEm || null,
    inativado_por: i.inativadoPor || null,
    xml_url: i.xmlUrl || '',
    last_update: i.lastUpdate || i.updatedAt || null,
    dados: JSON.stringify(dados)
  };
}

async function lerImoveis(userId) {
  if (await dbOk()) {
    try {
      let sql, params;
      if (!userId) {
        sql = `SELECT * FROM imoveis ORDER BY criado_em DESC`;
        params = [];
      } else {
        sql = `SELECT * FROM imoveis WHERE (user_id=$1 OR usuario_id=$1 OR codigo_usuario=$1 OR corretor_id=$1) ORDER BY criado_em DESC`;
        params = [userId];
      }
      const res = await query(sql, params);
      return res.rows.map(rowToImovel);
    } catch(e) {
      console.error('[lerImoveis PG]', e.message);
    }
  }
  const todos = lerJSON(dataFile(), []);
  if (!userId) return todos;
  return todos.filter(i => i.userId === userId || i.usuarioId === userId || i.codigoUsuario === userId || i.corretorId === userId);
}

async function salvarImovel(imovel) {
  if (await dbOk()) {
    try {
      const r = imovelToRow(imovel);
      await query(`
        INSERT INTO imoveis (id,id_externo,id_original,id_interno,codigo_imovel,titulo,tipo,categoria,transacao,condicao,status,bairro,cidade,estado,endereco,numero,complemento,cep,latitude,longitude,andar,torre,unidade,condominio_nome,valor_imovel,condominio,iptu,area_m2,area_total,quartos,suites,banheiros,vagas,salas,descricao,descricao_editada,fotos,proprietario,portais,corretor,fonte,source,user_id,usuario_id,codigo_usuario,usuario_nome,usuario_perfil,usuario_telefone,corretor_id,corretor_nome,corretor_email,corretor_telefone,url,url_publica,tour_virtual,inativado_em,inativado_por,xml_url,last_update,dados)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31,$32,$33,$34,$35,$36,$37,$38,$39,$40,$41,$42,$43,$44,$45,$46,$47,$48,$49,$50,$51,$52,$53,$54,$55,$56,$57,$58,$59,$60)
        ON CONFLICT (id) DO UPDATE SET
          titulo=EXCLUDED.titulo, tipo=EXCLUDED.tipo, status=EXCLUDED.status,
          bairro=EXCLUDED.bairro, cidade=EXCLUDED.cidade, estado=EXCLUDED.estado,
          endereco=EXCLUDED.endereco, valor_imovel=EXCLUDED.valor_imovel,
          area_m2=EXCLUDED.area_m2, quartos=EXCLUDED.quartos, suites=EXCLUDED.suites,
          banheiros=EXCLUDED.banheiros, vagas=EXCLUDED.vagas, descricao=EXCLUDED.descricao,
          fotos=EXCLUDED.fotos, proprietario=EXCLUDED.proprietario, portais=EXCLUDED.portais,
          user_id=EXCLUDED.user_id, codigo_usuario=EXCLUDED.codigo_usuario,
          latitude=EXCLUDED.latitude, longitude=EXCLUDED.longitude,
          inativado_em=EXCLUDED.inativado_em, inativado_por=EXCLUDED.inativado_por,
          dados=EXCLUDED.dados, atualizado_em=NOW()
      `, [r.id,r.id_externo,r.id_original,r.id_interno,r.codigo_imovel,r.titulo,r.tipo,r.categoria,r.transacao,r.condicao,r.status,r.bairro,r.cidade,r.estado,r.endereco,r.numero,r.complemento,r.cep,r.latitude,r.longitude,r.andar,r.torre,r.unidade,r.condominio_nome,r.valor_imovel,r.condominio,r.iptu,r.area_m2,r.area_total,r.quartos,r.suites,r.banheiros,r.vagas,r.salas,r.descricao,r.descricao_editada,r.fotos,r.proprietario,r.portais,r.corretor,r.fonte,r.source,r.user_id,r.usuario_id,r.codigo_usuario,r.usuario_nome,r.usuario_perfil,r.usuario_telefone,r.corretor_id,r.corretor_nome,r.corretor_email,r.corretor_telefone,r.url,r.url_publica,r.tour_virtual,r.inativado_em,r.inativado_por,r.xml_url,r.last_update,r.dados]);
      return imovel;
    } catch(e) {
      console.error('[salvarImovel PG]', e.message);
    }
  }
  const todos = lerJSON(dataFile(), []);
  const idx = todos.findIndex(i => i.id === imovel.id || i.idExterno === imovel.idExterno);
  if (idx >= 0) todos[idx] = { ...todos[idx], ...imovel };
  else todos.push(imovel);
  await salvarJSON(dataFile(), todos);
  return imovel;
}

async function salvarTodosImoveis(imoveis) {
  if (await dbOk()) {
    try {
      for (const im of imoveis) await salvarImovel(im);
      return imoveis;
    } catch(e) {
      console.error('[salvarTodosImoveis PG]', e.message);
    }
  }
  await salvarJSON(dataFile(), imoveis);
  return imoveis;
}

module.exports = { lerImoveis, salvarImovel, salvarTodosImoveis };
