const { query } = require('./db');
const { enviarEmail } = require('./email');
const dns = require('dns').promises;

const BASE_URL = process.env.RENDER ? 'https://www.matchimoveis.ia.br' : 'http://localhost:3000';

// ── Modelos de e-mail (2 tipos, cada um com várias variações) ──────────────
// "pagina": convida a se cadastrar na plataforma (link geral).
// "demanda": convida a ver quantos clientes tem na região agora (link /demanda).
// A cada envio sorteia o TIPO e depois a VARIAÇÃO dentro dele — mistura os
// dois modelos na mesma fila em vez de mandar tudo de um tipo só, e nunca
// repete o mesmo texto/assunto sempre igual (padrão robótico = spam).
const MODELOS = {
  pagina: [
    {
      assunto: '🚨 A IA já está trabalhando para corretores. E você?',
      corpo: `Olá {nome},

O corretor tradicional trabalha sozinho. O corretor moderno trabalha com Inteligência Artificial.

Imagine uma IA que trabalha por você, 24 horas por dia:

🤖 Encontra e minera leads automaticamente
🎯 Faz o match perfeito entre cliente e imóvel
📩 Envia vitrines inteligentes sem você pedir
📅 Agenda visitas sozinha
💬 Conversa no WhatsApp com memória inteligente

Enquanto você atende um cliente, a IA já está preparando o próximo.

Isso não é futuro. Isso já está acontecendo na Match Imóveis.

Você começa com 1.000 créditos gratuitos para testar tudo agora:
${BASE_URL}

— Equipe Match Imóveis`
    },
    {
      assunto: 'Corretores que usam IA vendem mais — e você não está usando',
      corpo: `Olá {nome},

Enquanto você responde um cliente no WhatsApp, um corretor com IA já está atendendo três ao mesmo tempo — sem perder qualidade.

A Match Imóveis cruza automaticamente cada lead com os imóveis certos da sua carteira e da rede, manda a vitrine sozinha e agenda a visita.

Sem mensalidade fixa, sem comissão sobre venda. Você testa com 1.000 créditos grátis:
${BASE_URL}

— Equipe Match Imóveis`
    },
    {
      assunto: 'Sua carteira de imóveis pode estar rendendo mais',
      corpo: `Olá {nome},

Cada imóvel da sua carteira pode gerar mais de um match por dia se cruzado automaticamente com os leads certos — é isso que a Match Imóveis faz sozinha, o dia inteiro.

Sem depender de você lembrar de mandar mensagem, agendar visita ou procurar imóvel na planilha.

1.000 créditos grátis pra testar agora:
${BASE_URL}

— Equipe Match Imóveis`
    },
    {
      assunto: 'Enquanto você dorme, a IA já está trabalhando pra você',
      corpo: `Olá {nome},

A Match Imóveis não para: cruza lead com imóvel, manda vitrine, agenda visita — 24h por dia, inclusive de madrugada e fim de semana.

Corretores que usam já não perdem lead por demora na resposta.

Comece grátis com 1.000 créditos:
${BASE_URL}

— Equipe Match Imóveis`
    }
  ],
  demanda: [
    {
      assunto: '📍 Quantos clientes reais tem na sua região agora?',
      corpo: `Olá {nome},

Tem gente procurando imóvel na sua cidade e bairro agora mesmo — e não é chute, é dado real minerado pela nossa IA.

Veja em segundos quantos interessados reais existem na sua região, sem compromisso:
${BASE_URL}/demanda

Leve esses leads pra sua conta hoje.

— Equipe Match Imóveis`
    },
    {
      assunto: 'Leads reais esperando por um corretor na sua região',
      corpo: `Olá {nome},

Não são leads de crédito nem cadastro genérico — são pessoas de verdade buscando imóvel na sua cidade agora, minerados em tempo real.

Confira quantos existem na sua região (sem custo pra ver o número):
${BASE_URL}/demanda

O primeiro corretor que pegar, leva.

— Equipe Match Imóveis`
    },
    {
      assunto: 'Sua região tem demanda — você só não está vendo ainda',
      corpo: `Olá {nome},

Descubra agora, de graça, quantos clientes reais estão buscando imóvel no seu bairro e cidade neste momento.

${BASE_URL}/demanda

Sem comissão, sem mensalidade. Você só paga se quiser levar os leads pra sua conta.

— Equipe Match Imóveis`
    },
    {
      assunto: 'Alguém está procurando imóvel perto de você agora',
      corpo: `Olá {nome},

Enquanto você lê esse email, pode ter gente buscando um imóvel exatamente na sua região. A gente já sabe quem são.

Veja o número real (grátis, sem cadastro):
${BASE_URL}/demanda

— Equipe Match Imóveis`
    }
  ]
};

