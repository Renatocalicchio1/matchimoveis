#!/bin/bash
TARGET="$HOME/Downloads/matchimoveis /cerebro"
echo "🧠 Instalando módulos novos..."

# ── leads-temporal.js ─────────────────────────────────────────────────────────
cat > "$TARGET/leads-temporal.js" << 'JSEOF'
'use strict';

function responder(mNorm, leads, btn, chip) {
  const agora = new Date();
  const hoje  = agora.toLocaleDateString('pt-BR');

  // LEADS DE HOJE
  if (/hoje|entraram hoje|chegaram hoje|novas hoje/.test(mNorm)) {
    const novas = leads.filter(l => {
      const d = l.dataCriacao||l.createdAt||l.data||'';
      return d.includes(hoje) || (d && new Date(d).toLocaleDateString('pt-BR')===hoje);
    });
    if (!novas.length) return `Nenhuma lead chegou hoje ainda. 📋<br><br>${chip('👥 Todas as leads','minhas leads')}`;
    return `📋 <strong>${novas.length} lead(s) hoje:</strong><br>`+
      novas.slice(0,8).map(l=>`• ${l.nome||l.name||'Lead'} — ${l.bairro||''} ${l.tipo||''}`).join('<br>')+
      `<br><br>${btn('Ver todas','app/leads')}`;
  }

  // LEADS QUENTES (com match + sem visita)
  if (/quente|mais chance|interessado|prioridade|atender primeiro/.test(mNorm)) {
    const quentes = leads.filter(l=>l.matchesBase&&l.matchesBase.length>0)
      .sort((a,b)=>(b.matchesBase?.length||0)-(a.matchesBase?.length||0))
      .slice(0,8);
    if (!quentes.length) return `Nenhuma lead com match ainda. Faça o match primeiro!<br><br>${btn('Fazer match','/app/leads')}`;
    return `🔥 <strong>Leads mais quentes:</strong><br>`+
      quentes.map((l,i)=>`${i+1}. ${l.nome||l.name||'Lead'} — ${l.bairro||''} ${l.tipo||''} · ${l.matchesBase?.length||0} match(es)`).join('<br>')+
      `<br><br>${btn('Ver leads','/app/leads?filtro=com_match')}`;
  }

  // LEADS FRIAS (sem contato há muito tempo)
  if (/fria|frio|esfriou|esquecida|parada|sem contato|abandonada/.test(mNorm)) {
    const limite = new Date(agora - 15*24*60*60*1000);
    const frias = leads.filter(l => {
      const d = l.dataCriacao||l.createdAt||l.data||'';
      return d && new Date(d) < limite && (!l.matchesBase||!l.matchesBase.length);
    }).slice(0,8);
    if (!frias.length) return `Nenhuma lead fria detectada. Boa gestão! ✅`;
    return `🥶 <strong>${frias.length} leads frias</strong> (sem match há 15+ dias):<br>`+
      frias.map(l=>`• ${l.nome||l.name||'Lead'} — ${l.bairro||''} ${l.tipo||''}`).join('<br>')+
      `<br><br>${chip('🎯 Fazer match','fazer match agora')}${btn('Ver leads','/app/leads')}`;
  }

  // REATIVAR LEADS
  if (/reativar|reengajar|recuperar|voltar a contatar/.test(mNorm)) {
    const reativar = leads.filter(l=>!l.matchesBase||!l.matchesBase.length).slice(0,6);
    if (!reativar.length) return `Todas as leads têm match! Nada para reativar. ✅`;
    return `♻️ <strong>${reativar.length} leads para reativar:</strong><br>`+
      reativar.map(l=>`• ${l.nome||l.name||'Lead'} — ${l.bairro||''} ${l.tipo||''}`).join('<br>')+
      `<br><br>Envie a vitrine ou faça o match agora!<br>${btn('Ver leads','/app/leads')}${chip('🎯 Fazer match','fazer match agora')}`;
  }

  // BUSCA POR NOME
  const nomeMatch = mNorm.match(/(?:lead|cliente|contato|buscar|procurar|encontrar|onde esta)\s+([a-z]{3,})/);
  if (nomeMatch) {
    const nome = nomeMatch[1];
    const encontrados = leads.filter(l=>{
      const n = (l.nome||l.name||'').toLowerCase();
      return n.includes(nome);
    });
    if (!encontrados.length) return `Não encontrei lead com nome "${nome}". Verifique na lista completa.<br><br>${btn('Ver leads','/app/leads')}`;
    return `🔍 <strong>${encontrados.length} lead(s) encontrada(s):</strong><br>`+
      encontrados.slice(0,5).map(l=>`• <strong>${l.nome||l.name}</strong> — ${l.bairro||''} ${l.tipo||''} ${l.telefone?'📱'+l.telefone:''}`).join('<br>')+
      `<br><br>${btn('Ver leads','/app/leads')}`;
  }

  // SEM RESPOSTA
  if (/sem resposta|nao respondeu|sem retorno|visualizou/.test(mNorm)) {
    return `📋 Leads sem resposta aparecem na lista com status pendente.<br><br>${btn('Ver leads','/app/leads')}${chip('⏳ Visitas pendentes','visitas pendentes')}`;
  }

  return null;
}

