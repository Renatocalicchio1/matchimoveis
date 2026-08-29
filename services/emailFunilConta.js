const { enviarEmail } = require('./email');
const { query } = require('./db');
const { atualizarUsuario } = require('./salvarUsuario');

const BASE_URL = 'https://www.matchimoveis.ia.br';

// E-mail por ESTÁGIO DE CONTA (ago/2026, pedido explícito: "continuar
// recebendo os emails conforme sua etapa de funil", pra TODO corretor já
// cadastrado — não só quem veio da campanha fria de aquisição). Cobre os 2
// estágios que ainda precisam andar (mesma lógica de _estagioConta em
// server.js, usada em /admin/funil):
//   convertido — tem conta, nunca usou o produto (sem XML, sem imóvel, sem
//                lead) — NENHUM e-mail existente cobria esse caso; escrito
//                do zero, 4 variações.
//   ativado    — já usou o produto mas não comprou — reaproveita o
//                followup3 já existente em services/campanha.js (mesma
//                situação: "tem conta, tá quase lá, falta comprar"), via
//                gerarEmailPorTipo() exportado de lá.
// "cliente" não entra aqui: já recebe o popup de afiliados + convite de
// indicação por e-mail — um 3º canal pedindo a mesma coisa seria repetitivo.
const VARIANTES_CONVERTIDO = [
  {
    assunto: 'Sua conta na MatchImóveis existe — só falta usar',
    headline: 'O primeiro imóvel é o que destrava tudo',
    corpo: `Você criou sua conta, mas ainda não colocou nenhum imóvel — nem manual, nem XML. Enquanto isso, a IA não tem o que cruzar com lead nenhuma.

Se você já usa outro sistema, importa o XML em menos de 2 minutos. Se não, cadastra o primeiro imóvel na mão — o segundo já sai mais rápido.`,
    botao: 'Cadastrar agora'
  },
  {
    assunto: '1.000 créditos parados, esperando 1 imóvel',
    headline: 'Os créditos de boas-vindas já estão aí — só falta usar',
    corpo: `Sua conta já tem os créditos de bônus, mas eles não fazem nada sozinhos. O motor de match só entra em ação depois que existe pelo menos 1 imóvel na sua carteira.

Importa seu XML (se seu site já gera um) ou cadastra o primeiro na mão — os dois levam poucos minutos.`,
    botao: 'Ver como cadastrar'
  },
  {
    assunto: 'Cada dia sem imóvel cadastrado é um lead que passa direto',
    headline: 'Sem imóvel na carteira, não tem o que a IA cruzar',
    corpo: `Enquanto sua carteira fica vazia, qualquer lead que bateria com o seu perfil de imóvel simplesmente não encontra você — porque não tem nada pra encontrar ainda.

Resolve isso agora: importa o XML do seu site ou cadastra o primeiro imóvel manualmente.`,
    botao: 'Cadastrar meu primeiro imóvel'
  },
  {
    assunto: 'Você criou a conta — falta o passo que faz ela valer a pena',
    headline: 'Conta criada não é a mesma coisa que conta em uso',
    corpo: `Cadastro feito, créditos na conta, e ainda assim nada acontece — porque falta o primeiro imóvel. É esse passo que liga o motor de match e começa a trazer lead de verdade.

Leva poucos minutos, e você não precisa repetir isso imóvel por imóvel: se já tem XML, importa tudo de uma vez.`,
    botao: 'Importar ou cadastrar agora'
  }
];

