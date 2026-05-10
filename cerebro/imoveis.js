'use strict';

function responder(mNorm, d, imoveis, btn, chip) {

  // PÁGINA DE CADASTRO
  if (/pagina cadastro|app cadastro|cadastrar imovel pagina|o que tem no cadastro/.test(mNorm))
    return '➕ <strong>Cadastrar Imóvel (/app/cadastro):</strong><br><br>' +
      'Duas opções:<br>' +
      '• 📥 <strong>Importar via XML</strong> — importar vários imóveis de uma vez<br>' +
      '• ✏️ <strong>Cadastro manual</strong> — cadastrar um imóvel por vez<br><br>' +
      btn('Cadastrar imóvel','/app/cadastro');

  // IMPORTAR VIA XML
  if (/importar via xml|url do feed|url xml|testar xml|testar url/.test(mNorm))
    return '📥 <strong>Importar via XML:</strong><br><br>' +
      btn('Cadastrar imóvel','/app/cadastro');

  // BUSCA POR TIPO/BAIRRO
  const temTipo = ['apartamento','casa','cobertura','sala','terreno','sobrado','studio','loft','kitnet'].find(t => mNorm.includes(t));
  const bairros = [...new Set(imoveis.map(i=>i.bairro).filter(Boolean))];
  const temBairro = bairros.find(b => mNorm.includes(b.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'')));
  const temQuartos = (mNorm.match(/(\d+)\s*(quarto|dorm|suite)/) || [])[1];
  const temValorMax = (() => { const m = mNorm.match(/ate\s*r?\$?\s*([\d.,]+)\s*(mil|k)?/); if (!m) return null; let v = parseFloat(m[1].replace(/\./g,'').replace(',','.')); if (m[2]) v *= 1000; return v; })();

  if (temTipo || temBairro) {
    let r = imoveis.filter(i => i.status !== 'inativo');
    if (temTipo)     r = r.filter(i => i.tipo && i.tipo.toLowerCase().includes(temTipo));
    if (temBairro)   r = r.filter(i => i.bairro && i.bairro.toLowerCase().includes(temBairro.toLowerCase()));
    if (temQuartos)  r = r.filter(i => i.quartos && parseInt(i.quartos) >= parseInt(temQuartos));
    if (temValorMax) r = r.filter(i => i.valor_imovel && parseFloat(i.valor_imovel) <= temValorMax);

    if (r.length === 0)
      return 'Nao encontrei imoveis ativos' + (temTipo ? ' do tipo ' + temTipo : '') + (temBairro ? ' em ' + temBairro : '') + '.<br><br>' + btn('Ver todos', '/app/imoveis');

    const lista = r.slice(0, 5).map(i => {
      const lid = i.id || (i.idExterno ? 'MI-' + i.idExterno : '');
      const val = i.valor_imovel ? ' · R$' + Number(i.valor_imovel).toLocaleString('pt-BR') : '';
      const qts = i.quartos ? ' · ' + i.quartos + 'q' : '';
      const vgs = i.vagas ? ' · ' + i.vagas + 'vg' : '';
      return '• <a href="/app/imovel/' + lid + '" target="_blank" style="color:#ff385c;font-weight:700">' + (i.tipo || 'Imovel') + ' — ' + (i.bairro || '') + '</a>' + qts + vgs + val;
    }).join('<br>');

    return '🔍 <strong>' + r.length + ' imovel(is)</strong>' + (temBairro ? ' em ' + temBairro : '') + (temTipo ? ' · ' + temTipo : '') + ':<br>' +
      lista +
      (r.length > 5 ? '<br><em>...e mais ' + (r.length - 5) + '</em>' : '') +
      '<br><br>' + btn('Ver todos', '/app/imoveis');
  }

  // GERAL
  if (d.ativos === 0)
    return 'Nenhum imovel ainda.<br><br>' + btn('Importar XML', '/app/imoveis');

  const tipos = {};
  imoveis.filter(i => i.status !== 'inativo').forEach(i => { if (i.tipo) tipos[i.tipo] = (tipos[i.tipo] || 0) + 1; });
  const topTipos = Object.entries(tipos).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([t, n]) => t + ' (' + n + ')').join(', ');

  return '🏠 <strong>Imoveis:</strong><br>' +
    'Ativos: <strong>' + d.ativos + '</strong> · Inativos: ' + d.inativos + '<br>' +
    'Bairros: ' + (d.bairros.slice(0, 5).join(', ') || '—') + '<br>' +
    'Tipos: ' + (topTipos || '—') + '<br><br>' +
    btn('Ver imoveis', '/app/imoveis') + chip('Importar XML', 'importar xml') + chip('Valor medio', 'valor medio da carteira');
}

module.exports = { responder };
