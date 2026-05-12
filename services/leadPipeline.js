function diasDesde(data){
  if(!data) return 999;
  try{
    const d = new Date(data);
    return Math.floor((Date.now() - d.getTime()) / 86400000);
  }catch(e){
    return 999;
  }
}

function getLeadStage(lead = {}, visitas = []){
  const matches = lead.matches || lead.matchesBase || [];
  const bestScore = Number(
    lead.bestScore ||
    lead.score ||
    matches[0]?.score ||
    0
  );

  const leadVisitas = visitas.filter(v =>
    String(v.leadId || v.idLead || v.cliente || '')
      .includes(String(lead.id || lead.nome || ''))
  );

  const ultimaInteracao =
    lead.updatedAt ||
    lead.lastInteraction ||
    lead.matchedAt ||
    lead.processedAt ||
    lead.createdAt;

  const dias = diasDesde(ultimaInteracao);

  const visitaConfirmada = leadVisitas.find(v =>
    String(v.status || '').toLowerCase().includes('confirm')
  );

  const visitaPendente = leadVisitas.find(v =>
    String(v.status || '').toLowerCase().includes('solicit')
  );

  if(visitaConfirmada){
    return {
      stage:'visita_confirmada',
      label:'🟢 Visita confirmada',
      prioridade:100
    };
  }

  if(visitaPendente){
    return {
      stage:'visita_pendente',
      label:'🟡 Visita pendente',
      prioridade:90
    };
  }

  if(matches.length >= 3){
    return {
      stage:'quente',
      label:'🔥 Lead quente',
      prioridade:85
    };
  }

  if(matches.length > 0){
    return {
      stage:'morno',
      label:'🟠 Lead morno',
      prioridade:65
    };
  }

  if(dias >= 7){
    return {
      stage:'sem_resposta',
      label:'⚪ Sem resposta',
      prioridade:40
    };
  }

  if(bestScore >= 70){
    return {
      stage:'quente_score',
      label:'🔥 Alta prioridade',
      prioridade:80
    };
  }

  return {
    stage:'frio',
    label:'🔵 Lead frio',
    prioridade:20
  };
}

function rankLeads(leads = [], visitas = []){
  return leads
    .map(l => {
      const pipeline = getLeadStage(l, visitas);

      return {
        ...l,
        pipeline
      };
    })
    .sort((a,b)=>
      (b.pipeline?.prioridade || 0)
      -
      (a.pipeline?.prioridade || 0)
    );
}

module.exports = {
  getLeadStage,
  rankLeads
};
