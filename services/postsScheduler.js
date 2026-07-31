// imagemEscolhida é TEXT — pode ser url unica (posts antigos, sem carrossel)
// ou JSON de array (selecao+ordem de fotos escolhida no card de preview)
function _decodificarImagemEscolhida(v) {
  if (!v) return [];
  try { const a = JSON.parse(v); return Array.isArray(a) ? a : [v]; }
  catch(e) { return [v]; }
}

// Roda a cada 1 minuto: publica no Instagram os posts com status='agendado'
// cuja data_agendada já chegou.
async function processarPostsAgendados() {
  try {
    const { listarPostsAgendadosVencidos, atualizarPost } = require('./salvarPost');
    const vencidos = await listarPostsAgendadosVencidos();
    if (!vencidos.length) return;

    const { lerUsuarios } = require('./salvarUsuario');
    const { publicarFeed } = require('./instagram');
    const { consumir, saldo } = require('./creditos');
    const usuarios = await lerUsuarios();

    for (const post of vencidos) {
      try {
        const user = usuarios.find(u => u.id === post.userId || u.codigoUsuario === post.userId || u.codigo_usuario === post.userId);
        if (!user || !user.instagramToken || !user.instagramContaId) {
          await atualizarPost(post.id, { status: 'erro', erro: 'Instagram não conectado no momento da publicação.' });
          continue;
        }
        const saldoAtual = await saldo(post.userId);
        const { CUSTO } = require('./creditos');
        if (saldoAtual < CUSTO.postar_instagram) {
          await atualizarPost(post.id, { status: 'erro', erro: 'Saldo insuficiente no momento da publicação.' });
          continue;
        }
        const imagens = _decodificarImagemEscolhida(post.imagemEscolhida);
        const resultado = await publicarFeed(user.instagramContaId, user.instagramToken, imagens, post.legenda || '');
        await consumir(post.userId, 'postar_instagram').catch(()=>{});
        await atualizarPost(post.id, { status: 'postado', dataPublicado: new Date().toISOString(), resultado });
        console.log('[postsScheduler] publicado:', post.id, post.userId);
      } catch(e) {
        console.error('[postsScheduler] erro ao publicar post', post.id, ':', e.message);
        await atualizarPost(post.id, { status: 'erro', erro: e.message }).catch(()=>{});
      }
    }
  } catch(e) {
    console.error('[postsScheduler] erro geral:', e.message);
  }
}

function iniciarPostsScheduler() {
  console.log('[postsScheduler] ⏱️ Scheduler de posts agendados iniciado');
  setInterval(processarPostsAgendados, 60 * 1000);
  setTimeout(processarPostsAgendados, 20000);
}

module.exports = { iniciarPostsScheduler, processarPostsAgendados };
