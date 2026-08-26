const path = require('path');
const fs = require('fs');

// Gera a imagem (card 1080x1080) do post institucional do Instagram a partir
// do MESMO fato real usado na legenda (ver server.js _fatoInstitucionalInstagram
// e services/instagramPostsIA.js) — não é screenshot da tela do app (ficaria
// com cara de UI interna), é um card desenhado só pra isso, na paleta da
// marca (services/salvarSiteConfig.js/CLAUDE.md: vermelho Rausch #FF385C,
// teal Babu #00A699, laranja Arches #FC642D — 1 cor fixa por tipo de post,
// não cicla). Renderiza via Chromium headless (Playwright, mesmo browser já
// usado em services/extratorPortal.js pra scraping, aqui só pra tirar print
// de HTML próprio — sem navegação externa a portal nenhum, só carrega fonte
// do Google Fonts mesmo, por isso espera document.fonts.ready antes do
// screenshot (senão o print às vezes sai com a fonte de fallback, corrida
// clássica de "screenshot antes da fonte terminar de carregar").
process.env.PLAYWRIGHT_BROWSERS_PATH = process.env.PLAYWRIGHT_BROWSERS_PATH || '0';

// Fraunces (serrifada, com personalidade, pro número/título) + Manrope (sans
// geométrica, pro resto) — evita a dupla clichê Inter/Space Grotesk que todo
// gerador de design cai por padrão.
const _FONTS_URL = 'https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,600;9..144,900&family=Manrope:wght@500;700;800&display=swap';

const _ICONES = {
  prova_social: '<path d="M4 23l8-8 5 5 11-13"/><path d="M20 6h8v8"/>',
  dica: '<path d="M12.5 25h7" stroke-width="2.4"/><path d="M13.5 28h5" stroke-width="2.4"/><path d="M16 4.5a9 9 0 00-5 16.5c1 .8 1.5 1.8 1.5 3.5h7c0-1.7.5-2.7 1.5-3.5a9 9 0 00-5-16.5z"/>',
  feature: '<path fill="currentColor" stroke="none" d="M16 2c0 7.2 3 10.5 10.5 10.5C19 12.5 16 15.8 16 23c0-7.2-3-10.5-10.5-10.5C13 12.5 16 9.2 16 2z"/>',
  // Duas "sparkles" (grande + pequena) — glifo comum de IA/mágica, distinto
  // do diamante único usado em "feature" pra não confundir os dois selos.
  ia: '<path fill="currentColor" stroke="none" d="M13 3c0 6.6-1.8 8.4-8.4 8.4C11.2 11.4 13 13.2 13 19.8c0-6.6 1.8-8.4 8.4-8.4C14.8 11.4 13 9.6 13 3z"/><path fill="currentColor" stroke="none" d="M24 14c0 3.2-.9 4.1-4.1 4.1 3.2 0 4.1.9 4.1 4.1 0-3.2.9-4.1 4.1-4.1-3.2 0-4.1-.9-4.1-4.1z"/>'
};

// Selo (eyebrow) continua ligado ao TIPO do post (conteúdo) — mas a cor do
// card agora é independente disso, ver _PALETA_ROTACAO abaixo. Antes cor e
// tipo eram a mesma coisa (prova_social sempre vermelho etc), e como o admin
// escolhe o tipo livremente a cada post, o grid do perfil saía com as 3
// cores misturadas sem padrão ("carnaval", como o Renato descreveu — ago/2026).
const _EYEBROW_TIPO = {
  prova_social: 'PROVA SOCIAL',
  dica: 'DICA',
  feature: 'FUNCIONALIDADE',
  ia: 'IA'
};

// Rotação de cor por bloco de 3 posts publicados no Feed (3 vermelho, 3
// teal, 3 laranja, repete) — controlada por server.js
// (_proximoIndiceCorInstagram/_avancarRotacaoCorInstagram), aqui só recebe o
// índice já calculado.
const _PALETA_ROTACAO = [
  { bg: '#FF385C', bg2: '#8F1436' }, // vermelho Rausch
  { bg: '#00A699', bg2: '#00443E' }, // teal Babu
  { bg: '#FC642D', bg2: '#8A2E0A' }  // laranja Arches
];

let _browserPromise = null;
let _idleTimer = null;
let _ultimoUso = 0;