module.exports = { responder };
JSEOF

# ── scoring.js ────────────────────────────────────────────────────────────────
cat > "$TARGET/scoring.js" << 'JSEOF'
'use strict';

// Calcula score de prioridade de cada lead
function calcularScore(lead, visitas) {
  let score = 0;
  const temMatch    = lead.matchesBase && lead.matchesBase.length > 0;
  const qtdMatch    = lead.matchesBase?.length || 0;
  const temVisita   = visitas.some(v => v.leadId===(lead.id||lead._id));
  const visitaConf  = visitas.some(v => v.leadId===(lead.id||lead._id) && v.status==='confirmada');
  const recente     = lead.dataCriacao && (new Date()-new Date(lead.dataCriacao)) < 7*24*60*60*1000;

  if (temMatch)    score += 40;
  if (qtdMatch>2)  score += 20;
  if (temVisita)   score += 30;
  if (visitaConf)  score += 25;
  if (recente)     score += 15;
  if (lead.valorMax && lead.valorMax > 500000) score += 10;

  return score;
}

function rankingLeads(leads, visitas, n=10) {
  return leads
    .map(l => ({ ...l, _score: calcularScore(l, visitas) }))
    .filter(l => l._score > 0)
    .sort((a,b) => b._score - a._score)
    .slice(0, n);
}

function responder(mNorm, leads, visitas, btn, chip) {

  // QUEM ATENDER PRIMEIRO
  if (/atender primeiro|mais urgente|prioridade|mais importante/.test(mNorm)) {
    const ranking = rankingLeads(leads, visitas, 5);
    if (!ranking.length) return `Nenhuma lead com score ainda. Faça o match primeiro!<br><br>${btn('Leads','/app/leads')}`;
    return `🎯 <strong>Atenda nessa ordem:</strong><br><br>`+
      ranking.map((l,i)=>{
        const emoji = i===0?'🔴':i===1?'🟠':i===2?'🟡':'🟢';
        return `${emoji} <strong>${i+1}. ${l.nome||l.name||'Lead'}</strong> — ${l.bairro||''} ${l.tipo||''} · score ${l._score}pts`;
      }).join('<br>')+
      `<br><br>${btn('Ver leads','/app/leads')}`;
  }

  // CHANCE DE FECHAR
  if (/chance de fechar|chance de compra|mais propenso|vai comprar|pronto para proposta/.test(mNorm)) {
    const ranking = rankingLeads(leads, visitas, 5);
    if (!ranking.length) return `Sem dados suficientes para calcular. Faça o match e aguarde visitas!`;
    const top = ranking[0];
    const nivel = top._score>=80?'🔥 Altíssima':top._score>=50?'✅ Boa':'🟡 Média';
    return `📊 <strong>Leads com mais chance de fechar:</strong><br><br>`+
      ranking.map((l,i)=>`${i+1}. ${l.nome||l.name||'Lead'} — ${l._score}pts`).join('<br>')+
      `<br><br>Chance do #1: <strong>${nivel}</strong><br>${btn('Ver leads','/app/leads')}`;
  }

  // RANKING GERAL
  const ranking = rankingLeads(leads, visitas, 8);
  if (!ranking.length) return null;
  return `📊 <strong>Ranking de leads por prioridade:</strong><br><br>`+
    ranking.map((l,i)=>`${i+1}. ${l.nome||l.name||'Lead'} — ${l._score}pts · ${l.bairro||''}`).join('<br>')+
    `<br><br>${btn('Ver leads','/app/leads')}`;
}

