const fs = require('fs');
let pt = fs.readFileSync('cerebro/portugues.js','utf8');

const novos = `
  // "filtros" sem contexto
  if (/^filtros?$/.test(m.trim())) {
    return '\uD83D\uDD0D Filtros dispon\u00edveis em cada p\u00e1gina:<br><br>' +
      '<strong>\uD83C\uDFE0 Im\u00f3veis:</strong> tipo, bairro, valor, quartos, vagas, su\u00edtes, status, propriet\u00e1rio, fotos<br>' +
      '<strong>\uD83D\uDC65 Leads:</strong> status, bairro, tipo, match, data<br>' +
      '<strong>\uD83D\uDCC5 Visitas:</strong> status, data, cliente<br><br>' +
      btn('Ver im\u00f3veis', '/app/imoveis') + btn('Ver leads', '/app/leads');
  }

  // "me fale mais da app" / "o que ela faz" / "o que o sistema faz"
  if (/me fale mais|o que ela faz|o que o sistema|me conta mais|me explica o sistema|como funciona o sistema|o que voce sabe fazer/.test(m)) {
    return '\uD83C\uDFE0 <strong>MatchIm\u00f3veis</strong> \u00e9 um CRM inteligente para corretores:<br><br>' +
      '\uD83C\uDFE0 <strong>Im\u00f3veis</strong> \u2014 importe via XML, gerencie sua carteira, gere feed para portais<br>' +
      '\uD83D\uDC65 <strong>Leads</strong> \u2014 importe clientes, extraia perfil automaticamente, fa\u00e7a match<br>' +
      '\uD83C\uDFAF <strong>Match</strong> \u2014 cruza bairro+tipo+quartos e encontra o im\u00f3vel certo para cada lead<br>' +
      '\uD83D\uDD17 <strong>Vitrine</strong> \u2014 p\u00e1gina personalizada para o cliente ver e agendar visita<br>' +
      '\uD83D\uDCC5 <strong>Visitas</strong> \u2014 agende, confirme e acompanhe visitas<br>' +
      '\uD83D\uDD14 <strong>Notifica\u00e7\u00f5es</strong> \u2014 alertas de visita, match e pendente<br>' +
      '\uD83E\uDD96 <strong>Portais</strong> \u2014 gere XML para VivaReal, ZAP, OLX, ImovelWeb e mais<br>' +
      '\uD83E\uDD16 <strong>Assistente</strong> \u2014 sou eu! Seu CRM por conversa<br><br>' +
      btn('Dashboard', '/app-home') + chip('O que fazer hoje', 'o que devo fazer hoje');
  }

  // "porque nao esta salvando" / memoria do chat
  if (/porque nao esta salvando|nao salva|perdeu o historico|sumir as mensagens|onde paramos|continuar de onde/.test(m)) {
    return '\uD83D\uDCBE <strong>Sobre a mem\u00f3ria do chat:</strong><br><br>' +
      'O assistente salva o hist\u00f3rico de perguntas e respostas em <code>assistente-memoria.json</code>.<br><br>' +
      'Por\u00e9m, <strong>cada nova sess\u00e3o come\u00e7a do zero visualmente</strong> \u2014 o chat n\u00e3o mostra mensagens anteriores na tela, mas eu lembro do seu perfil e prefer\u00eancias.<br><br>' +
      '\uD83D\uDCA1 Para continuar de onde parou, basta me contar o contexto: <em>"estava buscando leads no Balne\u00e1rio"</em> e eu retomo!<br><br>' +
      chip('O que fazer hoje', 'o que devo fazer hoje') + chip('Resumo geral', 'resumo geral');
  }

  // "quais as dicas pra hoje" / "onde posso melhorar"
  if (/dicas (pra|para) hoje|onde (posso |eu )?melhorar|como melhorar|o que melhorar|minha performance|meu desempenho/.test(m)) {
    const semMatch = leads.filter(l => !(l.matchesBase && l.matchesBase.length > 0));
    const semProp  = imoveis.filter(i => i.status !== 'inativo' && (!i.proprietario || !i.proprietario.nome));
    const dicas = [];
    if (semMatch.length > 0) dicas.push('\uD83D\uDCCB <strong>' + semMatch.length + ' leads sem match</strong> \u2014 verifique se tem im\u00f3veis nos bairros certos ' + chip('Demanda por bairro', 'demanda por bairro'));
    if (semProp.length > 0)  dicas.push('\uD83D\uDC64 <strong>' + semProp.length + ' im\u00f3veis sem propriet\u00e1rio</strong> \u2014 importe os dados para agilizar visitas ' + chip('Im\u00f3veis sem propriet\u00e1rio', 'imoveis sem proprietario'));
    const semFoto = imoveis.filter(i => i.status !== 'inativo' && (!i.fotos || i.fotos.length === 0));
    if (semFoto.length > 0)  dicas.push('\uD83D\uDCF8 <strong>' + semFoto.length + ' im\u00f3veis sem foto</strong> \u2014 portais rejeitam im\u00f3veis sem imagem');
    if (!dicas.length) return '\uD83C\uDF89 Tudo em ordem! Nenhuma melhoria urgente agora.' + chip('Resumo geral', 'resumo geral');
    return '\uD83D\uDCA1 <strong>Onde voc\u00ea pode melhorar agora:</strong><br><br>' + dicas.join('<br><br>') + '<br><br>' + btn('Dashboard', '/app-home');
  }

  // "buscar por valor" / "ate 300k" / "imoveis ate X"
  if (/buscar por valor|filtrar por valor|imoveis? (ate|abaixo|menos de)|ate \d/.test(m)) {
    const vM   = m.match(/ate\s+(\d+[,.]?\d*)\s*milh/);
    const vMil = m.match(/ate\s+(\d+[,.]?\d*)\s*mil/);
    const vK   = m.match(/ate\s+(\d+[,.]?\d*)\s*k\b/);
    const vNum = m.match(/ate\s+(\d[\d.,]+)/);
    let valorMax = null;
    if (vM)        valorMax = parseFloat(vM[1].replace(',','.')) * 1000000;
    else if (vMil) valorMax = parseFloat(vMil[1].replace(',','.')) * 1000;
    else if (vK)   valorMax = parseFloat(vK[1].replace(',','.')) * 1000;
    else if (vNum) valorMax = parseFloat(vNum[1].replace(/\./g,'').replace(',','.'));
    if (!valorMax) return 'Qual valor m\u00e1ximo voc\u00ea quer buscar?<br><br>' + chip('At\u00e9 300k', 'imoveis ate 300 mil') + chip('At\u00e9 500k', 'imoveis ate 500 mil') + chip('At\u00e9 800k', 'imoveis ate 800 mil');
    const r = imoveis.filter(i => i.status !== 'inativo' && i.valor && Number(i.valor) <= valorMax);
    r.sort((a,b) => Number(a.valor) - Number(b.valor));
    if (!r.length) return '\uD83D\uDE14 Nenhum im\u00f3vel ativo at\u00e9 R$ ' + valorMax.toLocaleString('pt-BR') + '.' + btn('Ver todos', '/app/imoveis');
    const fmtVal = v => 'R$ ' + Number(v).toLocaleString('pt-BR');
    return '\uD83D\uDD0D <strong>' + r.length + ' im\u00f3vel(is) at\u00e9 ' + fmtVal(valorMax) + ':</strong><br><br>' +
      r.slice(0,5).map(i => '\u2022 <strong>' + (i.tipo||'Im\u00f3vel') + '</strong> ' + (i.quartos?i.quartos+'q':'') + ' \u2014 ' + (i.bairro||'') + ' \u00b7 <strong>' + fmtVal(i.valor) + '</strong>').join('<br>') +
      (r.length > 5 ? '<br><em>...e mais ' + (r.length-5) + '</em>' : '') +
      '<br><br>' + btn('Ver todos', '/app/imoveis');
  }

`;

const marca = '  // ── PADRÕES APRENDIDOS DO HISTÓRICO REAL';
if (pt.includes(marca) && !pt.includes('porque nao esta salvando')) {
  pt = pt.replace(marca, novos + '\n  ' + marca);
  fs.writeFileSync('cerebro/portugues.js', pt);
  console.log('ok — novos padroes adicionados');
} else {
  console.log('ja existe ou marca nao encontrada');
}
