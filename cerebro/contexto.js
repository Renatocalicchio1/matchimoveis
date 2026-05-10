'use strict';
const rag = require('./rag');
const semAcento = s => (s||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
const INTENCOES = {
  BUSCAR_IMOVEL:  /tenho (um )?cliente|cliente (quer|procura|busca|precisa|esta procurando)|alguem (quer|procura)|procurando (um |uma )?(apto|apartamento|casa|imovel)|tem (apto|apartamento|casa)|quero ver|mostrar imoveis|buscar imoveis|imoveis (no|na|em|do|da)/,
  CADASTRAR_LEAD: /cadastra(r)? (lead|cliente|o lead|o cliente)|novo (lead|cliente|interessado)|adiciona(r)? (lead|cliente)|criar (lead|cliente)|anota(r)? (lead|cliente)|salva(r)? (lead|cliente)|novo atendimento/,
  CRIAR_VISITA:   /agendar visita|marcar visita|cliente quer visitar|cliente quer ver|visita para/,
  INFORMAR:       /acabei de|acabou de|ja (vendeu|vendemos|fechou|fechamos|foi vendido)|nao esta mais|imovel vendido|ja tem proposta/,
  FOLLOW_UP:      /follow.?up|retornar para|ligar para|mandar (mensagem|whatsapp|zap)|entrar em contato|cliente nao (respondeu|retornou)/,
  IMPORTAR_XML:    /importa(r)? (o |um )?xml|importa(r)? (os )?imoveis?|trazer imoveis?|subir xml|url do feed|trazer do (crm|tecimob|rankim|vista|jetimob|kenlo)|puxar imoveis?|trazer para (o |a )?match|cole a url/,
  GERAR_XML_TODOS: /gerar xml todos|xml todos|todos os imoveis.*xml|xml.*todos/,
  EXPORTAR_XML:    /exporta(r)? xml|gerar xml para|xml (do |para o )?(vivareal|zap|olx|chaves|imovelweb|123i)|publicar (no |no portal|para o portal)|enviar xml para portal|subir (no|para o) (vivareal|zap|olx)/,
  CADASTRAR_IMOVEL:/cadastra(r)? (um |o )?imovel|novo imovel|adicionar imovel|criar imovel|registrar imovel/,
  AVISAR_PROP:    /avisar (o |a )?proprietario|notificar (o |a )?proprietario|falar com (o |a )?proprietario/,
};
const OPERACAO = {
  venda:   /comprar|vender|financiar|compra/,
  aluguel: /alugar|aluguel|locar|locacao|mes|mensal/,
};
function extrairNome(frase) {
  const m = frase.match(/(?:cliente|lead|para o|para a)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/);
  return m ? m[1] : null;
}
function detectarIntencao(mNorm) {
  for (const [nome, regex] of Object.entries(INTENCOES)) {
    if (regex.test(mNorm)) return nome;
  }
  return null;
}
function analisar(fraseOriginal, imoveis, leads, visitas) {
  const mNorm    = semAcento(fraseOriginal);
  const intencao = detectarIntencao(mNorm);
  const operacao = Object.entries(OPERACAO).find(([,r]) => r.test(mNorm))?.[0] || null;
  const nome     = extrairNome(fraseOriginal);
  const bairrosDisponiveis = [...new Set(imoveis.map(i => i.bairro).filter(Boolean))];
  const slots = rag.extrairSlots(mNorm);
  const bairroCarteira = bairrosDisponiveis.find(b => mNorm.includes(semAcento(b)));
  if (bairroCarteira) slots.bairro = bairroCarteira;
  if (!slots.bairro) {
    const m2 = mNorm.match(/(?:no|na|em|do|da)\s+([a-z][a-z ]{2,20})(?:\s|$|,|\.)/);
    if (m2) {
      const stop = new Set(['minha','meu','sua','seu','nossa','carteira','cliente','lead','imovel','sistema']);
      const c = m2[1].trim();
      if (!stop.has(c)) slots.bairro = c;
    }
  }
  if (operacao) slots.operacao = operacao;
  if (nome)     slots.nomeCliente = nome;
  let imoveisEncontrados = [], leadsEncontrados = [];
  if (slots.tipo || slots.bairro || slots.quartos || slots.valorMax) {
    const b = rag.buscarImoveis(mNorm, imoveis, bairrosDisponiveis);
    if (b) imoveisEncontrados = b.resultado || [];
  }
  if (slots.tipo || slots.bairro) {
    const bl = rag.buscarLeads(mNorm, leads, bairrosDisponiveis);
    if (bl) leadsEncontrados = bl.resultado || [];
  }
  return { intencao, slots, imoveisEncontrados, leadsEncontrados, temDados: !!(slots.tipo||slots.bairro||slots.quartos||slots.valorMax||slots.vagas), fraseOriginal, mNorm };
}
function responder(ctx, d, user, imoveis, leads, visitas, btn, chip) {
  const { intencao, slots, imoveisEncontrados } = ctx;
  if (!intencao && !ctx.temDados) return null;
  const fmtVal = v => 'R$ ' + Number(v).toLocaleString('pt-BR');
  const filtros = [
    slots.tipo     && (slots.tipo.charAt(0).toUpperCase()+slots.tipo.slice(1)),
    slots.bairro   && ('\uD83D\uDCCD '+slots.bairro),
    slots.quartos  && (slots.quartos+'+ quartos'),
    slots.valorMax && ('ate '+fmtVal(slots.valorMax)),
    slots.vagas    && (slots.vagas+'+ vagas'),
    slots.operacao && slots.operacao,
  ].filter(Boolean).join(' \u00B7 ');
  if (intencao === 'BUSCAR_IMOVEL' || (ctx.temDados && !intencao)) {
    const nome = slots.nomeCliente ? ' para <strong>'+slots.nomeCliente+'</strong>' : '';
    if (imoveisEncontrados.length === 0) {
      return '\uD83D\uDE14 Nenhum imovel encontrado'+nome+'.<br><span style="font-size:12px;color:#888">'+filtros+'</span><br><br>\uD83D\uDCA1 Quer cadastrar esse cliente como lead?<br><br>'+btn('Cadastrar lead','/app/leads')+chip('Demanda por bairro','demanda por bairro');
    }
    const top = [...imoveisEncontrados].sort((a,b)=>(Number(a.valor)||0)-(Number(b.valor)||0));
    const cards = top.slice(0,4).map(i => {
      const val  = i.valor   ? fmtVal(Number(i.valor)) : '-';
      const det  = [i.quartos?i.quartos+'q':'', i.vagas?i.vagas+'vg':'', i.area?i.area+'m2':''].filter(Boolean).join(' · ');
      const prop = i.proprietario&&i.proprietario.nome ? ' · '+i.proprietario.nome : '';
      return '<div style="background:#f9f9f9;border-radius:8px;padding:10px 12px;margin:4px 0;border-left:3px solid #ff385c"><strong>'+(i.tipo||'Imovel')+'</strong> - '+(i.bairro||'-')+'<br><span style="color:#ff385c;font-weight:700">'+val+'</span><span style="color:#555;font-size:12px"> '+det+prop+'</span></div>';
    }).join('');
    const rodape = imoveisEncontrados.length > 4 ? '<br><em style="color:#888;font-size:12px">...e mais '+(imoveisEncontrados.length-4)+' imoveis.</em>' : '';
    const leadExistente = leads.find(l => slots.bairro && l.bairro && semAcento(l.bairro).includes(semAcento(slots.bairro)));
    const avisoLead = leadExistente
      ? '<br><br>\uD83D\uDCA1 Ja tem lead com perfil parecido: <strong>'+(leadExistente.nome||leadExistente.email||'Lead')+'</strong>. Enviar vitrine?'+chip('Leads com match','leads com match')
      : '<br><br>\uD83D\uDCA1 Cadastrar esse cliente como lead?'+btn('Cadastrar lead','/app/leads');
    return '\uD83D\uDD0D <strong>'+imoveisEncontrados.length+' imovel(is)</strong>'+nome+'<br><span style="font-size:12px;color:#888">'+filtros+'</span><br><br>'+cards+rodape+avisoLead+'<br>'+btn('Ver todos','/app/imoveis');
  }

  // ── IMPORTAR XML ────────────────────────────────────────────────────────────
  // ── CADASTRAR LEAD ──────────────────────────────────────────────────────────
  if (intencao === 'CADASTRAR_LEAD') {
    const frase = ctx.fraseOriginal;
    // Extrai nome
    const nomeMatch = frase.match(/(?:lead|cliente)[:\s]+([A-ZÀ-Úa-zà-ú][a-zà-ú]+(?:\s+[A-ZÀ-Úa-zà-ú][a-zà-ú]+)*)/i)
      || frase.match(/cadastra\s+([A-ZÀ-Ú][a-zà-ú]+(?:\s+[A-ZÀ-Ú][a-zà-ú]+)*)/i);
    const nome = nomeMatch ? nomeMatch[1].trim() : null;
    // Extrai celular
    const celularMatch = frase.match(/(\(?\d{2}\)?\s?\d{4,5}[-\s]?\d{4})/);
    const celular = celularMatch ? celularMatch[1].replace(/\D/g,'') : null;
    // Extrai tipo
    const tipoMatch = frase.match(/\b(apto|apartamento|casa|terreno|comercial|cobertura|studio|kitnet)\b/i);
    const tipo = tipoMatch ? (tipoMatch[1].toLowerCase()==='apto'?'Apartamento': tipoMatch[1].charAt(0).toUpperCase()+tipoMatch[1].slice(1)) : '';
    // Extrai quartos
    const quartosMatch = frase.match(/(\d+)\s*(?:q(?:uartos?)?|dorm)/i);
    const quartos = quartosMatch ? Number(quartosMatch[1]) : 0;
    // Extrai valor
    const valorMatch = frase.match(/(?:ate|até|por|valor)?\s*R?\$?\s*([\d.,]+)\s*(mil|k|m)?/i);
    let valor = 0;
    if (valorMatch) {
      let v = parseFloat(valorMatch[1].replace(/\./g,'').replace(',','.'));
      const suf = (valorMatch[2]||'').toLowerCase();
      if (suf==='mil'||suf==='k') v*=1000;
      if (suf==='m') v*=1000000;
      valor = v;
    }
    // Extrai bairro
    const bairroMatch = frase.match(/\b(?:em|no|na|bairro)\s+([A-ZÀ-Úa-zà-ú][a-zà-ú]+(?:\s+[A-ZÀ-Úa-zà-ú][a-zà-ú]+){0,2})/i);
    const bairro = bairroMatch ? bairroMatch[1].trim() : '';

    if (nome && celular) {
      return 'ACAO_CADASTRAR_LEAD:' + JSON.stringify({ nome, celular, tipo, quartos, valor_imovel: valor, bairro });
    }
    if (nome && !celular) {
      return '📋 Entendido! Quer cadastrar <strong>' + nome + '</strong>.<br><br>Qual o celular do cliente?';
    }
    return '📋 <strong>Cadastrar novo lead:</strong><br><br>Me passa nome e celular do cliente.<br><br>💡 Exemplo: <em>"cadastra lead João Silva, 47999991234, quer apto 3q em Itajaí até 600k"</em>';
  }


  // ── GERAR XML ───────────────────────────────────────────────────────────────

  if (intencao === 'GERAR_XML_TODOS') {
    const frase = ctx.fraseOriginal.toLowerCase();
    const portaisMap = { vivareal: 'vivareal', zap: 'zap', olx: 'olx', imovelweb: 'imovelweb', chaves: 'chaves', '123i': '123i' };
    const portalEncontrado = Object.keys(portaisMap).find(p => frase.includes(p)) || window?._portalPendente;
    const portal = portalEncontrado ? portaisMap[portalEncontrado] || portalEncontrado : null;
    if (portal) return 'ACAO_GERAR_XML:' + JSON.stringify({ portal });
    return '🔗 Para qual portal? ' + Object.keys(portaisMap).map(p => chip(p, 'gerar xml ' + p)).join(' ');
  }

  if (intencao === 'EXPORTAR_XML') {
    const frase = ctx.fraseOriginal.toLowerCase();
    const portaisMap = { vivareal: 'vivareal', zap: 'zap', olx: 'olx', imovelweb: 'imovelweb', 'imovel web': 'imovelweb', chaves: 'chaves', '123i': '123i' };
    const portalEncontrado = Object.keys(portaisMap).find(p => frase.includes(p));

    if (!portalEncontrado) {
      return '🔗 <strong>Gerar XML — para qual portal?</strong><br><br>' +
        chip('VivaReal','gerar xml vivareal') +
        chip('ZAP','gerar xml zap') +
        chip('OLX','gerar xml olx') +
        chip('ImovelWeb','gerar xml imovelweb') +
        chip('Chaves na Mão','gerar xml chaves') +
        chip('123i','gerar xml 123i');
    }

    return 'ACAO_GERAR_XML:' + JSON.stringify({ portal: portaisMap[portalEncontrado] });
  }

  if (intencao === 'IMPORTAR_XML') {
    // Extrair URL da mensagem se tiver
    const urlMatch = ctx.fraseOriginal.match(/https?:\/\/\S+/);
    const url = urlMatch ? urlMatch[0] : null;

    if (url) {
      return '📥 Encontrei a URL do feed:<br><br>' +
        '<code style="background:#f3f4f6;padding:4px 8px;border-radius:6px;font-size:12px">' + url + '</code><br><br>' +
        'Quer que eu importe agora? Os imóveis serão adicionados à sua carteira.<br><br>' +
        '<button onclick="importarXMLPeloChat(\'' + url + '\')" style="background:#ff385c;color:white;border:none;border-radius:10px;padding:10px 20px;font-weight:700;cursor:pointer;font-size:14px">📥 Importar agora</button>' +
        '  ' + btn('Ir para cadastro', '/app/cadastro');
    }

    return '📥 <strong>Importar imóveis via XML:</strong><br><br>' +
      '⚠️ <strong>Padrão obrigatório: VRSync do VivaReal</strong><br>' +
      'O sistema aceita apenas feeds no padrão VRSync do VivaReal.<br>' +
      'A maioria dos CRMs já exporta nesse formato: Tecimob, Rankim, Vista, Jetimob, Kenlo.<br><br>' +
      '💡 Cole a URL do feed aqui no chat ou acesse a página de cadastro:<br><br>' +
      '<div style="background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:10px 14px;font-size:12px;color:#92400e;margin:8px 0">' +
      '📋 Exemplo de URL válida:<br><code>https://seucrm.com.br/feed-vivareal.xml</code></div>' +
      '<br>' + btn('Importar XML', '/app/cadastro') + chip('Como importo', 'como importar xml');
  }

  // ── EXPORTAR XML PARA PORTAL ────────────────────────────────────────────────
  if (intencao === 'EXPORTAR_XML') {
    const portal = ctx.mNorm.match(/vivareal|zap|olx|chaves|imovelweb|123i/)?.[0] || null;
    if (portal) {
      return '🖗 Para exportar o XML para o <strong>'+portal.toUpperCase()+'</strong>:<br><br>' +
        '<div style="display:flex;gap:10px;margin:6px 0"><span style="background:#ff385c;color:white;border-radius:50%;width:22px;height:22px;min-width:22px;display:inline-flex;align-items:center;justify-content:center;font-size:11px;font-weight:700">1</span><span>Vá em Imóveis e selecione os imóveis</span></div>' +
        '<div style="display:flex;gap:10px;margin:6px 0"><span style="background:#ff385c;color:white;border-radius:50%;width:22px;height:22px;min-width:22px;display:inline-flex;align-items:center;justify-content:center;font-size:11px;font-weight:700">2</span><span>Clique em <strong>'+portal.toUpperCase()+'</strong> na barra inferior</span></div>' +
        '<div style="display:flex;gap:10px;margin:6px 0"><span style="background:#ff385c;color:white;border-radius:50%;width:22px;height:22px;min-width:22px;display:inline-flex;align-items:center;justify-content:center;font-size:11px;font-weight:700">3</span><span>Copie a URL do feed em <strong>Portais</strong> e envie ao portal</span></div>' +
        '<br>' + btn('Ir para Imóveis', '/app/imoveis') + btn('Ver Portais', '/app/portais');
    }
    return '🖗 Para <strong>exportar XML para portais parceiros</strong> (VivaReal, ZAP, OLX...):<br><br>' +
      '<div style="display:flex;gap:10px;margin:6px 0"><span style="background:#ff385c;color:white;border-radius:50%;width:22px;height:22px;min-width:22px;display:inline-flex;align-items:center;justify-content:center;font-size:11px;font-weight:700">1</span><span>Selecione os imóveis em <a href="/app/imoveis" style="color:#ff385c">/app/imoveis</a></span></div>' +
      '<div style="display:flex;gap:10px;margin:6px 0"><span style="background:#ff385c;color:white;border-radius:50%;width:22px;height:22px;min-width:22px;display:inline-flex;align-items:center;justify-content:center;font-size:11px;font-weight:700">2</span><span>Escolha o portal na barra inferior e clique em Gerar XML</span></div>' +
      '<div style="display:flex;gap:10px;margin:6px 0"><span style="background:#ff385c;color:white;border-radius:50%;width:22px;height:22px;min-width:22px;display:inline-flex;align-items:center;justify-content:center;font-size:11px;font-weight:700">3</span><span>A URL do feed fica em <a href="/app/portais" style="color:#ff385c">/app/portais</a></span></div>' +
      '<br>' + chip('VivaReal', 'gerar xml vivareal') + chip('ZAP', 'gerar xml zap') + chip('OLX', 'gerar xml olx') +
      '<br>' + btn('Imóveis', '/app/imoveis') + btn('Portais', '/app/portais');
  }

  // ── CADASTRAR IMÓVEL MANUAL ─────────────────────────────────────────────────
  if (intencao === 'CADASTRAR_IMOVEL') {
    // Tenta extrair dados da frase
    const tipoMatch = ctx.mNorm.match(/apto|apartamento|casa|sobrado|cobertura|terreno|comercial|loft/);
    const quartosMatch = ctx.mNorm.match(/(d+)s*(quartos?|q|dorm)/);
    const valorMatch = ctx.mNorm.match(/(d+[,.]?d*)s*(mil|k|milh)/);
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

      return '🏠 Entendi! Vou cadastrar o imóvel com esses dados:<br><br>' +
        detalhes + '<br><br>' +
        'Para completar o cadastro (valor, área, fotos, endereço) acesse:<br><br>' +
        btn('Cadastrar imóvel', '/app/cadastro') +
        chip('Importar via XML', 'importar xml');
    }

    return '🏠 Quer cadastrar um imóvel. Tem duas opções:<br><br>' +
      '<strong>1. Importar via XML</strong> — traz vários imóveis do seu CRM de uma vez<br>' +
      '<strong>2. Cadastro manual</strong> — preenche um por um<br><br>' +
      btn('Cadastrar imóvel', '/app/cadastro') +
      chip('Importar XML', 'importar xml');
  }


  // CADASTRAR_LEAD tratado no bloco principal acima
  if (intencao === 'CRIAR_VISITA')   return '\uD83D\uDCC5 Agendar visita'+(slots.nomeCliente?' para '+slots.nomeCliente:'')+'<br><br>'+btn('Ver visitas','/app/visitas')+chip('Visitas pendentes','visitas pendentes');
  if (intencao === 'FOLLOW_UP') {
    const frios = leads.filter(l => { const dias=(Date.now()-new Date(l.dataCriacao||l.createdAt||Date.now()))/86400000; return dias>3&&(!l.visitas||!l.visitas.length); });
    if (!frios.length) return 'Todas as leads tem interacao recente.';
    return '\uD83D\uDCF1 <strong>'+frios.length+' lead(s) para follow-up:</strong><br><br>'+frios.slice(0,5).map(l=>'- '+(l.nome||l.email||'Lead')+(l.bairro?' - '+l.bairro:'')).join('<br>')+'<br><br>'+btn('Ver leads','/app/leads');
  }
  if (intencao === 'AVISAR_PROP') return '\uD83D\uDC64 Acesse o imovel especifico para notificar o proprietario.<br><br>'+btn('Ver imoveis','/app/imoveis');
  if (intencao === 'INFORMAR')    return '\uD83D\uDCDD Para registrar venda ou saida, inative o imovel na carteira.<br><br>'+btn('Ver imoveis','/app/imoveis');
  return null;
}
module.exports = { analisar, responder, detectarIntencao, extrairNome };