function _agendarFechamentoOcioso() {
  if (_idleTimer) return;
  _idleTimer = setInterval(() => {
    if (_browserPromise && Date.now() - _ultimoUso > 10 * 60 * 1000) {
      fecharBrowserCard().catch(() => {});
    }
    if (!_browserPromise) { clearInterval(_idleTimer); _idleTimer = null; }
  }, 2 * 60 * 1000);
  if (_idleTimer.unref) _idleTimer.unref();
}

async function _getBrowser() {
  _ultimoUso = Date.now();
  _agendarFechamentoOcioso();
  if (!_browserPromise) {
    const { chromium } = require('playwright');
    _browserPromise = chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    }).catch(e => { _browserPromise = null; throw e; });
  }
  return _browserPromise;
}

async function fecharBrowserCard() {
  if (_browserPromise) {
    try { const b = await _browserPromise; await b.close(); } catch (e) {}
  }
  _browserPromise = null;
}

function _escHtml(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// Separa o "fato" (string única) em headline + corpo pro card. prova_social
// vem sempre com o número no começo (ver server.js) — extrai pra ficar
// gigante no card. feature/dica vêm como "Título: descrição".
function _partesDoFato(tipo, fato) {
  const texto = String(fato || '').trim();
  if (tipo === 'prova_social') {
    const m = texto.match(/^([\d.,]+)\s*(.*)$/);
    return m ? { headline: m[1], corpo: m[2] } : { headline: texto, corpo: '' };
  }
  const idx = texto.indexOf(':');
  const headlineBruto = idx > -1 ? texto.slice(0, idx).trim() : texto;
  // Conceitos do cerebro.js vêm em minúsculo ("match", "vitrine") — cabeçalho
  // de post fica estranho assim, capitaliza só a 1ª letra.
  const headline = headlineBruto.charAt(0).toUpperCase() + headlineBruto.slice(1);
  return { headline, corpo: idx > -1 ? texto.slice(idx + 1).trim() : '' };
}

// Feed = quadrado 1080x1080. Story = vertical 1080x1920 — Instagram cobre o
// topo (foto de perfil/nome/hora) e o rodapé (caixa de resposta) da própria
// UI dele por cima da imagem, então o conteúdo real fica com padding vertical
// bem maior que o do feed (zona "segura"), senão nasce cortado atrás da UI.
// padV/padH do feed maiores de propósito (~13-14% de margem em vez dos 7%
// originais): tanto o grid do perfil (3 colunas, corta lateral) quanto a
// visão "Posts" do painel profissional do Instagram (corta em cima/embaixo,
// escondendo o selo/eyebrow e o rodapé matchimoveis.ia.br) dão um leve
// zoom/corte no thumbnail mesmo em post quadrado 1080x1080 — reportado pelo
// Renato ago/2026 nas duas telas. O post aberto individualmente em tela
// cheia sempre vem completo, só essas visões reduzidas cortam conteúdo
// perto da borda.
const _FORMATOS = {
  feed: { w: 1080, h: 1080, padV: 148, padH: 148 },
  story: { w: 1080, h: 1920, padV: 230, padH: 84 }
};

function _montarHtmlCard(tipo, fato, formato, corIndice) {
  const dim = _FORMATOS[formato] || _FORMATOS.feed;
  const ehStory = formato === 'story';
  const idx = ((Number(corIndice) || 0) % _PALETA_ROTACAO.length + _PALETA_ROTACAO.length) % _PALETA_ROTACAO.length;
  const cor = { ..._PALETA_ROTACAO[idx], eyebrow: _EYEBROW_TIPO[tipo] || _EYEBROW_TIPO.feature };
  const icone = _ICONES[tipo] || _ICONES.feature;
  const { headline, corpo } = _partesDoFato(tipo, fato);
  const baseHeadline = tipo === 'prova_social' ? (headline.length > 6 ? 230 : 296) : (headline.length > 24 ? 72 : 90);
  const tamanhoHeadline = ehStory ? Math.round(baseHeadline * (tipo === 'prova_social' ? 1.05 : 1.15)) : baseHeadline;
  return `<!DOCTYPE html><html><head><meta charset="utf-8">
  <link rel="stylesheet" href="${_FONTS_URL}">
  <style>
    *{margin:0;padding:0;box-sizing:border-box}
    html,body{width:${dim.w}px;height:${dim.h}px}
    body{
      background:
        radial-gradient(ellipse 780px 620px at 8% -8%, rgba(255,255,255,.22), transparent 62%),
        radial-gradient(ellipse 720px 720px at 108% 10%, rgba(255,255,255,.15), transparent 58%),
        radial-gradient(ellipse 640px 820px at 96% 108%, rgba(0,0,0,.22), transparent 58%),
        radial-gradient(ellipse 600px 500px at -6% 96%, rgba(0,0,0,.14), transparent 55%),
        linear-gradient(158deg, ${cor.bg} 0%, ${cor.bg2} 100%);
      font-family:'Manrope',-apple-system,sans-serif;
      display:flex;flex-direction:column;justify-content:space-between;
      padding:${dim.padV}px ${dim.padH}px;color:#fff;position:relative;overflow:hidden;
    }
    .marca-agua{position:absolute;right:-90px;top:-60px;width:520px;height:520px;color:rgba(255,255,255,.10);opacity:.9}
    .eyebrow{display:inline-flex;align-items:center;gap:18px;font-family:'Manrope';font-size:44px;font-weight:800;letter-spacing:.06em;color:#fff;z-index:1;width:fit-content}
    .eyebrow .ic-wrap{width:60px;height:60px;border-radius:16px;background:rgba(255,255,255,.20);display:flex;align-items:center;justify-content:center}
    .eyebrow svg{width:34px;height:34px;color:#fff}
    .meio{flex:1;display:flex;flex-direction:column;justify-content:center;z-index:1;max-width:${ehStory ? 940 : 960}px}
    .headline{font-family:'Fraunces';font-optical-sizing:auto;font-size:${tamanhoHeadline}px;font-weight:900;line-height:${tipo === 'prova_social' ? '0.92' : '1.04'};letter-spacing:-.02em;text-wrap:balance;margin-bottom:32px;text-shadow:0 10px 40px rgba(0,0,0,.16)}
    .corpo{font-size:${ehStory ? 52 : 46}px;font-weight:500;line-height:1.38;opacity:.97;max-width:${ehStory ? 920 : 900}px}
    .rodape{display:flex;align-items:center;gap:22px;z-index:1;background:rgba(255,255,255,.98);border-radius:26px;padding:26px 36px;width:fit-content;box-shadow:0 16px 40px rgba(0,0,0,.22)}
    .logo{width:76px;height:76px;border-radius:18px;background:${cor.bg};display:flex;align-items:center;justify-content:center;font-family:'Fraunces';font-weight:900;font-size:40px;color:#fff;flex-shrink:0}
    .dominio{display:flex;flex-direction:column;line-height:1.24}
    .dominio b{font-family:'Manrope';font-size:48px;font-weight:800;color:#16181A}
    .dominio span{font-size:27px;font-weight:600;color:#6b7280}
  </style></head><body>
    <svg class="marca-agua" viewBox="0 0 32 32" fill="currentColor" stroke="none"><path d="M16 2c0 7.2 3 10.5 10.5 10.5C19 12.5 16 15.8 16 23c0-7.2-3-10.5-10.5-10.5C13 12.5 16 9.2 16 2z"/></svg>
    <div class="eyebrow"><span class="ic-wrap"><svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">${icone}</svg></span>${_escHtml(cor.eyebrow)}</div>
    <div class="meio">
      <div class="headline">${_escHtml(headline)}</div>
      ${corpo ? `<div class="corpo">${_escHtml(corpo)}</div>` : ''}
    </div>
    <div class="rodape">
      <div class="logo">M</div>
      <div class="dominio">${ehStory
        ? '<b>Conheça — link na bio</b><span>Match automático de imóveis</span>'
        : '<b>matchimoveis.ia.br</b><span>Match automático de imóveis</span>'}</div>
    </div>
  </body></html>`;
}

async function gerarCardImagemBuffer({ tipo, fato, formato, corIndice }) {
  const dim = _FORMATOS[formato] || _FORMATOS.feed;
  const browser = await _getBrowser();
  const page = await browser.newPage({ viewport: { width: dim.w, height: dim.h } });
  try {
    await page.setContent(_montarHtmlCard(tipo, fato, formato, corIndice), { waitUntil: 'networkidle' });
    // Garante que a fonte do Google Fonts já carregou antes do print — sem
    // isso o screenshot às vezes sai com a fonte de fallback do sistema.
    await page.evaluate(() => document.fonts.ready).catch(() => {});
    return await page.screenshot({ type: 'png' });
  } finally {
    await page.close().catch(() => {});
  }
}

module.exports = { gerarCardImagemBuffer, fecharBrowserCard };
