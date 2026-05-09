'use strict';

const FAQ = [
  // XML e portais
  { chave:/xml nao atualizou|xml erro|nao atualizou|url erro|403|404/, resposta:`🔧 <strong>XML não atualizou?</strong><br><br>Causas mais comuns:<br>• URL do feed incorreta no portal — copie novamente em <a href="/app/portais" style="color:#ff385c;font-weight:700">Portais →</a><br>• Imóveis sem foto ou descrição (portais rejeitam)<br>• XML gerado há muito tempo — gere novamente<br><br>Solução: gere um novo XML e cadastre a URL atualizada no portal.` },
  { chave:/portal rejeitou|imóvel nao apareceu|nao publicou|nao saiu no portal/, resposta:`🔧 <strong>Portal rejeitou imóvel?</strong><br><br>Verifique:<br>• Mínimo 3 fotos obrigatórias na maioria dos portais<br>• Descrição com pelo menos 100 caracteres<br>• Preço preenchido<br>• Endereço completo (bairro + cidade)<br>• Tipo do imóvel preenchido<br><br>Corrija o imóvel e gere o XML novamente.` },
  { chave:/como integrar|como conectar|como publicar portal|como subir xml|como gerar xml/, resposta:`🔗 <strong>Como publicar nos portais:</strong><br><br><div style="display:flex;gap:8px;margin:4px 0"><span style="background:#ff385c;color:white;border-radius:50%;width:20px;height:20px;display:inline-flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;flex-shrink:0">1</span><span>Acesse <a href="/app/imoveis" style="color:#ff385c;font-weight:700">Imóveis →</a> e selecione os imóveis</span></div><div style="display:flex;gap:8px;margin:4px 0"><span style="background:#ff385c;color:white;border-radius:50%;width:20px;height:20px;display:inline-flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;flex-shrink:0">2</span><span>Clique no portal desejado (VivaReal, ZAP, OLX...)</span></div><div style="display:flex;gap:8px;margin:4px 0"><span style="background:#ff385c;color:white;border-radius:50%;width:20px;height:22px;display:inline-flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;flex-shrink:0">3</span><span>Copie o link gerado em <a href="/app/portais" style="color:#ff385c;font-weight:700">Portais →</a></span></div><div style="display:flex;gap:8px;margin:4px 0"><span style="background:#ff385c;color:white;border-radius:50%;width:20px;height:20px;display:inline-flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;flex-shrink:0">4</span><span>Cole esse link nas configurações do portal</span></div>` },
  // Leads
  { chave:/por que lead nao apareceu|lead nao importou|extracao falhou|campos planilha|quais campos/, resposta:`📋 <strong>Campos obrigatórios na planilha de leads:</strong><br><br>• <strong>Nome</strong> do cliente<br>• <strong>Telefone</strong> ou e-mail<br>• <strong>Bairro</strong> de interesse<br>• <strong>Tipo</strong> de imóvel (apartamento, casa...)<br>• <strong>Quartos</strong><br>• <strong>Valor máximo</strong><br><br>Sem bairro + tipo + quartos o match não funciona.<br>Formatos aceitos: CSV e Excel (.xlsx)` },
  { chave:/como importar lead|importar planilha|subir planilha/, resposta:`📋 <strong>Importar leads:</strong><br><br>Acesse <a href="/app-importar-leads" style="color:#ff385c;font-weight:700">Importar Leads →</a> e envie o CSV ou Excel exportado do portal.<br><br>Portais suportados: ImovelWeb, ZAP, VivaReal, OLX, Chaves, 123i.` },
  { chave:/remover duplicado|lead duplicado|duplicatas/, resposta:`🔍 Leads duplicadas são identificadas pelo telefone ou e-mail. Acesse a lista de leads e exclua manualmente as duplicadas por enquanto — em breve teremos detecção automática.<br><br><a href="/app/leads" style="color:#ff385c;font-weight:700">Ver leads →</a>` },
  // Match
  { chave:/por que nao deu match|nao encontrou imovel|match falhou|match nao funcionou/, resposta:`🎯 <strong>Por que não deu match?</strong><br><br>O match exige:<br>• <strong>Bairro</strong> igual entre lead e imóvel<br>• <strong>Tipo</strong> igual (apartamento, casa...)<br>• Imóvel com quartos <strong>≥</strong> quartos pedidos pela lead<br><br>Causas comuns:<br>• Imóvel no bairro correto mas <strong>inativo</strong><br>• Lead com bairro em formato diferente (ex: "Itajaí" vs "itajai")<br>• Nenhum imóvel no bairro buscado<br><br>Verifique a demanda por bairro:` },
  { chave:/como melhorar match|aumentar match|mais match|score baixo/, resposta:`📈 <strong>Como melhorar o match:</strong><br><br>• Importe mais imóveis nos bairros mais buscados<br>• Verifique se os tipos batem (leads querem apto, você tem casas?)<br>• Reative imóveis inativos que podem ter match<br>• Revise o campo de bairro nos imóveis (padronize o nome)` },
  { chave:/como rodar rematch|rematch|refazer match|atualizar match/, resposta:`🔄 Para refazer o match, acesse <a href="/app/leads" style="color:#ff385c;font-weight:700">Leads →</a> e clique em <strong>Fazer Match</strong>. O sistema reprocessa todos os cruzamentos.` },
  // Imóveis
  { chave:/como cadastrar imovel|como adicionar imovel|novo imovel/, resposta:`🏠 <strong>Cadastrar imóvel:</strong><br><br>Acesse <a href="/app/imovel/cadastrar" style="color:#ff385c;font-weight:700">Cadastrar Imóvel →</a> e preencha os campos obrigatórios: tipo, bairro, quartos, valor e pelo menos 1 foto.` },
  { chave:/como inativar|como desativar|como ocultar imovel/, resposta:`🔴 Para inativar um imóvel, acesse <a href="/app/imoveis" style="color:#ff385c;font-weight:700">Imóveis →</a>, abra o imóvel e clique em <strong>Inativar</strong>. Ele sai do match e dos portais automaticamente.` },
  { chave:/como adicionar foto|como subir foto|fotos do imovel/, resposta:`📸 Para adicionar fotos, acesse o imóvel em <a href="/app/imoveis" style="color:#ff385c;font-weight:700">Imóveis →</a> e use o botão <strong>Adicionar Fotos</strong>. Formatos aceitos: JPG, PNG. Mínimo recomendado: 5 fotos.` },
  // Visitas
  { chave:/como confirmar visita|como aceitar visita/, resposta:`✅ Acesse <a href="/app/visitas" style="color:#ff385c;font-weight:700">Visitas →</a> e clique em <strong>Confirmar</strong> na visita desejada. O proprietário e o lead serão notificados automaticamente.` },
  { chave:/como agendar visita|como marcar visita/, resposta:`📅 As visitas são solicitadas pelos leads na vitrine. Você confirma ou recusa em <a href="/app/visitas" style="color:#ff385c;font-weight:700">Visitas →</a>. Em breve será possível agendar manualmente pelo chat.` },
  // Conta
  { chave:/como trocar senha|alterar senha|mudar senha/, resposta:`🔒 Acesse <a href="/app/perfil" style="color:#ff385c;font-weight:700">Perfil →</a> e use a opção <strong>Alterar Senha</strong>.` },
  { chave:/como acessar celular|app celular|versao mobile/, resposta:`📱 O MatchImóveis funciona pelo navegador do celular. Acesse <strong>matchimoveis.onrender.com</strong> pelo Chrome ou Safari e adicione à tela inicial para experiência de app.` },
  // WhatsApp
  { chave:/como conectar whatsapp|integrar whatsapp|whatsapp nao funciona/, resposta:`📱 <strong>WhatsApp:</strong><br><br>A integração WhatsApp via Twilio está em desenvolvimento. Em breve você poderá responder clientes direto pelo chat do MatchImóveis.<br><br>Por enquanto, use o número de telefone da lead para contato direto.` },
];

