'use strict';
var fs = require('fs');
var path = require('path');
var DATA_DIR = process.env.RENDER ? '/opt/render/project/src/data' : path.join(__dirname, '..');

function arqFluxo(userId) { return path.join(DATA_DIR, 'fluxo-' + userId + '.json'); }
function carregarFluxo(userId) { try { return JSON.parse(fs.readFileSync(arqFluxo(userId),'utf8')); } catch(e) { return null; } }
function salvarFluxo(userId, fluxo) { try { fs.writeFileSync(arqFluxo(userId), JSON.stringify(fluxo)); } catch(e) {} }
function limparFluxo(userId) { try { fs.unlinkSync(arqFluxo(userId)); } catch(e) {} }

var FLUXOS = {
  onboarding: {
    passos: [
      { id: 1, pergunta: 'Vamos configurar sua conta! Você já tem imóveis cadastrados?', opcoes: ['Sim, já tenho', 'Não ainda'], proximo: { 'Sim, já tenho': 2, 'Não ainda': 'importar_xml' } },
      { id: 2, pergunta: 'Você já importou leads (clientes interessados)?', opcoes: ['Sim', 'Não'], proximo: { 'Sim': 3, 'Não': 'importar_leads' } },
      { id: 3, pergunta: 'Ótimo! Quer fazer o match agora para cruzar leads com imóveis?', opcoes: ['Sim, fazer match!', 'Depois'], proximo: { 'Sim, fazer match!': 'fazer_match', 'Depois': 'fim' } }
    ]
  },
  diagnostico_sem_match: {
    passos: [
      { id: 1, pergunta: 'Vou te ajudar a resolver o match. Seus imóveis têm bairro preenchido?', opcoes: ['Sim', 'Não tenho certeza'], proximo: { 'Sim': 2, 'Não tenho certeza': 'verificar_imoveis' } },
      { id: 2, pergunta: 'As leads têm extração completa (bairro + tipo extraídos)?', opcoes: ['Sim', 'Não sei'], proximo: { 'Sim': 3, 'Não sei': 'verificar_leads' } },
      { id: 3, pergunta: 'Os bairros dos imóveis batem com os bairros das leads?', opcoes: ['Sim', 'Não'], proximo: { 'Sim': 'match_manual', 'Não': 'captacao' } }
    ]
  },
  fechar_negocio: {
    passos: [
      { id: 1, pergunta: 'Para fechar o negócio: o cliente já visitou o imóvel?', opcoes: ['Sim, visitou', 'Ainda não'], proximo: { 'Sim, visitou': 2, 'Ainda não': 'agendar_visita' } },
      { id: 2, pergunta: 'O cliente gostou do imóvel?', opcoes: ['Gostou muito', 'Gostou com ressalvas', 'Não gostou'], proximo: { 'Gostou muito': 3, 'Gostou com ressalvas': 'negociar', 'Não gostou': 'nova_opcao' } },
      { id: 3, pergunta: 'Ótimo! Qual o próximo passo?', opcoes: ['Fazer proposta', 'Agendar 2ª visita', 'Aguardar decisão'], proximo: { 'Fazer proposta': 'proposta', 'Agendar 2ª visita': 'agendar_visita', 'Aguardar decisão': 'followup' } }
    ]
  }
};

function iniciarFluxo(userId, nomeFluxo, btn, chip) {
  var fluxo = FLUXOS[nomeFluxo];
  if (!fluxo) return null;
  var estado = { nome: nomeFluxo, passoAtual: 1, respostas: {} };
  salvarFluxo(userId, estado);
  var passo = fluxo.passos[0];
  return gerarPasso(passo, btn, chip);
}

function gerarPasso(passo, btn, chip) {
  var html = '<div style="background:#f0f9ff;border-left:3px solid #3b82f6;border-radius:10px;padding:14px">';
  html += '💬 ' + passo.pergunta + '<br><br>';
  passo.opcoes.forEach(function(op){ html += '<button onclick="enviarMsg(' + "'" + op + "'" + ')" style="background:#fff;border:1px solid #3b82f6;color:#1d4ed8;border-radius:20px;padding:8px 16px;margin:4px;cursor:pointer;font-size:13px;font-weight:600">' + op + '</button>'; });
  html += '</div>';
  return html;
}

