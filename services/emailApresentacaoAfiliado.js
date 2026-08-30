const { enviarEmail } = require('./email');

const BASE_URL = 'https://matchimoveis.ia.br';

// Apresentação de mão dupla no programa de afiliados (ago/2026, pedido
// explícito do Renato): toda vez que alguém entra numa rede de afiliado
// (indicadoPor preenchido no cadastro, ver POST /login e /entrar/:contatoId
// em server.js), dispara 2 e-mails — um pro que ACABOU de entrar
// apresentando quem está acima dele na rede, outro pro que JÁ estava
// avisando que alguém entrou embaixo. Reaproveita o mesmo padrão simples de
// emailOnboardingPassos.js (sem A/B de variante — é transacional 1:1, não
// campanha de alcance). Fire-and-forget nos dois call sites (.catch no
// chamador), igual o resto dos bônus de indicação — não pode travar o
// cadastro se o envio de e-mail falhar.

function enviarApresentacaoNovoAfiliado({ paraEmail, novoNome, acimaNome }) {
  if (!paraEmail) return Promise.resolve({ skipped: true });
  const nome = novoNome || 'Corretor';
  const acima = acimaNome || 'seu indicador';
  const html = `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:32px">
    <h2 style="color:#FF385C;margin-top:0">🤝 Conheça quem está com você na MatchImóveis</h2>
    <p>Oi, ${nome}!</p>
    <p>Seja bem-vindo(a) ao programa de afiliados da MatchImóveis. A partir de agora, <strong>${acima}</strong> é quem está conectado logo acima de você na rede — já está na plataforma há mais tempo e pode te ajudar a entender como tudo funciona.</p>
    <p>Isso não muda nada no seu ganho: você continua recebendo sua comissão normal em cima de quem <em>você</em> indicar. ${acima} só participa de uma fatia extra quando a <em>sua</em> rede cresce — é assim que o programa incentiva todo mundo a crescer junto.</p>
    <p>Qualquer dúvida sobre como funciona, pode chamar ${acima} ou nosso time.</p>
    <a href="${BASE_URL}/app/afiliados" style="display:inline-block;margin-top:16px;padding:12px 24px;background:#FF385C;color:#fff;text-decoration:none;border-radius:8px;font-weight:bold">Ver minha rede de afiliados →</a>
    <p style="margin-top:32px;color:#888;font-size:12px">MatchImóveis • matchimoveis.ia.br</p>
  </div>`;
  const texto = `Oi ${nome}! ${acima} é quem está conectado logo acima de você na rede de afiliados da MatchImóveis. Isso não muda seu ganho — você continua recebendo sua comissão normal. Veja sua rede: ${BASE_URL}/app/afiliados`;
  return enviarEmail({ para: paraEmail, assunto: '🤝 Conheça quem está com você na MatchImóveis', html, texto, tipo: 'apresentacao_afiliado_novo' });
}

function enviarApresentacaoAfiliadoAcima({ paraEmail, acimaNome, novoNome, userId }) {
  if (!paraEmail) return Promise.resolve({ skipped: true });
  const acima = acimaNome || 'Corretor';
  const novo = novoNome || 'Alguém';
  const html = `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:32px">
    <h2 style="color:#FF385C;margin-top:0">🎉 Alguém entrou na sua rede de afiliados</h2>
    <p>Oi, ${acima}!</p>
    <p><strong>${novo}</strong> acabou de entrar na MatchImóveis pelo seu link de indicação e agora faz parte da sua rede.</p>
    <p>A partir de agora, toda vez que ${novo} indicar alguém, você também ganha uma fatia da comissão dessa venda — além do que você já ganha nas suas próprias indicações.</p>
    <p>Vale a pena chamar ${novo} pra se apresentar e ajudar a começar bem — quanto mais rápido a rede dele(a) cresce, mais você também ganha.</p>
    <a href="${BASE_URL}/app/afiliados" style="display:inline-block;margin-top:16px;padding:12px 24px;background:#FF385C;color:#fff;text-decoration:none;border-radius:8px;font-weight:bold">Ver minha rede →</a>
    <p style="margin-top:32px;color:#888;font-size:12px">MatchImóveis • matchimoveis.ia.br</p>
  </div>`;
  const texto = `Oi ${acima}! ${novo} acabou de entrar na MatchImóveis pelo seu link e agora faz parte da sua rede de afiliados. Veja sua rede: ${BASE_URL}/app/afiliados`;
  return enviarEmail({ para: paraEmail, assunto: '🎉 Alguém entrou na sua rede de afiliados', html, texto, tipo: 'apresentacao_afiliado_acima', userId: userId || null });
}

module.exports = { enviarApresentacaoNovoAfiliado, enviarApresentacaoAfiliadoAcima };
