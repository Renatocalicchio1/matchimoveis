/**
 * import-processor.js
 * Processa leads vindas de importação de planilha ou cadastro manual.
 */

const TIPOS_COMERCIAIS = ['sala','loja','galpao','galpão','escritorio','escritório','comercial','ponto comercial','industria','indústria','conjunto','hotel','pousada','consultorio','restaurante','predio','prédio','pavilhao','pavilhão'];
const TIPOS_TERRENO    = ['terreno','lote','area rural','área rural','chacara','chácara','sitio','sítio','fazenda'];

function isComercial(tipo) { return TIPOS_COMERCIAIS.some(t => (tipo||'').toLowerCase().includes(t)); }
function isTerreno(tipo)   { return TIPOS_TERRENO.some(t => (tipo||'').toLowerCase().includes(t)); }

const sinal = (v, peso, src) => [{ valor: v, peso, fonte: src }];

async function processarLeadImportada(lead) {
  try {
    const p = lead.perfilIA || {};
    const tipo = p.tipo || '';
    const _ehComercial = isComercial(tipo);
    const _ehTerreno   = isTerreno(tipo);

    const mapa = {
      transacao:   p.intencao  ? sinal(p.intencao,                           95, 'importacao') : [],
      tipo_imovel: tipo        ? sinal(tipo,                                  95, 'importacao') : [],
      cidade:      p.cidade    ? sinal(p.cidade,                              95, 'importacao') : [],
      estado:      p.estado    ? sinal(p.estado,                              95, 'importacao') : [],
      bairro:      p.bairro    ? sinal(p.bairro,                              95, 'importacao') : [],
      valor:       p.valorMax  ? sinal({ min: p.valorMin||0, max: p.valorMax }, 95, 'importacao') : [],
      quartos:     (!_ehComercial && !_ehTerreno && p.quartos) ? sinal(p.quartos, 95, 'importacao') : [],
      suites:      (!_ehComercial && !_ehTerreno && p.suites)  ? sinal(p.suites,  90, 'importacao') : [],
      vagas:       p.vagas     ? sinal(p.vagas,                               90, 'importacao') : [],
      banheiros:   (!_ehTerreno && p.banheiros) ? sinal(p.banheiros,          90, 'importacao') : [],
      area:        ((_ehComercial || _ehTerreno) && p.areaMax) ? sinal({ min: p.areaMin||0, max: p.areaMax }, 95, 'importacao') :
                   p.areaMax ? sinal({ min: p.areaMin||0, max: p.areaMax },   85, 'importacao') : [],
    };

    // Campos obrigatórios por tipo
    let camposObrigatorios;
    if (_ehTerreno || _ehComercial) {
      camposObrigatorios = [mapa.transacao, mapa.tipo_imovel, mapa.cidade, mapa.bairro, mapa.valor, mapa.area];
    } else {
      camposObrigatorios = [mapa.transacao, mapa.tipo_imovel, mapa.cidade, mapa.bairro, mapa.valor, mapa.quartos];
    }

    const preenchidos = camposObrigatorios.filter(c => c.length > 0).length;
    mapa.fase        = preenchidos >= 5 ? 'qualificando' : preenchidos >= 3 ? 'qualificado' : 'novo';
    mapa.temperatura = preenchidos >= 5 ? 'morno'        : preenchidos >= 3 ? 'frio'        : 'frio';

    console.log(`[IMPORT PROCESSOR] ${lead.nome||lead.id} | tipo: ${tipo||'?'} | comercial:${_ehComercial} | terreno:${_ehTerreno} | preenchidos: ${preenchidos}/6 | fase: ${mapa.fase}`);
    return mapa;
  } catch(e) {
    console.error('[IMPORT PROCESSOR] erro:', e.message);
    return null;
  }
}

module.exports = { processarLeadImportada };
