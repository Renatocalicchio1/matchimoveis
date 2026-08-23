const https = require('https');

// Gera legenda de post institucional pro Instagram da marca MatchImóveis —
// SEMPRE a partir de um fato real passado pelo chamador (feature real do
// cerebro.js, conceito real, ou número real agregado da base), nunca livre —
// mesma disciplina de "nunca inventar dado" já usada no prompt do assistente
// (cerebro/groq-ia.js), só que aplicada a copy de marketing em vez de
// resposta de chat. Reaproveita a MESMA infra Groq (env var, endpoint,
// modelo) — não é um provedor de IA novo.
const GROQ_API_KEY = (process.env.GROQ_API_KEY || '').trim();
const MODEL = 'openai/gpt-oss-20b';

const _INSTRUCOES_POR_TIPO = {
  feature: 'O fato é uma funcionalidade real da plataforma. Escreva um post explicando o benefício pro corretor/imobiliária de forma simples, terminando com uma chamada pra conhecer a MatchImóveis.',
  dica: 'O fato é um conceito real da plataforma. Escreva um post em formato de dica prática pro corretor imobiliário, mostrando como isso ajuda no dia a dia dele.',
  prova_social: 'O fato é um número real agregado da rede de corretores da plataforma. Escreva um post de prova social, mostrando o resultado de forma que gere confiança em quem ainda não usa a plataforma.'
};

function gerarLegendaInstagram({ tipo, fato }) {
  return new Promise((resolve, reject) => {
    if (!GROQ_API_KEY) return reject(new Error('GROQ_API_KEY não configurada'));
    const instrucao = _INSTRUCOES_POR_TIPO[tipo] || _INSTRUCOES_POR_TIPO.feature;

    const systemPrompt = `Você escreve a legenda do post institucional do Instagram da MatchImóveis (plataforma de CRM + match automático de imóveis pra corretores e imobiliárias brasileiras).

REGRAS:
- Português BR, tom direto e confiante, sem exagero nem emoji em excesso (no máx 3 emojis no post inteiro).
- Baseie o post SÓ no fato fornecido — nunca invente número, funcionalidade ou dado que não esteja no fato.
- Formato: 1 frase de gancho, 2-4 linhas de corpo, 1 chamada pra ação no fim (ex: "Link na bio" ou "Conheça a MatchImóveis").
- Até 4 hashtags no final, relacionadas a corretor de imóveis / proptech, nada genérico demais.
- Não use aspas ao redor do texto todo, devolva só a legenda pronta pra colar no Instagram.`;

    const body = JSON.stringify({
      model: MODEL,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `Tipo de post: ${tipo}\nInstrução: ${instrucao}\nFato real: ${fato}` }
      ],
      max_tokens: 400,
      temperature: 0.6
    });

    const options = {
      hostname: 'api.groq.com',
      path: '/openai/v1/chat/completions',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + GROQ_API_KEY,
        'Content-Length': Buffer.byteLength(body)
      },
      timeout: 15000
    };

    const req = https.request(options, res => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        if (res.statusCode < 200 || res.statusCode >= 300) {
          return reject(new Error('Groq HTTP ' + res.statusCode + ': ' + data.slice(0, 300)));
        }
        try {
          const json = JSON.parse(data);
          const texto = json.choices?.[0]?.message?.content;
          if (texto) resolve(texto.trim());
          else reject(new Error('Resposta vazia (HTTP ' + res.statusCode + '): ' + data.slice(0, 200)));
        } catch (e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Timeout Groq')); });
    req.write(body);
    req.end();
  });
}

module.exports = { gerarLegendaInstagram };
