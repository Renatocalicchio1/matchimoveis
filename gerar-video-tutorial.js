// Robô que grava vídeo de navegação real do app pra virar tutorial (FAQ/suporte).
// Roda via Playwright (mesmo Chromium já usado por services/instagramCardImagem.js),
// grava a tela e converte pra mp4 com ffmpeg. Sem narração ainda — só a
// navegação (a voz entra depois, quando decidir o provedor de TTS).
//
// Uso: node gerar-video-tutorial.js
// Credenciais via env: TUTORIAL_LOGIN=telefone TUTORIAL_SENHA=senha node gerar-video-tutorial.js
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
  await pausa(2500);

  // Mostra os filtros (rolar até eles, se existirem)
  const filtroCidade = page.locator('#f-cidade');
  if (await filtroCidade.count()) {
    await filtroCidade.scrollIntoViewIfNeeded().catch(() => {});
    await pausa(1200);
  }

  // Usa a busca por ID/texto
  const busca = page.locator('#busca');
  if (await busca.count()) {
    await busca.scrollIntoViewIfNeeded().catch(() => {});
    await pausa(800);
  }

  // Abre o primeiro card de imóvel, se existir
  const primeiroCard = page.locator('.im-card').first();
  if (await primeiroCard.count()) {
    await primeiroCard.scrollIntoViewIfNeeded().catch(() => {});
    await pausa(1000);
    await primeiroCard.click({ timeout: 5000 }).catch(e => console.log('[nav] não conseguiu clicar no card:', e.message));
    await pausa(2500);
  } else {
    console.log('[nav] nenhum imóvel encontrado na conta — vídeo só mostra a tela vazia.');
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
