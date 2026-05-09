const fs = require('fs');

// Adicionar no contexto.js — detectar ação de importar XML e cadastrar imóvel
let ctx = fs.readFileSync('cerebro/contexto.js','utf8');

const novasIntencoes = `  IMPORTAR_XML:    /importa(r)? (o |um )?xml|importa(r)? (os )?imoveis|trazer imoveis|subir xml|url do feed|trazer do crm|importar do (tecimob|rankim|vista|crm)|cole a url/,
  CADASTRAR_IMOVEL:/cadastra(r)? (um |o )?imovel|novo imovel|adicionar imovel|criar imovel|registrar imovel/,`;

if (!ctx.includes('IMPORTAR_XML')) {
  ctx = ctx.replace(
    '  AVISAR_PROP:',
    novasIntencoes + '\n  AVISAR_PROP:'
  );
  fs.writeFileSync('cerebro/contexto.js', ctx);
  console.log('1. intencoes adicionadas');
} else {
  console.log('1. ja existe');
}

// Adicionar respostas no responder do contexto
let resposta = fs.readFileSync('cerebro/contexto.js','utf8');

const novasRespostas = `
  // ── IMPORTAR XML ────────────────────────────────────────────────────────────
  if (intencao === 'IMPORTAR_XML') {
    // Extrair URL da mensagem se tiver
    const urlMatch = ctx.fraseOriginal.match(/https?:\/\/[^\s]+/);
    const url = urlMatch ? urlMatch[0] : null;

    if (url) {
      return '\uD83D\uDCE5 Encontrei a URL do feed:<br><br>' +
        '<code style="background:#f3f4f6;padding:4px 8px;border-radius:6px;font-size:12px">' + url + '</code><br><br>' +
        'Quer que eu importe agora? Os im\u00f3veis ser\u00e3o adicionados \u00e0 sua carteira.<br><br>' +
        '<button onclick="importarXMLPeloChat(\'' + url + '\')" style="background:#ff385c;color:white;border:none;border-radius:10px;padding:10px 20px;font-weight:700;cursor:pointer;font-size:14px">\uD83D\uDCE5 Importar agora</button>' +
        '  ' + btn('Ir para cadastro', '/app/cadastro');
    }

    return '\uD83D\uDCE5 <strong>Importar im\u00f3veis via XML:</strong><br><br>' +
      'Para importar, preciso da URL do feed XML do seu CRM.<br>' +
      'Exemplos: Tecimob, Rankim, Vista, Jetimob...<br><br>' +
      '\uD83D\uDCA1 Cole a URL aqui no chat ou acesse a p\u00e1gina de cadastro:<br><br>' +
      btn('Importar XML', '/app/cadastro') +
      chip('Como importo', 'como importar xml');
  }

  // ── CADASTRAR IMÓVEL MANUAL ─────────────────────────────────────────────────
  if (intencao === 'CADASTRAR_IMOVEL') {
    // Tenta extrair dados da frase
    const tipoMatch = ctx.mNorm.match(/apto|apartamento|casa|sobrado|cobertura|terreno|comercial|loft/);
    const quartosMatch = ctx.mNorm.match(/(\d+)\s*(quartos?|q\b|dorm)/);
    const valorMatch = ctx.mNorm.match(/(\d+[,.]?\d*)\s*(mil|k\b|milh)/);
    const bairroMatch = ctx.slots?.bairro;

    const tipo = tipoMatch ? tipoMatch[0] : null;
    const quartos = quartosMatch ? quartosMatch[1] : null;
    const bairro = bairroMatch || null;

    let temDados = tipo || quartos || bairro;

    if (temDados) {
      const detalhes = [
        tipo && 'Tipo: <strong>' + tipo + '</strong>',
        quartos && 'Quartos: <strong>' + quartos + '</strong>',
        bairro && 'Bairro: <strong>' + bairro + '</strong>',
      ].filter(Boolean).join('<br>');

      return '\uD83C\uDFE0 Entendi! Vou cadastrar o im\u00f3vel com esses dados:<br><br>' +
        detalhes + '<br><br>' +
        'Para completar o cadastro (valor, \u00e1rea, fotos, endere\u00e7o) acesse:<br><br>' +
        btn('Cadastrar im\u00f3vel', '/app/cadastro') +
        chip('Importar via XML', 'importar xml');
    }

    return '\uD83C\uDFE0 Quer cadastrar um im\u00f3vel. Tem duas op\u00e7\u00f5es:<br><br>' +
      '<strong>1. Importar via XML</strong> \u2014 traz v\u00e1rios im\u00f3veis do seu CRM de uma vez<br>' +
      '<strong>2. Cadastro manual</strong> \u2014 preenche um por um<br><br>' +
      btn('Cadastrar im\u00f3vel', '/app/cadastro') +
      chip('Importar XML', 'importar xml');
  }

`;

if (!resposta.includes('IMPORTAR_XML') || !resposta.includes('importarXMLPeloChat')) {
  resposta = resposta.replace(
    "  if (intencao === 'CADASTRAR_LEAD')",
    novasRespostas + "\n  if (intencao === 'CADASTRAR_LEAD')"
  );
  fs.writeFileSync('cerebro/contexto.js', resposta);
  console.log('2. respostas adicionadas');
} else {
  console.log('2. ja existe');
}

// Adicionar função importarXMLPeloChat no assistente EJS
let ejs = fs.readFileSync('views/app-assistente.ejs','utf8');
if (!ejs.includes('importarXMLPeloChat')) {
  ejs = ejs.replace(
    'async function uploadArquivo(input) {',
    `async function importarXMLPeloChat(url) {
  addMsg('Importando XML: ' + url, 'user');
  showTyping();
  try {
    const form = new FormData();
    form.append('xmlUrl', url);
    const res = await fetch('/app/importar', { method:'POST', body: form });
    const data = await res.json();
    removeTyping();
    if (data.ok || data.importados) {
      streamMsg('\u2705 <strong>' + (data.importados||0) + ' im\u00f3vel(is) importado(s) com sucesso!</strong><br><br>Acesse sua carteira para ver os novos im\u00f3veis.');
    } else {
      streamMsg('\u274C Erro ao importar: ' + (data.erro||data.error||'Verifique a URL e tente novamente.'));
    }
  } catch(e) {
    removeTyping();
    streamMsg('\u274C Erro ao conectar. Tente novamente.');
  }
}

async function uploadArquivo(input) {`
  );
  fs.writeFileSync('views/app-assistente.ejs', ejs);
  console.log('3. importarXMLPeloChat adicionado no assistente');
} else {
  console.log('3. ja existe');
}
