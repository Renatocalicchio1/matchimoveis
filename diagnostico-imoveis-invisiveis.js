// Diagnóstico read-only (não altera nada): lista os imóveis de uma conta e
// diz exatamente por que cada um passa ou não em imovelVisivelPublico()
// (services/salvarImovel.js) — o filtro que decide o que aparece em
// /imovel/:id, /portal, /site/:codigo etc. Sem foto OU valor abaixo do
// mínimo (R$150.000 venda / R$500 aluguel) faz o imóvel cair no mesmo
// "não encontrado" genérico da página pública, mesmo existindo de verdade.
//
// Como rodar (Render Shell, dentro de /opt/render/project/src/):
//   node diagnostico-imoveis-invisiveis.js VIS-NR59

const { lerImoveis, imovelVisivelPublico } = require('./services/salvarImovel');

const VALOR_MINIMO_VENDA = 150000;
const VALOR_MINIMO_ALUGUEL = 500;

function motivoInvisivel(im) {
  const motivos = [];
  if (!im.fotos || !im.fotos.length) motivos.push('sem foto');
  const valor = parseFloat(im.valor_imovel) || 0;
  const transacao = String(im.transacao || '').toLowerCase();
  const minimo = transacao.includes('alug') ? VALOR_MINIMO_ALUGUEL : VALOR_MINIMO_VENDA;
  if (valor < minimo) motivos.push(`valor R$${valor.toLocaleString('pt-BR')} abaixo do mínimo (R$${minimo.toLocaleString('pt-BR')} pra ${transacao || 'venda'})`);
  if (im.status === 'inativo' || im.status === 'excluido') motivos.push('status ' + im.status);
  return motivos;
}

async function main() {
  const codigoUsuario = process.argv[2];
  if (!codigoUsuario) {
    console.error('Uso: node diagnostico-imoveis-invisiveis.js <codigoUsuario>');
    process.exit(1);
  }
  console.log('[diagnostico] buscando imóveis de', codigoUsuario, '...');
  const imoveis = await lerImoveis(codigoUsuario);
  if (!imoveis.length) {
    console.log('[diagnostico] nenhum imóvel encontrado pra essa conta (nem interno) — problema pode ser de dono/vínculo, não de visibilidade pública.');
    return;
  }
  console.log('[diagnostico]', imoveis.length, 'imóvel(is) encontrado(s) na conta.\n');

  let visiveis = 0, invisiveis = 0;
  for (const im of imoveis) {
    const ok = imovelVisivelPublico(im);
    if (ok) { visiveis++; continue; }
    invisiveis++;
    const motivos = motivoInvisivel(im);
    console.log('❌', im.id || im.idInterno, '—', im.titulo || '(sem título)', '—', motivos.join(', ') || '(motivo não identificado)');
  }
  console.log('\n[diagnostico] resumo:', visiveis, 'visíveis publicamente,', invisiveis, 'invisíveis (dando "não encontrado" se alguém clicar no link).');
}

main().then(() => process.exit(0)).catch(e => { console.error('[diagnostico] erro:', e.message); process.exit(1); });