function responder(mNorm, btn, chip) {
  // Verificar se é dúvida técnica
  const isDuvida = (
    /extracao falhou|campos planilha|como cadastro foto|follow up|link do cliente|vitrine do cliente/.test(mNorm) ||
    /nao funciona|nao atualizou|nao apareceu|nao saiu|nao consigo/.test(mNorm) ||
    /como cadastrar imovel|como adicionar foto|como subir foto/.test(mNorm) ||
    /como inativar|como trocar senha|como importar lead/.test(mNorm) ||
    /como conectar whatsapp|como acessar celular/.test(mNorm) ||
    /como confirmar visita|como publicar portal|como gerar xml/.test(mNorm) ||
    /xml nao|portal rejeit/.test(mNorm)
  ) && !/como funciona|como e o/.test(mNorm);
  if (!isDuvida) return null;

  // Buscar na FAQ
  for (const item of FAQ) {
    if (item.chave.test(mNorm)) {
      return item.resposta + (item.chave.source.includes('match')
        ? `<br><br>${chip('📍 Demanda por bairro','demanda por bairro')}${btn('Ver imóveis','/app/imoveis')}`
        : '');
    }
  }

  // Dúvida técnica genérica
  return `🔧 <strong>Suporte técnico:</strong><br><br>Pode me detalhar mais o problema? Por exemplo:<br>• Qual funcionalidade não está funcionando?<br>• O que aparece na tela?<br>• Imóvel, lead ou visita específica?<br><br>${chip('❓ XML não atualizou','meu xml nao atualizou')}${chip('❓ Lead sem match','por que nao deu match')}${chip('❓ Portal rejeitou','portal rejeitou imovel')}`;
}

