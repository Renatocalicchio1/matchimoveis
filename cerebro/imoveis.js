'use strict';

function responder(mNorm, d, imoveis, btn, chip) {
  // PÁGINA DE CADASTRO
  if (/pagina cadastro|app cadastro|cadastrar imovel pagina|o que tem no cadastro/.test(mNorm))
    return '➕ <strong>Cadastrar Imóvel (/app/cadastro):</strong><br><br>' +
      'Duas opções:<br>' +
      '• 📥 <strong>Importar via XML</strong> — importar vários imóveis de uma vez<br>' +
      '• ✏️ <strong>Cadastro manual</strong> — cadastrar um imóvel por vez<br><br>' +
      'Ideal para captações diretas ou exclusividades.<br><br>' +
      btn('Cadastrar imóvel','/app/cadastro');

  // IMPORTAR VIA XML
  if (/importar via xml|url do feed|url xml|testar xml|testar url/.test(mNorm))
    return '📥 <strong>Importar via XML:</strong><br><br>' +
      '<div style="display:flex;gap:8px;margin:4px 0"><span style="background:#ff385c;color:white;border-radius:50%;width:20px;height:20px;display:inline-flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;flex-shrink:0">1</span><span>Cole a URL do feed XML ou envie o arquivo</span></div>' +
      '<div style="display:flex;gap:8px;margin:4px 0"><span style="background:#ff385c;color:white;border-radius:50%;width:20px;height:20px;display:inline-flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;flex-shrink:0">2</span><span>Clique em <strong>Testar</strong> para validar</span></div>' +
      '<div style="display:flex;gap:8px;margin:4px 0"><span style="background:#ff385c;color:white;border-radius:50%;width:20px;height:20px;display:inline-flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;flex-shrink:0">3</span><span>Sistema mostra quantos imóveis serão importados</span></div>' +
      '<div style="display:flex;gap:8px;margin:4px 0"><span style="background:#ff385c;color:white;border-radius:50%;width:20px;height:20px;display:inline-flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;flex-shrink:0">4</span><span>Clique em <strong>Importar Agora</strong></span></div>' +
      '<div style="display:flex;gap:8px;margin:4px 0"><span style="background:#ff385c;color:white;border-radius:50%;width:20px;height:20px;display:inline-flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;flex-shrink:0">5</span><span>URL salva com data da última atualização</span></div>' +
      '<br>' + btn('Cadastrar imóvel','/app/cadastro');

  // CADASTRO MANUAL
  if (/cadastro manual|cadastrar um imovel|captacao direta|exclusividade cadastro/.test(mNorm))
    return '✏️ <strong>Cadastro manual de imóvel:</strong><br><br>' +
      'Ideal para captações diretas e exclusividades.<br><br>' +
      '<strong>Campos do cadastro:</strong><br>' +
      '• Tipo: Apartamento · Casa · Sobrado · Cobertura · Loft · Estúdio · Kitnet · Terreno · Comercial<br>' +
      '• Operação: Venda · Aluguel<br>' +
      '• Status: Publicado · Arquivado · Não publicado<br>' +
      '• Endereço: Bairro · Cidade · Estado · CEP<br>' +
      '• Valores: Preço · Condomínio · IPTU<br>' +
      '• Área: Total · Útil/Privativa<br>' +
      '• Quartos · Suítes · Banheiros · Vagas<br>' +
      '• Descrição do imóvel<br>' +
      '• Proprietário: Nome · Telefone · E-mail<br>' +
      '• Portais: OLX · ZAP · VivaReal · Chaves · ImovelWeb · 123i<br>' +
      '• Fotos: subir, definir capa, excluir<br><br>' +
      btn('Cadastrar imóvel','/app/cadastro');

  // TESTAR URL XML
  if (/testar url|testar feed|como testar xml|botao testar/.test(mNorm))
    return '🔍 <strong>Testar URL do XML:</strong><br><br>' +
      'Cole a URL do feed e clique em <strong>Testar</strong>.<br>' +
      'O sistema valida a URL e mostra quantos imóveis serão importados.<br>' +
      'Se der certo, clique em <strong>Importar Agora</strong>.<br><br>' +
      btn('Cadastrar imóvel','/app/cadastro');

  // DIFERENÇA XML VS MANUAL
  if (/diferenca xml manual|quando usar xml|quando usar manual|xml ou manual/.test(mNorm))
    return '📊 <strong>XML vs Cadastro Manual:</strong><br><br>' +
      '• 📥 <strong>XML</strong> — importa vários imóveis de uma vez via URL ou arquivo. Ideal para quem tem CRM (Tecimob, Rankim...)<br>' +
      '• ✏️ <strong>Manual</strong> — cadastra um imóvel por vez. Ideal para captações diretas ou exclusividades<br><br>' +
      btn('Cadastrar imóvel','/app/cadastro');

  // PÁGINA DE IMÓVEIS — o que tem
  if (/o que tem na pagina imoveis|pagina imoveis|meus imoveis pagina|app imoveis/.test(mNorm))
    return '🏠 <strong>Página Meus Imóveis (/app/imoveis):</strong><br><br>' +
      '• Quantidade de imóveis indexados<br>' +
      '• Seleção em massa + geração de XML por portal<br>' +
      '• Filtros: tipo, bairro, cidade, estado, valor min/max, área, quartos, vagas, suítes, banheiros, operação, status, proprietário, fotos<br>' +
      '• Cards com: ID externo, valor, região, proprietário, metragem<br>' +
      '• Botões: Ver imóvel, Editar<br><br>' +
      btn('Ver imóveis','/app/imoveis');

  // FILTROS DA PÁGINA
  if (/filtros imoveis|filtrar imoveis|como filtrar/.test(mNorm))
    return '🔍 <strong>Filtros disponíveis em Imóveis:</strong><br><br>' +
      'Tipo · Bairro · Cidade · Estado · Valor mín/máx · Área · Quartos · Vagas · Suítes · Banheiros · Operação (venda/aluguel) · Status (ativo/inativo) · Proprietário · Fotos<br><br>' +
      btn('Ver imóveis','/app/imoveis');

  // GERAR XML / PORTAIS
  if (/selecionar todos|checkboxes|selecionar imoveis/.test(mNorm))
    return '☑️ Na página de imóveis, clique em <strong>Selecionar Todos</strong> para marcar todos os imóveis.<br><br>' +
      'Depois escolha o portal para gerar o XML:<br>' +
      '• VivaReal (padrão VRSync)<br>• ZAP Imóveis<br>• OLX<br>• Chaves na Mão<br>• ImovelWeb<br>• 123i<br><br>' +
      btn('Ver imóveis','/app/imoveis');

  // TIPOS DE IMÓVEL COMPLETOS
  if (/tipos de imovel|quais tipos|tipo imovel/.test(mNorm))
    return '🏠 <strong>Tipos de imóvel:</strong><br><br>' +
      'Apartamento · Casa · Sobrado · Cobertura · Loft · Estúdio · Kitnet · Terreno · Comercial<br><br>' +
      btn('Ver imóveis','/app/imoveis');

  // OPERAÇÕES
  if (/operacao|tipo operacao|venda|aluguel/.test(mNorm))
    return '🔄 <strong>Tipos de operação:</strong><br><br>' +
      '• <strong>Venda</strong> — imóvel à venda<br>' +
      '• <strong>Aluguel</strong> — imóvel para locação<br><br>' +
      'Filtre por operação na página de imóveis.' + btn('Ver imóveis','/app/imoveis');

  // EDITAR IMÓVEL
  if (/editar imovel|como editar|campos do imovel|o que tem no cadastro/.test(mNorm))
    return '✏️ <strong>Editar imóvel — campos disponíveis:</strong><br><br>' +
      'Tipo · Bairro · Cidade · Estado · Valor · Área · Quartos · Suítes · Banheiros · Vagas · Descrição<br>' +
      'Proprietário: nome, telefone, e-mail<br>' +
      'Status: Publicado · Arquivado · Não publicado<br>' +
      'Portais: OLX · ZAP · VivaReal · Chaves · ImovelWeb · 123i<br>' +
      'Fotos: subir, definir capa, excluir<br><br>' +
      btn('Ver imóveis','/app/imoveis');

  // STATUS DO IMÓVEL
  if (/status imovel|publicado|arquivado|nao publicado/.test(mNorm))
    return '📋 <strong>Status do imóvel:</strong><br><br>' +
      '• <strong>Publicado</strong> — ativo, aparece no match e nos portais<br>' +
      '• <strong>Arquivado</strong> — inativo, não aparece no match nem nos portais<br>' +
      '• <strong>Não publicado</strong> — cadastrado mas não publicado ainda<br><br>' +
      btn('Ver imóveis','/app/imoveis');

  // FOTOS
  if (/fotos imovel|subir foto|capa imovel|excluir foto/.test(mNorm))
    return '📸 <strong>Gerenciar fotos do imóvel:</strong><br><br>' +
      '• Subir fotos (JPG, PNG)<br>' +
      '• Definir foto de capa<br>' +
      '• Excluir fotos<br><br>' +
      'Acesse o imóvel e clique em <strong>Editar</strong>.' + btn('Ver imóveis','/app/imoveis');

  // CARD DO IMÓVEL
  if (/card imovel|o que aparece no card|informacoes imovel/.test(mNorm))
    return '📋 <strong>Card do imóvel mostra:</strong><br><br>' +
      '• ID externo (do sistema de origem)<br>' +
      '• Valor<br>' +
      '• Região/Bairro<br>' +
      '• Nome do proprietário<br>' +
      '• Metragem (m²)<br><br>' +
      btn('Ver imóveis','/app/imoveis');

  // PADRÃO XML VR5
  if (/vr5|vrsync|padrao xml|padrao viva real/.test(mNorm))
    return '🔗 O MatchImóveis gera XML no <strong>padrão VRSync</strong> do VivaReal, compatível com todos os principais portais brasileiros.<br><br>' +
      btn('Ver portais','/app/portais');


  // IMPORTAR XML
  if (/xml|importar|tecimob|rankim|subir/.test(mNorm))
    return `📥 <strong>Importar imóveis via XML:</strong><br><br>`+
      `<div style="display:flex;gap:10px;margin:6px 0"><span style="background:#ff385c;color:white;border-radius:50%;width:22px;height:22px;display:inline-flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;flex-shrink:0">1</span><span>Exporte o XML do seu CRM (Tecimob, Rankim ou outro).</span></div>`+
      `<div style="display:flex;gap:10px;margin:6px 0"><span style="background:#ff385c;color:white;border-radius:50%;width:22px;height:22px;display:inline-flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;flex-shrink:0">2</span><span>Acesse <a href="/app/imoveis" style="color:#ff385c;font-weight:700">Imóveis →</a> e clique em <strong>Importar XML</strong>.</span></div>`+
      `<div style="display:flex;gap:10px;margin:6px 0"><span style="background:#ff385c;color:white;border-radius:50%;width:22px;height:22px;display:inline-flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;flex-shrink:0">3</span><span>Selecione o arquivo <strong>.xml</strong> e clique em Enviar.</span></div>`+
      `<br>${btn('Ir para imóveis','/app/imoveis')}`;

  // INATIVOS
  if (/inativo|desativado|oculto/.test(mNorm)) {
    if (d.inativos===0) return `✅ Nenhum imóvel inativo no momento.`;
    return `❌ <strong>${d.inativos} imóveis inativos</strong><br>`+
      `Imóveis inativos não aparecem no match nem nos portais.<br><br>`+
      `${btn('Ver inativos','/app/imoveis?status=inativo')}${chip('🔄 Reativar','como reativar imovel')}`;
  }

  // SEM PROPRIETÁRIO
  if (/proprietario|dono|sem prop/.test(mNorm)) {
    const semProp = imoveis.filter(i=>!i.proprietario&&!i.nomeProprietario).length;
    if (semProp===0) return `✅ Todos os imóveis têm proprietário vinculado! Perfeito.`;
    return `👤 <strong>${semProp} imóveis sem proprietário</strong><br>`+
      `Sem proprietário, não é possível notificá-lo sobre visitas.<br><br>`+
      `${btn('Vincular proprietários','/app/imoveis')}${chip('📥 Importar Excel','importar proprietarios')}`;
  }

  // SEM MATCH / PARADOS
  if (/parado|sem match|sem lead|sem visita|encalhado/.test(mNorm)) {
    const total = imoveis.filter(i=>i.status!=='inativo').length;
    return `📉 Imóveis parados = ativos mas sem nenhuma lead compatível.<br>`+
      `Você tem <strong>${total}</strong> imóveis ativos.<br><br>`+
      `Dicas para melhorar:<br>`+
      `• Verifique se os bairros batem com o que as leads buscam<br>`+
      `• Revise o valor — pode estar acima da faixa buscada<br>`+
      `• Adicione mais fotos e descrição<br><br>`+
      `${btn('Ver imóveis','/app/imoveis')}${chip('📍 Demanda por bairro','demanda por bairro')}`;
  }

  // VALOR MÉDIO
  if (/valor medio|preco medio|ticket medio/.test(mNorm)) {
    const vals = imoveis.filter(i=>i.status!=='inativo'&&i.valor&&i.valor>0).map(i=>Number(i.valor));
    if (!vals.length) return `Sem dados de valor nos imóveis ainda.`;
    const med = Math.round(vals.reduce((a,b)=>a+b,0)/vals.length);
    const min = Math.min(...vals), max = Math.max(...vals);
    return `💰 <strong>Valores da carteira:</strong><br>`+
      `Mínimo: R$ ${min.toLocaleString('pt-BR')}<br>`+
      `Médio: R$ ${med.toLocaleString('pt-BR')}<br>`+
      `Máximo: R$ ${max.toLocaleString('pt-BR')}<br><br>`+
      `${btn('Ver imóveis','/app/imoveis')}`;
  }

  // BUSCA POR BAIRRO/TIPO
  const temBairro = d.bairros.find(b => mNorm.includes(b.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'')));
  const temTipo = ['apartamento','casa','cobertura','sala','terreno','sobrado','studio'].find(t => mNorm.includes(t));
  if (temBairro||temTipo) {
    let r = imoveis.filter(i=>i.status!=='inativo');
    if (temBairro) r = r.filter(i=>i.bairro&&i.bairro.toLowerCase().includes(temBairro.toLowerCase()));
    if (temTipo)   r = r.filter(i=>i.tipo&&i.tipo.toLowerCase().includes(temTipo));
    if (r.length===0) return `Não encontrei imóveis ativos${temTipo?' do tipo '+temTipo:''}${temBairro?' em '+temBairro:''}.<br><br>${btn('Ver todos','/app/imoveis')}`;
    return `🔍 <strong>${r.length} imóvel(is)</strong>${temBairro?' em '+temBairro:''}${temTipo?' · '+temTipo:''}:<br>`+
      r.slice(0,5).map(i=>`• <strong>${i.tipo||'Imóvel'}</strong> ${i.quartos?i.quartos+'q':''} — ${i.bairro||''} ${i.valor?'· R$'+Number(i.valor).toLocaleString('pt-BR'):''}`).join('<br>')+
      (r.length>5?`<br><em>...e mais ${r.length-5}</em>`:'')+
      `<br><br>${btn('Ver todos','/app/imoveis')}`;
  }

  // GERAL
  if (d.ativos===0)
    return `Nenhum imóvel ainda. 🏠<br><br>${btn('Importar XML','/app/imoveis')}`;

  // Distribuição por tipo
  const tipos = {};
  imoveis.filter(i=>i.status!=='inativo').forEach(i=>{ if(i.tipo) tipos[i.tipo]=(tipos[i.tipo]||0)+1; });
  const topTipos = Object.entries(tipos).sort((a,b)=>b[1]-a[1]).slice(0,3).map(([t,n])=>`${t} (${n})`).join(', ');

  return `🏠 <strong>Imóveis:</strong><br>`+
    `✅ Ativos: <strong>${d.ativos}</strong> · ❌ Inativos: ${d.inativos}<br>`+
    `📍 Bairros: ${d.bairros.slice(0,5).join(', ')||'—'}<br>`+
    `🏷️ Tipos: ${topTipos||'—'}<br><br>`+
    `${btn('Ver imóveis','/app/imoveis')}${chip('📥 Importar XML','importar xml')}${chip('💰 Valor médio','valor medio da carteira')}${chip('👤 Proprietários','imoveis sem proprietario')}`;
}

module.exports = { responder };
