'use strict';

function responder(mNorm, d, imoveis, btn, chip) {
  if (/xml|importar|tecimob|rankim/.test(mNorm))
    return `📥 Envie o XML do Tecimob ou Rankim.<br><br>${btn('Importar XML','/app/imoveis')}`;
  if (/inativo/.test(mNorm)) {
    if (d.inativos===0) return `✅ Nenhum imóvel inativo.`;
    return `❌ <strong>${d.inativos} imóveis inativos</strong><br><br>${btn('Ver inativos','/app/imoveis?status=inativo')}`;
  }
  if (/proprietario|dono/.test(mNorm)) {
    const semProp = imoveis.filter(i=>!i.proprietario&&!i.nomeProprietario).length;
    if (semProp===0) return `✅ Todos têm proprietário vinculado!`;
    return `🏠 <strong>${semProp} imóveis sem proprietário</strong><br><br>${btn('Vincular','/app/imoveis')}`;
  }
  const temBairro = d.bairros.find(b => mNorm.includes(b.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'')));
  const temTipo = ['apartamento','casa','cobertura','sala','terreno'].find(t => mNorm.includes(t));
  if (temBairro||temTipo) {
    let r = imoveis.filter(i=>i.status!=='inativo');
    if (temBairro) r = r.filter(i=>i.bairro&&i.bairro.toLowerCase().includes(temBairro.toLowerCase()));
    if (temTipo)   r = r.filter(i=>i.tipo&&i.tipo.toLowerCase().includes(temTipo));
    if (r.length===0) return `Não encontrei imóveis${temTipo?' do tipo '+temTipo:''}${temBairro?' em '+temBairro:''}.`;
    return `🔍 <strong>${r.length} imóvel(is)</strong>${temBairro?' em '+temBairro:''}:<br>`+
      r.slice(0,5).map(i=>`• ${i.tipo||'Imóvel'} ${i.quartos?i.quartos+'q':''} — ${i.bairro||''}`).join('<br>')+
      `<br><br>${btn('Ver todos','/app/imoveis')}`;
  }
  if (d.ativos===0) return `Nenhum imóvel ainda. 🏠<br><br>${btn('Importar XML','/app/imoveis')}`;
  return `🏠 <strong>Imóveis:</strong><br>✅ Ativos: ${d.ativos} · ❌ Inativos: ${d.inativos}<br>📍 Bairros: ${d.bairros.slice(0,5).join(', ')||'—'}<br>🏷️ Tipos: ${d.tipos.slice(0,4).join(', ')||'—'}<br><br>${btn('Ver imóveis','/app/imoveis')}${chip('📥 Importar XML','importar xml')}`;
}

module.exports = { responder };