function continuarFluxo(userId, resposta, btn, chip) {
  var estado = carregarFluxo(userId);
  if (!estado) return null;
  var fluxo = FLUXOS[estado.nome];
  if (!fluxo) return null;
  var passoAtual = fluxo.passos.find(function(p){ return p.id === estado.passoAtual; });
  if (!passoAtual) return null;
  var proximo = passoAtual.proximo[resposta];
  if (!proximo) return null;
  estado.respostas['passo_'+estado.passoAtual] = resposta;

  // Ação final
  var acoesFinal = {
    importar_xml:      '📥 Vamos importar seus imóveis! Acesse:<br><br>' + btn('Importar XML','/app/cadastro'),
    importar_leads:    '📋 Vamos importar leads! Acesse:<br><br>' + btn('Importar leads','/app-importar-leads'),
    fazer_match:       '🎯 Iniciando match agora...<br><br>' + '<button onclick="rodarMatchBase()" style="background:#ff385c;color:white;border:none;border-radius:10px;padding:10px 20px;font-weight:700;cursor:pointer">🎯 Fazer match</button>',
    verificar_imoveis: '🏠 Verifique seus imóveis e certifique que o bairro está preenchido:<br><br>' + btn('Ver imóveis','/app/imoveis'),
    verificar_leads:   '👥 Verifique o status de extração das leads:<br><br>' + btn('Ver leads','/app/leads'),
    captacao:          '💡 Seus bairros não coincidem! Os bairros mais demandados pelas leads não têm imóveis. Capte imóveis nesses bairros!<br><br>' + chip('Ver oportunidades','oportunidade de captacao'),
    match_manual:      '🎯 Tudo parece certo! Tente rodar o match novamente:<br><br>' + '<button onclick="enviarMsg(' + "'fazer match agora'" + ')" style="background:#ff385c;color:white;border:none;border-radius:10px;padding:10px 20px;font-weight:700;cursor:pointer">🎯 Fazer match</button>',
    agendar_visita:    '📅 Vamos agendar a visita! Acesse suas leads com match e envie a vitrine:<br><br>' + btn('Ver leads','/app/leads?filtro=com_match'),
    negociar:          '🤝 Bom sinal! Se houver objeções de preço, veja se tem margem para negociar. Sugestão: ofereça um desconto simbólico ou inclua algo (vaga extra, personalização).',
    nova_opcao:        '💡 Sem problema! Temos outras opções. Veja as leads com mais matches:<br><br>' + btn('Ver leads','/app/leads?filtro=com_match'),
    proposta:          '📋 Hora de fazer a proposta formal! Documente valor, condições e prazo. Quer ajuda para montar a proposta?<br><br>' + chip('Dicas de proposta','como fazer uma boa proposta'),
    followup:          '📱 Aguarde 2-3 dias e entre em contato novamente. Dica: envie um novo imóvel que acabou de chegar para manter o interesse.',
    fim:               '✅ Perfeito! Sua conta está configurada. Use o menu para navegar entre leads, imóveis e visitas.'
  };

  if (acoesFinal[proximo]) {
    limparFluxo(userId);
    return acoesFinal[proximo];
  }

  // Próximo passo do fluxo
  var proximoPasso = fluxo.passos.find(function(p){ return p.id === proximo; });
  if (proximoPasso) {
    estado.passoAtual = proximo;
    salvarFluxo(userId, estado);
    return gerarPasso(proximoPasso, btn, chip);
  }

  limparFluxo(userId);
  return null;
}

function detectarFluxo(mNorm, d) {
  if (/nao sei por onde comecar|primeiro passo|como comecar|por onde comecar|nao tenho nada|conta nova/.test(mNorm) && d.ativos === 0) return 'onboarding';
  if (/por que nao tem match|sem match algum|nao entendo o match|nao deu match|diagnosticar/.test(mNorm)) return 'diagnostico_sem_match';
  if (/como fechar|fechar negocio|quero fechar|ta quase fechando|vamos fechar/.test(mNorm)) return 'fechar_negocio';
  return null;
}

module.exports = { iniciarFluxo, continuarFluxo, detectarFluxo, carregarFluxo, limparFluxo };
