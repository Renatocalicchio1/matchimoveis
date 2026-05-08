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
