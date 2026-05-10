const fs = require('fs');

// ── 1. CONTEXTO.JS — adicionar intenção e resposta ──────────────────────────
let ctx = fs.readFileSync('cerebro/contexto.js', 'utf8');

const novaIntencao = `  CADASTRAR_LEAD:  /cadastra(r)? (lead|cliente)|novo (lead|cliente|interessado)|adiciona(r)? (lead|cliente)|criar (lead|cliente)|novo atendimento|anota(r)? (lead|cliente)|salva(r)? (lead|cliente)/,`;

const respostaCadastrarLead = `
  // ── CADASTRAR LEAD ──────────────────────────────────────────────────────────
  if (intencao === 'CADASTRAR_LEAD') {
    // Extrai nome — após "lead:", "cliente:", ou primeira palavra maiúscula
    const nomeMatch = ctx.fraseOriginal.match(/(?:lead|cliente|interessado)[:\s]+([A-ZÀ-Ú][a-zà-ú]+(?:\s+[A-ZÀ-Úa-zà-ú]+)*)/i)
      || ctx.fraseOriginal.match(/(?:cadastra|anota|salva|adiciona)\s+([A-ZÀ-Ú][a-zà-ú]+(?:\s+[A-ZÀ-Úa-zà-ú]+)*)/i);
    const nome = nomeMatch ? nomeMatch[1].trim() : null;

    // Extrai celular
    const celularMatch = ctx.fraseOriginal.match(/(\(?\d{2}\)?\s?\d{4,5}[-\s]?\d{4})/);
    const celular = celularMatch ? celularMatch[1].replace(/\D/g,'') : null;

    // Extrai tipo
    const tipoMatch = ctx.fraseOriginal.match(/\b(apto|apartamento|casa|terreno|comercial|sala|loja|galpao|cobertura|studio|kitnet)\b/i);
    const tipo = tipoMatch ? (tipoMatch[1].toLowerCase() === 'apto' ? 'Apartamento' : tipoMatch[1].charAt(0).toUpperCase() + tipoMatch[1].slice(1).toLowerCase()) : '';

    // Extrai quartos
    const quartosMatch = ctx.fraseOriginal.match(/(\d+)\s*(?:q(?:uartos?)?|dorm(?:it[oó]rios?)?)/i);
    const quartos = quartosMatch ? quartosMatch[1] : '';

    // Extrai valor
    const valorMatch = ctx.fraseOriginal.match(/(?:at[eé]|por|valor|ate)\s*R?\$?\s*([\d.,]+)\s*(mil|k|m|milhao)?/i)
      || ctx.fraseOriginal.match(/R?\$\s*([\d.,]+)\s*(mil|k|m)?/i);
    let valor = 0;
    if (valorMatch) {
      let v = parseFloat(valorMatch[1].replace(/\./g,'').replace(',','.'));
      const sufixo = (valorMatch[2]||'').toLowerCase();
      if (sufixo === 'mil' || sufixo === 'k') v *= 1000;
      if (sufixo === 'm' || sufixo === 'milhao') v *= 1000000;
      valor = v;
    }

    // Extrai bairro — após "em", "no", "na"
    const bairroMatch = ctx.fraseOriginal.match(/\b(?:em|no|na|bairro)\s+([A-ZÀ-Úa-zà-ú][a-zà-ú]+(?:\s+[A-ZÀ-Úa-zà-ú][a-zà-ú]+)*)/i);
    const bairro = bairroMatch ? bairroMatch[1].trim() : '';

    // Se tem nome e celular — cadastra direto
    if (nome && celular) {
      return 'ACAO_CADASTRAR_LEAD:' + JSON.stringify({ nome, celular, tipo, quartos: Number(quartos)||0, valor_imovel: valor, bairro });
    }

    // Se tem nome mas não celular
    if (nome && !celular) {
      return '📋 Entendido! Quer cadastrar <strong>' + nome + '</strong>.<br><br>Qual o celular do cliente?';
    }

    // Se não extraiu nada
    return '📋 <strong>Cadastrar novo lead:</strong><br><br>Me passa os dados:<br><br>' +
      '<strong>Obrigatório:</strong> nome e celular<br>' +
      '<strong>Opcional:</strong> tipo de imóvel, bairro, valor, quartos<br><br>' +
      '💡 Exemplo: <em>"cadastra lead João Silva, 47999991234, quer apto 3q em Itajaí até 600k"</em>';
  }

`;

