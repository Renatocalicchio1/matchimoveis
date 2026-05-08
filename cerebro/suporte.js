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

module.exports = { responder, FAQ };