module.exports = { responder, rankingLeads, calcularScore };
JSEOF

# ── suporte.js ────────────────────────────────────────────────────────────────
cat > "$TARGET/suporte.js" << 'JSEOF'
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
  const isDuvida = /como|por que|porque|nao funciona|nao atualizou|nao apareceu|erro|falhou|problema|nao consigo|nao sei|me explica|como faz|como faço/.test(mNorm);
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
JSEOF

# ── Atualizar index.js com novos módulos ──────────────────────────────────────
cat > "$TARGET/index.js" << 'JSEOF'
'use strict';
const nlp            = require('./nlp');
const modLeads       = require('./leads');
const modImoveis     = require('./imoveis');
const modVisitas     = require('./visitas');
const modMatch       = require('./match');
const modPortais     = require('./portais');
const modSistema     = require('./sistema');
const modMercado     = require('./mercado');
const acoes          = require('./acoes');
const estrategista   = require('./estrategista');
const rag            = require('./rag');
const memoria        = require('./memoria');
const aprendizado    = require('./aprendizado');
const notifs         = require('./notificacoes');
const onboarding     = require('./onboarding');
const relatorio      = require('./relatorio');
const leadsTemp      = require('./leads-temporal');
const scoring        = require('./scoring');
const suporte        = require('./suporte');
const { criarArvore } = require('./arvore');

const btn  = (label, href) => `<a href="${href}" style="display:inline-block;background:#ff385c;color:white;padding:8px 16px;border-radius:8px;text-decoration:none;font-weight:700;margin:4px">${label} →</a>`;
const chip = (label, msg)  => `<button onclick="enviarMsg('${msg}')" style="background:#f3f4f6;border:none;border-radius:20px;padding:8px 14px;margin:4px;cursor:pointer;font-weight:600;font-size:13px">${label}</button>`;

const arvore = criarArvore({
  btn, chip,
  modLeads, modImoveis, modVisitas, modMatch,
  modPortais, modSistema, modMercado,
  acoes, estrategista, rag, notifs, onboarding, relatorio
});

function responder(mensagem, d, user, imoveis, leads, visitas, contexto) {
  const uid    = user.id || user.userId || 'anon';
  const mNorm  = nlp.normalizar(mensagem);
  const perfil = memoria.atualizarPerfil(uid, { d, user, imoveis, leads });
  const hist   = memoria.historicoPorUsuario(uid, 5);

  // 1. SUPORTE TÉCNICO (dúvidas como/por que/erro)
  const resSuporte = suporte.responder(mNorm, btn, chip);
  if (resSuporte) return resSuporte;

  // 2. LEADS TEMPORAIS (hoje/quentes/frias/reativar/por nome)
  const resTemp = leadsTemp.responder(mNorm, leads, btn, chip);
  if (resTemp) return resTemp;

  // 3. SCORING (prioridade/chance de fechar)
  const isScoring = /atender primeiro|mais chance|chance de fechar|pronto para proposta|ranking lead|scoring/.test(mNorm);
  if (isScoring) {
    const res = scoring.responder(mNorm, leads, visitas, btn, chip);
    if (res) return res;
  }

  // 4. ÁRVORE PRINCIPAL
  const resultado = arvore.responder(mensagem, d, user, imoveis, leads, visitas, hist, perfil);
  return resultado.resposta;
}

function detectarTema(mensagem) {
  return nlp.detectarDominio(nlp.normalizar(mensagem));
}

function pesosArvore() { return arvore.pesos(); }

module.exports = { responder, detectarTema, nlp, memoria, pesosArvore };
JSEOF

echo ""
echo "✅ Módulos instalados!"
echo ""
wc -l "$TARGET"/*.js | sort -rn | head -20
