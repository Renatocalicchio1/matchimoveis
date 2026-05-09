const fs = require('fs');
let pt = fs.readFileSync('cerebro/portugues.js','utf8');

const novosBlocos = `
  // ── LEADS COM VITRINE ────────────────────────────────────────────────────────
  if (/leads? (com|que tem|que gerou|que tem|com) vitrine|vitrine gerada|quais (leads?|clientes?) (tem|gerou|com) vitrine|leads? (que|com) link/.test(m)) {
    const comVitrine = leads.filter(l => l.matchesBase && l.matchesBase.length > 0);
    if (!comVitrine.length) return 'Nenhuma lead tem vitrine ainda. Fa\u00e7a o match primeiro.<br><br>'+btn('Ver leads','/app/leads');
    return '\uD83D\uDD17 <strong>'+comVitrine.length+' lead(s) com vitrine dispon\u00edvel:</strong><br><br>'+
      comVitrine.slice(0,8).map(l=>'<div style="background:#f9f9f9;border-radius:8px;padding:8px 12px;margin:3px 0">'+
        '<strong>'+(l.nome||l.email||'Lead')+'</strong>'+(l.bairro?' \u2014 '+l.bairro:'')+' \u00b7 '+l.matchesBase.length+' im\u00f3vel(is)<br>'+
        '<a href="/cliente/oferta/'+l.id+'" style="font-size:12px;color:#ff385c" target="_blank">\uD83D\uDD17 /cliente/oferta/'+l.id+'</a>'+
      '</div>').join('')+
      (comVitrine.length>8?'<br><em>...e mais '+(comVitrine.length-8)+'</em>':'')+
      '<br>'+btn('Ver todas as leads','/app/leads');
  }

  // ── LEADS SEM VITRINE (com match mas sem visita) ──────────────────────────
  if (/leads? (sem|que nao|ainda nao) (viram|receberam|acessaram|tem) vitrine|nao enviou vitrine|faltam enviar vitrine/.test(m)) {
    const semVisita = leads.filter(l => l.matchesBase && l.matchesBase.length > 0 &&
      (!visitas || !visitas.some(v => String(v.leadId||'') === String(l.id||''))));
    if (!semVisita.length) return '\uD83C\uDF89 Todas as leads com match j\u00e1 t\u00eam visita agendada!';
    return '\uD83D\uDCE4 <strong>'+semVisita.length+' lead(s) com vitrine mas sem visita ainda:</strong><br><br>'+
      semVisita.slice(0,6).map(l=>'<div style="background:#f9f9f9;border-radius:8px;padding:8px 12px;margin:3px 0">'+
        '<strong>'+(l.nome||l.email||'Lead')+'</strong>'+(l.bairro?' \u2014 '+l.bairro:'')+
        '<br><a href="/cliente/oferta/'+l.id+'" style="font-size:12px;color:#ff385c">\uD83D\uDD17 Enviar vitrine</a>'+
      '</div>').join('')+
      '<br>'+btn('Ver leads','/app/leads');
  }

  // ── VISITAS AGUARDANDO PROPRIETÁRIO ──────────────────────────────────────
  if (/visitas? (falta|aguarda|espera|pendente|proprietario ainda|que o proprietario|sem resposta do proprietario|nao aceitou|nao confirmou)|proprietario (nao|ainda nao) (aceitou|confirmou|respondeu)/.test(m)) {
    const pendentes = visitas.filter(v => v.status === 'solicitada' || v.status === 'pendente');
    if (!pendentes.length) return '\uD83C\uDF89 Nenhuma visita aguardando propriet\u00e1rio! Tudo em dia.'+btn('Ver visitas','/app/visitas');
    return '\u23F3 <strong>'+pendentes.length+' visita(s) aguardando propriet\u00e1rio:</strong><br><br>'+
      pendentes.slice(0,6).map(v=>'<div style="background:#fff8f0;border-radius:8px;padding:8px 12px;margin:3px 0;border-left:3px solid #f59e0b">'+
        '\uD83D\uDC64 <strong>'+(v.nome||v.cliente?.nome||v.leadNome||'Cliente')+'</strong><br>'+
        '\uD83C\uDFE0 '+(v.imovelTitulo||v.imovel?.tipo||'Im\u00f3vel')+(v.imovelBairro?' em '+v.imovelBairro:'')+
        (v.dataVisita?'<br>\uD83D\uDCC5 '+v.dataVisita+(v.horaVisita?' \u00e0s '+v.horaVisita:''):'')+
      '</div>').join('')+
      '<br>'+btn('Ver visitas','/app/visitas')+chip('Confirmar visitas','visitas pendentes');
  }

  // ── VISITAS CONFIRMADAS ───────────────────────────────────────────────────
  if (/visitas? confirmadas?|quais (visitas?|agendamentos?) (foram|estao) confirmad/.test(m)) {
    const conf = visitas.filter(v => v.status === 'confirmada');
    if (!conf.length) return 'Nenhuma visita confirmada ainda.'+btn('Ver visitas','/app/visitas');
    return '\u2705 <strong>'+conf.length+' visita(s) confirmada(s):</strong><br><br>'+
      conf.slice(0,6).map(v=>'<div style="background:#f0fdf4;border-radius:8px;padding:8px 12px;margin:3px 0;border-left:3px solid #22c55e">'+
        '\uD83D\uDC64 <strong>'+(v.nome||v.leadNome||'Cliente')+'</strong><br>'+
        '\uD83C\uDFE0 '+(v.imovelTitulo||'Im\u00f3vel')+(v.imovelBairro?' em '+v.imovelBairro:'')+
        (v.dataVisita?'<br>\uD83D\uDCC5 '+v.dataVisita+(v.horaVisita?' \u00e0s '+v.horaVisita:''):'')+
      '</div>').join('')+
      '<br>'+btn('Ver visitas','/app/visitas');
  }

  // ── IMÓVEIS PARADOS (sem visita há 30+ dias) ──────────────────────────────
  if (/imoveis? parados?|sem visita ha|imoveis? sem movimento|imoveis? encalhados?|parado sem visita/.test(m)) {
    const visitadosIds = new Set((visitas||[]).map(v=>String(v.imovelId||'')).filter(Boolean));
    const parados = imoveis.filter(i => i.status !== 'inativo' && !visitadosIds.has(String(i.id||i.idExterno||'')));
    if (!parados.length) return '\uD83C\uDF89 Todos os im\u00f3veis ativos j\u00e1 tiveram visita!';
    return '\uD83D\uDCC9 <strong>'+parados.length+' im\u00f3vel(is) ativo(s) sem visita:</strong><br><br>'+
      parados.slice(0,6).map(i=>'<div style="background:#f9f9f9;border-radius:8px;padding:8px 12px;margin:3px 0">'+
        '<strong>'+(i.tipo||'Im\u00f3vel')+'</strong> '+(i.quartos?i.quartos+'q ':'')+'\u2014 '+(i.bairro||'-')+
        (i.valor?' \u00b7 R$ '+Number(i.valor).toLocaleString('pt-BR'):'')+
      '</div>').join('')+
      '<br>'+btn('Ver im\u00f3veis','/app/imoveis')+chip('Reduzir valor','valor medio da carteira');
  }

  // ── IMÓVEIS SEM FOTO ──────────────────────────────────────────────────────
  if (/imoveis? (sem|sem nenhuma|sem) foto|sem imagem|nao tem foto|falta foto/.test(m)) {
    const semFoto = imoveis.filter(i => i.status !== 'inativo' && (!i.fotos || i.fotos.length === 0));
    if (!semFoto.length) return '\uD83D\uDCF8 Todos os im\u00f3veis ativos t\u00eam foto! \uD83D\uDC4F';
    return '\uD83D\uDCF8 <strong>'+semFoto.length+' im\u00f3vel(is) sem foto:</strong><br><br>'+
      semFoto.slice(0,6).map(i=>'\u2022 <strong>'+(i.tipo||'Im\u00f3vel')+'</strong> \u2014 '+(i.bairro||'-')+(i.valor?' \u00b7 R$ '+Number(i.valor).toLocaleString('pt-BR'):'')).join('<br>')+
      '<br><br>\uD83D\uDCA1 Portais como VivaReal e ZAP rejeitam im\u00f3veis sem foto.<br>'+btn('Ver im\u00f3veis','/app/imoveis');
  }

  // ── BAIRROS COM LEAD MAS SEM IMÓVEL ──────────────────────────────────────
  if (/bairros? (sem imovel|que nao tem imovel|com lead mas sem|nao cobertos?|falta imovel)|oportunidade de captacao|onde falta imovel/.test(m)) {
    const bairrosLeads = {};
    leads.forEach(l => { if(l.bairro) bairrosLeads[l.bairro]=(bairrosLeads[l.bairro]||0)+1; });
    const bairrosIm = new Set(imoveis.filter(i=>i.status!=='inativo').map(i=>i.bairro).filter(Boolean));
    const oportunidades = Object.entries(bairrosLeads)
      .filter(([b]) => !bairrosIm.has(b))
      .sort((a,b)=>b[1]-a[1]).slice(0,8);
    if (!oportunidades.length) return '\uD83C\uDF89 Voc\u00ea tem im\u00f3veis em todos os bairros demandados!';
    return '\uD83D\uDEA8 <strong>Oportunidades de capta\u00e7\u00e3o — bairros com demanda mas sem im\u00f3vel:</strong><br><br>'+
      oportunidades.map(([b,n],i)=>(i+1)+'. <strong>'+b+'</strong> \u2014 '+n+' lead'+(n>1?'s':'')+' sem op\u00e7\u00e3o').join('<br>')+
      '<br><br>\uD83D\uDCA1 Capte im\u00f3veis nesses bairros para fechar mais neg\u00f3cios!<br>'+btn('Ver leads','/app/leads')+chip('Demanda por bairro','demanda por bairro');
  }

  // ── QUAL LEAD TEM MAIS MATCH ──────────────────────────────────────────────
  if (/lead (com mais|que tem mais) (match|opcoes|imoveis?)|mais (match|opcoes) para qual lead|ranking de match/.test(m)) {
    const ranking = leads
      .filter(l => l.matchesBase && l.matchesBase.length > 0)
      .sort((a,b)=>(b.matchesBase?.length||0)-(a.matchesBase?.length||0))
      .slice(0,6);
    if (!ranking.length) return 'Nenhuma lead com match ainda.'+btn('Ver leads','/app/leads');
    return '\uD83C\uDFC6 <strong>Leads com mais op\u00e7\u00f5es de im\u00f3vel:</strong><br><br>'+
      ranking.map((l,i)=>(i+1)+'. <strong>'+(l.nome||l.email||'Lead')+'</strong>'+(l.bairro?' \u2014 '+l.bairro:'')+' \u00b7 <strong>'+l.matchesBase.length+' im\u00f3vel(is)</strong>').join('<br>')+
      '<br><br>'+btn('Ver leads','/app/leads')+chip('Enviar vitrine','enviar vitrine para cliente');
  }

  // ── LEADS QUENTES (com match + visita solicitada) ─────────────────────────
  if (/leads? quentes?|leads? mais (interessadas?|avancadas?|proximas?)|prontas? para fechar|mais chances?/.test(m)) {
    const quentes = leads.filter(l => {
      const temMatch = l.matchesBase && l.matchesBase.length > 0;
      const temVisita = visitas && visitas.some(v => String(v.leadId||'') === String(l.id||''));
      return temMatch && temVisita;
    });
    const mornos = leads.filter(l => l.matchesBase && l.matchesBase.length > 0 &&
      (!visitas || !visitas.some(v => String(v.leadId||'') === String(l.id||''))));
    let resp = '';
    if (quentes.length) {
      resp += '\uD83D\uDD25 <strong>'+quentes.length+' lead(s) QUENTE(S) — match + visita:</strong><br><br>'+
        quentes.slice(0,4).map(l=>'<div style="background:#fff8f0;border-radius:8px;padding:8px 12px;margin:3px 0;border-left:3px solid #ff385c">'+
          '\uD83D\uDC64 <strong>'+(l.nome||l.email||'Lead')+'</strong>'+(l.bairro?' \u2014 '+l.bairro:'')+
          '<br><a href="/cliente/oferta/'+l.id+'" style="font-size:12px;color:#ff385c">\uD83D\uDD17 Vitrine</a>'+
        '</div>').join('');
    }
    if (mornos.length) {
      resp += '<br>\uD83D\uDFE1 <strong>'+mornos.length+' lead(s) MORNA(S) — match mas sem visita:</strong><br><br>'+
        mornos.slice(0,3).map(l=>'\u2022 '+(l.nome||l.email||'Lead')+(l.bairro?' \u2014 '+l.bairro:'')).join('<br>');
    }
    if (!resp) return 'Nenhuma lead com match ainda.'+btn('Ver leads','/app/leads');
    return resp+'<br><br>'+btn('Ver leads','/app/leads');
  }

`;

const marca = '  return null;\n}\nfunction interpretar(mensagem,';
const marca2 = '  return null;\n}\nfunction interpretar(mensagem, d,';
const pos = pt.includes(marca) ? pt.lastIndexOf(marca) : pt.lastIndexOf(marca2);
if (pos !== -1) {
  pt = pt.slice(0, pos) + novosBlocos + pt.slice(pos);
  fs.writeFileSync('cerebro/portugues.js', pt);
  console.log('ok — ' + (novosBlocos.match(/if \(/g)||[]).length + ' novos padroes');
} else {
  console.log('marca nao encontrada');
}
