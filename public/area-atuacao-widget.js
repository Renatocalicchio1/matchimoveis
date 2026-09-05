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

  // `autocomplete="off"` sozinho não segura o Chrome em campo que ele
  // classifica como endereço (heurística por texto do label/id, não só o
  // atributo) — em páginas com outro campo de endereço de verdade por perto
  // (ex: "Localização" do escritório em app-perfil.ejs) ele ignora o off e
  // sobrepõe o dropdown de "endereços salvos" no campo de cidade/bairro,
  // tampando as sugestões reais do próprio app (relatado ago/2026, print
  // mostrando "Gerenciar endereços..." do Chrome por cima). `new-password`
  // é o valor que o Chrome nunca tenta preencher/sugerir em cima, mesmo
  // quando ignora "off" — funciona mesmo não sendo campo de senha.
  ['CidadeInput', 'BairroInput'].forEach(function (suf) {
    var el = $(suf);
    if (el) el.setAttribute('autocomplete', 'new-password');
  });

  function escHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function normTexto(s) {
    return String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  }
  // 2ª camada de defesa contra cidade/bairro duplicado ou triplicado na
  // sugestão (set/2026) — o servidor já agrupa por texto normalizado
  // (/api/localidades/*), mas isso protege o widget mesmo se algum outro
  // endpoint futuro devolver a mesma lista sem esse cuidado.
  function dedupeNormalizado(lista) {
    var vistos = {};
    var unicos = [];
    (lista || []).forEach(function (item) {
      var chave = normTexto(item).trim().replace(/\s+/g, ' ');
      if (vistos[chave]) return;
      vistos[chave] = true;
      unicos.push(item);
    });
    return unicos;
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
      cidadesNomes = dedupeNormalizado(d.cidades || []);
    } catch (e) { cidadesNomes = []; }
    cidadeInput.placeholder = 'Digite pra buscar a cidade (' + cidadesNomes.length + ')...';
    cidadeInput.disabled = false;
  }

  function renderSugestoesCidade() {
    var termo = normTexto($('CidadeInput').value.trim());
    var box = $('CidadeSugestoes');
    var disponiveis = cidadesNomes.filter(function (c) { return cidadesSelecionadas.indexOf(c) === -1; });
    // cidadesNomes vazio = falha ao carregar (erro de rede) — avisa em vez
    // de esconder sem explicação; já com disponiveis vazio (todas já
    // escolhidas como chip) não tem nada de novo pra sugerir mesmo, some.
    if (!cidadesNomes.length) {
      box.innerHTML = '<div class="sugestao-item gray">Não foi possível carregar as cidades — tenta de novo</div>';
      box.style.display = 'block';
      return;
    }
    if (!disponiveis.length) { box.style.display = 'none'; return; }
    // Cap alto (não 30) — o corretor reclamou de não conseguir ver/rolar até
    // o fim da lista de bairros/cidades sem digitar nada (set/2026); a caixa
    // já rola (.sugestoes-dropdown tem overflow-y:auto), o corte em 30 é que
    // escondia o resto. 300 é só um teto de segurança, na prática nenhuma
    // cidade/estado real chega perto disso.
    var visiveis = (termo ? disponiveis.filter(function (c) { return normTexto(c).indexOf(termo) > -1; }) : disponiveis).slice(0, 300);
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
        bairrosPorCidade[cidade] = dedupeNormalizado(d.bairros || []);
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
    // Escondia a caixa sem avisar nada quando a cidade não tem NENHUM
    // bairro na base — parecia que o campo tinha travado (relatado ago/2026,
    // cidade "Praia Grande"). Agora sempre mostra uma mensagem clara.
    if (!paresDisponiveis.length) {
      box.innerHTML = '<div class="sugestao-item gray">Essa cidade ainda não tem bairros cadastrados na nossa base — pode continuar sem escolher bairro</div>';
      box.style.display = 'block';
      return;
    }
    var termo = normTexto($('BairroInput').value.trim());
    var marcadasChaves = paresMarcados.map(parChave);
    var disponiveis = paresDisponiveis.filter(function (p) { return marcadasChaves.indexOf(parChave(p)) === -1; });
    // Mesmo motivo do cap de cidade acima — 300 é só teto de segurança.
    var visiveis = (termo ? disponiveis.filter(function (p) { return normTexto(p.bairro).indexOf(termo) > -1; }) : disponiveis).slice(0, 300);
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
    if (cidadesSelecionadas.indexOf(cidade) === -1) {
      cidadesSelecionadas.push(cidade);
      renderCidadesChips();
      sincronizarHidden();
      await carregarBairrosDaCidade(cidade);
    }
    // Mantém a lista aberta (menos a cidade que acabou de entrar como chip) —
    // corretor que atua em várias cidades escolhe uma atrás da outra sem
    // precisar clicar de novo no campo a cada cidade (pedido do Renato, set/2026).
    renderSugestoesCidade();
    $('CidadeInput').focus();
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
      renderBairrosChips();
      sincronizarHidden();
      // Mantém a lista aberta — mesmo motivo do handler de cidade acima:
      // escolher 1, 2, 3+ bairros seguidos sem reabrir o campo a cada um.
      renderSugestoesBairro();
      $('BairroInput').focus();
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
