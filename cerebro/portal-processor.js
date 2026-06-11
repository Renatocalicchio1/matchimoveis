/**
 * portal-processor.js
 * Processa leads vindas de portais imobiliários (ImovelWeb, ZAP, VivaReal, OLX, Chaves, 123i)
 * Monta mapaIntencao diretamente dos campos estruturados — sem extrator de texto
 * Mesmo formato de saída do analisador-intencao.js — totalmente isolado
 */

const NORM = s => String(s||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim();

async function comRetry(fn, tentativas = 3, espera = 2000) {
  for (let i = 0; i < tentativas; i++) {
    try { const r = await fn(); if (r) return r; } catch(e) {}
    if (i < tentativas - 1) await new Promise(res => setTimeout(res, espera));
  }
  return null;
}

function sinal(valor, confianca, origem) {
  return [{ valor, confianca, score: confianca, peso: 1, timestamp: Date.now(), origem }];
}

async function processarLeadPortal(lead) {
  try {
    const { query } = require('../services/db');
    const mapa = {
      transacao:   [],
      tipo_imovel: [],
      cidade:      [],
      estado:      [],
      bairro:      [],
      valor:       [],
      quartos:     [],
      suites:      [],
      vagas:       [],
      banheiros:   [],
      area:        [],
      fase:        'novo',
      temperatura: 'frio',
    };

    // 1. Busca imóvel do anúncio pelo idAnuncio/clientListingId
    const idAnuncio = lead.idAnuncio || lead.clientListingId || lead.referencia || '';
    let imovel = null;
    if (idAnuncio) {
      imovel = await comRetry(async () => {
        const r = await query("SELECT * FROM imoveis WHERE id_externo=$1 OR id_interno=$1 OR id=$1 LIMIT 1", [String(idAnuncio)]);
        return r.rows[0] || null;
      });
    }

    // 2. Se achou o imóvel — usa os dados dele (alta confiança)
    if (imovel) {
      const tipo = NORM(imovel.tipo || imovel.type || '');
      const transacao = NORM(imovel.transacao || imovel.transaction_type || '');
      const cidade = NORM(imovel.cidade || imovel.city || '');
      const _estadoRaw = imovel.estado || imovel.state || '';
      const _estadoMapPortal = {'sp':'Santa Catarina','sc':'Santa Catarina','rj':'Rio de Janeiro','mg':'Minas Gerais','rs':'Rio Grande do Sul','pr':'Paraná','ba':'Bahia','go':'Goiás','df':'Distrito Federal','es':'Espírito Santo','pe':'Pernambuco','ce':'Ceará','am':'Amazonas','pa':'Pará','mt':'Mato Grosso','ms':'Mato Grosso do Sul','pb':'Paraíba','rn':'Rio Grande do Norte','pi':'Piauí','al':'Alagoas','se':'Sergipe','ro':'Rondônia','to':'Tocantins','ac':'Acre','ap':'Amapá','rr':'Roraima','ma':'Maranhão'};
      const estado = NORM(_estadoMapPortal[_estadoRaw.toLowerCase()] || _estadoRaw);
      const bairro = NORM(imovel.bairro || imovel.neighborhood || '');
      const valor = parseFloat(imovel.valor_imovel || imovel.valor || imovel.preco || imovel.price || 0);
      const quartos = parseInt(imovel.quartos || imovel.bedrooms || 0);
      const suites = parseInt(imovel.suites || 0);
      const vagas = parseInt(imovel.vagas || imovel.parking || 0);
      const banheiros = parseInt(imovel.banheiros || imovel.bathrooms || 0);
      const area = parseFloat(imovel.area_m2 || imovel.area || imovel.area_util || 0);

      if (tipo)      mapa.tipo_imovel = sinal(tipo, 95, 'portal_imovel');
      if (transacao) mapa.transacao   = sinal(transacao === 'sell' || transacao === 'venda' ? 'venda' : transacao === 'rent' || transacao === 'aluguel' ? 'aluguel' : transacao, 95, 'portal_imovel');
      if (cidade)    mapa.cidade      = sinal(cidade, 95, 'portal_imovel');
      if (estado)    mapa.estado      = sinal(estado, 95, 'portal_imovel');
      if (bairro)    mapa.bairro      = sinal(bairro, 95, 'portal_imovel');
      if (valor > 0) mapa.valor       = sinal({ min: 0, max: valor }, 95, 'portal_imovel');
      if (quartos)   mapa.quartos     = sinal(quartos, 95, 'portal_imovel');
      if (suites)    mapa.suites      = sinal(suites, 90, 'portal_imovel');
      if (vagas)     mapa.vagas       = sinal(vagas, 90, 'portal_imovel');
      if (banheiros) mapa.banheiros   = sinal(banheiros, 90, 'portal_imovel');
      if (area > 0)  mapa.area        = sinal(area, 90, 'portal_imovel');

      console.log('[PORTAL PROCESSOR] imovel encontrado:', idAnuncio, '| tipo:', tipo, '| cidade:', cidade);
    }

    // 3. Se não achou imóvel — limpa idAnuncio para forçar caso2 e extrai da mensagem
    if (!imovel) lead.idAnuncio = '';
    // Se mensagem veio vazia — busca do PG (pode estar só no campo dados)
    if (lead.id) {
      const _msgRow = await comRetry(async () => {
        const _r = await query("SELECT dados->>'mensagem' as msg FROM leads WHERE id=$1", [String(lead.id)]);
        return _r.rows[0]?.msg ? _r.rows[0] : null;
      });
      if (_msgRow?.msg) lead.mensagem = _msgRow.msg;
    }
    if (!imovel && lead.mensagem) {
      const { extrairPerfil } = require('./extrator-perfil');
      // Normaliza mensagem — portais enviam em MAIÚSCULAS às vezes
      const msgNorm = NORM(lead.mensagem);
      const perfil = extrairPerfil([{ de: 'cliente', texto: msgNorm }]);

      if (perfil.tipo)      mapa.tipo_imovel = sinal(perfil.tipo, 80, 'portal_mensagem');
      if (perfil.intencao)  mapa.transacao   = sinal(perfil.intencao, 80, 'portal_mensagem');
      if (perfil.cidade)    mapa.cidade      = sinal(perfil.cidade, 80, 'portal_mensagem');
      if (perfil.estado)    mapa.estado      = sinal(perfil.estado, 80, 'portal_mensagem');
      if (perfil.bairro)    mapa.bairro      = sinal(perfil.bairro, 75, 'portal_mensagem');
      if (perfil.valorMax)  mapa.valor       = sinal({ min: perfil.valorMin||0, max: perfil.valorMax }, 80, 'portal_mensagem');
      if (perfil.quartos)   mapa.quartos     = sinal(perfil.quartos, 80, 'portal_mensagem');
      if (perfil.suites)    mapa.suites      = sinal(perfil.suites, 75, 'portal_mensagem');
      if (perfil.vagas)     mapa.vagas       = sinal(perfil.vagas, 75, 'portal_mensagem');
      if (perfil.banheiros) mapa.banheiros   = sinal(perfil.banheiros, 75, 'portal_mensagem');

      console.log('[PORTAL PROCESSOR] extraido da mensagem | tipo:', perfil.tipo||'?', '| cidade:', perfil.cidade||'?');
    }

    // 4. Define fase e temperatura
    const campos = [mapa.transacao, mapa.tipo_imovel, mapa.cidade, mapa.bairro, mapa.valor, mapa.quartos];
    const preenchidos = campos.filter(c => c.length > 0).length;
    mapa.fase = preenchidos >= 4 ? 'qualificado' : preenchidos >= 2 ? 'interesse' : 'novo';
    mapa.temperatura = preenchidos >= 5 ? 'quente' : preenchidos >= 3 ? 'morno' : 'frio';

    return mapa;
  } catch(e) {
    console.error('[PORTAL PROCESSOR] erro:', e.message);
    return null;
  }
}

module.exports = { processarLeadPortal };
