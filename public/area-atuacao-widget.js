// Seletor de área de atuação (estado + múltiplas cidades + múltiplos bairros,
// digita-e-clica em vez de lista rolável) — componente único reaproveitado em
// 3 lugares: views/landing.ejs (modal de cadastro), o modal de cadastro da
// página /demanda (server.js, prefixo "suArea") e views/app-perfil.ejs
// (prefixo "pfArea"). Antes cada lugar tinha sua própria cópia da lógica
// (select + datalist de 1 cidade só + checkbox rolável de bairro) — ago/2026,
// trocado por esse widget único baseado no padrão de chips que já existia no
// formulário principal de busca de /demanda.
//
// Contrato de IDs esperado na página, com o prefixo passado em criarSeletorAreaAtuacao(prefixo, ...):
//   <prefixo>EstadoInput        — <select> de estado (UF)
//   <prefixo>CidadeInput        — <input type=text> de cidade
//   <prefixo>CidadeSugestoes    — <div> onde a lista de sugestões de cidade aparece
//   <prefixo>CidadesChips       — <div> onde os chips de cidade escolhida aparecem
//   <prefixo>BairroInput        — <input type=text> de bairro
//   <prefixo>BairroSugestoes    — <div> onde a lista de sugestões de bairro aparece
//   <prefixo>BairrosChips       — <div> onde os chips de bairro escolhido aparecem
//   <prefixo>AtuacaoEstadoHidden  — <input type=hidden> (opcional) recebe o estado
//   <prefixo>AtuacaoCidadesHidden — <input type=hidden> (opcional) recebe JSON.stringify(cidades)
//   <prefixo>AtuacaoBairrosHidden — <input type=hidden> (opcional) recebe JSON.stringify([{cidade,bairro},...])
//
// CSS necessário na página (classes .chips/.chip/.sugestoes-dropdown/.sugestao-item) —
// não vem embutido aqui de propósito, cada página já tem seu próprio <style>.
function criarSeletorAreaAtuacao(prefixo, opts) {
  opts = opts || {};
  var apiCidades = opts.apiCidades || '/api/localidades/cidades';
  var apiBairros = opts.apiBairros || '/api/localidades/bairros';

  function $(suf) { return document.getElementById(prefixo + suf); }
  function escHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function normTexto(s) {
    return String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  }

  var cidadesNomes = [];
  var cidadesSelecionadas = [];
  var bairrosPorCidade = {};
  var paresDisponiveis = [];
  var paresMarcados = [];

  function parChave(p) { return p.cidade + '|||' + p.bairro; }

  function dispararInput(el) {
    if (!el) return;
    try { el.dispatchEvent(new Event('input', { bubbles: true })); } catch (e) {}
  }

  function sincronizarHidden() {
    var hEstado = $('AtuacaoEstadoHidden');
    var hCidades = $('AtuacaoCidadesHidden');
    var hBairros = $('AtuacaoBairrosHidden');
    if (hEstado) { hEstado.value = $('EstadoInput') ? $('EstadoInput').value : ''; }
    if (hCidades) { hCidades.value = JSON.stringify(cidadesSelecionadas); }
    if (hBairros) { hBairros.value = JSON.stringify(paresMarcados); }
    if (opts.onChange) opts.onChange();
    // dispara depois do onChange pra não duplicar side-effect se o próprio
    // onChange já reage a isso — mas alguns formulários (app-perfil.ejs) têm
    // autosave que escuta 'input' nesses hidden, então precisa disparar.
    dispararInput(hEstado); dispararInput(hCidades); dispararInput(hBairros);
  }

  function esconderSugestoesCidade() { var b = $('CidadeSugestoes'); if (b) b.style.display = 'none'; }
  function esconderSugestoesBairro() { var b = $('BairroSugestoes'); if (b) b.style.display = 'none'; }

  async function onEstadoChange() {
    var estado = $('EstadoInput').value;
    var cidadeInput = $('CidadeInput');
    cidadesNomes = [];
    cidadesSelecionadas = [];
    bairrosPorCidade = {};
    paresDisponiveis = [];
    paresMarcados = [];
    renderCidadesChips();
    renderBairrosChips();
    esconderSugestoesBairro();
    cidadeInput.value = '';
    cidadeInput.disabled = true;
    var bairroInput = $('BairroInput');
    if (bairroInput) { bairroInput.disabled = true; bairroInput.value = ''; }
    esconderSugestoesCidade();
    sincronizarHidden();
    if (!estado) { cidadeInput.placeholder = 'Selecione o estado primeiro...'; return; }
    cidadeInput.placeholder = 'Carregando...';
    try {
      var r = await fetch(apiCidades + '?estado=' + encodeURIComponent(estado));
      var d = await r.json();
      cidadesNomes = d.cidades || [];
    } catch (e) { cidadesNomes = []; }
    cidadeInput.placeholder = 'Digite pra buscar a cidade (' + cidadesNomes.length + ')...';
    cidadeInput.disabled = false;
  }

  function renderSugestoesCidade() {
    var termo = normTexto($('CidadeInput').value.trim());
    var box = $('CidadeSugestoes');
    var disponiveis = cidadesNomes.filter(function (c) { return cidadesSelecionadas.indexOf(c) === -1; });
    if (!disponiveis.length) { box.style.display = 'none'; return; }
    var visiveis = (termo ? disponiveis.filter(function (c) { return normTexto(c).indexOf(termo) > -1; }) : disponiveis).slice(0, 30);
    if (!visiveis.length) { box.innerHTML = '<div class="sugestao-item gray">Nenhuma cidade encontrada</div>'; box.style.display = 'block'; return; }
    box.innerHTML = visiveis.map(function (c) { return '<div class="sugestao-item" data-cidade="' + escHtml(c) + '">' + escHtml(c) + '</div>'; }).join('');
    box.style.display = 'block';
  }

  async function carregarBairrosDaCidade(cidade) {
    var estado = $('EstadoInput').value;
    var bairroInput = $('BairroInput');
    if (!bairrosPorCidade[cidade]) {
      if (bairroInput) bairroInput.placeholder = 'Carregando bairros de ' + cidade + '...';
      try {
        var r = await fetch(apiBairros + '?estado=' + encodeURIComponent(estado) + '&cidade=' + encodeURIComponent(cidade));
        var d = await r.json();
        bairrosPorCidade[cidade] = d.bairros || [];
      } catch (e) { bairrosPorCidade[cidade] = []; }
    }
    reconstruirParesDisponiveis();
    if (bairroInput) { bairroInput.disabled = false; bairroInput.placeholder = 'Digite pra buscar o bairro...'; }
  }

  function reconstruirParesDisponiveis() {
    paresDisponiveis = [];
    cidadesSelecionadas.forEach(function (cid) {
      (bairrosPorCidade[cid] || []).forEach(function (b) { paresDisponiveis.push({ cidade: cid, bairro: b }); });
    });
  }

  function renderSugestoesBairro() {
    var box = $('BairroSugestoes');
    if (!box) return;
    if (!paresDisponiveis.length) { box.style.display = 'none'; return; }
    var termo = normTexto($('BairroInput').value.trim());
    var marcadasChaves = paresMarcados.map(parChave);
    var disponiveis = paresDisponiveis.filter(function (p) { return marcadasChaves.indexOf(parChave(p)) === -1; });
    var visiveis = (termo ? disponiveis.filter(function (p) { return normTexto(p.bairro).indexOf(termo) > -1; }) : disponiveis).slice(0, 30);
    if (!visiveis.length) { box.innerHTML = '<div class="sugestao-item gray">Nenhum bairro encontrado</div>'; box.style.display = 'block'; return; }
    var multiplasCidades = cidadesSelecionadas.length > 1;
    box.innerHTML = visiveis.map(function (p) {
      var label = multiplasCidades ? (p.bairro + ' (' + p.cidade + ')') : p.bairro;
      return '<div class="sugestao-item" data-chave="' + escHtml(parChave(p)) + '" data-cidade="' + escHtml(p.cidade) + '" data-bairro="' + escHtml(p.bairro) + '">' + escHtml(label) + '</div>';
    }).join('');
    box.style.display = 'block';
  }

  function renderCidadesChips() {
    var box = $('CidadesChips');
    if (!box) return;
    box.innerHTML = cidadesSelecionadas.map(function (c) {
      return '<span class="chip">' + escHtml(c) + '<button type="button" data-remover-cidade="' + escHtml(c) + '">×</button></span>';
    }).join('');
  }

  function renderBairrosChips() {
    var box = $('BairrosChips');
    if (!box) return;
    var multiplasCidades = cidadesSelecionadas.length > 1;
    box.innerHTML = paresMarcados.map(function (p) {
      var label = multiplasCidades ? (p.bairro + ' (' + p.cidade + ')') : p.bairro;
      return '<span class="chip">' + escHtml(label) + '<button type="button" data-remover-bairro="' + escHtml(parChave(p)) + '">×</button></span>';
    }).join('');
  }

  // --- listeners ---
  $('EstadoInput').addEventListener('change', onEstadoChange);

  $('CidadeInput').addEventListener('input', renderSugestoesCidade);
  $('CidadeInput').addEventListener('focus', renderSugestoesCidade);
  $('CidadeInput').addEventListener('click', renderSugestoesCidade);

  $('CidadeSugestoes').addEventListener('click', async function (e) {
    var item = e.target.closest('[data-cidade]');
    if (!item) return;
    var cidade = item.getAttribute('data-cidade');
    $('CidadeInput').value = '';
    esconderSugestoesCidade();
    if (cidadesSelecionadas.indexOf(cidade) > -1) return;
    cidadesSelecionadas.push(cidade);
    renderCidadesChips();
    sincronizarHidden();
    await carregarBairrosDaCidade(cidade);
  });

  document.addEventListener('click', function (e) {
    if (!e.target.closest('#' + prefixo + 'CidadeInput') && !e.target.closest('#' + prefixo + 'CidadeSugestoes')) esconderSugestoesCidade();
  });

  $('CidadesChips').addEventListener('click', function (e) {
    var btn = e.target.closest('[data-remover-cidade]');
    if (!btn) return;
    var cidade = btn.getAttribute('data-remover-cidade');
    cidadesSelecionadas = cidadesSelecionadas.filter(function (c) { return c !== cidade; });
    paresMarcados = paresMarcados.filter(function (p) { return p.cidade !== cidade; });
    renderCidadesChips();
    reconstruirParesDisponiveis();
    esconderSugestoesBairro();
    renderBairrosChips();
    sincronizarHidden();
    var bairroInput = $('BairroInput');
    if (bairroInput && !cidadesSelecionadas.length) { bairroInput.disabled = true; bairroInput.value = ''; }
  });

  var bairroInputEl = $('BairroInput');
  if (bairroInputEl) {
    bairroInputEl.addEventListener('input', renderSugestoesBairro);
    bairroInputEl.addEventListener('focus', renderSugestoesBairro);
    bairroInputEl.addEventListener('click', renderSugestoesBairro);
  }

  var bairroSugestoesEl = $('BairroSugestoes');
  if (bairroSugestoesEl) {
    bairroSugestoesEl.addEventListener('click', function (e) {
      var item = e.target.closest('[data-chave]');
      if (!item) return;
      var par = { cidade: item.getAttribute('data-cidade'), bairro: item.getAttribute('data-bairro') };
      var chave = parChave(par);
      if (paresMarcados.findIndex(function (p) { return parChave(p) === chave; }) === -1) paresMarcados.push(par);
      $('BairroInput').value = '';
      esconderSugestoesBairro();
      renderBairrosChips();
      sincronizarHidden();
    });
  }

  document.addEventListener('click', function (e) {
    if (!e.target.closest('#' + prefixo + 'BairroInput') && !e.target.closest('#' + prefixo + 'BairroSugestoes')) esconderSugestoesBairro();
  });

  var bairrosChipsEl = $('BairrosChips');
  if (bairrosChipsEl) {
    bairrosChipsEl.addEventListener('click', function (e) {
      var btn = e.target.closest('[data-remover-bairro]');
      if (!btn) return;
      var chave = btn.getAttribute('data-remover-bairro');
      paresMarcados = paresMarcados.filter(function (p) { return parChave(p) !== chave; });
      renderBairrosChips();
      sincronizarHidden();
    });
  }

  return {
    // Pré-preenche o widget com um valor já salvo (ex: app-perfil.ejs
    // carregando o que o corretor já tinha escolhido antes). Assíncrono
    // porque precisa buscar a lista de cidades do estado e os bairros de
    // cada cidade já marcada.
    async preencher(estado, cidades, pares) {
      if (!estado) return;
      $('EstadoInput').value = estado;
      await onEstadoChange();
      cidadesSelecionadas = (cidades || []).slice();
      renderCidadesChips();
      for (var i = 0; i < cidadesSelecionadas.length; i++) {
        await carregarBairrosDaCidade(cidadesSelecionadas[i]);
      }
      paresMarcados = (pares || []).filter(function (p) { return p && p.cidade && p.bairro; });
      renderBairrosChips();
      sincronizarHidden();
    },
    ler() {
      return {
        estado: $('EstadoInput') ? $('EstadoInput').value : '',
        cidades: cidadesSelecionadas.slice(),
        bairros: paresMarcados.slice()
      };
    }
  };
}
