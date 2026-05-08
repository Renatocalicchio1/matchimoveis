'use strict';

function responder(mNorm, d, btn, chip) {
  if (/como|explicar|o que|funciona/.test(mNorm))
    return `🎯 <strong>Como funciona o Match:</strong><br>Cruza <strong>bairro + tipo + quartos</strong> automaticamente.<br>Score: valor abaixo do máx +50pts · área maior +30pts · quartos extras +20pts<br><br>${btn('Ver leads com match','/app/leads?filtro=com_match')}`;
  if (/sem match|por que|melhorar/.test(mNorm)) {
    if (d.semMatch===0) return `✅ Todas as leads têm match! Excelente!`;
    return `❌ <strong>${d.semMatch} leads sem match</strong><br>• Bairros que as leads buscam não estão na carteira<br>• Tipo ou quartos incompatível<br>• Imóveis inativos<br><br>${btn('Analisar leads','/app/leads')}${chip('📊 Demanda por bairro','demanda por bairro')}`;
  }
  const taxa = d.leads>0 ? Math.round(d.comMatch/d.leads*100) : 0;
  return `🎯 <strong>Match:</strong><br>✅ Com match: ${d.comMatch} · ❌ Sem match: ${d.semMatch}<br>📊 Taxa: <strong>${taxa}%</strong><br><br>${btn('Ver leads','/app/leads')}${chip('❓ Como funciona?','como funciona o match')}`;
}

module.exports = { responder };
