const { query } = require('./db');
const { enviarEmail } = require('./email');
const { emailValido } = require('./validarEmailFormato');

const BASE_URL = process.env.RENDER ? 'https://www.matchimoveis.ia.br' : 'http://localhost:3000';

// ── Modelos de e-mail (2 tipos, cada um com várias variações) ──────────────
// "pagina": convida a se cadastrar na plataforma (link geral).
// "demanda": convida a ver quantos clientes tem na região agora (link /demanda).
// A cada envio sorteia o TIPO e depois a VARIAÇÃO dentro dele — mistura os
// dois modelos na mesma fila em vez de mandar tudo de um tipo só, e nunca
// repete o mesmo texto/assunto sempre igual (padrão robótico = spam).
const MODELOS = {
  // Framework PAS (Problema → Agitação → Solução) em todas as variações:
  // nomeia uma dor real do corretor, mostra o custo de não resolver, e só
  // então apresenta a Match Imóveis como solução — com 1 único CTA por
  // email. Assuntos sem emoji de alarme/caps (gatilho de spam), sem
  // promessa não verificável (ex: prazo garantido de venda).
  pagina: [
    {
      assunto: 'Você está perdendo leads pra quem responde primeiro',
      corpo: `Olá {nome},

Todo dia, alguém procura um imóvel na sua região — e quem responde primeiro, com o imóvel certo, é quem fecha negócio.

A maioria dos corretores descobre o lead horas depois: mensagem perdida no WhatsApp, imóvel certo esquecido na planilha, visita nunca agendada.

A Match Imóveis resolve isso sozinha, 24 horas por dia:

• Cruza cada lead com os imóveis certos da sua carteira e da rede
• Monta a vitrine e envia pro cliente automaticamente
• Agenda a visita sem você precisar lembrar

Sem mensalidade fixa e sem comissão sobre venda. Teste agora com 1.000 créditos grátis.

— Equipe Match Imóveis`
    },
    {
      assunto: 'O corretor que usa IA fecha mais rápido que você',
      corpo: `Olá {nome},

Enquanto você responde um cliente no WhatsApp, um corretor que usa IA já está atendendo três — sem perder qualidade e sem esquecer ninguém.

A Match Imóveis faz por você:

• Cruza automaticamente cada lead com os imóveis certos
• Monta a vitrine e agenda a visita sozinha
• Funciona 24 horas por dia, mesmo fora do seu horário

Comece agora com 1.000 créditos grátis, sem compromisso.

— Equipe Match Imóveis`
    },
    {
      assunto: 'Sua carteira de imóveis pode estar rendendo mais',
      corpo: `Olá {nome},

Todo imóvel parado na carteira é uma venda que não está acontecendo. Na maioria das vezes o problema não é o imóvel — é não cruzar ele com o lead certo, na hora certa.

A Match Imóveis faz esse cruzamento sozinha, o dia inteiro:

• Recebe cada novo lead automaticamente
• Encontra os imóveis compatíveis na sua carteira e na rede
• Envia a vitrine sem você precisar lembrar

Teste agora com 1.000 créditos grátis, sem cartão de crédito.

— Equipe Match Imóveis`
    },
    {
      assunto: 'Enquanto você dorme, seus leads continuam chegando',
      corpo: `Olá {nome},

Lead não escolhe horário: chega de madrugada, no fim de semana, no meio de uma visita com outro cliente. Quem demora a responder, perde pro corretor que responde primeiro.

A Match Imóveis trabalha por você 24 horas por dia:

• Recebe o lead assim que ele chega
• Encontra o imóvel certo automaticamente
• Envia a vitrine sem depender da sua disponibilidade

Comece grátis agora, com 1.000 créditos pra testar.

— Equipe Match Imóveis`
    }
  ],
  demanda: [
    {
      assunto: 'Quantas pessoas buscam imóvel na sua região agora',
      corpo: `Olá {nome},

Agora mesmo, tem gente procurando imóvel na sua cidade e no seu bairro — não é estimativa, é dado real, minerado pela nossa IA todos os dias.

Em segundos você descobre:

• Quantos interessados reais existem na sua região
• Em quais bairros a demanda está maior
• Sem custo pra consultar, sem compromisso

E não é só ver o número: ao criar sua conta, esses leads já entram nela — você abre o painel e já tem gente pra atender hoje mesmo, não precisa esperar chegar cliente do zero.

Quem chega primeiro, atende primeiro.

— Equipe Match Imóveis`
    },
    {
      assunto: 'Tem lead esperando por um corretor na sua região',
      corpo: `Olá {nome},

Não são leads genéricos de cadastro — são pessoas reais buscando imóvel na sua cidade agora, identificadas em tempo real pela nossa IA.

• Veja quantos existem na sua região agora mesmo
• Sem custo pra consultar
• Sua conta já nasce com esses leads dentro — comece a atender hoje, não amanhã

— Equipe Match Imóveis`
    },
    {
      assunto: 'Sua região tem demanda — você só não viu o número ainda',
      corpo: `Olá {nome},

Descubra agora, de graça, quantas pessoas estão buscando imóvel no seu bairro e na sua cidade neste momento.

• Consulta gratuita, sem cadastro
• Sem mensalidade e sem comissão
• Leve esses leads pra sua conta e comece a atender no mesmo dia — ela já abre com eles dentro

— Equipe Match Imóveis`
    },
    {
      assunto: 'Alguém pode estar procurando imóvel perto de você agora',
      corpo: `Olá {nome},

Enquanto você lê este email, pode ter alguém buscando exatamente um imóvel na sua região — e a gente já sabe quem é.

• Veja o número real da sua região
• Grátis e sem cadastro
• Sua conta já entra com essas leads pra você atender — nada de começar do zero

Leva menos de 1 minuto pra consultar.

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
  await query(`ALTER TABLE campanha_contatos ADD COLUMN IF NOT EXISTS corpo_usado TEXT`);
  await query(`ALTER TABLE campanha_contatos ADD COLUMN IF NOT EXISTS aberto_em TIMESTAMP`);
  await query(`ALTER TABLE campanha_contatos ADD COLUMN IF NOT EXISTS clicado_em TIMESTAMP`);
  await query(`CREATE TABLE IF NOT EXISTS campanha_config (
    id INT PRIMARY KEY DEFAULT 1,
    ativo BOOLEAN DEFAULT false,
    atualizado_em TIMESTAMP DEFAULT NOW()
  )`);
  await query(`INSERT INTO campanha_config (id, ativo) VALUES (1, false) ON CONFLICT (id) DO NOTHING`);
  _colunasProntas = true;
  await _limparInvalidosAntigos();
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
// roda em lotes pequenos via job periódico (server.js). Email inválido é
// EXCLUÍDO da tabela (não só marcado) — não faz sentido guardar um contato
// que nunca vai poder receber nada.
async function validarProximoLote(limite = 50) {
  await _garantirColunas();
  const { rows } = await query(
    `SELECT id, email FROM campanha_contatos WHERE email_valido IS NULL LIMIT $1`,
    [limite]
  );
  let validos = 0, invalidos = 0;
  for (const c of rows) {
    const valido = await emailValido(c.email);
    if (valido) {
      validos++;
      await query(`UPDATE campanha_contatos SET email_valido=true WHERE id=$1`, [c.id]);
    } else {
      invalidos++;
      await query(`DELETE FROM campanha_contatos WHERE id=$1`, [c.id]);
    }
  }
  return { processados: rows.length, validos, invalidos };
}

// Limpeza única de inválidos que já tinham sido marcados email_valido=false
// em execuções anteriores (antes da validação passar a excluir na hora).
// Chamada só dentro de _garantirColunas(), que já roda 1x por boot.
async function _limparInvalidosAntigos() {
  try {
    const { rowCount } = await query(`DELETE FROM campanha_contatos WHERE email_valido = false`);
    if (rowCount) console.log(`[CAMPANHA] limpeza única: ${rowCount} contatos com email inválido excluídos`);
  } catch (e) { console.error('[CAMPANHA] erro na limpeza de invalidos antigos:', e.message); }
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
// Prioridade: região primeiro (SP > RJ > SC > resto), e DENTRO de cada
// região quem parece corretor/imobiliária/broker vai antes do resto —
// nunca mistura regiões (não manda um corretor do RJ antes de esgotar todo
// mundo de SP, mesmo os que não parecem corretor).
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
    ORDER BY COALESCE(cc.ddd_grupo, 3), (CASE WHEN cc.parece_corretor THEN 0 ELSE 1 END), cc.criado_em ASC
    LIMIT $1
  `, [limite]);
  return rows;
}

async function marcarEnviado(id, erro, extra = {}) {
  if (erro) {
    await query(`UPDATE campanha_contatos SET status='erro', erro=$1, enviado_em=NOW() WHERE id=$2`, [erro, id]);
  } else {
    await query(
      `UPDATE campanha_contatos SET status='enviado', enviado_em=NOW(), modelo_usado=$1, titulo_usado=$2, corpo_usado=$3 WHERE id=$4`,
      [extra.modelo || null, extra.titulo || null, extra.corpo || null, id]
    );
  }
}

// CTA em botão de verdade (não link solto no meio do texto), separado por
// tipo de modelo — "pagina" convida a testar a plataforma, "demanda" convida
// a consultar a demanda da região.
const CTA_POR_TIPO = {
  pagina: 'Testar grátis agora →',
  demanda: 'Ver demanda da minha região →'
};

function gerarHTML(mensagem, contato, tipo) {
  const trackPixel = `${BASE_URL}/campanha/track/open/${contato.id || 0}`;
  const trackLink = `${BASE_URL}/campanha/track/click/${contato.id || 0}`;
  const msg = mensagem.replace(/{nome}/g, contato.nome || 'Corretor');

  // Blocos separados por linha em branco. Bloco em que TODA linha começa
  // com "• " vira lista de tópicos; senão vira parágrafo normal.
  const corpoHtml = msg.split(/\n\n+/).map(bloco => {
    const linhas = bloco.split('\n').filter(l => l.trim());
    const ehLista = linhas.length > 1 && linhas.every(l => l.trim().startsWith('•'));
    if (ehLista) {
      const itens = linhas.map(l =>
        '<li style="margin:8px 0;padding-left:22px;position:relative"><span style="position:absolute;left:0;color:#00A699;font-weight:bold">✓</span>'
        + l.trim().replace(/^•\s*/, '') + '</li>'
      ).join('');
      return '<ul style="list-style:none;padding:18px 22px;margin:16px 0;background:#f9fafb;border-radius:10px;font-size:14.5px;color:#374151">' + itens + '</ul>';
    }
    return '<p style="margin:0 0 16px 0;font-size:15px;line-height:1.7;color:#222">' + bloco.replace(/\n/g, '<br>') + '</p>';
  }).join('');

  const ctaTexto = tipo && CTA_POR_TIPO[tipo];
  let ctaHtml = '';
  if (ctaTexto) {
    ctaHtml = '<a href="' + trackLink + '" style="display:inline-block;margin:8px 0 4px 0;padding:14px 28px;background:#FF385C;color:#fff;text-decoration:none;border-radius:8px;font-weight:bold;font-size:15px">' + ctaTexto + '</a>';
  }
  // Sem tipo (ex: envio de teste com texto livre) — mantém o link clicável
  // dentro do próprio texto, como já funcionava antes do botão existir.
  let corpoFinal = corpoHtml;
  if (!ctaTexto) {
    const _urlRegex = new RegExp(BASE_URL.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(/demanda)?', 'g');
    corpoFinal = corpoHtml.replace(_urlRegex, (match) => '<a href="' + trackLink + '" style="color:#FF385C">' + match + '</a>');
  }

  return `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:32px;color:#222">
    ${corpoFinal}
    ${ctaHtml}
    <p style="margin-top:20px;font-size:13px;color:#888">Para não receber mais emails, responda com CANCELAR.</p>
    <img src="${trackPixel}" width="1" height="1" style="display:none">
  </div>`;
}

// Um envio — chamado pelo job automático (server.js, intervalo aleatório
// de 30s a 5min entre cada chamada).
async function enviarProximo() {
  await _garantirColunas();
  await _backfillPrioridadePendente();
  if (!(await estaAtiva())) return { enviado: false, motivo: 'pausada' };

  const [contato] = await proximoLote(1);
  if (!contato) return { enviado: false, motivo: 'sem_elegiveis' };

  const modelo = _sortearModelo();
  const corpoPersonalizado = modelo.corpo.replace(/\{nome\}/g, contato.nome || 'Corretor');
  const html = gerarHTML(corpoPersonalizado, contato, modelo.tipo);
  try {
    await enviarEmail({ para: contato.email, assunto: modelo.assunto, html, texto: modelo.assunto });
    await marcarEnviado(contato.id, null, { modelo: modelo.tipo, titulo: modelo.assunto, corpo: modelo.corpo });
    return { enviado: true, email: contato.email, modelo: modelo.tipo, titulo: modelo.assunto };
  } catch (e) {
    await marcarEnviado(contato.id, e.message);
    return { enviado: false, motivo: 'erro_envio', erro: e.message };
  }
}

async function enviarTeste(emailTeste, { assunto, mensagem }) {
  const html = gerarHTML(mensagem.replace(/\{nome\}/g, 'Corretor Teste'), { id: 'teste' });
  await enviarEmail({ para: emailTeste, assunto: '[TESTE] ' + assunto, html, texto: assunto });
}

async function listarEnvios({ limite = 50, offset = 0 } = {}) {
  await _garantirColunas();
  const { rows } = await query(
    `SELECT cc.id, cc.nome, cc.email, cc.celular, cc.status, cc.modelo_usado, cc.titulo_usado, cc.enviado_em, cc.aberto_em, cc.clicado_em, cc.erro,
            (LOWER(cc.email) IN (SELECT LOWER(email) FROM usuarios WHERE email IS NOT NULL AND email != '')) AS cadastrou
     FROM campanha_contatos cc
     WHERE cc.status = 'enviado' OR cc.status = 'erro'
     ORDER BY cc.enviado_em DESC
     LIMIT $1 OFFSET $2`,
    [limite, offset]
  );
  return rows;
}

// Reconstrói o HTML exatamente como foi enviado (mesmo assunto/corpo), pro
// admin conferir no modal de preview.
async function buscarEnvioParaPreview(id) {
  await _garantirColunas();
  const { rows } = await query(`SELECT * FROM campanha_contatos WHERE id=$1`, [id]);
  const envio = rows[0];
  if (!envio) return null;
  const corpoPersonalizado = (envio.corpo_usado || '').replace(/\{nome\}/g, envio.nome || 'Corretor');
  const html = gerarHTML(corpoPersonalizado, envio, envio.modelo_usado);
  return { ...envio, html };
}

module.exports = {
  importarContatos, statsBase, statsTracking, statsCadastrados, statsValidacao,
  proximoLote, enviarTeste, enviarProximo,
  iniciarCampanha, pausarCampanha, estaAtiva, buscarEnvioParaPreview,
  validarProximoLote, listarEnvios
};
