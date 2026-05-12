function soData(d) {
  if (!d) return '';
  const dt = new Date(d);
  if (isNaN(dt)) return '';
  return dt.toISOString().slice(0,10);
}

function hojeISO() {
  return new Date().toISOString().slice(0,10);
}

function addDias(n) {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0,10);
}

function extrairPeriodo(m) {
  const hoje = hojeISO();

  if (/amanha|amanhã/.test(m)) return { tipo:'dia', data:addDias(1), label:'amanhã' };
  if (/hoje/.test(m)) return { tipo:'dia', data:hoje, label:'hoje' };
  if (/ontem/.test(m)) return { tipo:'dia', data:addDias(-1), label:'ontem' };

  const match = m.match(/(\d{1,2})[\/\-](\d{1,2})(?:[\/\-](\d{2,4}))?/);
  if (match) {
    const dia = String(match[1]).padStart(2,'0');
    const mes = String(match[2]).padStart(2,'0');
    let ano = match[3] || String(new Date().getFullYear());
    if (ano.length === 2) ano = '20' + ano;
    return { tipo:'dia', data:`${ano}-${mes}-${dia}`, label:`${dia}/${mes}/${ano}` };
  }

  if (/proxima semana|próxima semana/.test(m)) {
    return { tipo:'range', inicio:addDias(1), fim:addDias(7), label:'próxima semana' };
  }

  if (/essa semana|esta semana/.test(m)) {
    return { tipo:'range', inicio:hoje, fim:addDias(7), label:'esta semana' };
  }

  return null;
}

function dentroPeriodo(data, periodo) {
  const d = soData(data);
  if (!d || !periodo) return false;

  if (periodo.tipo === 'dia') return d === periodo.data;
  if (periodo.tipo === 'range') return d >= periodo.inicio && d <= periodo.fim;

  return false;
}

function dataLead(l) {
  return l.createdAt || l.dataCriacao || l.processedAt || l.importedAt || l.data || '';
}

function dataImovel(i) {
  return i.createdAt || i.cadastradoEm || i.importedAt || i.lastUpdate || i.updatedAt || i.data || '';
}

function dataVisita(v) {
  return v.dataVisita || v.dataPreferida || v.data || v.createdAt || '';
}

function responder(mNorm, d, imoveis, leads, visitas, btn, chip) {
  const periodo = extrairPeriodo(mNorm);
  if (!periodo) return null;

  const querLeads = /lead|leads|cliente|clientes/.test(mNorm);
  const querImoveis = /imovel|imóveis|imoveis|carteira/.test(mNorm);
  const querVisitas = /visita|visitas|agenda|agendamento/.test(mNorm);

  if (querVisitas) {
    const lista = (visitas || []).filter(v => dentroPeriodo(dataVisita(v), periodo));
    if (!lista.length) {
      return `📅 Nenhuma visita encontrada para <strong>${periodo.label}</strong>.<br><br>${btn('Ver visitas','/app/visitas')}`;
    }

    return `📅 <strong>${lista.length} visita(s) para ${periodo.label}:</strong><br><br>` +
      lista.slice(0,10).map(v =>
        '• <strong>' + (v.nome || v.leadNome || 'Cliente') + '</strong>' +
        ' — ' + (v.dataVisita || v.dataPreferida || '-') +
        (v.horaVisita ? ' às ' + v.horaVisita : '') +
        (v.imovelBairro ? ' · ' + v.imovelBairro : '')
      ).join('<br>') +
      (lista.length > 10 ? '<br><em>...e mais ' + (lista.length - 10) + '</em>' : '') +
      '<br><br>' + btn('Ver visitas','/app/visitas');
  }

  if (querLeads) {
    const lista = (leads || []).filter(l => dentroPeriodo(dataLead(l), periodo));
    if (!lista.length) {
      return `👥 Nenhuma lead encontrada em <strong>${periodo.label}</strong>.<br><br>${btn('Ver leads','/app/leads')}`;
    }

    return `👥 <strong>${lista.length} lead(s) de ${periodo.label}:</strong><br><br>` +
      lista.slice(0,10).map(l =>
        '• <strong>' + (l.nome || l.email || 'Lead') + '</strong>' +
        (l.bairro ? ' — ' + l.bairro : '') +
        (l.tipo ? ' · ' + l.tipo : '')
      ).join('<br>') +
      (lista.length > 10 ? '<br><em>...e mais ' + (lista.length - 10) + '</em>' : '') +
      '<br><br>' + btn('Ver leads','/app/leads');
  }

  if (querImoveis) {
    const lista = (imoveis || []).filter(i => dentroPeriodo(dataImovel(i), periodo));
    if (!lista.length) {
      return `🏠 Nenhum imóvel encontrado em <strong>${periodo.label}</strong>.<br><br>${btn('Ver imóveis','/app/imoveis')}`;
    }

    return `🏠 <strong>${lista.length} imóvel(is) de ${periodo.label}:</strong><br><br>` +
      lista.slice(0,10).map(i =>
        '• <strong>' + (i.tipo || 'Imóvel') + '</strong>' +
        (i.bairro ? ' — ' + i.bairro : '') +
        (i.valor_imovel ? ' · R$ ' + Number(i.valor_imovel).toLocaleString('pt-BR') : '')
      ).join('<br>') +
      (lista.length > 10 ? '<br><em>...e mais ' + (lista.length - 10) + '</em>' : '') +
      '<br><br>' + btn('Ver imóveis','/app/imoveis');
  }

  return null;
}

module.exports = { responder, extrairPeriodo, dentroPeriodo };
