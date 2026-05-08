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
