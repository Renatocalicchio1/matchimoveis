#!/bin/bash
TARGET="$HOME/Downloads/matchimoveis /cerebro"
echo "🧠 Expandindo cérebro v16.0..."

# ── leads.js EXPANDIDO ────────────────────────────────────────────────────────
cat > "$TARGET/leads.js" << 'JSEOF'
'use strict';

function responder(mNorm, d, leads, btn, chip) {

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
JSEOF

# ── imoveis.js EXPANDIDO ──────────────────────────────────────────────────────
cat > "$TARGET/imoveis.js" << 'JSEOF'
'use strict';

function responder(mNorm, d, imoveis, btn, chip) {

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
JSEOF

# ── visitas.js EXPANDIDO ──────────────────────────────────────────────────────
cat > "$TARGET/visitas.js" << 'JSEOF'
'use strict';

function responder(mNorm, d, visitas, btn, chip) {

  // HOJE
  if (/hoje|do dia/.test(mNorm)) {
    if (d.hoje===0) return `📅 Nenhuma visita hoje. Aproveite para enviar vitrines para leads com match!<br><br>${chip('🎯 Ver leads com match','leads com match')}`;
    return `📅 <strong>${d.hoje} visita(s) hoje!</strong> ⚠️ Não esqueça!<br><br>${btn('Ver visitas de hoje','/app/visitas?filtro=hoje')}`;
  }

  // PENDENTES
  if (/pendente|sem resposta|aguardando|confirmar/.test(mNorm)) {
    if (d.pendentes===0) return `✅ Nenhuma visita pendente. Tudo confirmado!`;
    return `⏳ <strong>${d.pendentes} visita(s) pendente(s)</strong> aguardando confirmação.<br>`+
      `Confirme logo — leads não gostam de esperar!<br><br>`+
      `${btn('Confirmar visitas','/app/visitas?filtro=pendentes')}`;
  }

  // CONFIRMADAS
  if (/confirmada|aprovada/.test(mNorm))
    return `✅ <strong>${d.confirmadas} visita(s) confirmada(s)</strong><br><br>${btn('Ver visitas','/app/visitas')}`;

  // COMO FUNCIONA
  if (/como funciona|fluxo|como agendar|como remarcar/.test(mNorm))
    return `📅 <strong>Fluxo de visitas:</strong><br><br>`+
      `<div style="display:flex;gap:10px;margin:6px 0"><span style="background:#ff385c;color:white;border-radius:50%;width:22px;height:22px;display:inline-flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;flex-shrink:0">1</span><span>Lead recebe a vitrine com imóveis em match.</span></div>`+
      `<div style="display:flex;gap:10px;margin:6px 0"><span style="background:#ff385c;color:white;border-radius:50%;width:22px;height:22px;display:inline-flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;flex-shrink:0">2</span><span>Lead escolhe imóvel e solicita visita.</span></div>`+
      `<div style="display:flex;gap:10px;margin:6px 0"><span style="background:#ff385c;color:white;border-radius:50%;width:22px;height:22px;display:inline-flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;flex-shrink:0">3</span><span>Proprietário confirma ou recusa.</span></div>`+
      `<div style="display:flex;gap:10px;margin:6px 0"><span style="background:#ff385c;color:white;border-radius:50%;width:22px;height:22px;display:inline-flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;flex-shrink:0">4</span><span>Lead é notificado automaticamente.</span></div>`+
      `<br>${btn('Ver visitas','/app/visitas')}`;

  // REMARCAR
  if (/remarcar|reagendar|mudar data/.test(mNorm))
    return `🔄 Para remarcar uma visita, acesse a página de visitas e use o botão <strong>Remarcar</strong>.<br><br>${btn('Ver visitas','/app/visitas')}`;

  // GERAL
  if (d.visitas===0)
    return `Nenhuma visita agendada ainda. 📅<br><br>Envie vitrines para leads com match para receber solicitações!<br><br>${chip('🎯 Leads com match','leads com match')}`;

  return `📅 <strong>Visitas:</strong><br>`+
    `Total: <strong>${d.visitas}</strong> · ✅ Confirmadas: ${d.confirmadas} · ⏳ Pendentes: ${d.pendentes}<br>`+
    `📆 Hoje: <strong>${d.hoje}</strong><br><br>`+
    `${btn('Ver visitas','/app/visitas')}<br>`+
    `${chip('📆 Hoje','visitas hoje')}${chip('⏳ Pendentes','visitas pendentes')}${chip('❓ Como funciona','como funciona a visita')}`;
}

module.exports = { responder };
JSEOF

# ── match.js EXPANDIDO ────────────────────────────────────────────────────────
cat > "$TARGET/match.js" << 'JSEOF'
'use strict';

function responder(mNorm, d, leads, imoveis, btn, chip) {

  // EXPLICAR
  if (/como|explicar|o que|funciona|entender/.test(mNorm))
    return `🎯 <strong>Como funciona o Match:</strong><br><br>`+
      `O sistema cruza automaticamente cada lead com seus imóveis usando:<br>`+
      `• <strong>Bairro</strong> — deve ser igual<br>`+
      `• <strong>Tipo</strong> — deve ser igual (apto, casa, etc)<br>`+
      `• <strong>Quartos</strong> — imóvel deve ter ≥ quartos pedidos<br><br>`+
      `<strong>Score de ordenação na vitrine:</strong><br>`+
      `• Valor abaixo do máximo: +50pts<br>`+
      `• Área maior que o pedido: +30pts<br>`+
      `• Quartos extras: +20pts · Suítes: +15pts · Vagas: +15pts<br>`+
      `• Base interna: +25pts<br><br>`+
      `${btn('Ver leads com match','/app/leads?filtro=com_match')}${chip('❓ Por que sem match','por que nao tem match')}`;

  // DIAGNÓSTICO SEM MATCH
  if (/sem match|por que|melhorar|aumentar|nao tem/.test(mNorm)) {
    if (d.semMatch===0) return `✅ Todas as leads têm match! Excelente carteira!`;

    // Análise cruzada bairros
    const bairrosLeads = {};
    leads.forEach(l => { if (l.bairro) bairrosLeads[l.bairro]=(bairrosLeads[l.bairro]||0)+1; });
    const bairrosIm = new Set(imoveis.filter(i=>i.status!=='inativo').map(i=>i.bairro).filter(Boolean).map(b=>b.toLowerCase()));
    const semCobertura = Object.entries(bairrosLeads)
      .filter(([b]) => !bairrosIm.has(b.toLowerCase()))
      .sort((a,b)=>b[1]-a[1]).slice(0,3);

    let diagnostico = `❌ <strong>${d.semMatch} leads sem match</strong><br><br><strong>Diagnóstico:</strong><br>`;
    if (semCobertura.length)
      diagnostico += `• Bairros sem cobertura: <strong>${semCobertura.map(([b,n])=>`${b} (${n} leads)`).join(', ')}</strong><br>`;
    diagnostico += `• Verifique se tipos e quartos batem com as leads<br>`;
    diagnostico += `• Imóveis inativos não entram no match<br><br>`;
    diagnostico += `${btn('Ver leads sem match','/app/leads?filtro=sem_match')}${chip('📍 Demanda por bairro','demanda por bairro')}`;
    return diagnostico;
  }

  // TAXA
  if (/taxa|percentual|porcentagem/.test(mNorm)) {
    const taxa = d.leads>0 ? Math.round(d.comMatch/d.leads*100) : 0;
    const avaliacao = taxa>=70?'🟢 Excelente!':taxa>=40?'🟡 Razoável — pode melhorar':' 🔴 Baixa — precisa de atenção';
    return `📊 <strong>Taxa de match: ${taxa}%</strong> ${avaliacao}<br>`+
      `${d.comMatch} com match · ${d.semMatch} sem match · ${d.leads} total<br><br>`+
      `${chip('❓ Como melhorar','como melhorar o match')}${btn('Ver leads','/app/leads')}`;
  }

  // GERAL
  const taxa = d.leads>0 ? Math.round(d.comMatch/d.leads*100) : 0;
  const avaliacao = taxa>=70?'🟢 Excelente':taxa>=40?'🟡 Razoável':'🔴 Baixa';
  return `🎯 <strong>Match:</strong><br>`+
    `✅ Com match: <strong>${d.comMatch}</strong> · ❌ Sem match: ${d.semMatch}<br>`+
    `📊 Taxa: <strong>${taxa}%</strong> ${avaliacao}<br><br>`+
    `${btn('Ver leads','/app/leads')}<br>`+
    `${chip('❓ Como funciona','como funciona o match')}${chip('❌ Por que sem match','por que nao tem match')}${chip('📊 Taxa detalhada','taxa de match')}`;
}

module.exports = { responder };
JSEOF

# ── portais.js EXPANDIDO ─────────────────────────────────────────────────────
cat > "$TARGET/portais.js" << 'JSEOF'
'use strict';

const PORTAIS = ['VivaReal','ZAP','OLX','Chaves','ImovelWeb','123i'];

function responder(mNorm, d, btn, chip) {

  // GERAR XML ESPECÍFICO
  const portal = PORTAIS.find(p => mNorm.includes(p.toLowerCase().replace(' ','')));
  if (portal && /gerar|criar|publicar|subir|feed/.test(mNorm))
    return `🔗 <strong>Gerar XML para ${portal}:</strong><br><br>`+
      `<div style="display:flex;gap:10px;margin:6px 0"><span style="background:#ff385c;color:white;border-radius:50%;width:22px;height:22px;display:inline-flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;flex-shrink:0">1</span><span>Acesse <a href="/app/imoveis" style="color:#ff385c;font-weight:700">Imóveis →</a></span></div>`+
      `<div style="display:flex;gap:10px;margin:6px 0"><span style="background:#ff385c;color:white;border-radius:50%;width:22px;height:22px;display:inline-flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;flex-shrink:0">2</span><span>Selecione os imóveis com os checkboxes.</span></div>`+
      `<div style="display:flex;gap:10px;margin:6px 0"><span style="background:#ff385c;color:white;border-radius:50%;width:22px;height:22px;display:inline-flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;flex-shrink:0">3</span><span>Clique em <strong>${portal}</strong> na barra inferior.</span></div>`+
      `<div style="display:flex;gap:10px;margin:6px 0"><span style="background:#ff385c;color:white;border-radius:50%;width:22px;height:22px;display:inline-flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;flex-shrink:0">4</span><span>Copie o link gerado em <a href="/app/portais" style="color:#ff385c;font-weight:700">Portais →</a> e cadastre no portal.</span></div>`+
      `<br>${btn('Ir para imóveis','/app/imoveis')}${btn('Ver portais','/app/portais')}`;

  // GERAR XML GENÉRICO
  if (/gerar|criar|publicar|xml/.test(mNorm))
    return `🔗 <strong>Para qual portal gerar o XML?</strong><br><br>`+
      PORTAIS.map(p=>chip(`🔗 ${p}`,`gerar xml ${p.toLowerCase()}`)).join('');

  // O QUE É XML
  if (/o que|para que|como funciona|explicar/.test(mNorm))
    return `🔗 <strong>O que é o XML de portais:</strong><br><br>`+
      `O XML é um arquivo que envia seus imóveis automaticamente para portais como VivaReal, ZAP e OLX.<br><br>`+
      `<strong>Como usar:</strong><br>`+
      `1. Gere o XML aqui no MatchImóveis<br>`+
      `2. Copie o link do feed gerado<br>`+
      `3. Cadastre esse link nas configurações do portal<br>`+
      `4. O portal atualiza automaticamente seus imóveis!<br><br>`+
      `${btn('Ver portais','/app/portais')}${chip('🔗 Gerar XML','gerar xml')}`;

  // STATUS PORTAIS
  if (/status|ativo|atualizado|quando/.test(mNorm))
    return `🔗 Veja o status de todos os seus feeds em <strong>Portais</strong>:<br><br>${btn('Ver portais','/app/portais')}`;

  // GERAL
  return `🔗 <strong>Portais disponíveis:</strong><br>`+
    PORTAIS.join(' · ')+'<br><br>'+
    `Gere o XML de cada portal e cadastre o link nas configurações do portal.<br><br>`+
    `${btn('Ver portais','/app/portais')}${btn('Ir para imóveis','/app/imoveis')}<br>`+
    PORTAIS.map(p=>chip(`🔗 ${p}`,`gerar xml ${p.toLowerCase()}`)).join('');
}

module.exports = { responder, PORTAIS };
JSEOF

# ── sistema.js EXPANDIDO ──────────────────────────────────────────────────────
cat > "$TARGET/sistema.js" << 'JSEOF'
'use strict';

const EXPLICACOES = {
  match:        'Match é quando um imóvel da sua carteira combina com o que um lead procura. O sistema cruza bairro + tipo + quartos automaticamente.',
  vitrine:      'Vitrine é uma página exclusiva enviada ao lead com os imóveis em match. O lead escolhe e solicita visita — tudo automático!',
  score:        'Score define a ordem na vitrine: valor abaixo do máximo +50pts, área maior +30pts, quartos extras +20pts, suítes +15pts, vagas +15pts.',
  lead:         'Lead é um cliente interessado em comprar ou alugar. Você importa planilhas dos portais e o sistema faz o match automático.',
  xml:          'XML é o arquivo que envia seus imóveis para portais (VivaReal, ZAP, OLX). Gere aqui e cadastre o link no portal.',
  coins:        'Match Coins são pontos ganhos a cada match realizado. Futuramente usados para recursos premium.',
  visita:       'Fluxo: Lead recebe vitrine → escolhe imóvel → solicita visita → proprietário confirma/recusa → lead notificado. Tudo automático!',
  proprietario: 'Proprietário é o dono do imóvel. Vincule via Excel (padrão Tecimob) para que ele receba notificações de visitas.',
  extracao:     'Extração é o processo que lê a planilha do portal e identifica automaticamente bairro, tipo, quartos, valor e mais.',
  rag:          'RAG significa que o assistente busca nos seus dados reais antes de responder — nunca inventa informações.',
  cerebro:      'O cérebro é o sistema de IA local do MatchImóveis. Tem 16 módulos especializados que trabalham juntos para responder qualquer dúvida.',
};

const AJUDA = [
  {emoji:'👥', label:'Leads',        msg:'minhas leads'},
  {emoji:'🏠', label:'Imóveis',      msg:'meus imoveis'},
  {emoji:'📅', label:'Visitas',      msg:'minhas visitas'},
  {emoji:'🎯', label:'Match',        msg:'ver match'},
  {emoji:'🔗', label:'Portais',      msg:'ver portais'},
  {emoji:'🪙', label:'Coins',        msg:'meus coins'},
  {emoji:'🔔', label:'Notificações', msg:'minhas notificacoes'},
  {emoji:'📊', label:'Resumo',       msg:'resumo geral'},
  {emoji:'🧠', label:'Plano do dia', msg:'o que devo fazer hoje'},
  {emoji:'📈', label:'Relatório',    msg:'relatorio semanal'},
  {emoji:'📍', label:'Demanda',      msg:'demanda por bairro'},
  {emoji:'🚀', label:'Onboarding',   msg:'primeiros passos'},
];

function responder(mNorm, d, btn, chip) {
  // Explicações específicas
  for (const [key, texto] of Object.entries(EXPLICACOES)) {
    if (mNorm.includes(key))
      return `💡 <strong>${key.charAt(0).toUpperCase()+key.slice(1)}</strong><br><br>${texto}<br><br>${chip('❓ Mais ajuda','ajuda')}`;
  }
  // Ajuda geral
  return `🤖 <strong>Sou o Match — seu assistente imobiliário.</strong><br><br>Posso te ajudar com:<br><br>`+
    AJUDA.map(i=>`<button onclick="enviarMsg('${i.msg}')" style="background:#f3f4f6;border:none;border-radius:20px;padding:8px 14px;margin:4px;cursor:pointer;font-weight:600;font-size:13px">${i.emoji} ${i.label}</button>`).join('');
}

module.exports = { EXPLICACOES, responder };
JSEOF

# ── mercado.js EXPANDIDO ──────────────────────────────────────────────────────
cat > "$TARGET/mercado.js" << 'JSEOF'
'use strict';

function responder(mNorm, leads, imoveis, btn, chip) {

  // BAIRROS MAIS DEMANDADOS
  if (/bairro|demanda|mais buscado|onde|regiao/.test(mNorm)) {
    const bairrosLeads = {};
    leads.forEach(l => { if (l.bairro) bairrosLeads[l.bairro]=(bairrosLeads[l.bairro]||0)+1; });
    const ranking = Object.entries(bairrosLeads).sort((a,b)=>b[1]-a[1]).slice(0,8);
    if (!ranking.length) return `Sem dados de bairro nas leads ainda.<br><br>${btn('Importar leads','/app-importar-leads')}`;
    const bairrosIm = {};
    imoveis.filter(i=>i.status!=='inativo').forEach(i=>{ if(i.bairro) bairrosIm[i.bairro]=(bairrosIm[i.bairro]||0)+1; });
    const lista = ranking.map(([b,n],i)=>{
      const of = bairrosIm[b]||0;
      const st = of===0?'🔴':of<n?'🟡':'🟢';
      return `${i+1}. <strong>${b}</strong> — ${n} lead${n>1?'s':''} · ${of} imóvel(is) ${st}`;
    }).join('<br>');
    return `📍 <strong>Bairros mais buscados pelas leads:</strong><br><br>${lista}<br><br>`+
      `🔴 sem imóvel · 🟡 pouca oferta · 🟢 ok<br><br>`+
      `${chip('🏠 Ver imóveis','meus imoveis')}${chip('📥 Importar XML','importar xml')}`;
  }

  // TIPO MAIS BUSCADO
  if (/tipo|apartamento|casa|mais pedido/.test(mNorm)) {
    const tipos = {};
    leads.forEach(l => { if (l.tipo) tipos[l.tipo]=(tipos[l.tipo]||0)+1; });
    const ranking = Object.entries(tipos).sort((a,b)=>b[1]-a[1]).slice(0,5);
    if (!ranking.length) return `Sem dados de tipo nas leads ainda.`;
    return `🏷️ <strong>Tipos mais buscados pelas leads:</strong><br><br>`+
      ranking.map(([t,n],i)=>`${i+1}. <strong>${t}</strong> — ${n} lead${n>1?'s':''}`).join('<br>')+
      `<br><br>${chip('🏠 Ver imóveis','meus imoveis')}`;
  }

  // FAIXA DE VALOR
  if (/valor|preco|faixa|orcamento|quanto pagam/.test(mNorm)) {
    const vals = leads.filter(l=>l.valorMax&&l.valorMax>0).map(l=>Number(l.valorMax));
    if (!vals.length) return `Sem dados de valor nas leads ainda.`;
    const med = Math.round(vals.reduce((a,b)=>a+b,0)/vals.length);
    const faixas = { 'até 300k':0, '300k-500k':0, '500k-800k':0, 'acima 800k':0 };
    vals.forEach(v => {
      if (v<=300000) faixas['até 300k']++;
      else if (v<=500000) faixas['300k-500k']++;
      else if (v<=800000) faixas['500k-800k']++;
      else faixas['acima 800k']++;
    });
    const faixaLista = Object.entries(faixas).filter(([,n])=>n>0).map(([f,n])=>`• ${f}: ${n} lead${n>1?'s':''}`).join('<br>');
    return `💰 <strong>Faixa de valor das leads:</strong><br><br>`+
      `Médio: <strong>R$ ${med.toLocaleString('pt-BR')}</strong><br><br>`+
      faixaLista+`<br><br>${chip('🏠 Meus imóveis','meus imoveis')}`;
  }

  // QUARTOS
  if (/quarto|dormitorio/.test(mNorm)) {
    const qts = {};
    leads.forEach(l => { if (l.quartos) qts[l.quartos]=(qts[l.quartos]||0)+1; });
    const ranking = Object.entries(qts).sort((a,b)=>b[1]-a[1]).slice(0,5);
    if (!ranking.length) return `Sem dados de quartos nas leads ainda.`;
    return `🛏️ <strong>Quartos mais pedidos:</strong><br><br>`+
      ranking.map(([q,n],i)=>`${i+1}. <strong>${q} quarto${q>1?'s':''}</strong> — ${n} lead${n>1?'s':''}`).join('<br>')+
      `<br><br>${chip('🏠 Ver imóveis','meus imoveis')}`;
  }

  // OFERTA VS DEMANDA (padrão)
  const bairrosLeads = {};
  leads.forEach(l => { if (l.bairro) bairrosLeads[l.bairro]=(bairrosLeads[l.bairro]||0)+1; });
  const bairrosIm = {};
  imoveis.filter(i=>i.status!=='inativo').forEach(i=>{ if(i.bairro) bairrosIm[i.bairro]=(bairrosIm[i.bairro]||0)+1; });
  const top = Object.entries(bairrosLeads).sort((a,b)=>b[1]-a[1]).slice(0,5);
  if (!top.length) return `Sem dados de mercado ainda.<br><br>${btn('Importar leads','/app-importar-leads')}`;

  return `📊 <strong>Inteligência de mercado:</strong><br><br>`+
    top.map(([b,dem])=>{
      const of=bairrosIm[b]||0;
      const st=of===0?'🔴 sem imóvel':of<dem?'🟡 pouca oferta':'🟢 equilibrado';
      return `• <strong>${b}</strong>: ${dem} leads · ${of} imóveis — ${st}`;
    }).join('<br>')+
    `<br><br>${chip('💰 Faixa de valor','faixa de valor das leads')}${chip('🏷️ Tipos','tipo mais buscado')}${chip('🛏️ Quartos','quartos mais pedidos')}`;
}

module.exports = { responder };
JSEOF

echo ""
echo "✅ Todos os módulos de domínio expandidos!"
echo ""
echo "Tamanho atual:"
wc -l "$TARGET"/*.js | sort -rn | head -20
