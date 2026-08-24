// Robô que grava vídeo de navegação real do app pra virar tutorial (FAQ/suporte).
// Roda via Playwright (mesmo Chromium já usado por services/instagramCardImagem.js),
// grava a tela e converte pra mp4 com ffmpeg. Sem narração ainda — só a
// navegação (a voz entra depois, quando decidir o provedor de TTS).
//
// Simula um uso real de ~1 minuto: filtra por cidade/bairro/valor, limpa os
// filtros, busca por ID, rola a lista, seleciona um card, abre um imóvel pra
// editar e volta — pausas longas entre cada ação pra não passar rápido demais.
//
// Uso: TUTORIAL_LOGIN=telefone TUTORIAL_SENHA=senha node gerar-video-tutorial.js
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const BASE_URL = process.env.RENDER ? 'https://www.matchimoveis.ia.br' : 'http://localhost:3000';
const LOGIN = process.env.TUTORIAL_LOGIN;
const SENHA = process.env.TUTORIAL_SENHA;
if (!LOGIN || !SENHA) {
  console.error('Defina TUTORIAL_LOGIN e TUTORIAL_SENHA (env vars) antes de rodar.');
  process.exit(1);
}

const OUT_DIR = process.env.RENDER
  ? '/opt/render/project/src/data/uploads/imoveis/tutoriais'
  : path.join(__dirname, 'public', 'uploads', 'imoveis', 'tutoriais');
fs.mkdirSync(OUT_DIR, { recursive: true });

const NOME_VIDEO = 'meus-imoveis';
const RAW_DIR = path.join(OUT_DIR, '_raw-' + Date.now());
fs.mkdirSync(RAW_DIR, { recursive: true });

async function pausa(ms) { await new Promise(r => setTimeout(r, ms)); }

// Preenche um campo simulando digitação letra a letra (mais natural no vídeo
// do que .fill() instantâneo), só executa se o elemento existir na tela.
async function digitar(page, seletor, texto, { esperaAntes = 800, esperaDepois = 2000 } = {}) {
  const loc = page.locator(seletor).first();
  if (!(await loc.count())) return false;
  await loc.scrollIntoViewIfNeeded().catch(() => {});
  await pausa(esperaAntes);
  await loc.click({ timeout: 5000 }).catch(() => {});
  await loc.fill('').catch(() => {});
  await loc.pressSequentially(texto, { delay: 90 }).catch(() => {});
  await pausa(esperaDepois);
  return true;
}

async function limparCampo(page, seletor) {
  const loc = page.locator(seletor).first();
  if (await loc.count()) await loc.fill('').catch(() => {});
}

async function clicarSeExistir(page, seletor, { esperaAntes = 800, esperaDepois = 1500 } = {}) {
  const loc = page.locator(seletor).first();
  if (!(await loc.count())) return false;
  await loc.scrollIntoViewIfNeeded().catch(() => {});
  await pausa(esperaAntes);
  await loc.click({ timeout: 5000 }).catch(() => {});
  await pausa(esperaDepois);
  return true;
}

async function rolarSuave(page, passos = 3, distancia = 500, pausaEntre = 1400) {
  for (let i = 0; i < passos; i++) {
    await page.mouse.wheel(0, distancia);
    await pausa(pausaEntre);
  }
}

