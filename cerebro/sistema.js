'use strict';
const fs = require('fs');
const path = require('path');

const EXPLICACOES = {
  match:        'Match é quando um imóvel da sua carteira combina com o que um lead procura. O sistema cruza bairro + tipo + quartos + valor automaticamente.',
  vitrine:      'Vitrine é uma página exclusiva enviada ao lead com os imóveis em match. O lead escolhe e solicita visita — tudo automático.',
  score:        'Score define a ordem na vitrine: valor abaixo do máximo +50pts, área maior +30pts, quartos extras +20pts, suítes +15pts, vagas +15pts.',
  lead:         'Lead é um cliente interessado em comprar ou alugar. Você importa planilhas dos portais e o sistema faz o match automático.',
  xml:          'XML é o arquivo que envia seus imóveis para portais (VivaReal, ZAP, OLX). Gere aqui e cadastre o link no portal.',
  coins:        'Match Coins são créditos do sistema. R$20 = 1.000 coins. Cada ação consome coins: match (20), vitrine WA (30), resposta IA (30).',
  visita:       'Fluxo: Lead recebe vitrine → escolhe imóvel → solicita visita → proprietário confirma → lead notificado. Tudo automático.',
  proprietario: 'Proprietário é o dono do imóvel. Vincule nome + celular no imóvel para que ele receba notificações de visitas via WhatsApp.',
  cerebro:      'O cérebro é o sistema de IA do MatchImóveis com 50+ módulos. Aprende com as perguntas e busca nos seus dados reais.',
  temperatura:  'Temperatura mostra o engajamento do lead: frio → qualificando → morno → match → quente (visita solicitada) → super quente (visita confirmada).',
  funil:        'Funil de leads: novo → qualificando → match → vitrine → visita → proposta → fechado.',
  instancia:    'Instância é a conexão do seu número WhatsApp com o sistema via Evolution API. Cada conta tem a sua própria instância.',
  quintoandar:  'QuintoAndar tem fluxo separado. Ative no Perfil, garanta CEP + endereço + número + proprietário nos imóveis e o XML é gerado automaticamente.',
};