function _sorteia(lista) { return lista[Math.floor(Math.random() * lista.length)]; }
function _sortearModelo() {
  const tipo = Math.random() < 0.5 ? 'pagina' : 'demanda';
  return { tipo, ...(_sorteia(MODELOS[tipo])) };
}

// ── DDD por região (prioridade de envio) ────────────────────────────────────
const _DDD_SP = ['11','12','13','14','15','16','17','18','19'];
const _DDD_RJ = ['21','22','24'];
const _DDD_SC = ['47','48','49'];
function _dddDigits(celular) {
  let d = String(celular || '').replace(/\D/g, '');
  if (d.length >= 12 && d.startsWith('55')) d = d.slice(2);
  return d.slice(0, 2);
}
function _calcularDddGrupo(celular) {
  const ddd = _dddDigits(celular);
  if (_DDD_SP.includes(ddd)) return 0;
  if (_DDD_RJ.includes(ddd)) return 1;
  if (_DDD_SC.includes(ddd)) return 2;
  return 3;
}
function _pareceCorretor(nome, email) {
  const t = (String(nome || '') + ' ' + String(email || '')).toLowerCase();
  return /corretor|corretora|imobiliari|broker/.test(t);
}

let _colunasProntas = false;
async function _garantirColunas() {
  if (_colunasProntas) return;
  await query(`ALTER TABLE campanha_contatos ADD COLUMN IF NOT EXISTS ddd_grupo INT`);
  await query(`ALTER TABLE campanha_contatos ADD COLUMN IF NOT EXISTS parece_corretor BOOLEAN DEFAULT false`);
  await query(`ALTER TABLE campanha_contatos ADD COLUMN IF NOT EXISTS email_valido BOOLEAN`);
  await query(`ALTER TABLE campanha_contatos ADD COLUMN IF NOT EXISTS modelo_usado TEXT`);
  await query(`ALTER TABLE campanha_contatos ADD COLUMN IF NOT EXISTS titulo_usado TEXT`);
  await query(`ALTER TABLE campanha_contatos ADD COLUMN IF NOT EXISTS aberto_em TIMESTAMP`);
  await query(`ALTER TABLE campanha_contatos ADD COLUMN IF NOT EXISTS clicado_em TIMESTAMP`);
  await query(`CREATE TABLE IF NOT EXISTS campanha_config (
    id INT PRIMARY KEY DEFAULT 1,
    ativo BOOLEAN DEFAULT false,
    atualizado_em TIMESTAMP DEFAULT NOW()
  )`);
  await query(`INSERT INTO campanha_config (id, ativo) VALUES (1, false) ON CONFLICT (id) DO NOTHING`);
  _colunasProntas = true;
}

// Prioridade calculada 1x no import — evita recalcular DDD/regex a cada
// query de envio. Roda automaticamente pra quem ainda não tem (contatos
// importados antes dessa coluna existir).
async function _backfillPrioridadePendente() {
  await _garantirColunas();
  const { rows } = await query(`SELECT id, nome, email, celular FROM campanha_contatos WHERE ddd_grupo IS NULL LIMIT 500`);
  if (!rows.length) return 0;
  for (const c of rows) {
    await query(
      `UPDATE campanha_contatos SET ddd_grupo=$1, parece_corretor=$2 WHERE id=$3`,
      [_calcularDddGrupo(c.celular), _pareceCorretor(c.nome, c.email), c.id]
    );
  }
  return rows.length;
}

async function importarContatos(contatos) {
  await _garantirColunas();
  let importados = 0, duplicados = 0;
  for (const c of contatos) {
    try {
      await query(
        `INSERT INTO campanha_contatos (nome, email, celular, ddd_grupo, parece_corretor) VALUES ($1,$2,$3,$4,$5) ON CONFLICT (email) DO NOTHING`,
        [c.nome || '', c.email.toLowerCase().trim(), c.celular || '', _calcularDddGrupo(c.celular), _pareceCorretor(c.nome, c.email)]
      );
      importados++;
    } catch (e) { duplicados++; }
  }
  return { importados, duplicados };
}

// ── Validação de email (formato + MX do domínio) ────────────────────────────
// 100k+ contatos não dá pra validar tudo de uma vez (DNS custa tempo) —
// roda em lotes pequenos via job periódico (server.js), cacheando o
// resultado por domínio na memória (gmail.com/hotmail.com etc se repetem
// muito, não faz sentido consultar o MX de novo pra cada contato).
const _REGEX_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const _cacheMx = new Map(); // domínio -> boolean (tem MX válido)
async function _dominioTemMx(dominio) {
  if (_cacheMx.has(dominio)) return _cacheMx.get(dominio);
  let ok = false;
  try {
    const registros = await dns.resolveMx(dominio);
    ok = Array.isArray(registros) && registros.length > 0;
  } catch (e) { ok = false; }
  _cacheMx.set(dominio, ok);
  return ok;
}