FAQ.push({chave:/quais campos planilha|campos obrigatorios|o que precisa na planilha/, resposta:'📋 <strong>Campos obrigatórios na planilha:</strong><br>• Nome · Telefone ou e-mail · Bairro · Tipo · Quartos · Valor máximo<br><br>Sem bairro + tipo + quartos o match não funciona.'});
FAQ.push({chave:/link do cliente|vitrine do cliente|link da vitrine|enviar link/, resposta:'✨ A <strong>vitrine</strong> é a página enviada ao lead com imóveis em match. Acesse <a href="/app/leads" style="color:#ff385c;font-weight:700">Leads →</a> e clique em <strong>Enviar Vitrine</strong>.'});
FAQ.push({chave:/follow.?up|lembrar cliente|mandar lembrete/, resposta:'📱 Follow-up ainda é manual. Em breve teremos automação direto pelo MatchImóveis.<br><br>Dica: filtre leads sem visita há 7+ dias e entre em contato.'});
FAQ.push({chave:/como comeco|por onde comecar|primeiro passo|nao sei comecar/, resposta:'🚀 <strong>Por onde começar:</strong><br>1. Importe XML dos imóveis<br>2. Importe planilha de leads<br>3. Faça o match<br>4. Envie vitrine<br>5. Aguarde visitas'});
FAQ.push({chave:/campos planilha precisa|campos da planilha|quais campos|campos obrigatorios/, resposta:'📋 <strong>Campos obrigatórios na planilha:</strong><br><br>• Nome · Celular/Telefone · E-mail<br>• ID do anúncio · URL do anúncio<br>• Estado · Cidade · Bairro<br>• Quartos · Suítes · Banheiros · Vagas · Área · Valor<br><br><strong>Mais importantes:</strong> ID do anúncio, nome, celular e URL do portal.' });
FAQ.push({chave:/xml nao saiu|xml nao foi|xml nao apareceu|subir xml|enviar xml para portal/, resposta:'🔧 <strong>XML não saiu no portal?</strong><br><br>1. Acesse <a href="/app/imoveis" style="color:#ff385c;font-weight:700">Imóveis →</a><br>2. Selecione os imóveis<br>3. Clique no portal desejado para gerar o XML<br>4. Copie o link em <a href="/app/portais" style="color:#ff385c;font-weight:700">Portais →</a><br>5. Cole nas configurações do portal<br><br>Se já tem o link mas não atualizou, aguarde até 24h ou regere o XML.' });
FAQ.push({chave:/enviar vitrine para cliente|mandar vitrine para cliente|como envio vitrine|como mando vitrine/, resposta:'📱 <strong>Enviar vitrine para o cliente:</strong><br><br>1. Acesse <a href="/app/leads" style="color:#ff385c;font-weight:700">Leads →</a><br>2. Encontre a lead com match<br>3. Clique em <strong>Enviar Vitrine</strong><br>4. O WhatsApp abre com a mensagem pronta:<br><em>"Olá! Separamos algumas oportunidades. Veja: [link]"</em>' });
FAQ.push({
  chave:/como portal acessa imoveis|como portal le imoveis|como integrar portal|basta ler xml|xml e suficiente|xml da conta|portal le xml/,
  resposta:'📡 <strong>Como o portal acessa seus imóveis:</strong><br><br>O portal só precisa ler o link do XML da sua conta.<br><br>O XML contém <strong>todos os imóveis selecionados</strong> — é a fonte de verdade.<br><br>Fluxo:<br>1. Gere o XML em <a href="/app/imoveis" style="color:#ff385c;font-weight:700">Meus Imóveis →</a><br>2. Copie o link em <a href="/app/portais" style="color:#ff385c;font-weight:700">Portais →</a><br>3. Cole nas configurações do portal<br>4. O portal lê e publica automaticamente todos os imóveis<br><br>Ao atualizar e gerar novo XML, o portal se atualiza.'
});
module.exports = { responder, FAQ };
