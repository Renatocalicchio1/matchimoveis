'use strict';

function responder(mNorm, d, leads, btn, chip) {
  // CARD DA LEAD
  if (/card lead|o que aparece na lead|informacoes da lead/.test(mNorm))
    return '👤 <strong>Card da lead mostra:</strong><br><br>' +
      '• Nome da lead<br>' +
      '• Telefone<br>' +
      '• Origem: importada ou orgânica<br>' +
      '• Status de extração: extraído ou pendente<br>' +
      '• Botão WhatsApp — falar com o cliente<br>' +
      '• Botão Ver Vitrine — abre a vitrine da lead<br>' +
      '• Botão Enviar Vitrine — abre WhatsApp com mensagem padrão<br><br>' +
      btn('Ver leads','/app/leads');

  // VITRINE
  if (/vitrine|o que e vitrine|como funciona vitrine|ver vitrine/.test(mNorm))
    return '✨ <strong>Vitrine da lead:</strong><br><br>' +
      'A vitrine é uma página exclusiva gerada para cada lead com os imóveis em match.<br><br>' +
      'Link: <strong>/cliente/oferta/:leadId</strong><br><br>' +
      '<strong>Enviar vitrine:</strong> abre o WhatsApp com a mensagem:<br>' +
      '<em>"Olá! Separamos algumas oportunidades semelhantes ao que você buscou. Veja sua vitrine: [link]"</em><br><br>' +
      btn('Ver leads','/app/leads');

  // ENVIAR VITRINE
  if (/enviar vitrine|mandar vitrine|como enviar vitrine/.test(mNorm))
    return '📱 <strong>Enviar vitrine para a lead:</strong><br><br>' +
      '1. Acesse a lead em ' + btn('Leads','/app/leads') + '<br>' +
      '2. Clique em <strong>Enviar Vitrine</strong><br>' +
      '3. Abre o WhatsApp com mensagem padrão:<br>' +
      '<em>"Olá! Separamos algumas oportunidades semelhantes ao que você buscou. Veja sua vitrine: [link]"</em><br><br>' +
      'O lead clica no link, escolhe o imóvel e solicita visita.';

  // WHATSAPP DA LEAD
  if (/whatsapp lead|falar com lead|contato lead|botao whatsapp/.test(mNorm))
    return '📱 Cada lead tem um botão <strong>WhatsApp</strong> no card.<br><br>' +
      'Clique para abrir a conversa diretamente com o cliente.<br><br>' +
      btn('Ver leads','/app/leads');

  // ORGÂNICA VS IMPORTADA
  if (/organica|importada|diferenca organica|o que e organica/.test(mNorm))
    return '📋 <strong>Tipos de lead:</strong><br><br>' +
      '• 🌐 <strong>Orgânica</strong> — veio automaticamente dos portais parceiros (Rankim, ImovelWeb, ZAP, VivaReal...)<br>' +
      '• 📋 <strong>Importada</strong> — você mesmo importou via planilha CSV ou Excel<br><br>' +
      btn('Ver leads','/app/leads');

  // EXTRAÇÃO
  if (/extracao|extraido|pendente extracao|perfil extraido/.test(mNorm))
    return '🤖 <strong>Extração de perfil:</strong><br><br>' +
      'A IA lê os dados da lead e extrai automaticamente:<br>' +
      'bairro · tipo de imóvel · quartos · valor máximo · área<br><br>' +
      '• ✅ <strong>Extraído</strong> — IA processou com sucesso<br>' +
      '• ⏳ <strong>Pendente</strong> — aguardando processamento<br><br>' +
      'Sem extração completa o match não funciona corretamente.';

  // PÁGINA DE LEADS — o que tem
  if (/pagina leads|o que tem em leads|menu leads|app leads/.test(mNorm))
    return '👥 <strong>Página Leads (/app/leads):</strong><br><br>' +
      '📊 <strong>Totais:</strong> Total de leads · IA encontrou imóvel · Sem match · Total de matches<br><br>' +
      '🔍 <strong>Filtros:</strong><br>' +
      '• Status: IA encontrou imóvel · Dados extraídos · Pendente de extração · Orgânica · Importada<br>' +
      '• Score: 30+ · 50+ · 60+ · 70+ · 90+<br>' +
      '• Fonte: Ranking · ImovelWeb · Quinto Andar · ZAP · VivaReal · Própria<br>' +
      '• Busca inteligente: nome, e-mail, celular ou bairro<br><br>' +
      btn('Ver leads','/app/leads');

  // STATUS DAS LEADS
  if (/status lead|status das leads|o que significa pendente|o que significa organica|dados extraidos/.test(mNorm))
    return '📋 <strong>Status das leads:</strong><br><br>' +
      '• 🤖 <strong>IA encontrou imóvel</strong> — lead tem match com imóvel da carteira<br>' +
      '• ✅ <strong>Dados extraídos</strong> — IA extraiu bairro, tipo, quartos, valor<br>' +
      '• ⏳ <strong>Pendente de extração</strong> — aguardando processamento da IA<br>' +
      '• 🌐 <strong>Orgânica</strong> — veio diretamente do portal<br>' +
      '• 📋 <strong>Importada</strong> — veio de planilha enviada manualmente<br><br>' +
      btn('Ver leads','/app/leads');

  // SCORE
  if (/score lead|score das leads|o que e score|filtrar por score/.test(mNorm))
    return '⭐ <strong>Score das leads:</strong><br><br>' +
      'O score mede a compatibilidade entre lead e imóvel.<br>' +
      'Quanto maior, melhor o match.<br><br>' +
      '• 30+ · 50+ · 60+ · 70+ · 90+<br><br>' +
      'Filtre por score para ver as leads mais quentes primeiro.<br>' +
      btn('Ver leads','/app/leads');

  // FONTES DAS LEADS
  if (/fonte lead|de onde vem|origem lead|portal lead/.test(mNorm))
    return '🌐 <strong>Fontes de leads:</strong><br><br>' +
      '• Ranking (Rankim)<br>' +
      '• ImovelWeb<br>' +
      '• Quinto Andar<br>' +
      '• ZAP Imóveis<br>' +
      '• VivaReal<br>' +
      '• Própria (importada pelo usuário)<br><br>' +
      btn('Ver leads','/app/leads');

  // BUSCA INTELIGENTE
  if (/busca inteligente|buscar lead|pesquisar lead/.test(mNorm))
    return '🔍 <strong>Busca inteligente de leads:</strong><br><br>' +
      'Busque por: nome · e-mail · celular · bairro<br><br>' +
      btn('Ver leads','/app/leads');

  // IMPORTAR LEADS — campos obrigatórios
  if (/campos importar|campos planilha|campos obrigatorios lead|o que precisa na planilha/.test(mNorm))
    return '📋 <strong>Campos da planilha de leads:</strong><br><br>' +
      '<strong>Obrigatórios:</strong><br>' +
      '• Nome · Celular/Telefone · E-mail<br>' +
      '• ID do anúncio · URL do anúncio<br>' +
      '• Estado · Cidade · Bairro<br>' +
      '• Quartos · Suítes · Banheiros · Vagas · Área · Valor<br><br>' +
      '<strong>Mais importantes:</strong> ID do anúncio, nome, celular, e-mail e URL do portal.<br><br>' +
      'Formatos aceitos: <strong>CSV</strong> ou <strong>Excel (.xlsx)</strong>' +
      btn('Importar leads','/app-importar-leads');

  // COMO IMPORTAR
  if (/como importar lead|importar planilha lead|enviar planilha/.test(mNorm))
    return '📋 <strong>Importar leads — passo a passo:</strong><br><br>' +
      '<div style="display:flex;gap:8px;margin:4px 0"><span style="background:#ff385c;color:white;border-radius:50%;width:20px;height:20px;display:inline-flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;flex-shrink:0">1</span><span>Prepare a planilha CSV ou Excel com os campos obrigatórios</span></div>' +
      '<div style="display:flex;gap:8px;margin:4px 0"><span style="background:#ff385c;color:white;border-radius:50%;width:20px;height:20px;display:inline-flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;flex-shrink:0">2</span><span>Clique em <strong>Importar Leads</strong> na página de leads</span></div>' +
      '<div style="display:flex;gap:8px;margin:4px 0"><span style="background:#ff385c;color:white;border-radius:50%;width:20px;height:20px;display:inline-flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;flex-shrink:0">3</span><span>Clique em <strong>Escolher Arquivo</strong> e selecione o arquivo</span></div>' +
      '<div style="display:flex;gap:8px;margin:4px 0"><span style="background:#ff385c;color:white;border-radius:50%;width:20px;height:20px;display:inline-flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;flex-shrink:0">4</span><span>Clique em <strong>Enviar Planilha</strong> para iniciar a importação</span></div>' +
      '<div style="display:flex;gap:8px;margin:4px 0"><span style="background:#ff385c;color:white;border-radius:50%;width:20px;height:20px;display:inline-flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;flex-shrink:0">5</span><span>A IA lê a planilha e extrai automaticamente os dados</span></div>' +
      '<br>' + btn('Importar leads','/app-importar-leads');


  // IMPORTAR
  if (/importar|planilha|csv|upload|subir/.test(mNorm))
    return `📋 <strong>Importar leads — passo a passo:</strong><br><br>`+
      `<div style="display:flex;gap:10px;margin:6px 0"><span style="background:#ff385c;color:white;border-radius:50%;width:22px;height:22px;display:inline-flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;flex-shrink:0">1</span><span>Exporte a planilha do portal (ImovelWeb, ZAP, VivaReal, OLX).</span></div>`+
      `<div style="display:flex;gap:10px;margin:6px 0"><span style="background:#ff385c;color:white;border-radius:50%;width:22px;height:22px;display:inline-flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;flex-shrink:0">2</span><span>Acesse <a href="/app/leads" style="color:#ff385c;font-weight:700">Leads →</a> e clique em <strong>Importar</strong>.</span></div>`+
      `<div style="display:flex;gap:10px;margin:6px 0"><span style="background:#ff385c;color:white;border-radius:50%;width:22px;height:22px;display:inline-flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;flex-shrink:0">3</span><span>Selecione o arquivo <strong>CSV ou Excel</strong>.</span></div>`+
      `<div style="display:flex;gap:10px;margin:6px 0"><span style="background:#ff385c;color:white;border-radius:50%;width:22px;height:22px;display:inline-flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;flex-shrink:0">4</span><span>O sistema extrai bairro, tipo, quartos e valor automaticamente.</span></div>`+
      `<br>${btn('Importar leads','/app-importar-leads')}`;

  // SEM MATCH
  if (/sem match|nao tem match|sem combinacao/.test(mNorm)) {
    if (d.semMatch===0) return `✅ Todas as suas leads têm match! Excelente carteira!`;
    // Análise de causas
    const bairrosLeads = {};
    leads.forEach(l => { if (l.bairro) bairrosLeads[l.bairro]=(bairrosLeads[l.bairro]||0)+1; });
    const topSemBairro = Object.entries(bairrosLeads).sort((a,b)=>b[1]-a[1]).slice(0,3).map(([b,n])=>`${b} (${n})`).join(', ');
    return `❌ <strong>${d.semMatch} leads sem match</strong><br><br>`+
      `Possíveis causas:<br>`+
      `• Bairros mais buscados: <strong>${topSemBairro||'—'}</strong> — você tem imóveis nesses bairros?<br>`+
      `• Tipo ou quantidade de quartos incompatível<br>`+
      `• Imóveis inativos não entram no match<br><br>`+
      `${btn('Ver leads sem match','/app/leads?filtro=sem_match')}${chip('📍 Demanda por bairro','demanda por bairro')}${chip('🏠 Meus imóveis','meus imoveis')}`;
  }

  // COM MATCH
  if (/com match|tem match|com combinacao/.test(mNorm)) {
    const taxa = d.leads>0 ? Math.round(d.comMatch/d.leads*100) : 0;
    return `🎯 <strong>${d.comMatch} leads com match</strong> (${taxa}% da base)<br><br>`+
      `Essas leads já receberam a vitrine? Envie agora e converta em visitas!<br><br>`+
      `${btn('Ver leads com match','/app/leads?filtro=com_match')}`;
  }

  // ORGÂNICAS
  if (/organica|do portal|origem/.test(mNorm))
    return `🌐 <strong>${d.organicas} leads orgânicas</strong> — vieram diretamente dos portais (ImovelWeb, ZAP, etc).<br><br>${btn('Ver leads','/app/leads')}`;

  // IMPORTADAS
  if (/importada|planilha/.test(mNorm))
    return `📋 <strong>${d.importadas} leads importadas</strong> — vieram de planilhas enviadas manualmente.<br><br>${btn('Ver leads','/app/leads')}`;

  // QUENTES (com match + sem visita)
  if (/quente|interessado|alta intencao/.test(mNorm)) {
    if (d.quentes > 0) {
      let resp = `🔥 Você tem <b>${d.quentes} lead(s) quente(s)</b> agora!<br><br>`;
      if (d.leadsQuentes && d.leadsQuentes.length > 0) {
        d.leadsQuentes.forEach(l => {
          resp += `• <b>${l.nome||'Sem nome'}</b> — ${l.faseFunil||'qualificado'}`;
          if (l.ultimaMensagem) resp += ` — "${l.ultimaMensagem.substring(0,40)}..."`;
          resp += '<br>';
        });
      }
      return resp;
    }
    const taxa = d.leads>0 ? Math.round(d.comMatch/d.leads*100) : 0;
    return `🔥 Leads quentes = com match + ainda sem visita agendada.<br>`+
      `Você tem <strong>${d.comMatch}</strong> leads com match (${taxa}%).<br><br>`+
      `${btn('Ver leads quentes','/app/leads?filtro=com_match')}`;
  }

  // ANTIGAS / SEM CONTATO
  if (/antiga|sem contato|parada|abandonada/.test(mNorm))
    return `📋 Leads antigas sem contato podem esfriar. Envie a vitrine para reengajar!<br><br>`+
      `${btn('Ver todas as leads','/app/leads')}${chip('🎯 Fazer match','fazer match agora')}`;

  // TOTAL / GERAL
  if (d.leads===0)
    return `Nenhuma lead ainda. 👥<br><br>Importe planilhas dos portais para começar o match!<br><br>${btn('Importar leads','/app-importar-leads')}`;

  const taxa = d.leads>0 ? Math.round(d.comMatch/d.leads*100) : 0;

  // Análise de bairros das leads
  const bairrosLeads = {};
  leads.forEach(l => { if (l.bairro) bairrosLeads[l.bairro]=(bairrosLeads[l.bairro]||0)+1; });
  const topBairros = Object.entries(bairrosLeads).sort((a,b)=>b[1]-a[1]).slice(0,3).map(([b,n])=>`${b} (${n})`).join(', ');

  return `👥 <strong>Leads:</strong><br>`+
    `Total: ${d.leads} · 🌐 Orgânicas: ${d.organicas} · 📋 Importadas: ${d.importadas}<br>`+
    `🎯 Com match: <strong>${d.comMatch}</strong> (${taxa}%) · ❌ Sem match: ${d.semMatch}<br>`+
    `📍 Bairros mais buscados: ${topBairros||'—'}<br><br>`+
    `${btn('Ver leads','/app/leads')}${btn('Importar','/app-importar-leads')}<br>`+
    `${chip('🎯 Com match','leads com match')}${chip('❌ Sem match','leads sem match')}${chip('📊 Demanda','demanda por bairro')}`;
}

module.exports = { responder };