function responder(mNorm, d, btn, chip) {

  // PRIMEIROS PASSOS
  if (/primeiros passos|como comecar|por onde comecar|primeiro passo|nao sei comecar|como uso|tutorial/.test(mNorm))
    return '🚀 <strong>Primeiros passos no MatchImóveis:</strong><br><br>' +
      '<div style="display:flex;gap:10px;margin:6px 0"><span style="background:#ff385c;color:white;border-radius:50%;width:22px;height:22px;min-width:22px;display:inline-flex;align-items:center;justify-content:center;font-size:11px;font-weight:700">1</span><span>Importe seus imóveis via XML do seu CRM</span></div>' +
      '<div style="display:flex;gap:10px;margin:6px 0"><span style="background:#ff385c;color:white;border-radius:50%;width:22px;height:22px;min-width:22px;display:inline-flex;align-items:center;justify-content:center;font-size:11px;font-weight:700">2</span><span>Importe leads da planilha dos portais</span></div>' +
      '<div style="display:flex;gap:10px;margin:6px 0"><span style="background:#ff385c;color:white;border-radius:50%;width:22px;height:22px;min-width:22px;display:inline-flex;align-items:center;justify-content:center;font-size:11px;font-weight:700">3</span><span>O match é feito automaticamente</span></div>' +
      '<div style="display:flex;gap:10px;margin:6px 0"><span style="background:#ff385c;color:white;border-radius:50%;width:22px;height:22px;min-width:22px;display:inline-flex;align-items:center;justify-content:center;font-size:11px;font-weight:700">4</span><span>Envie a vitrine para o lead via WhatsApp</span></div>' +
      '<div style="display:flex;gap:10px;margin:6px 0"><span style="background:#ff385c;color:white;border-radius:50%;width:22px;height:22px;min-width:22px;display:inline-flex;align-items:center;justify-content:center;font-size:11px;font-weight:700">5</span><span>Aguarde a solicitação de visita e confirme</span></div>' +
      '<br>'+btn('Cadastrar imóvel','/app/cadastro')+' '+btn('Importar leads','/app/importar-leads');

  // MENU / NAVEGAÇÃO GERAL
  if (/menu|navegacao|onde encontro|onde fica|onde acho|paginas do sistema|o que tem no menu/.test(mNorm))
    return '📋 <strong>Menu do MatchImóveis:</strong><br><br>' +
      '🏠 <a href="/app-home" style="color:#ff385c;font-weight:700">Dashboard</a> — métricas e resumo<br>' +
      '🏢 <a href="/app/imoveis" style="color:#ff385c;font-weight:700">Meus Imóveis</a> — carteira completa<br>' +
      '👥 <a href="/app/leads" style="color:#ff385c;font-weight:700">Leads</a> — kanban de clientes<br>' +
      '📅 <a href="/app/visitas" style="color:#ff385c;font-weight:700">Visitas</a> — agendamentos<br>' +
      '🗺️ <a href="/app/mapa" style="color:#ff385c;font-weight:700">Mapa</a> — imóveis e visitas no mapa<br>' +
      '📱 <a href="/app/whatsapp" style="color:#ff385c;font-weight:700">WhatsApp</a> — inbox de mensagens<br>' +
      '🔗 <a href="/app/portais" style="color:#ff385c;font-weight:700">Portais</a> — XML para portais<br>' +
      '🪙 <a href="/app/coins" style="color:#ff385c;font-weight:700">Coins</a> — saldo e histórico<br>' +
      '👤 <a href="/app/perfil" style="color:#ff385c;font-weight:700">Perfil</a> — dados da conta<br>' +
      '🤖 <a href="/app/assistente" style="color:#ff385c;font-weight:700">Assistente</a> — aqui!';

  // DASHBOARD
  if (/dashboard|painel|painel de controle|o que tem no dashboard|tela inicial|home/.test(mNorm))
    return '📊 <strong>Dashboard (/app-home):</strong><br><br>' +
      '• Ticker: total de imóveis ativos<br>' +
      '• Ticker: total de leads<br>' +
      '• Ticker: visitas pendentes<br>' +
      '• Ticker: taxa de match<br>' +
      '• Gráfico funil de leads por status<br>' +
      '• Heatmap de demanda por bairro<br>' +
      '• Gauge de temperatura das leads<br>' +
      '• Botões de ação rápida<br><br>' +
      btn('Ir ao Dashboard','/app-home');

  // PERFIL
  if (/pagina perfil|app perfil|meu perfil|dados da conta|o que tem no perfil|o que tem em perfil/.test(mNorm))
    return '👤 <strong>Perfil (/app/perfil):</strong><br><br>' +
      '• Nome da conta<br>' +
      '• Celular<br>' +
      '• CRECI<br>' +
      '• CPF<br>' +
      '• Tipo de conta: Corretor, Imobiliária ou Construtora<br>' +
      '• Código do usuário (ex: REN-HUH6)<br>' +
      '• Toggle QuintoAndar + contador elegíveis<br>' +
      '• Conectar WhatsApp via QR code<br>' +
      '• Atualizar localização automática<br>' +
      '• Alterar senha<br><br>' +
      btn('Ver Perfil','/app/perfil');

  // IMÓVEIS
  if (/o que tem.*imoveis|pagina.*imoveis|tela.*imoveis|imoveis.*o que tem/.test(mNorm))
    return '🏢 <strong>Meus Imóveis (/app/imoveis):</strong><br><br>' +
      '• Cards com foto, tipo, bairro, valor e status<br>' +
      '• Badge VENDA / ALUGUEL em cada card<br>' +
      '• Ícones dos portais ativos por imóvel<br>' +
      '• Seleção em lote para publicar em portais<br>' +
      '• Busca por texto, ID interno ou ID externo<br>' +
      '• Filtros: tipo, transação, bairro, valor, status, proprietário, fotos, portal<br>' +
      '• Botão imóveis incompletos para QuintoAndar<br><br>' +
      btn('Ver Imóveis','/app/imoveis');

  // LEADS
  if (/o que tem.*leads|pagina.*leads|tela.*leads|leads.*o que tem/.test(mNorm))
    return '👥 <strong>Leads (/app/leads):</strong><br><br>' +
      '• Kanban: novo → qualificando → match → vitrine → visita → proposta → fechado<br>' +
      '• Cards com nome, bairro, tipo, temperatura e score<br>' +
      '• Badge de temperatura: frio, morno, quente, super quente<br>' +
      '• Botão Nova Lead para cadastro manual<br>' +
      '• Filtros por status, fonte e bairro<br><br>' +
      btn('Ver Leads','/app/leads');

  // VISITAS
  if (/o que tem.*visitas|pagina.*visitas|tela.*visitas|visitas.*o que tem/.test(mNorm))
    return '📅 <strong>Visitas (/app/visitas):</strong><br><br>' +
      '• Kanban: solicitada → aguard. cliente → remarcação → confirmada → realizada → cancelada<br>' +
      '• Card com lead, imóvel, data e status<br>' +
      '• Botão Realizada nas colunas aguardando e confirmada<br>' +
      '• Notificação automática ao proprietário via WhatsApp<br>' +
      '• Botões: Confirmar, Remarcar, Cancelar<br><br>' +
      btn('Ver Visitas','/app/visitas');

  // WHATSAPP
  if (/o que tem.*whatsapp|pagina.*whatsapp|tela.*whatsapp|whatsapp.*o que tem|inbox whatsapp/.test(mNorm))
    return '📱 <strong>WhatsApp (/app/whatsapp):</strong><br><br>' +
      '• Inbox de mensagens recebidas dos leads<br>' +
      '• Conversa organizada por lead<br>' +
      '• Copiloto com sugestões de resposta<br>' +
      '• Badge com não lidas no menu<br>' +
      '• Enviar mensagem direta pelo sistema<br><br>' +
      btn('Ver WhatsApp','/app/whatsapp');

  // COINS
  if (/o que tem.*coins|pagina.*coins|tela.*coins|coins.*o que tem|match coins/.test(mNorm))
    return '🪙 <strong>Match Coins (/app/coins):</strong><br><br>' +
      '• Saldo atual de Match Coins<br>' +
      '• Histórico de débitos e créditos<br>' +
      '• Tabela de custos: match (20), vitrine WA (30), resposta IA (30), importar XML (2/imóvel)<br>' +
      '• Comprar via Mercado Pago: R$20 = 1.000 coins<br><br>' +
      btn('Ver Coins','/app/coins');

  // PORTAIS
  if (/o que tem.*portais|pagina.*portais|tela.*portais|portais.*o que tem/.test(mNorm))
    return '🔗 <strong>Portais (/app/portais):</strong><br><br>' +
      '• VivaReal, ZAP Imóveis, OLX, Chaves na Mão, ImovelWeb, 123i<br>' +
      '• Link XML por portal para cadastrar no portal parceiro<br>' +
      '• QuintoAndar tem fluxo separado via toggle no Perfil<br>' +
      '• Status e data da última geração<br><br>' +
      btn('Ver Portais','/app/portais');

  // CRECI
  if (/creci|registro creci|numero creci/.test(mNorm))
    return '📋 O <strong>CRECI</strong> é o registro profissional do corretor. Fica salvo no seu perfil em ' +
      btn('Perfil','/app/perfil');

  // CÓDIGO DO USUÁRIO
  if (/codigo usuario|id usuario|meu codigo|codigo da conta/.test(mNorm))
    return '🔑 O <strong>código do usuário</strong> é seu ID único na plataforma (ex: REN-HUH6). ' +
      'Aparece no menu e no perfil.<br><br>' + btn('Ver Perfil','/app/perfil');

  // LOCALIZAÇÃO
  if (/localizacao|atualizar localizacao|minha localizacao/.test(mNorm))
    return '📍 <strong>Atualizar localização:</strong><br><br>' +
      '1. Acesse Perfil<br>2. Clique em <strong>Atualizar Localização</strong><br>' +
      '3. O sistema detecta automaticamente<br><br>' + btn('Ver Perfil','/app/perfil');

  // ALTERAR SENHA
  if (/alterar senha|trocar senha|mudar senha|esqueci senha/.test(mNorm))
    return '🔒 <strong>Alterar senha:</strong><br><br>' +
      '• Logado: Perfil → Alterar Senha<br>' +
      '• Esqueceu: tela de login → "Esqueci minha senha" → nova senha chega via WhatsApp<br><br>' +
      btn('Ver Perfil','/app/perfil');

  // WHATSAPP — CONECTAR
  if (/como conectar whatsapp|integrar whatsapp|conectar whatsapp|ligar whatsapp|qr code/.test(mNorm))
    return '📱 <strong>Conectar WhatsApp:</strong><br><br>' +
      '1. Vá em Perfil → Conectar WhatsApp<br>' +
      '2. Clique em Gerar QR code<br>' +
      '3. Abra o WhatsApp no celular → Dispositivos conectados → Conectar dispositivo<br>' +
      '4. Escaneie o QR code<br>' +
      '5. Pronto — leads que mandarem mensagem entram automaticamente no sistema<br><br>' +
      btn('Conectar WhatsApp','/app/whatsapp/qrcode');

  // WHATSAPP — DESCONECTOU
  if (/whatsapp desconectou|perdeu conexao|whatsapp caiu|reconectar whatsapp/.test(mNorm))
    return '⚠️ <strong>WhatsApp desconectado:</strong><br><br>' +
      '1. Vá em Perfil → Conectar WhatsApp<br>' +
      '2. Gere um novo QR code<br>' +
      '3. Escaneie com o celular<br><br>' +
      '💡 Dica: mantenha o celular conectado à internet para evitar desconexões.<br><br>' +
      btn('Reconectar','/app/whatsapp/qrcode');

  // INATIVAR IMÓVEL
  if (/como inativar|desativar imovel|inativar imovel|tirar do ar/.test(mNorm))
    return '🔴 <strong>Inativar imóvel:</strong><br><br>' +
      '1. Vá em Meus Imóveis<br>' +
      '2. Abra o imóvel e clique em Editar<br>' +
      '3. Mude o status para <strong>Inativo</strong><br>' +
      '4. Salve — o imóvel sai do match e dos portais automaticamente<br><br>' +
      btn('Ver Imóveis','/app/imoveis');

  // ADICIONAR FOTO
  if (/como cadastro foto|adicionar foto|subir foto|como adiciono foto|foto imovel/.test(mNorm))
    return '📸 <strong>Adicionar fotos ao imóvel:</strong><br><br>' +
      '1. Vá em Meus Imóveis → abra o imóvel → Editar<br>' +
      '2. Clique em <strong>Adicionar Foto</strong><br>' +
      '3. Arraste para reordenar — a primeira é a capa<br>' +
      '4. Formatos aceitos: JPG, PNG<br><br>' +
      btn('Ver Imóveis','/app/imoveis');

  // MATCH — COMO FUNCIONA
  if (/como funciona.*match|como funciona o match|como o match funciona/.test(mNorm))
    return '🎯 <strong>Como funciona o Match:</strong><br><br>' +
      '<strong>Caso 1 — Lead clicou em um imóvel (portal):</strong><br>' +
      '• Esse imóvel é a âncora (score 100)<br>' +
      '• Busca até 30 similares: mesmo tipo + cidade + bairro (score 90) + valor ±30%/+20% + área ±20%<br><br>' +
      '<strong>Caso 2 — Lead com perfil de busca:</strong><br>' +
      '• Precisa de: tipo + transação + cidade + bairro + valor + quartos (residencial)<br>' +
      '• Valor: -30% / +20% do valorMax da lead<br><br>' +
      btn('Ver Leads','/app/leads') + ' ' + chip('Leads com match','leads com match');

  // VITRINE
  if (/o que e vitrine|como funciona vitrine|como envio vitrine|enviar vitrine/.test(mNorm))
    return '✨ <strong>Vitrine:</strong><br><br>' +
      'Página exclusiva enviada ao lead com os imóveis em match.<br><br>' +
      '1. Abra a lead com match<br>' +
      '2. Clique em <strong>Enviar Vitrine via WhatsApp</strong><br>' +
      '3. O lead recebe o link e pode solicitar visita diretamente<br><br>' +
      btn('Ver Leads','/app/leads') + ' ' + chip('Minhas vitrines','minhas vitrines');

  // COINS — CUSTOS
  if (/quanto custa|tabela coins|custo.*coins|coins.*custo|quanto gasta/.test(mNorm))
    return '🪙 <strong>Tabela de custos (Match Coins):</strong><br><br>' +
      '• Cadastrar imóvel: 15 coins<br>' +
      '• Importar XML: 2 coins/imóvel<br>' +
      '• Match encontrado: 20 coins<br>' +
      '• Vitrine WhatsApp: 30 coins<br>' +
      '• IA responde WhatsApp: 30 coins<br>' +
      '• Follow-up automático: 25 coins<br>' +
      '• Visita agendada IA: 40 coins<br>' +
      '• Nova lead portal (webhook): 20 coins<br>' +
      '• Importar lead planilha: 10 coins/lead<br><br>' +
      '💰 R$20 = 1.000 coins<br><br>' +
      btn('Ver Coins','/app/coins');

  // QUINTOANDAR
  if (/quintoandar|quinto andar|como ativo quintoandar|publicar quintoandar/.test(mNorm))
    return '🏠 <strong>QuintoAndar:</strong><br><br>' +
      '1. Vá em Perfil → ative o toggle <strong>QuintoAndar</strong><br>' +
      '2. Imóveis elegíveis precisam ter: CEP + endereço + número + proprietário (nome + celular)<br>' +
      '3. Clique em <strong>Ver imóveis incompletos</strong> para corrigir os que faltam<br>' +
      '4. O XML é gerado automaticamente em /xml/quintoandar-global<br><br>' +
      '📍 Estados ativos: SP, RJ, MG, RS, PR, GO, DF, BA, PE, CE, ES, SC e mais<br><br>' +
      btn('Ver Perfil','/app/perfil') + ' ' + btn('Ver Imóveis','/app/imoveis');

  // TAXA DE MATCH
  if (/taxa de match|taxa match|percentual match/.test(mNorm))
    return '📊 <strong>Taxa de match</strong> = leads com match ÷ total de leads × 100%<br><br>' +
      'Aparece no Dashboard. Se estiver baixa:<br>' +
      '• Verifique se os leads têm bairro + tipo preenchidos<br>' +
      '• Verifique se tem imóveis nos bairros que os leads procuram<br>' +
      '• Use Demanda por bairro para identificar gaps<br><br>' +
      btn('Ver Dashboard','/app-home') + ' ' + chip('Demanda por bairro','demanda por bairro');

  // TIPOS DE IMÓVEL
  if (/tipos de imovel|tipos imovel|quais tipos|tipo de imovel/.test(mNorm))
    return '🏠 <strong>Tipos de imóvel disponíveis:</strong><br><br>' +
      'Residencial: Apartamento, Casa, Cobertura, Sobrado, Studio, Loft, Casa de Condomínio<br>' +
      'Comercial: Sala, Loja, Galpão, Prédio, Escritório, Conjunto, Hotel, Pousada, Consultório, Restaurante<br>' +
      'Terreno: Terreno, Lote, Área Rural, Chácara, Sítio, Fazenda';

  // TIPOS DE CONTA
  if (/tipo de conta|tipo conta|corretor conta|imobiliaria conta|construtora conta/.test(mNorm))
    return '👤 <strong>Tipos de conta:</strong><br><br>' +
      '• <strong>Corretor</strong> — profissional autônomo<br>' +
      '• <strong>Imobiliária</strong> — empresa com equipe<br>' +
      '• <strong>Construtora</strong> — lançamentos e empreendimentos<br><br>' +
      'Mude em Perfil → Tipo de conta<br><br>' + btn('Ver Perfil','/app/perfil');

  // TEMPERATURA DO LEAD
  if (/temperatura lead|o que e temperatura|como funciona temperatura/.test(mNorm))
    return '🌡️ <strong>Temperatura das leads:</strong><br><br>' +
      '🔵 <strong>Frio</strong> — lead novo, sem qualificação<br>' +
      '🔵 <strong>Frio+</strong> — qualificando<br>' +
      '🟡 <strong>Morno</strong> — tem match<br>' +
      '🟡 <strong>Morno+</strong> — vitrine enviada<br>' +
      '🟠 <strong>Quente</strong> — visita solicitada<br>' +
      '🔴 <strong>Quente+</strong> — visita confirmada<br>' +
      '⭐ <strong>Super quente</strong> — visita realizada';

  // IMPORTAR LEADS
  if (/como importar lead|importar planilha|importar leads|como importo leads/.test(mNorm))
    return '📋 <strong>Importar leads:</strong><br><br>' +
      '1. Vá em Leads → Importar Leads<br>' +
      '2. Baixe o modelo de planilha<br>' +
      '3. Preencha com os leads exportados dos portais<br>' +
      '4. Faça upload — o sistema extrai bairro, tipo, quartos e valor automaticamente<br><br>' +
      btn('Importar Leads','/app/importar-leads');

  // PROPRIETÁRIO
  if (/proprietario.*imovel|vincular proprietario|cadastrar proprietario|dono.*imovel/.test(mNorm))
    return '👤 <strong>Proprietário do imóvel:</strong><br><br>' +
      'O proprietário recebe notificações automáticas de visitas via WhatsApp.<br><br>' +
      'Para vincular:<br>' +
      '1. Edite o imóvel<br>' +
      '2. Preencha Nome e Celular do proprietário<br>' +
      '3. Salve<br><br>' +
      '💡 Imóveis sem proprietário: o corretor confirma a visita diretamente (Caso 2).<br><br>' +
      btn('Ver Imóveis','/app/imoveis');

  // PARCEIROS
  if (/parceiros|corretor parceiro|comissao parceiro/.test(mNorm))
    return '🤝 <strong>Parceiros (/app/parceiros):</strong><br><br>' +
      '• Lista de corretores parceiros<br>' +
      '• Defina comissão por visita<br>' +
      '• Agende visitas com parceiro<br><br>' +
      btn('Ver Parceiros','/app/parceiros');

  // MAPA
  if (/o que tem.*mapa|pagina.*mapa|tela.*mapa|mapa.*o que tem/.test(mNorm))
    return '🗺️ <strong>Mapa (/app/mapa):</strong><br><br>' +
      '• Pins dos imóveis no mapa<br>' +
      '• Pins de visitas agendadas<br>' +
      '• Filtro por status da visita<br>' +
      '• Centraliza automaticamente na região de atuação<br><br>' +
      btn('Ver Mapa','/app/mapa');

  // EXPLICAÇÕES GERAIS
  for (const [key, texto] of Object.entries(EXPLICACOES)) {
    if (mNorm.includes(key)) {
      return '💡 <strong>' + key.charAt(0).toUpperCase() + key.slice(1) + ':</strong><br><br>' + texto;
    }
  }

  return null;
}

