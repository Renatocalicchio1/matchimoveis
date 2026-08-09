// Reenvia o convite "cadastre seu imóvel" (primeiro envio em
// services/salvarLead.js) pra leads que buscaram imóvel, já receberam o
// convite, mas ainda não cadastraram o próprio imóvel. Cadência: a cada 15
// dias nos 2 primeiros reenvios, depois a cada 30 dias — repete até ela
// cadastrar.
//
// "Já cadastrou" é checado por telefone/email batendo com uma lead de
// captação (tipo_lead='cliente_vendedor') já existente pro mesmo corretor —
// mesmo critério de dedup já usado em POST /captar/iniciar/:userId (o
// cadastro público não liga de volta na lead de origem por id, só por
// telefone/transação, então o "já cadastrou" tem que casar do mesmo jeito).
const { enviarEmail } = require('./email');
const { query } = require('./db');

async function enviarEmailsCaptacaoResend() {
  try {
    const { rows } = await query(`
      SELECT id, nome, telefone, whatsapp, email, user_id, codigo_usuario, dados
      FROM leads
      WHERE email IS NOT NULL AND email != ''
        AND COALESCE(tipo_lead, '') != 'cliente_vendedor'
        AND COALESCE(origem, '') != 'captacao_link'
        AND dados ? 'captacaoEmailUltimoEnvio'
    `);
    console.log('[CAPTACAO RESEND] candidatas:', rows.length);

    let enviados = 0, jaCadastraram = 0;
    for (const l of rows) {
      try {
        const dados = l.dados || {};
        if (dados.temImovelParaCaptar === true) continue;
        const reenvios = dados.captacaoEmailReenvios || 0;
        const ultimoEnvio = new Date(dados.captacaoEmailUltimoEnvio);
        if (isNaN(ultimoEnvio.getTime())) continue;
        const diasDesde = Math.floor((Date.now() - ultimoEnvio.getTime()) / (24 * 3600 * 1000));
        const intervalo = reenvios < 2 ? 15 : 30;
        if (diasDesde < intervalo) continue;

        const userId = l.user_id || l.codigo_usuario;
        if (!userId) continue;

        // Já cadastrou o imóvel? (mesmo corretor + telefone ou email batendo
        // com uma lead de captação existente) — se sim, pula pra sempre (a
        // condição WHERE já filtra ela mesma se algum dia essa lead virar
        // cliente_vendedor, mas cadastros pelo fluxo público criam uma lead
        // NOVA, então precisa checar cruzado).
        const tel8 = String(l.telefone || l.whatsapp || '').replace(/\D/g, '').slice(-8);
        const emailNorm = String(l.email || '').toLowerCase().trim();
        const condicoes = [];
        const params = [userId];
        if (tel8) { params.push('%' + tel8); condicoes.push(`(telefone LIKE $${params.length} OR whatsapp LIKE $${params.length})`); }
        if (emailNorm) { params.push(emailNorm); condicoes.push(`LOWER(email) = $${params.length}`); }
        if (condicoes.length) {
          const { rows: _jaCap } = await query(
            `SELECT 1 FROM leads WHERE (user_id=$1 OR codigo_usuario=$1) AND tipo_lead='cliente_vendedor' AND (${condicoes.join(' OR ')}) LIMIT 1`,
            params
          );
          if (_jaCap.length) { jaCadastraram++; continue; }
        }

        const linkCap = 'https://matchimoveis.ia.br/captar/' + userId;
        await enviarEmail({
          para: l.email,
          assunto: 'Cadastre seu imóvel — MatchImóveis',
          html: '<div style="font-family:Arial,sans-serif;max-width:600px;padding:32px"><h2 style="color:#FF385C">Olá, ' + (l.nome || '') + '!</h2><p>Se você tiver um imóvel para venda ou locação, você pode cadastrar as informações básicas do seu imóvel que nosso time entrará em contato.</p><p>Clique no botão abaixo — o processo é simples e rápido.</p><a href="' + linkCap + '" style="display:inline-block;margin-top:16px;padding:12px 24px;background:#FF385C;color:#fff;text-decoration:none;border-radius:8px;font-weight:bold">Cadastrar meu imóvel →</a></div>',
          texto: 'Cadastre seu imovel: ' + linkCap
        });

        await query(`UPDATE leads SET dados = dados || $1::jsonb WHERE id = $2`, [
          JSON.stringify({ captacaoEmailUltimoEnvio: new Date().toISOString(), captacaoEmailReenvios: reenvios + 1 }),
          l.id
        ]);
        enviados++;
        console.log('[CAPTACAO RESEND] reenviado (tentativa ' + (reenvios + 1) + '):', l.email);
      } catch (eLead) { console.error('[CAPTACAO RESEND] erro na lead', l.id, ':', eLead.message); }
    }
    console.log('[CAPTACAO RESEND] total reenviado:', enviados, '| já tinham cadastrado:', jaCadastraram);
  } catch (e) { console.error('[CAPTACAO RESEND] erro geral:', e.message); }
}

module.exports = { enviarEmailsCaptacaoResend };