async function validarProximoLote(limite = 50) {
  await _garantirColunas();
  const { rows } = await query(
    `SELECT id, email FROM campanha_contatos WHERE email_valido IS NULL LIMIT $1`,
    [limite]
  );
  let validos = 0, invalidos = 0;
  for (const c of rows) {
    const email = String(c.email || '').trim();
    const formatoOk = _REGEX_EMAIL.test(email);
    const dominio = formatoOk ? email.split('@')[1].toLowerCase() : '';
    const mxOk = formatoOk && dominio ? await _dominioTemMx(dominio) : false;
    const valido = formatoOk && mxOk;
    if (valido) validos++; else invalidos++;
    await query(`UPDATE campanha_contatos SET email_valido=$1 WHERE id=$2`, [valido, c.id]);
  }
  return { processados: rows.length, validos, invalidos };
}

async function statsBase() {
  await _garantirColunas();
  const { rows } = await query(`SELECT status, COUNT(*) as total FROM campanha_contatos GROUP BY status`);
  return rows;
}

async function statsValidacao() {
  await _garantirColunas();
  const { rows } = await query(`
    SELECT
      COUNT(*) FILTER (WHERE email_valido IS NULL)::int AS pendente_validar,
      COUNT(*) FILTER (WHERE email_valido = true)::int AS validos,
      COUNT(*) FILTER (WHERE email_valido = false)::int AS invalidos
    FROM campanha_contatos
  `);
  return rows[0] || { pendente_validar: 0, validos: 0, invalidos: 0 };
}

async function statsTracking() {
  const { rows } = await query(`SELECT tipo, COUNT(*) as total FROM campanha_tracking GROUP BY tipo`);
  return rows;
}

async function statsCadastrados() {
  const { rows } = await query(`
    SELECT COUNT(*) as total FROM campanha_contatos cc
    WHERE LOWER(cc.email) IN (SELECT LOWER(email) FROM usuarios WHERE email IS NOT NULL AND email != '')
    AND cc.status = 'enviado'
  `);
  return rows[0]?.total || 0;
}

async function estaAtiva() {
  await _garantirColunas();
  const { rows } = await query('SELECT ativo FROM campanha_config WHERE id=1');
  return !!(rows[0] && rows[0].ativo);
}
async function iniciarCampanha() {
  await _garantirColunas();
  await query(`UPDATE campanha_config SET ativo=true, atualizado_em=NOW() WHERE id=1`);
}
async function pausarCampanha() {
  await _garantirColunas();
  await query(`UPDATE campanha_config SET ativo=false, atualizado_em=NOW() WHERE id=1`);
}

// Só considera enviável quem: está pendente, teve o email validado como
// existente, não bate email NEM celular com conta já cadastrada (usuarios).
// Prioridade: parece corretor > região (SP > RJ > SC > resto) > mais antigo.
async function proximoLote(limite) {
  await _garantirColunas();
  const { rows } = await query(`
    SELECT cc.id, cc.nome, cc.email, cc.celular
    FROM campanha_contatos cc
    WHERE cc.status = 'pendente'
      AND cc.email_valido = true
      AND LOWER(cc.email) NOT IN (SELECT LOWER(email) FROM usuarios WHERE email IS NOT NULL AND email != '')
      AND NOT EXISTS (
        SELECT 1 FROM usuarios u
        WHERE u.celular IS NOT NULL AND u.celular != ''
          AND cc.celular IS NOT NULL AND cc.celular != ''
          AND RIGHT(regexp_replace(u.celular, '\\D', '', 'g'), 8) = RIGHT(regexp_replace(cc.celular, '\\D', '', 'g'), 8)
      )
    ORDER BY (CASE WHEN cc.parece_corretor THEN 0 ELSE 1 END), COALESCE(cc.ddd_grupo, 3), cc.criado_em ASC
    LIMIT $1
  `, [limite]);
  return rows;
}

async function marcarEnviado(id, erro, extra = {}) {
  if (erro) {
    await query(`UPDATE campanha_contatos SET status='erro', erro=$1, enviado_em=NOW() WHERE id=$2`, [erro, id]);
  } else {
    await query(
      `UPDATE campanha_contatos SET status='enviado', enviado_em=NOW(), modelo_usado=$1, titulo_usado=$2 WHERE id=$3`,
      [extra.modelo || null, extra.titulo || null, id]
    );
  }
}

