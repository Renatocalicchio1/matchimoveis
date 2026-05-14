'use strict';
var fs = require('fs');
var path = require('path');
var DATA_DIR = process.env.RENDER ? '/opt/render/project/src/data' : path.join(__dirname, '..');

function arqSlots(userId) { return path.join(DATA_DIR, 'slots-' + userId + '.json'); }
function carregar(userId) { try { return JSON.parse(fs.readFileSync(arqSlots(userId),'utf8')); } catch(e) { return {}; } }
function salvar(userId, slots) { try { fs.writeFileSync(arqSlots(userId), JSON.stringify(slots)); } catch(e) {} }
function limpar(userId) { try { fs.unlinkSync(arqSlots(userId)); } catch(e) {} }

// Extrai slots de qualquer mensagem
function extrairSlots(texto) {
  var t = String(texto).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
  var slots = {};
  // Tipo
  var tipos = ['apartamento','apto','casa','cobertura','terreno','sobrado','studio','loft','kitnet','comercial'];
  for (var tp of tipos) { if (t.includes(tp)) { slots.tipo = tp === 'apto' ? 'apartamento' : tp; break; } }
  // Quartos
  var q = t.match(/(\d+)\s*(?:quarto|dorm|suite|q\b)/i); if (q) slots.quartos = parseInt(q[1]);
  // Valor
  var milh = t.match(/(?:ate|r\$)?\s*([\d,.]+)\s*milh/i); if (milh) slots.valorMax = parseFloat(milh[1].replace(/\./g,'').replace(',','.'))*1000000;
  var mil = t.match(/(?:ate|r\$)?\s*([\d,.]+)\s*(?:mil|k)/i); if (!slots.valorMax && mil) slots.valorMax = parseFloat(mil[1].replace(/\./g,'').replace(',','.'))*1000;
  // Bairro (após preposição)
  var bairroM = t.match(/(?:em|no|na|bairro)\s+([a-z][a-z\s]{2,20}?)(?:\s*[,.]|$|\s+(?:quarto|apto|ate|por|valor))/i);
  if (bairroM) slots.bairro = bairroM[1].trim();
  // Operação
  if (/aluguel|alugar|locar/.test(t)) slots.operacao = 'aluguel';
  if (/comprar|vender|venda/.test(t)) slots.operacao = 'venda';
  // Nome do cliente
  var nomeM = texto.match(/(?:cliente|lead|para o|para a|do|da)\s+([A-ZÀ-Ú][a-zà-ú]+(?:\s+[A-ZÀ-Ú][a-zà-ú]+)?)/);
  if (nomeM) slots.nomeCliente = nomeM[1];
  // Telefone
  var telM = texto.match(/(\(?\d{2}\)?\s?\d{4,5}[\s-]?\d{4})/);
  if (telM) slots.telefone = telM[1].replace(/\D/g,'');
  return slots;
}

// Mescla slots novos com existentes
function mesclar(userId, novosSlots) {
  var existentes = carregar(userId);
  var merged = Object.assign({}, existentes, novosSlots);
  merged._updatedAt = new Date().toISOString();
  salvar(userId, merged);
  return merged;
}

// Verifica quais slots faltam para uma intenção
var SLOTS_NECESSARIOS = {
  buscar_imovel:   ['tipo', 'bairro'],
  cadastrar_lead:  ['nomeCliente', 'telefone'],
  agendar_visita:  ['nomeCliente', 'bairro'],
  fazer_proposta:  ['nomeCliente', 'valorMax'],
  gerar_xml:       ['portal'],
};

var PERGUNTAS_SLOTS = {
  tipo: 'Que tipo de imovel?',
  bairro: 'Qual bairro?',
  nomeCliente: 'Qual o nome do cliente?',
  telefone: 'Qual o telefone?',
  valorMax: 'Qual o valor maximo?',
  quartos: 'Quantos quartos?',
  portal: 'Para qual portal? (vivareal, zap, olx, imovelweb)',
};

function verificarSlotsFaltantes(intencao, slotsAtuais) {
  var necessarios = SLOTS_NECESSARIOS[intencao] || [];
  return necessarios.filter(function(s){ return !slotsAtuais[s]; });
}

function perguntarProximoSlot(slotsFaltantes) {
  if (!slotsFaltantes.length) return null;
  var proximo = slotsFaltantes[0];
  return PERGUNTAS_SLOTS[proximo] || ('Me diz o ' + proximo + ':');
}

module.exports = { extrairSlots, mesclar, carregar, limpar, verificarSlotsFaltantes, perguntarProximoSlot, SLOTS_NECESSARIOS };
