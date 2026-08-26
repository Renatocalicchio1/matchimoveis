// Diagnóstico read-only (não altera nada): diz exatamente por que UM
// imóvel específico não aparece na página pública /imovel/:id — mesma
// lógica de busca (id/id_externo/id_interno/codigo_imovel) e de
// visibilidade (imovelVisivelPublico) que a rota real usa.
//
// Como rodar (Render Shell, dentro de /opt/render/project/src/):
//   node diagnostico-imovel-id.js MI-1787772016638-ZRTCTI

const { query } = require('./services/db');
const { rowToImovel, imovelVisivelPublico } = require('./services/salvarImovel');

const VALOR_MINIMO_VENDA = 150000;
const VALOR_MINIMO_ALUGUEL = 500;

async function main() {
  const id = process.argv[2];
  if (!id) {
    console.error('Uso: node diagnostico-imovel-id.js <id>');
    process.exit(1);
  }
  console.log('[diagnostico-id] buscando', id, '...');
  const { rows } = await query('SELECT * FROM imoveis WHERE id=$1 OR id_externo=$1 OR id_interno=$1 OR codigo_imovel=$1 LIMIT 1', [id]);
  if (!rows.length) {
    console.log('[diagnostico-id] ❌ NÃO existe nenhuma linha na tabela imoveis com esse id/id_externo/id_interno/codigo_imovel — o cadastro pode não ter salvo de verdade (ex: erro depois do redirect, ou ID copiado errado).');
    return;
  }
  const im = rowToImovel(rows[0]);
  console.log('[diagnostico-id] ✅ encontrado — id:', im.id, '| idInterno:', im.idInterno, '| título:', im.titulo || '(sem título)');
  console.log('[diagnostico-id] dono (userId/usuarioId/codigoUsuario/corretorId):', im.userId || im.usuarioId || im.codigoUsuario || im.corretorId || '(nenhum campo de dono preenchido!)');
  console.log('[diagnostico-id] status:', im.status || '(vazio)');
  console.log('[diagnostico-id] fotos:', (im.fotos || []).length);
  console.log('[diagnostico-id] transacao:', im.transacao, '| valor_imovel:', im.valorImovel || im.valor_imovel);

  if (im.status === 'inativo' || im.status === 'excluido') {
    console.log('\n[diagnostico-id] MOTIVO: status "' + im.status + '" — imóvel desativado/excluído, some de tudo que é público.');
    return;
  }
  if (!im.fotos || !im.fotos.length) {
    console.log('\n[diagnostico-id] MOTIVO: sem foto nenhuma — a página pública mostra "cadastro em finalização" em vez do anúncio (não é 404, mas também não aparece completo).');
    return;
  }
  const valor = parseFloat(im.valorImovel || im.valor_imovel) || 0;
  const transacao = String(im.transacao || '').toLowerCase();
  const minimo = transacao.includes('alug') ? VALOR_MINIMO_ALUGUEL : VALOR_MINIMO_VENDA;
  if (valor < minimo) {
    console.log('\n[diagnostico-id] MOTIVO: valor R$' + valor.toLocaleString('pt-BR') + ' abaixo do mínimo (R$' + minimo.toLocaleString('pt-BR') + ' pra ' + (transacao || 'venda') + ') — cai no "Imóvel não encontrado" genérico da página pública, mesmo existindo.');
    return;
  }
  const visivel = imovelVisivelPublico(im);
  console.log('\n[diagnostico-id]', visivel ? '✅ passa em imovelVisivelPublico() — deveria estar aparecendo normal na página pública.' : '❌ NÃO passa em imovelVisivelPublico() por outro motivo não coberto acima — investigar o código.');
}

main().then(() => process.exit(0)).catch(e => { console.error('[diagnostico-id] erro:', e.message); process.exit(1); });
