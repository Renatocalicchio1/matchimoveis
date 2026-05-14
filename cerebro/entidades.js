'use strict';
function limpar(txt) { return String(txt||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/\s+/g,' ').trim(); }
const STOPWORDS = new Set(['lead','leads','cliente','clientes','imovel','imoveis','pagina','link','da','do','de','dos','das','a','o','as','os','para','pra','quando','tem','existe','mostrar','abrir','enviar','buscar','achar','encontrar','vitrine','meu','minha','meus','minhas','ver','quero','preciso','tenho','novo','nova','esse','essa','aqui','agora','me','nos','voce','vc']);
const TIPOS_IMOVEL = ['apartamento','apto','casa','cobertura','terreno','sobrado','studio','loft','kitnet','flat','comercial','sala','galpao','chacara','village','duplex','triplex','penthouse'];
const TIPO_NORM = { apto:'apartamento', kitinete:'kitnet', sobrado:'casa', penthouse:'cobertura', duplex:'casa', triplex:'casa', village:'casa' };
const PREFIXOS_BAIRRO = ['em','no','na','do','da','bairro','regiao','proximo a','perto do','perto da'];
function extrairTipo(txt) { const t=limpar(txt); for(const tipo of TIPOS_IMOVEL){ if(t.includes(tipo)) return TIPO_NORM[tipo]||tipo; } return null; }
function extrairQuartos(txt) { const m=txt.match(/(\d+)\s*(?:quarto|dorm|suite|q\b)/i); return m?parseInt(m[1]):null; }
function extrairVagas(txt) { const m=txt.match(/(\d+)\s*(?:vaga|garagem|garage)/i); return m?parseInt(m[1]):null; }
function extrairArea(txt) { const m=txt.match(/(\d+)\s*(?:m2|metros?\s*quadrados?|mq)/i); return m?parseInt(m[1]):null; }
function extrairValor(txt) {
  const t=limpar(txt);
  const milh=t.match(/(?:ate|por|max)?\s*r?\$?\s*([\d,.]+)\s*milh/i); if(milh) return parseFloat(milh[1].replace(/\./g,'').replace(',','.'))*1000000;
  const mil=t.match(/(?:ate|por|max)?\s*r?\$?\s*([\d,.]+)\s*(?:mil|k)/i); if(mil) return parseFloat(mil[1].replace(/\./g,'').replace(',','.'))*1000;
  const reais=t.match(/(?:ate|r\$)\s*([\d.]+(?:,\d{2})?)/i); if(reais){const v=parseFloat(reais[1].replace(/\./g,'').replace(',','.')); if(v>10000) return v;}
  return null;
}
function extrairBairro(txt, bairrosConhecidos) {
  const t=limpar(txt);
  if(bairrosConhecidos&&bairrosConhecidos.length){ const b=bairrosConhecidos.find(b=>t.includes(limpar(b))); if(b) return b; }
  for(const pref of PREFIXOS_BAIRRO){ const m=t.match(new RegExp(pref+'\\s+([a-z][a-z\\s]{2,25}?)(?:\\s*[,.]|$|\\s+(?:quarto|apto|casa|ate|por|valor|tipo|com))','i')); if(m){const b=m[1].trim(); if(b.length>2&&!STOPWORDS.has(b)) return b;} }
  return null;
}
function extrairOperacao(txt) {
  if(/aluguel|alugando|alugar|locacao|locar|\bmes\b|mensal/.test(limpar(txt))) return 'aluguel';
  if(/comprar|vender|venda|financiar|\bcompra\b/.test(limpar(txt))) return 'venda';
  return null;
}
function detectarAcao(txt) {
  const t=limpar(txt);
  if(/quando|data|entrou|cadastr/.test(t)) return 'DATA';
  if(/link|pagina|detalhe|abrir/.test(t)) return 'LINK';
  if(/vitrine/.test(t)) return 'VITRINE';
  if(/proprietario|dono/.test(t)) return 'PROPRIETARIO';
  if(/whatsapp|zap|ligar|falar/.test(t)) return 'WHATSAPP';
  if(/visita|agendar|marcar/.test(t)) return 'VISITA';
  if(/inativar|desativar|ocultar|remover/.test(t)) return 'INATIVAR';
  if(/buscar|achar|encontrar|procurar|tem|existe/.test(t)) return 'BUSCAR';
  return '';
}
function detectarEntidade(txt) {
  const t=limpar(txt);
  if(/lead|cliente|comprador|interessado/.test(t)) return 'LEAD';
  if(/imovel|imoveis|casa|apartamento|apto|cobertura|terreno|sobrado/.test(t)) return 'IMOVEL';
  if(/visita|agendamento/.test(t)) return 'VISITA';
  if(/proprietario|dono/.test(t)) return 'PROPRIETARIO';
  if(/vitrine|oferta/.test(t)) return 'VITRINE';
  if(/match|combinou|combinar/.test(t)) return 'MATCH';
  return '';
}
function extrairNome(txt) { return limpar(txt).split(' ').filter(p=>p&&!STOPWORDS.has(p)).join(' ').trim(); }
function analisar(txt, bairrosConhecidos) {
  return { entidade:detectarEntidade(txt), acao:detectarAcao(txt), nome:extrairNome(txt), tipo:extrairTipo(txt), quartos:extrairQuartos(txt), vagas:extrairVagas(txt), area:extrairArea(txt), valorMax:extrairValor(txt), bairro:extrairBairro(txt,bairrosConhecidos||[]), operacao:extrairOperacao(txt), bruto:txt };
}
module.exports = { analisar, extrairNome, detectarAcao, detectarEntidade, extrairTipo, extrairQuartos, extrairValor, extrairBairro, extrairArea, extrairVagas, extrairOperacao };