// Inserir antes do if de BUSCAR_IMOVEL
if (!ctx.includes('ACAO_CADASTRAR_LEAD')) {
  ctx = ctx.replace("  // ── BUSCAR IMÓVEL", respostaCadastrarLead + "  // ── BUSCAR IMÓVEL");
  fs.writeFileSync('cerebro/contexto.js', ctx);
  console.log('1. contexto.js atualizado');
} else {
  console.log('1. ja existe');
}

// ── 2. ASSISTENTE.EJS — adicionar função cadastrarLeadPeloChat ───────────────
let ejs = fs.readFileSync('views/app-assistente.ejs', 'utf8');

const funcaoCadastrar = `
async function cadastrarLeadPeloChat(dados) {
  showTyping();
  try {
    const res = await fetch('/app/leads/manual', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(dados)
    });
    const data = await res.json();
    removeTyping();
    if (data.ok) {
      streamMsg('✅ <strong>Lead cadastrado com sucesso!</strong><br><br>' +
        '👤 <strong>' + data.lead.nome + '</strong><br>' +
        '📱 ' + data.lead.contato + '<br>' +
        (data.lead.tipo ? '🏠 ' + data.lead.tipo + '<br>' : '') +
        (data.lead.bairro ? '📍 ' + data.lead.bairro + '<br>' : '') +
        (data.lead.valor_imovel ? '💰 R$ ' + data.lead.valor_imovel.toLocaleString('pt-BR') + '<br>' : '') +
        '<br><a href="/app/leads" style="background:#ff385c;color:white;padding:8px 18px;border-radius:8px;text-decoration:none;font-weight:700;font-size:13px">Ver leads →</a>');
    } else {
      streamMsg('❌ Erro ao cadastrar: ' + (data.erro || 'Tente novamente.'));
    }
  } catch(e) {
    removeTyping();
    streamMsg('❌ Erro ao conectar. Tente novamente.');
  }
}
`;

if (!ejs.includes('cadastrarLeadPeloChat')) {
  ejs = ejs.replace('async function importarXMLPeloChat', funcaoCadastrar + '\nasync function importarXMLPeloChat');
  fs.writeFileSync('views/app-assistente.ejs', ejs);
  console.log('2. cadastrarLeadPeloChat adicionado no assistente');
} else {
  console.log('2. ja existe');
}

// ── 3. ASSISTENTE.EJS — interceptar ACAO_CADASTRAR_LEAD na resposta ──────────
if (!ejs.includes('ACAO_CADASTRAR_LEAD')) {
  ejs = fs.readFileSync('views/app-assistente.ejs', 'utf8');
  // Procura onde o texto da resposta é exibido e intercepta
  const interceptor = `
    // Intercepta ações do cérebro
    if (texto.startsWith('ACAO_CADASTRAR_LEAD:')) {
      const dados = JSON.parse(texto.replace('ACAO_CADASTRAR_LEAD:', ''));
      streamMsg('📋 Cadastrando lead <strong>' + dados.nome + '</strong>...');
      await cadastrarLeadPeloChat(dados);
      return;
    }
  `;
  ejs = ejs.replace("streamMsg(texto);", interceptor + "\n    streamMsg(texto);");
  fs.writeFileSync('views/app-assistente.ejs', ejs);
  console.log('3. interceptor ACAO_CADASTRAR_LEAD adicionado');
} else {
  console.log('3. ja existe');
}

console.log('✅ DONE');
