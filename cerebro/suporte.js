'use strict';

const FAQ = [

  // ── ERROS COMUNS ─────────────────────────────────────────────────────────────
  { chave:/whatsapp desconectou|whatsapp caiu|perdeu conexao whatsapp|reconectar whatsapp|qr code expirou/,
    resposta:'⚠️ <strong>WhatsApp desconectado:</strong><br><br>1. Vá em Perfil → Conectar WhatsApp<br>2. Gere um novo QR code<br>3. Abra o WhatsApp no celular → Dispositivos conectados → Conectar dispositivo<br>4. Escaneie o QR code<br><br>💡 Mantenha o celular com internet para evitar desconexões.<br><br><a href="/app/whatsapp/qrcode" style="color:#ff385c;font-weight:700">Reconectar WhatsApp →</a>' },

  { chave:/xml nao atualizou|xml nao foi|xml nao apareceu|xml erro|nao atualizou|403|404/,
    resposta:'🔧 <strong>XML não atualizou no portal?</strong><br><br>Causas mais comuns:<br>• URL do feed incorreta no portal — copie novamente em <a href="/app/portais" style="color:#ff385c;font-weight:700">Portais →</a><br>• Imóveis sem foto ou sem preço (portais rejeitam)<br>• XML antigo — gere novamente em Meus Imóveis<br><br>Os portais atualizam o XML a cada 24-48h automaticamente.' },

  { chave:/portal rejeitou|imovel nao apareceu no portal|nao publicou|nao saiu no portal/,
    resposta:'🔧 <strong>Portal rejeitou imóvel?</strong><br><br>Verifique:<br>• Mínimo 3 fotos (maioria dos portais exige)<br>• Preço preenchido<br>• Endereço completo: bairro + cidade + CEP<br>• Tipo do imóvel preenchido<br><br>Corrija o imóvel e gere o XML novamente.<br><br><a href="/app/imoveis" style="color:#ff385c;font-weight:700">Ver Imóveis →</a>' },

  { chave:/nao consigo entrar|nao consigo logar|esqueci senha|senha errada|nao acessa/,
    resposta:'🔒 <strong>Problema de acesso:</strong><br><br>• Senha errada: use <strong>Esqueci minha senha</strong> na tela de login — você recebe a nova senha via WhatsApp<br>• Cache: tente limpar o cache do navegador (Ctrl+Shift+R)<br>• Se persistir: entre em contato com o suporte via WhatsApp' },

  { chave:/foto nao sobe|foto nao carrega|erro ao subir foto|foto nao aparece/,
    resposta:'📸 <strong>Problema com foto:</strong><br><br>• Formatos aceitos: JPG e PNG<br>• Tamanho máximo: 5MB por foto<br>• Tente outro navegador (Chrome recomendado)<br>• Verifique sua conexão com a internet<br><br><a href="/app/imoveis" style="color:#ff385c;font-weight:700">Ver Imóveis →</a>' },

  { chave:/vitrine nao abre|vitrine nao carrega|link da vitrine nao funciona/,
    resposta:'🔧 <strong>Vitrine não abre?</strong><br><br>• A lead precisa ter ao menos 1 imóvel em match<br>• Imóveis inativos não aparecem na vitrine<br>• Verifique se o imóvel em match está ativo<br><br><a href="/app/leads" style="color:#ff385c;font-weight:700">Ver Leads →</a>' },

  { chave:/proprietario nao recebe|dono nao recebe|proprietario nao foi notificado/,
    resposta:'📱 <strong>Proprietário não recebeu notificação?</strong><br><br>• Confirme se o celular do proprietário está preenchido no imóvel (com DDD)<br>• O número precisa ter WhatsApp ativo<br>• A notificação é enviada quando a visita é confirmada<br><br><a href="/app/imoveis" style="color:#ff385c;font-weight:700">Verificar imóvel →</a>' },

  { chave:/lead nao importou|leads nao apareceram|importacao falhou|erro ao importar leads/,
    resposta:'📋 <strong>Leads não importaram?</strong><br><br>• Verifique se a planilha tem as colunas: nome, celular, bairro, tipo, quartos, valor<br>• Evite linhas em branco no início do arquivo<br>• Formatos aceitos: Excel (.xlsx) e CSV<br>• Sem bairro + tipo + quartos o match não funciona<br><br><a href="/app/importar-leads" style="color:#ff385c;font-weight:700">Importar Leads →</a>' },

  { chave:/coins nao aparece|saldo errado|coins nao atualizou|nao recebi coins/,
    resposta:'🪙 <strong>Problema com Coins?</strong><br><br>• O saldo atualiza após cada ação processada<br>• Recarregue a página para ver o saldo atual<br>• Veja o histórico completo em Coins<br><br><a href="/app/coins" style="color:#ff385c;font-weight:700">Ver Coins →</a>' },

  { chave:/mapa nao carrega|pins nao aparecem|imovel nao aparece no mapa/,
    resposta:'🗺️ <strong>Mapa sem pins?</strong><br><br>• Imóveis precisam ter CEP preenchido para aparecer no mapa<br>• Se sem CEP: o sistema usa fallback por bairro/cidade<br>• Aguarde alguns segundos para o mapa carregar<br><br><a href="/app/mapa" style="color:#ff385c;font-weight:700">Ver Mapa →</a>' },

  { chave:/imovel duplicado|duplicata imovel|mesmo imovel duas vezes/,
    resposta:'🔍 <strong>Imóvel duplicado?</strong><br><br>• Acontece quando o XML é importado mais de uma vez com o mesmo ID externo<br>• Inative ou exclua o duplicado em Meus Imóveis<br>• O sistema usa o ID externo para evitar duplicatas na próxima importação<br><br><a href="/app/imoveis" style="color:#ff385c;font-weight:700">Ver Imóveis →</a>' },

  { chave:/lead duplicada|cliente duplicado|mesmo cliente duas vezes/,
    resposta:'🔍 <strong>Lead duplicada?</strong><br><br>• O sistema identifica duplicatas pelo telefone/celular<br>• Se o mesmo número entrar por canais diferentes pode gerar duas leads<br>• Exclua manualmente a duplicata em Leads<br><br><a href="/app/leads" style="color:#ff385c;font-weight:700">Ver Leads →</a>' },

  // ── COMO FAZER ────────────────────────────────────────────────────────────────
  { chave:/como integrar|como conectar|como publicar portal|como subir xml|como gerar xml/,
    resposta:'🔗 <strong>Publicar imóveis nos portais:</strong><br><br>1. Vá em Meus Imóveis → selecione os imóveis (checkbox)<br>2. Na barra flutuante escolha os portais<br>3. Clique em Publicar<br>4. Vá em Portais → copie o link XML<br>5. Cole nas configurações do portal parceiro<br><br><a href="/app/imoveis" style="color:#ff385c;font-weight:700">Ir para Imóveis →</a>' },

  { chave:/como importar lead|importar planilha|subir planilha|como importo leads/,
    resposta:'📋 <strong>Importar leads:</strong><br><br>1. Vá em Leads → Importar Leads<br>2. Baixe o modelo de planilha<br>3. Preencha com os leads dos portais<br>4. Faça upload<br><br>Portais suportados: ImovelWeb, ZAP, VivaReal, OLX, Chaves, 123i<br><br><a href="/app/importar-leads" style="color:#ff385c;font-weight:700">Importar Leads →</a>' },

  { chave:/por que nao deu match|nao encontrou imovel|match falhou|match nao funcionou|sem match/,
    resposta:'🎯 <strong>Por que não deu match?</strong><br><br>O match exige:<br>• Bairro igual entre lead e imóvel<br>• Tipo igual (apartamento, casa...)<br>• Valor da lead dentro da faixa do imóvel (-30%/+20%)<br><br>Causas comuns:<br>• Imóvel no bairro correto mas <strong>inativo</strong><br>• Lead sem bairro preenchido<br>• Nenhum imóvel no bairro buscado<br>• Valor do imóvel fora da faixa<br><br><a href="/app/leads" style="color:#ff385c;font-weight:700">Ver Leads →</a>' },

  { chave:/como confirmar visita|como aceitar visita|confirmar agendamento/,
    resposta:'✅ <strong>Confirmar visita:</strong><br><br>1. Vá em Visitas<br>2. Encontre a visita na coluna "Solicitada" ou "Aguard. Cliente"<br>3. Clique em <strong>Confirmar</strong><br>4. O lead e o proprietário são notificados automaticamente<br><br><a href="/app/visitas" style="color:#ff385c;font-weight:700">Ver Visitas →</a>' },

  { chave:/como remarcar visita|remarcar agendamento|mudar data visita/,
    resposta:'📅 <strong>Remarcar visita:</strong><br><br>1. Vá em Visitas<br>2. No card da visita clique em <strong>Remarcar</strong><br>3. Escolha nova data e horário<br>4. O lead é notificado automaticamente<br><br><a href="/app/visitas" style="color:#ff385c;font-weight:700">Ver Visitas →</a>' },

  { chave:/como avisar proprietario|notificar proprietario|avisar dono/,
    resposta:'📱 <strong>Avisar proprietário:</strong><br><br>Em Visitas, clique em <strong>Notificar Proprietário</strong>. O sistema envia WhatsApp automático com data, horário e nome do cliente.<br><br><a href="/app/visitas" style="color:#ff385c;font-weight:700">Ver Visitas →</a>' },

  { chave:/quais campos planilha|campos obrigatorios|o que precisa na planilha|campos da planilha/,
    resposta:'📋 <strong>Campos da planilha de leads:</strong><br><br><strong>Obrigatórios para match:</strong><br>• Bairro · Tipo · Quartos · Valor máximo<br><br><strong>Dados do cliente:</strong><br>• Nome · Celular · E-mail<br><br><strong>Dados do anúncio:</strong><br>• ID do anúncio · URL do anúncio · Portal<br><br>Sem bairro + tipo + quartos o match não funciona.' },

  { chave:/como bloquear lead|bloquear cliente|nao quero mais mensagem/,
    resposta:'🚫 <strong>Bloquear lead:</strong><br><br>1. Abra a lead em Leads<br>2. Clique em <strong>Bloquear</strong><br>3. O número vai para a lista de bloqueados<br>4. Não receberá mais mensagens automáticas<br><br><a href="/app/leads" style="color:#ff385c;font-weight:700">Ver Leads →</a>' },

  { chave:/como melhorar match|aumentar match|mais match|match baixo/,
    resposta:'📈 <strong>Como melhorar o match:</strong><br><br>• Importe mais imóveis nos bairros mais buscados<br>• Verifique se os tipos batem (leads querem apto, você tem casas?)<br>• Reative imóveis inativos que podem ter match<br>• Padronize o nome dos bairros nos imóveis<br>• Use Demanda por bairro para identificar gaps<br><br><a href="/app/leads" style="color:#ff385c;font-weight:700">Ver Leads →</a>' },

  { chave:/como acessa celular|app celular|versao mobile|pelo celular/,
    resposta:'📱 O MatchImóveis funciona pelo navegador do celular. Acesse <strong>matchimoveis.ia.br</strong> pelo Chrome ou Safari e adicione à tela inicial para experiência de app.' },

  { chave:/quem nao respondeu|sem resposta|nao me respondeu|leads frias/,
    resposta:'📋 Leads sem resposta ficam com temperatura <strong>fria</strong> no kanban. Filtre por temperatura em Leads para ver quem não engajou.<br><br><a href="/app/leads" style="color:#ff385c;font-weight:700">Ver Leads →</a>' },
];

function responder(mNorm, btn, chip) {
  for (const item of FAQ) {
    if (item.chave.test(mNorm)) return item.resposta;
  }

  const isDuvida =
    /nao funciona|nao atualizou|nao apareceu|nao saiu|nao consigo|nao carrega|erro|problema|falhou|nao abre|nao importou|nao recebe/.test(mNorm) ||
    /como cadastrar imovel|como adicionar foto|como subir foto|como inativar|como trocar senha/.test(mNorm) ||
    /como importar lead|como confirmar visita|como remarcar|como bloquear|como publicar portal/.test(mNorm);

  if (!isDuvida) return null;

  return '🔧 <strong>Pode me detalhar mais o problema?</strong><br><br>Por exemplo:<br>• Qual funcionalidade não está funcionando?<br>• O que aparece na tela?<br>• É sobre imóvel, lead ou visita específica?<br><br>' +
    chip('XML não atualizou','meu xml nao atualizou') + ' ' +
    chip('Lead sem match','por que nao deu match') + ' ' +
    chip('WhatsApp caiu','whatsapp desconectou');
}

module.exports = { responder, FAQ };