function gerarHTML(mensagem, contato) {
  const trackPixel = `${BASE_URL}/campanha/track/open/${contato.id || 0}`;
  const trackLink = `${BASE_URL}/campanha/track/click/${contato.id || 0}`;
  // Casa a URL base COM ou SEM /demanda atrás — sem isso, um link
  // "matchimoveis.ia.br/demanda" ficava com só a parte base virando link
  // clicável e "/demanda" sobrando como texto solto ao lado.
  const _urlRegex = new RegExp(BASE_URL.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(/demanda)?', 'g');
  const msgFinal = mensagem
    .replace(/{nome}/g, contato.nome || 'Corretor')
    .replace(_urlRegex, (match) => '<a href="' + trackLink + '" style="color:#FF385C">' + match + '</a>');
  const msgHtml = msgFinal
    .replace(/\n\n/g, '</p><p style="margin:16px 0;font-size:15px;line-height:1.7;color:#222">')
    .replace(/\n/g, '<br>');
  return `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:32px;color:#222">
    <p style="margin:0 0 16px 0;font-size:15px;line-height:1.7;color:#222">${msgHtml}</p>
    <p style="margin-top:8px;font-size:13px;color:#888">Para não receber mais emails, responda com CANCELAR.</p>
    <img src="${trackPixel}" width="1" height="1" style="display:none">
  </div>`;
}

// Um envio — chamado pelo job automático (server.js, intervalo aleatório
// 1-3min) ou manualmente via /admin/campanha/disparar-lote.
async function enviarProximo() {
  await _garantirColunas();
  await _backfillPrioridadePendente();
  if (!(await estaAtiva())) return { enviado: false, motivo: 'pausada' };

  const [contato] = await proximoLote(1);
  if (!contato) return { enviado: false, motivo: 'sem_elegiveis' };

  const modelo = _sortearModelo();
  const corpoPersonalizado = modelo.corpo.replace(/\{nome\}/g, contato.nome || 'Corretor');
  const html = gerarHTML(corpoPersonalizado, contato);
  try {
    await enviarEmail({ para: contato.email, assunto: modelo.assunto, html, texto: modelo.assunto });
    await marcarEnviado(contato.id, null, { modelo: modelo.tipo, titulo: modelo.assunto });
    return { enviado: true, email: contato.email, modelo: modelo.tipo, titulo: modelo.assunto };
  } catch (e) {
    await marcarEnviado(contato.id, e.message);
    return { enviado: false, motivo: 'erro_envio', erro: e.message };
  }
}

// Disparo manual em lote (mantido pra compatibilidade — usado quando o
// admin quer forçar um envio imediato de N contatos com um texto próprio,
// em vez de esperar o job automático).
async function dispararLote(lote, { assunto, mensagem }) {
  let enviados = 0, erros = 0;
  for (const c of lote) {
    try {
      const msgPersonalizada = mensagem.replace(/\{nome\}/g, c.nome || 'Corretor');
      const html = gerarHTML(msgPersonalizada, c);
      await enviarEmail({ para: c.email, assunto, html, texto: assunto });
      await marcarEnviado(c.id, null, { modelo: 'manual', titulo: assunto });
      enviados++;
      console.log(`[CAMPANHA] enviado: ${c.email} (${enviados}/${lote.length})`);
      await new Promise(r => setTimeout(r, 1100));
    } catch (e) {
      await marcarEnviado(c.id, e.message);
      erros++;
      console.error(`[CAMPANHA] erro: ${c.email}`, e.message);
    }
  }
  return { enviados, erros };
}

async function enviarTeste(emailTeste, { assunto, mensagem }) {
  const html = gerarHTML(mensagem.replace(/\{nome\}/g, 'Corretor Teste'), { id: 'teste' });
  await enviarEmail({ para: emailTeste, assunto: '[TESTE] ' + assunto, html, texto: assunto });
}

async function listarEnvios({ limite = 50, offset = 0 } = {}) {
  await _garantirColunas();
  const { rows } = await query(
    `SELECT id, nome, email, celular, status, modelo_usado, titulo_usado, enviado_em, aberto_em, clicado_em, erro
     FROM campanha_contatos
     WHERE status = 'enviado' OR status = 'erro'
     ORDER BY enviado_em DESC
     LIMIT $1 OFFSET $2`,
    [limite, offset]
  );
  return rows;
}

module.exports = {
  importarContatos, statsBase, statsTracking, statsCadastrados, statsValidacao,
  proximoLote, dispararLote, enviarTeste, enviarProximo,
  iniciarCampanha, pausarCampanha, estaAtiva,
  validarProximoLote, listarEnvios
};
