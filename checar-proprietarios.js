// Script de diagnóstico — roda no Render Shell: node checar-proprietarios.js
// Verifica se os imóveis com os códigos abaixo existem no banco e se têm dados de proprietário.
const { query } = require('./services/db');

const codigos = [
  'CAPJUJU019','DREA57','DAVRAF024','CAPVAZ033','DREA39','CAPJUJU006','CAPRAFA472','CAPJUJU033',
  'CAPRAFA195','CAPCESA001','DMYCAP528','CAPRAFA399','CAPRAFA303','CAPRAFA173','CAPRAFA212','CAPJUJU017',
  'CAPVAZ028','CAPVAZ007','DMYCAP638','DMYCAP657','CAPVAZ010','CAPJUJU027','DMYCAP767','CAPRAFA194',
  'CAPJUJU045','CAPJUJU046','CAPRAFA347','DMYCAP803','CAPLHP156','CAPRAFA566','CAPVAZ051','DMYCAP606',
  'CAPLHP233','CAPRAFA197','CAPRAFA152','CAPRAFA119','CAPRAFA257','CAPRAFA576','DMYCAP140','DMYCAP185',
  'DMYCAP466','DMYCAP425','CAPJUJU040','DAVRAF008','CAPRAFA110','CAPRAFA394','CAPRAFA332','DMYCAP198',
  'DMYCAP748','DMYCAP90','CAPJUJU038','CAPRAFA572','CAPRAFA423','DMYCAP633','DMYCAP346','CAPRAFA388',
  'CAPLHP090','CAPRAFA263','CAPRAFA138','CAPJUJU050','CAPLHP079','CAPRAFA516','CAPLHP085','CAPRAFA149',
  'CAPLHP089','CAPRAFA191','DMYCAP691','CAPRAFA111','CAPJUJU015','CAPLHP088','CAPRAFA492','CAPJUJU010',
  'DAVRAF003','CAPLHP191','CAPRAFA227','CAPJUJU042','CAPRAFA262','DMYCAP307','CAPLHP212','CAPRAFA374',
  'CAPLHP167','CAPRAFA562','CAPRAFA292','CAPLHP129','CAPRAFA574','CAPRAFA133','CAPRAFA323','DMYALE01',
  'CAPLHP139','CAPRAFA256','CAPRAFA127','CAPLILI06','CAPLHP206','CAPRAFA407','CAPLHP192','DAVRAF025',
  'DREA45','DREA31','CAPLHP199','CAPRAFA493','CAPRAFA573','CAPLHP168','CAPRAFA029'
];

function temProprietario(p) {
  if (!p) return false;
  if (typeof p === 'string') { try { p = JSON.parse(p); } catch(e) { return false; } }
  return !!(p && (p.nome || p.celular || p.telefone || p.email));
}

async function run() {
  const encontrados = [];
  const semProprietario = [];
  const naoEncontrados = [];

  for (const cod of codigos) {
    const r = await query(
      `SELECT id, id_externo, id_original, id_interno, codigo_imovel, user_id, usuario_id, codigo_usuario,
              titulo, bairro, cidade, proprietario, dados->'proprietario' AS proprietario_dados
       FROM imoveis
       WHERE id_externo=$1 OR id_original=$1 OR id_interno=$1 OR codigo_imovel=$1 OR id=$1
       LIMIT 1`,
      [cod]
    );
    if (!r.rows.length) {
      naoEncontrados.push(cod);
      continue;
    }
    const im = r.rows[0];
    const prop = im.proprietario && Object.keys(im.proprietario || {}).length ? im.proprietario : im.proprietario_dados;
    const dono = im.codigo_usuario || im.user_id || im.usuario_id || '?';
    if (temProprietario(prop)) {
      encontrados.push({ cod, id: im.id, dono, titulo: im.titulo, bairro: im.bairro, prop });
    } else {
      semProprietario.push({ cod, id: im.id, dono, titulo: im.titulo, bairro: im.bairro });
    }
  }

  console.log('\n========== COM DADOS DE PROPRIETÁRIO (' + encontrados.length + ') ==========');
  encontrados.forEach(e => {
    const p = typeof e.prop === 'string' ? JSON.parse(e.prop) : e.prop;
    console.log(e.cod, '| id:', e.id, '| dono:', e.dono, '|', e.titulo || '-', '/', e.bairro || '-', '| proprietário:', (p && p.nome) || '-', (p && (p.celular||p.telefone)) || '');
  });

  console.log('\n========== SEM DADOS DE PROPRIETÁRIO (' + semProprietario.length + ') ==========');
  semProprietario.forEach(e => {
    console.log(e.cod, '| id:', e.id, '| dono:', e.dono, '|', e.titulo || '-', '/', e.bairro || '-');
  });

  console.log('\n========== NÃO ENCONTRADOS NO BANCO (' + naoEncontrados.length + ') ==========');
  naoEncontrados.forEach(c => console.log(c));

  console.log('\n--- RESUMO ---');
  console.log('Total consultado:', codigos.length);
  console.log('Com proprietário:', encontrados.length);
  console.log('Sem proprietário:', semProprietario.length);
  console.log('Não encontrados:', naoEncontrados.length);

  process.exit(0);
}

run().catch(e => { console.error('Erro:', e.message); process.exit(1); });
