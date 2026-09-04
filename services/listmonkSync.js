// services/listmonkSync.js — integração MatchImóveis -> Listmonk (painel de
// disparo self-hosted, ver infra/email-marketing/). Duas responsabilidades:
//
//   1. sincronizarContatosListmonk() — importa/atualiza os contatos de
//      campanha_contatos (mesma fonte que já alimenta o disparo via SES,
//      services/campanha.js — ~118k linhas hoje) como "subscribers" no
//      Listmonk, sem duplicar a lógica de quem é elegível (reaproveita a
//      mesma exclusão "já é usuário cadastrado" que services/campanha.js
//      já usa).
//   2. dispararLoteDoWarmup({inicio, fim, diaWarmup}) — chamado por
//      infra/email-marketing/warmup-schedule.js: cria uma lista no
//      Listmonk só com a fatia [inicio, fim) do aquecimento e sobe uma
//      campanha pra ela.
//
// ⚠️ Escrito e validado só como sintaxe — não tenho como testar contra uma
// instância real do Listmonk daqui (sem VPS/rede pra isso neste ambiente).
// Confere o formato exato de resposta da API na primeira rodada real e
// ajusta se a versão do Listmonk instalada divergir (API pode mudar entre
// versões maiores).
//
// Variáveis de ambiente esperadas:
//   LISTMONK_URL       — ex: http://SEU_IP_DA_VPS:9000 (ou https:// atrás de proxy)
//   LISTMONK_API_USER  — usuário de API criado em Settings → Users no Listmonk
//   LISTMONK_API_TOKEN — token gerado junto com o usuário de API

const { query } = require('./db');

const LISTMONK_URL = (process.env.LISTMONK_URL || '').replace(/\/$/, '');
const LISTMONK_API_USER = process.env.LISTMONK_API_USER || '';
const LISTMONK_API_TOKEN = process.env.LISTMONK_API_TOKEN || '';

// CTA das campanhas de aquecimento — domínio principal (não o
// matchimoveis.online, que é só o domínio de ENVIO) + ?cadastro=1 (abre o
// modal de cadastro direto, mesmo padrão já usado no resto da plataforma,
// ver CLAUDE.md "Páginas de conteúdo SEO/AEO").
const BASE_URL_MATCHIMOVEIS_CADASTRO = 'https://www.matchimoveis.ia.br/?cadastro=1';

function _authHeader() {
  const cred = Buffer.from(`${LISTMONK_API_USER}:${LISTMONK_API_TOKEN}`).toString('base64');
  return { Authorization: `Basic ${cred}`, 'Content-Type': 'application/json' };
}

function _checarConfig() {
  if (!LISTMONK_URL || !LISTMONK_API_USER || !LISTMONK_API_TOKEN) {
    throw new Error('LISTMONK_URL / LISTMONK_API_USER / LISTMONK_API_TOKEN não configurados (variáveis de ambiente).');
  }
}

async function _listmonkFetch(caminho, opcoes = {}) {
  _checarConfig();
  const resp = await fetch(LISTMONK_URL + caminho, {
    ...opcoes,
    headers: { ..._authHeader(), ...(opcoes.headers || {}) }
  });
  const texto = await resp.text();
  let corpo;
  try { corpo = texto ? JSON.parse(texto) : {}; } catch (e) { corpo = { raw: texto }; }
  if (!resp.ok) {
    throw new Error(`Listmonk ${opcoes.method || 'GET'} ${caminho} -> HTTP ${resp.status}: ${JSON.stringify(corpo).slice(0, 300)}`);
  }
  return corpo;
}

// Cria a lista "MatchImóveis - Base Geral" se ainda não existir, devolve o
// ID dela. Listmonk não tem upsert-por-nome nativo, então lista primeiro.
let _idListaGeralCache = null;
async function _garantirListaGeral() {
  if (_idListaGeralCache) return _idListaGeralCache;
  const existentes = await _listmonkFetch('/api/lists?per_page=100');
  const lista = (existentes.data?.results || existentes.data || []).find(l => l.name === 'MatchImóveis - Base Geral');
  if (lista) { _idListaGeralCache = lista.id; return lista.id; }
  const criada = await _listmonkFetch('/api/lists', {
    method: 'POST',
    body: JSON.stringify({ name: 'MatchImóveis - Base Geral', type: 'private', optin: 'single', tags: ['matchimoveis'] })
  });
  _idListaGeralCache = criada.data.id;
  return _idListaGeralCache;
}