(async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    recordVideo: { dir: RAW_DIR, size: { width: 1280, height: 800 } }
  });

  // Login via POST direto (evita depender do modal/JS da landing) — o cookie
  // de sessão fica no context, valendo pra navegação seguinte.
  const loginResp = await context.request.post(BASE_URL + '/login', {
    form: { telefone: LOGIN, senha: SENHA },
    maxRedirects: 0
  }).catch(e => { throw new Error('Falha no POST de login: ' + e.message); });
  console.log('[login] status:', loginResp.status());

  const page = await context.newPage();

  console.log('[nav] abrindo Meus Imóveis...');
  await page.goto(BASE_URL + '/app/imoveis', { waitUntil: 'networkidle', timeout: 30000 });
  await pausa(3000);

  // Filtro por cidade
  console.log('[nav] filtrando por cidade...');
  await digitar(page, '#f-cidade', 'São Paulo');
  await limparCampo(page, '#f-cidade');
  await pausa(500);

  // Filtro por bairro
  console.log('[nav] filtrando por bairro...');
  await digitar(page, '#f-bairro', 'Moema');
  await limparCampo(page, '#f-bairro');
  await pausa(500);

  // Faixa de valor
  console.log('[nav] ajustando faixa de valor...');
  await digitar(page, '#f-valor-min', '300000', { esperaDepois: 1000 });
  await digitar(page, '#f-valor-max', '900000', { esperaDepois: 2000 });

  // Limpa os filtros
  console.log('[nav] limpando filtros...');
  await clicarSeExistir(page, 'button:has-text("Limpar filtros")', { esperaDepois: 2000 });

  // Busca por ID/texto
  console.log('[nav] buscando por ID/texto...');
  const primeiraDataId = await page.locator('.im-card').first().getAttribute('data-id').catch(() => null);
  await digitar(page, '#busca', primeiraDataId || '123', { esperaDepois: 2000 });
  await limparCampo(page, '#busca');
  await pausa(1000);

  // Rola a lista de imóveis devagar
  console.log('[nav] rolando a lista...');
  await rolarSuave(page, 3, 450, 1600);
  await page.mouse.wheel(0, -1400);
  await pausa(1500);

  // Seleciona um card (clique simples = toggle de seleção)
  console.log('[nav] selecionando um card...');
  const primeiroCard = page.locator('.im-card').first();
  if (await primeiroCard.count()) {
    await primeiroCard.scrollIntoViewIfNeeded().catch(() => {});
    await pausa(1000);
    await primeiroCard.click({ timeout: 5000 }).catch(() => {});
    await pausa(2000);
    await primeiroCard.click({ timeout: 5000 }).catch(() => {}); // desmarca de volta
    await pausa(1000);
  }

  // Abre um imóvel pra editar
  console.log('[nav] abrindo um imóvel pra editar...');
  const linkEditar = page.locator('.im-card a.im-btn.edit').first();
  if (await linkEditar.count()) {
    await linkEditar.scrollIntoViewIfNeeded().catch(() => {});
    await pausa(1000);
    await linkEditar.click({ timeout: 5000 }).catch(e => console.log('[nav] não abriu edição:', e.message));
    await pausa(3500);
    await page.goBack({ waitUntil: 'networkidle', timeout: 15000 }).catch(() => {});
    await pausa(2000);
  } else {
    console.log('[nav] nenhum imóvel com botão Editar (não é dono) — pulando.');
  }

  await pausa(1500);
  await context.close(); // finaliza o arquivo de vídeo
  await browser.close();

  // Playwright salva 1 .webm por página aberta no context — pega o mais recente
  const arquivos = fs.readdirSync(RAW_DIR).filter(f => f.endsWith('.webm'));
  if (!arquivos.length) throw new Error('Nenhum vídeo gerado pelo Playwright.');
  const webmPath = path.join(RAW_DIR, arquivos[0]);
  const mp4Path = path.join(OUT_DIR, NOME_VIDEO + '.mp4');

  console.log('[ffmpeg] convertendo pra mp4...');
  execSync(`ffmpeg -y -i "${webmPath}" -c:v libx264 -pix_fmt yuv420p -movflags +faststart "${mp4Path}"`, { stdio: 'inherit' });

  fs.rmSync(RAW_DIR, { recursive: true, force: true });

  const urlPublica = BASE_URL + '/data-uploads/tutoriais/' + NOME_VIDEO + '.mp4';
  console.log('\n✅ Vídeo pronto:', mp4Path);
  console.log('🔗 URL pública:', urlPublica);
})().catch(e => { console.error('ERRO:', e.message); process.exit(1); });