function _montarHtmlConvertido(nome, v, codigo) {
  const corpoHtml = v.corpo.split(/\n\n+/).map(p =>
    '<p style="margin:0 0 16px 0;font-size:15px;line-height:1.7;color:#222">' + p.replace(/\n/g, '<br>') + '</p>'
  ).join('');
  return `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:32px">
    <h2 style="color:#FF385C;margin-top:0">${v.headline}</h2>
    <p>Olá, <strong>${nome}</strong>!</p>
    ${corpoHtml}
    <a href="${BASE_URL}/app/cadastro" style="display:inline-block;padding:12px 24px;background:#FF385C;color:#fff;text-decoration:none;border-radius:8px;font-weight:bold;font-size:15px">${v.botao} →</a>
    <p style="margin-top:32px;color:#888;font-size:12px">MatchImóveis • matchimoveis.ia.br</p>
    <p style="margin-top:8px;color:#9ca3af;font-size:11px;line-height:1.6">Não quer mais receber estes e-mails? <a href="${BASE_URL}/email/cancelar?u=${codigo}" style="color:#9ca3af">Cancelar recebimento</a></p>
  </div>`;
}

function _varianteDeterministica(lista, codigo) {
  let h = 0;
  const s = String(codigo);
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return lista[h % lista.length];
}

// Conta imóveis/leads por dono direto em SQL (COALESCE dos vários nomes de
// coluna de dono que o sistema usa historicamente — mesma convenção de
// fallback duplo documentada no topo do projeto) — mais barato que carregar
// as tabelas inteiras num service que não tem acesso ao cache em memória
// de server.js.
async function enviarEmailFunilConta() {
  try {
    const { BONUS_CADASTRO } = require('./creditos');
    const { rows } = await query(`
      SELECT u.codigo_usuario, u.nome, u.email, u.xml_url,
        COALESCE(im.cnt, 0) AS imoveis_count,
        COALESCE(ld.cnt, 0) AS leads_count
      FROM usuarios u
      LEFT JOIN (
        SELECT COALESCE(user_id, usuario_id, codigo_usuario, corretor_id) AS uid, COUNT(*) AS cnt
        FROM imoveis GROUP BY 1
      ) im ON im.uid = u.codigo_usuario
      LEFT JOIN (
        SELECT COALESCE(user_id, codigo_usuario) AS uid, COUNT(*) AS cnt
        FROM leads GROUP BY 1
      ) ld ON ld.uid = u.codigo_usuario
      WHERE u.email IS NOT NULL AND u.email != '' AND u.ativo = true
        AND COALESCE((u.dados->>'emailOptOut')::boolean, false) = false
        AND COALESCE((u.dados->>'afiliadoRestrito')::boolean, false) = false
        AND COALESCE(u.match_coins_total, 0) <= ${BONUS_CADASTRO}
        AND (u.dados->>'nudgeFunilEnviadoEm' IS NULL OR (u.dados->>'nudgeFunilEnviadoEm')::timestamp <= NOW() - INTERVAL '7 days')
      ORDER BY u.criado_em ASC
      LIMIT 500
    `);

    console.log('[EMAIL FUNIL CONTA] elegiveis:', rows.length);

    for (const u of rows) {
      try {
        const ativado = !!u.xml_url || Number(u.imoveis_count) > 0 || Number(u.leads_count) > 0;
        let assunto, html;
        if (ativado) {
          const { gerarEmailPorTipo } = require('./campanha');
          const r = await gerarEmailPorTipo('followup3', u.nome);
          assunto = r.assunto; html = r.html;
        } else {
          const v = _varianteDeterministica(VARIANTES_CONVERTIDO, u.codigo_usuario);
          assunto = v.assunto; html = _montarHtmlConvertido(u.nome, v, u.codigo_usuario);
        }
        await enviarEmail({
          para: u.email, assunto, html, texto: assunto,
          tipo: 'funil_conta_' + (ativado ? 'ativado' : 'convertido'),
          userId: u.codigo_usuario
        });
        await atualizarUsuario(u.codigo_usuario, { nudgeFunilEnviadoEm: new Date().toISOString() });
        console.log('[EMAIL FUNIL CONTA] enviado:', u.email, '| estágio:', ativado ? 'ativado' : 'convertido');
        await new Promise(r => setTimeout(r, 1000));
      } catch (e) { console.error('[EMAIL FUNIL CONTA] erro:', u.email, e.message); }
    }
  } catch (e) { console.error('[EMAIL FUNIL CONTA] erro geral:', e.message); }
}

module.exports = { enviarEmailFunilConta };
