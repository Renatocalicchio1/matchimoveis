'use strict';
const rag = require('./rag');
const semAcento = s => (s||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
const INTENCOES = {
  BUSCAR_IMOVEL:  /tenho (um )?cliente|cliente (quer|procura|busca|precisa|esta procurando)|alguem (quer|procura)|procurando (um |uma )?(apto|apartamento|casa|imovel)|tem (apto|apartamento|casa)|quero ver|mostrar imoveis|buscar imoveis|imoveis (no|na|em|do|da)/,
  CADASTRAR_LEAD: /cadastrar (lead|cliente)|novo (lead|cliente)|criar (lead|cliente)|adicionar (lead|cliente)|novo atendimento/,
  CRIAR_VISITA:   /agendar visita|marcar visita|cliente quer visitar|cliente quer ver|visita para/,
  INFORMAR:       /acabei de|acabou de|ja (vendeu|vendemos|fechou|fechamos|foi vendido)|nao esta mais|imovel vendido|ja tem proposta/,
  FOLLOW_UP:      /follow.?up|retornar para|ligar para|mandar (mensagem|whatsapp|zap)|entrar em contato|cliente nao (respondeu|retornou)/,
  AVISAR_PROP:    /avisar (o |a )?proprietario|notificar (o |a )?proprietario|falar com (o |a )?proprietario/,
};
const OPERACAO = {
  venda:   /comprar|vender|financiar|compra/,
  aluguel: /alugar|aluguel|locar|locacao|mes|mensal/,
};
function extrairNome(frase) {
  const m = frase.match(/(?:cliente|lead|para o|para a)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/);
  return m ? m[1] : null;
}
function detectarIntencao(mNorm) {
  for (const [nome, regex] of Object.entries(INTENCOES)) {
    if (regex.test(mNorm)) return nome;
  }
  return null;
}
function analisar(fraseOriginal, imoveis, leads, visitas) {
  const mNorm    = semAcento(fraseOriginal);
  const intencao = detectarIntencao(mNorm);
  const operacao = Object.entries(OPERACAO).find(([,r]) => r.test(mNorm))?.[0] || null;
  const nome     = extrairNome(fraseOriginal);
  const bairrosDisponiveis = [...new Set(imoveis.map(i => i.bairro).filter(Boolean))];
  const slots = rag.extrairSlots(mNorm);
  const bairroCarteira = bairrosDisponiveis.find(b => mNorm.includes(semAcento(b)));
  if (bairroCarteira) slots.bairro = bairroCarteira;
  if (!slots.bairro) {
    const m2 = mNorm.match(/(?:no|na|em|do|da)\s+([a-z][a-z ]{2,20})(?:\s|$|,|\.)/);
    if (m2) {
      const stop = new Set(['minha','meu','sua','seu','nossa','carteira','cliente','lead','imovel','sistema']);
      const c = m2[1].trim();
      if (!stop.has(c)) slots.bairro = c;
    }
  }
  if (operacao) slots.operacao = operacao;
  if (nome)     slots.nomeCliente = nome;
  let imoveisEncontrados = [], leadsEncontrados = [];
  if (slots.tipo || slots.bairro || slots.quartos || slots.valorMax) {
    const b = rag.buscarImoveis(mNorm, imoveis, bairrosDisponiveis);
    if (b) imoveisEncontrados = b.resultado || [];
  }
  if (slots.tipo || slots.bairro) {
    const bl = rag.buscarLeads(mNorm, leads, bairrosDisponiveis);
    if (bl) leadsEncontrados = bl.resultado || [];
  }
  return { intencao, slots, imoveisEncontrados, leadsEncontrados, temDados: !!(slots.tipo||slots.bairro||slots.quartos||slots.valorMax||slots.vagas), fraseOriginal, mNorm };
}
function responder(ctx, d, user, imoveis, leads, visitas, btn, chip) {
  const { intencao, slots, imoveisEncontrados } = ctx;
  if (!intencao && !ctx.temDados) return null;
  const fmtVal = v => 'R$ ' + Number(v).toLocaleString('pt-BR');
  const filtros = [
    slots.tipo     && (slots.tipo.charAt(0).toUpperCase()+slots.tipo.slice(1)),
    slots.bairro   && ('\uD83D\uDCCD '+slots.bairro),
    slots.quartos  && (slots.quartos+'+ quartos'),
    slots.valorMax && ('ate '+fmtVal(slots.valorMax)),
    slots.vagas    && (slots.vagas+'+ vagas'),
    slots.operacao && slots.operacao,
  ].filter(Boolean).join(' \u00B7 ');
  if (intencao === 'BUSCAR_IMOVEL' || (ctx.temDados && !intencao)) {
    const nome = slots.nomeCliente ? ' para <strong>'+slots.nomeCliente+'</strong>' : '';
    if (imoveisEncontrados.length === 0) {
      return '\uD83D\uDE14 Nenhum imovel encontrado'+nome+'.<br><span style="font-size:12px;color:#888">'+filtros+'</span><br><br>\uD83D\uDCA1 Quer cadastrar esse cliente como lead?<br><br>'+btn('Cadastrar lead','/app/leads')+chip('Demanda por bairro','demanda por bairro');
    }
    const top = [...imoveisEncontrados].sort((a,b)=>(Number(a.valor)||0)-(Number(b.valor)||0));
    const cards = top.slice(0,4).map(i => {
      const val  = i.valor   ? fmtVal(Number(i.valor)) : '-';
      const det  = [i.quartos?i.quartos+'q':'', i.vagas?i.vagas+'vg':'', i.area?i.area+'m2':''].filter(Boolean).join(' · ');
      const prop = i.proprietario&&i.proprietario.nome ? ' · '+i.proprietario.nome : '';
      return '<div style="background:#f9f9f9;border-radius:8px;padding:10px 12px;margin:4px 0;border-left:3px solid #ff385c"><strong>'+(i.tipo||'Imovel')+'</strong> - '+(i.bairro||'-')+'<br><span style="color:#ff385c;font-weight:700">'+val+'</span><span style="color:#555;font-size:12px"> '+det+prop+'</span></div>';
    }).join('');
    const rodape = imoveisEncontrados.length > 4 ? '<br><em style="color:#888;font-size:12px">...e mais '+(imoveisEncontrados.length-4)+' imoveis.</em>' : '';
    const leadExistente = leads.find(l => slots.bairro && l.bairro && semAcento(l.bairro).includes(semAcento(slots.bairro)));
    const avisoLead = leadExistente
      ? '<br><br>\uD83D\uDCA1 Ja tem lead com perfil parecido: <strong>'+(leadExistente.nome||leadExistente.email||'Lead')+'</strong>. Enviar vitrine?'+chip('Leads com match','leads com match')
      : '<br><br>\uD83D\uDCA1 Cadastrar esse cliente como lead?'+btn('Cadastrar lead','/app/leads');
    return '\uD83D\uDD0D <strong>'+imoveisEncontrados.length+' imovel(is)</strong>'+nome+'<br><span style="font-size:12px;color:#888">'+filtros+'</span><br><br>'+cards+rodape+avisoLead+'<br>'+btn('Ver todos','/app/imoveis');
  }
  if (intencao === 'CADASTRAR_LEAD') return '\uD83D\uDC64 Cadastrar lead'+(slots.nomeCliente?' - '+slots.nomeCliente:'')+(filtros?'<br><span style="font-size:12px;color:#888">'+filtros+'</span>':'')+'<br><br>'+btn('Cadastrar lead','/app/leads');
  if (intencao === 'CRIAR_VISITA')   return '\uD83D\uDCC5 Agendar visita'+(slots.nomeCliente?' para '+slots.nomeCliente:'')+'<br><br>'+btn('Ver visitas','/app/visitas')+chip('Visitas pendentes','visitas pendentes');
  if (intencao === 'FOLLOW_UP') {
    const frios = leads.filter(l => { const dias=(Date.now()-new Date(l.dataCriacao||l.createdAt||Date.now()))/86400000; return dias>3&&(!l.visitas||!l.visitas.length); });
    if (!frios.length) return 'Todas as leads tem interacao recente.';
    return '\uD83D\uDCF1 <strong>'+frios.length+' lead(s) para follow-up:</strong><br><br>'+frios.slice(0,5).map(l=>'- '+(l.nome||l.email||'Lead')+(l.bairro?' - '+l.bairro:'')).join('<br>')+'<br><br>'+btn('Ver leads','/app/leads');
  }
  if (intencao === 'AVISAR_PROP') return '\uD83D\uDC64 Acesse o imovel especifico para notificar o proprietario.<br><br>'+btn('Ver imoveis','/app/imoveis');
  if (intencao === 'INFORMAR')    return '\uD83D\uDCDD Para registrar venda ou saida, inative o imovel na carteira.<br><br>'+btn('Ver imoveis','/app/imoveis');
  return null;
}
module.exports = { analisar, responder, detectarIntencao, extrairNome };