function responderComMapa(mNorm, btn, chip) {
  let mapa;
  try { mapa = JSON.parse(fs.readFileSync(path.join(__dirname,'mapa-completo.json'),'utf8')); } catch(e) { return null; }
  const views = mapa.views || {};
  const mapaViews = {
    'leads':         'app-leads',
    'imoveis':       'app-imoveis',
    'visitas':       'app-visitas',
    'dashboard':     'app-home',
    'home':          'app-home',
    'cadastro':      'app-cadastro',
    'portais':       'app-portais',
    'notificacoes':  'app-notificacoes',
    'perfil':        'app-perfil',
    'coins':         'app-coins',
    'assistente':    'app-assistente',
    'whatsapp':      'app-whatsapp',
    'mapa':          'app-mapa',
    'feed':          'app-feed',
    'parceiros':     'app-parceiros',
    'importar leads':'app-importar-leads',
  };
  const viewKey = Object.entries(mapaViews).find(([k]) => mNorm.includes(k));
  if (!viewKey) return null;
  const view = views[viewKey[1]];
  if (!view) return null;
  const nome = viewKey[1].replace('app-','').replace(/-/g,' ');

  if (/o que tem|o que ha|me explica|me fala|o que fica|conteudo|pagina de/.test(mNorm)) {
    let resp = '📋 <strong>Página ' + nome + ':</strong><br><br>';
    if (view.inputs && view.inputs.length) resp += '<strong>Campos:</strong><br>' + view.inputs.slice(0,8).map(i=>'• '+i).join('<br>') + '<br><br>';
    if (view.selects && view.selects.length) resp += '<strong>Filtros/Opções:</strong><br>' + view.selects.slice(0,8).map(s=>'• '+s).join('<br>') + '<br><br>';
    if (view.links && view.links.length) resp += '<strong>Links internos:</strong><br>' + [...new Set(view.links)].slice(0,6).map(l=>'• '+l).join('<br>');
    return resp || null;
  }
  if (/campos?|inputs?|formulario|preencher/.test(mNorm)) {
    if (!view.inputs || !view.inputs.length) return 'Não encontrei campos nessa página.';
    return '📝 <strong>Campos em ' + nome + ':</strong><br><br>' + view.inputs.map(i=>'• '+i).join('<br>');
  }
  if (/links?|navega|para onde|rotas?/.test(mNorm)) {
    if (!view.links || !view.links.length) return 'Não encontrei links nessa página.';
    return '🔗 <strong>Links em ' + nome + ':</strong><br><br>' + [...new Set(view.links)].slice(0,8).map(l=>'• '+l).join('<br>');
  }
  return null;
}

module.exports = { responderComMapa, EXPLICACOES, responder };