// 1 página por vez (Listmonk não gosta de payload gigante de uma vez só) —
// mesma lógica de paginação já usada em services/interesadosPortal.js.
async function _buscarPaginaContatos(offset, limite) {
  const { rows } = await query(
    `SELECT id, nome, email, celular
     FROM campanha_contatos
     WHERE email IS NOT NULL AND email != ''
       AND LOWER(email) NOT IN (SELECT LOWER(email) FROM usuarios WHERE email IS NOT NULL AND email != '')
       -- nunca sincroniza pro Listmonk quem já pediu descadastro, ou já
       -- deu bounce/reclamação em qualquer envio anterior via SES — mesma
       -- tabela de supressão que services/email.js já usa pra todo envio
       -- da plataforma (ver descadastrarEmail() em services/email.js)
       AND LOWER(email) NOT IN (SELECT email FROM email_optout)
     ORDER BY id ASC
     LIMIT $1 OFFSET $2`,
    [limite, offset]
  );
  return rows;
}

async function sincronizarContatosListmonk({ tamanhoLote = 200, pausaMs = 300 } = {}) {
  const idLista = await _garantirListaGeral();
  let offset = 0;
  let total = 0;
  let erros = 0;
  for (;;) {
    const pagina = await _buscarPaginaContatos(offset, tamanhoLote);
    if (!pagina.length) break;
    for (const contato of pagina) {
      try {
        await _listmonkFetch('/api/subscribers', {
          method: 'POST',
          body: JSON.stringify({
            email: contato.email,
            name: contato.nome || contato.email,
            status: 'enabled',
            lists: [idLista],
            attribs: {
              matchimoveis_id: contato.id,
              celular: contato.celular || '',
              origem: 'campanha_contatos'
            }
          })
        });
        total++;
      } catch (e) {
        // Listmonk devolve 409/erro quando o e-mail já existe — normal em
        // reexecução (sincronização é idempotente por design), só loga se
        // não for esse o caso.
        if (!/already exists|duplicate/i.test(e.message)) {
          console.error('[listmonkSync] erro ao sincronizar', contato.email, ':', e.message);
          erros++;
        }
      }
    }
    offset += tamanhoLote;
    console.log(`[listmonkSync] sincronizados até agora: ${offset} (${total} novos, ${erros} erros)`);
    await new Promise(r => setTimeout(r, pausaMs)); // não martela a API do Listmonk
  }
  console.log(`[listmonkSync] concluído — ${total} contatos sincronizados, ${erros} erros.`);
  return { total, erros };
}

