const fs = require('fs');
let nav = fs.readFileSync('cerebro/navegador.js','utf8');

// Corrigir descrições no navegador
nav = nav.replace(
  "descricao:'Feeds XML para portais imobiliarios'",
  "descricao:'XML que VOC\u00ca EXPORTA para portais parceiros (VivaReal, ZAP, OLX...)'"
);
nav = nav.replace(
  "descricao:'Adicione imoveis manualmente ou via XML'",
  "descricao:'IMPORTE imoveis do seu CRM para o MatchIm\u00f3veis via XML (Tecimob, Rankim, Vista...)'"
);

// Corrigir keywords para não confundir importar com exportar
nav = nav.replace(
  "keywords:['portais','xml','feed','vivareal','zap','olx','chaves','imovelweb','123i','url do feed','link do portal','portias','ver portais']",
  "keywords:['portais','exportar xml','feed portal','vivareal','zap','olx','chaves','imovelweb','123i','url do feed','link do portal','portias','ver portais','enviar para portal','publicar portal']"
);
nav = nav.replace(
  "keywords:['cadastrar','cadastro','novo imovel','adicionar imovel','importar xml','subir xml','url xml','feed xml']",
  "keywords:['cadastrar','cadastro','novo imovel','adicionar imovel','importar xml','subir xml','url xml','feed xml','trazer imoveis','importar do crm','trazer do tecimob','trazer do rankim','puxar imoveis','trazer imoveis para matchimoveis']"
);

// Corrigir fluxos
nav = nav.replace(
  "titulo:'Gerar XML para portal', rota:'/app/imoveis'",
  "titulo:'Exportar XML para portal parceiro', rota:'/app/imoveis'"
);
nav = nav.replace(
  "keywords:['gerar xml','xml vivareal','xml zap','xml olx','publicar portal','feed portal','como gero xml','gerar feed']",
  "keywords:['gerar xml','exportar xml','xml vivareal','xml zap','xml olx','publicar portal','feed portal','como gero xml','gerar feed','enviar xml para portal','subir no vivareal','publicar no zap']"
);

fs.writeFileSync('cerebro/navegador.js', nav);
console.log('1. navegador.js — vocabulario corrigido');

// Corrigir no contexto.js — IMPORTAR_XML é trazer do CRM
let ctx = fs.readFileSync('cerebro/contexto.js','utf8');
ctx = ctx.replace(
  "IMPORTAR_XML:    /importa(r)? (o |um )?xml|importa(r)? (os )?imoveis|trazer imoveis|subir xml|url do feed|trazer do crm|importar do (tecimob|rankim|vista|crm)|cole a url/,",
  "IMPORTAR_XML:    /importa(r)? (o |um )?xml|importa(r)? (os )?imoveis?|trazer imoveis?|subir xml|url do feed|trazer do (crm|tecimob|rankim|vista|jetimob|kenlo)|puxar imoveis?|trazer para (o |a )?match|cole a url/,"
);

// Separar EXPORTAR_XML como nova intenção
if (!ctx.includes('EXPORTAR_XML')) {
  ctx = ctx.replace(
    '  CADASTRAR_IMOVEL:',
    '  EXPORTAR_XML:    /exporta(r)? xml|gerar xml para|xml (do |para o )?(vivareal|zap|olx|chaves|imovelweb|123i)|publicar (no |no portal|para o portal)|enviar xml para portal|subir (no|para o) (vivareal|zap|olx)/,\n  CADASTRAR_IMOVEL:'
  );
  fs.writeFileSync('cerebro/contexto.js', ctx);
  console.log('2. contexto.js — EXPORTAR_XML adicionado');
}

// Adicionar resposta para EXPORTAR_XML
ctx = fs.readFileSync('cerebro/contexto.js','utf8');
if (!ctx.includes("intencao === 'EXPORTAR_XML'")) {
  ctx = ctx.replace(
    "  // ── CADASTRAR IMÓVEL MANUAL",
    `  // ── EXPORTAR XML PARA PORTAL ────────────────────────────────────────────────
  if (intencao === 'EXPORTAR_XML') {
    const portal = ctx.mNorm.match(/vivareal|zap|olx|chaves|imovelweb|123i/)?.[0] || null;
    if (portal) {
      return '\uD83D\uDD97 Para exportar o XML para o <strong>'+portal.toUpperCase()+'</strong>:<br><br>' +
        '<div style="display:flex;gap:10px;margin:6px 0"><span style="background:#ff385c;color:white;border-radius:50%;width:22px;height:22px;min-width:22px;display:inline-flex;align-items:center;justify-content:center;font-size:11px;font-weight:700">1</span><span>V\u00e1 em Im\u00f3veis e selecione os im\u00f3veis</span></div>' +
        '<div style="display:flex;gap:10px;margin:6px 0"><span style="background:#ff385c;color:white;border-radius:50%;width:22px;height:22px;min-width:22px;display:inline-flex;align-items:center;justify-content:center;font-size:11px;font-weight:700">2</span><span>Clique em <strong>'+portal.toUpperCase()+'</strong> na barra inferior</span></div>' +
        '<div style="display:flex;gap:10px;margin:6px 0"><span style="background:#ff385c;color:white;border-radius:50%;width:22px;height:22px;min-width:22px;display:inline-flex;align-items:center;justify-content:center;font-size:11px;font-weight:700">3</span><span>Copie a URL do feed em <strong>Portais</strong> e envie ao portal</span></div>' +
        '<br>' + btn('Ir para Im\u00f3veis', '/app/imoveis') + btn('Ver Portais', '/app/portais');
    }
    return '\uD83D\uDD97 Para <strong>exportar XML para portais parceiros</strong> (VivaReal, ZAP, OLX...):<br><br>' +
      '<div style="display:flex;gap:10px;margin:6px 0"><span style="background:#ff385c;color:white;border-radius:50%;width:22px;height:22px;min-width:22px;display:inline-flex;align-items:center;justify-content:center;font-size:11px;font-weight:700">1</span><span>Selecione os im\u00f3veis em <a href="/app/imoveis" style="color:#ff385c">/app/imoveis</a></span></div>' +
      '<div style="display:flex;gap:10px;margin:6px 0"><span style="background:#ff385c;color:white;border-radius:50%;width:22px;height:22px;min-width:22px;display:inline-flex;align-items:center;justify-content:center;font-size:11px;font-weight:700">2</span><span>Escolha o portal na barra inferior e clique em Gerar XML</span></div>' +
      '<div style="display:flex;gap:10px;margin:6px 0"><span style="background:#ff385c;color:white;border-radius:50%;width:22px;height:22px;min-width:22px;display:inline-flex;align-items:center;justify-content:center;font-size:11px;font-weight:700">3</span><span>A URL do feed fica em <a href="/app/portais" style="color:#ff385c">/app/portais</a></span></div>' +
      '<br>' + chip('VivaReal', 'gerar xml vivareal') + chip('ZAP', 'gerar xml zap') + chip('OLX', 'gerar xml olx') +
      '<br>' + btn('Im\u00f3veis', '/app/imoveis') + btn('Portais', '/app/portais');
  }

  // ── CADASTRAR IMÓVEL MANUAL`
  );
  fs.writeFileSync('cerebro/contexto.js', ctx);
  console.log('3. contexto.js — resposta EXPORTAR_XML adicionada');
}

console.log('\nPronto! Rode: npm run cerebro');