// Chamado por infra/email-marketing/warmup-schedule.js — pega a fatia
// [inicio, fim) da base (por ordem de ID, estável entre execuções) e
// sobe ela como lista+campanha própria do dia, pra controlar o ritmo do
// aquecimento sem depender do Listmonk mandar tudo de uma vez.
async function dispararLoteDoWarmup({ inicio, fim, diaWarmup }) {
  const tamanho = fim - inicio;
  const { rows } = await query(
    `SELECT id, nome, email, celular
     FROM campanha_contatos
     WHERE email IS NOT NULL AND email != ''
       AND LOWER(email) NOT IN (SELECT LOWER(email) FROM usuarios WHERE email IS NOT NULL AND email != '')
       -- nunca sincroniza pro Listmonk quem já pediu descadastro, ou já
       -- deu bounce/reclamação em qualquer envio anterior via SES — mesma
       -- tabela de supressão que services/email.js já usa pra todo envio
       -- da plataforma (ver descadastrarEmail() em services/email.js)
       AND LOWER(email) NOT IN (SELECT email FROM email_optout)
     ORDER BY id ASC
     LIMIT $1 OFFSET $2`,
    [tamanho, inicio]
  );
  if (!rows.length) {
    console.log('[listmonkSync] dia', diaWarmup, 'sem contatos novos pra liberar (base pode ter menos que o esperado nesse intervalo).');
    return { enviados: 0 };
  }

  const nomeLista = `Aquecimento - Dia ${diaWarmup}`;
  const listaCriada = await _listmonkFetch('/api/lists', {
    method: 'POST',
    body: JSON.stringify({ name: nomeLista, type: 'private', optin: 'single', tags: ['aquecimento', `dia-${diaWarmup}`] })
  });
  const idListaDia = listaCriada.data.id;

  for (const contato of rows) {
    try {
      await _listmonkFetch('/api/subscribers', {
        method: 'POST',
        body: JSON.stringify({
          email: contato.email,
          name: contato.nome || contato.email,
          status: 'enabled',
          lists: [idListaDia],
          attribs: { matchimoveis_id: contato.id, celular: contato.celular || '' }
        })
      });
    } catch (e) {
      if (!/already exists|duplicate/i.test(e.message)) console.error('[listmonkSync] erro no lote do dia', diaWarmup, contato.email, ':', e.message);
    }
  }

  // Conteúdo real (não placeholder vazio) — mesmo tom/voz já usado na
  // campanha por SES (services/campanha.js, template "pagina"). Testado ao
  // vivo (set/2026): um corpo vazio/genérico ("teste"/parágrafo em branco)
  // caiu no spam do Gmail e do Yahoo mesmo com SPF/DKIM/DMARC 100% — email
  // sem conteúdo real é sinal forte de spam por conteúdo, além da questão
  // de reputação de domínio novo (que só o aquecimento gradual resolve).
  // Só 1 variação por enquanto (a campanha por SES já tem rotação de ~30
  // variações pra nunca repetir o mesmo texto — considerar portar esse
  // mesmo mecanismo pra cá antes do disparo real pros 118k, pra não
  // repetir o mesmo assunto/corpo todo santo dia do aquecimento).
  const _ASSUNTO_WARMUP = 'Tem gente procurando imóvel na sua região agora — só não com você';
  const _CTA_URL = BASE_URL_MATCHIMOVEIS_CADASTRO;
  const _corpoWarmupHtml = `<p>Olá,</p>
<p>Todo dia, gente na sua região está procurando imóvel — e boa parte desses contatos nunca chega até você, porque não existe nada cruzando essa demanda com a sua carteira automaticamente.</p>
<p>A Match Imóveis faz isso sozinha: recebe o lead, casa com o imóvel certo, monta a vitrine e já manda pelo WhatsApp — sem você precisar ficar de olho o dia inteiro.</p>
<p style="text-align:center;margin:28px 0">
  <a href="${_CTA_URL}" style="background:#FF385C;color:#fff;text-decoration:none;font-weight:700;padding:12px 28px;border-radius:8px;display:inline-block">Conhecer a Match Imóveis →</a>
</p>
<p>— Equipe Match Imóveis</p>`;

  // Cria a campanha e já marca pra rodar (status "running") — troca por
  // "draft" aqui se preferir revisar manualmente no painel antes de cada
  // disparo em vez de automático.
  // from_email sempre explícito — sem isso o Listmonk cai no default de
  // Settings → General (nunca corrigido lá, só nas campanhas de teste
  // criadas manualmente pelo painel), que é o endereço de exemplo
  // "noreply@listmonk.yoursite.com". Incidente real (set/2026): o Dia 1
  // rodou 97 envios reais assim antes de ser pausado — sai sem DKIM
  // (SigningTable só bate *@matchimoveis.online) e o remetente não existe.
  const campanha = await _listmonkFetch('/api/campaigns', {
    method: 'POST',
    body: JSON.stringify({
      name: `Aquecimento - Dia ${diaWarmup}`,
      subject: _ASSUNTO_WARMUP,
      lists: [idListaDia],
      type: 'regular',
      content_type: 'richtext',
      body: _corpoWarmupHtml,
      from_email: 'MatchImóveis <contato@matchimoveis.online>'
    })
  });
  await _listmonkFetch(`/api/campaigns/${campanha.data.id}/status`, {
    method: 'PUT',
    body: JSON.stringify({ status: 'running' })
  });

  console.log('[listmonkSync] dia', diaWarmup, '—', rows.length, 'contatos liberados, campanha', campanha.data.id, 'iniciada.');
  return { enviados: rows.length, campanhaId: campanha.data.id };
}

module.exports = { sincronizarContatosListmonk, dispararLoteDoWarmup };

if (require.main === module) {
  sincronizarContatosListmonk().catch(e => { console.error('[listmonkSync] erro geral:', e.message); process.exit(1); });
}
