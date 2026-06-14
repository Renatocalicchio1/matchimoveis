'use strict';
const https = require('https');

const GROQ_API_KEY = process.env.GROQ_API_KEY;
const MODEL = 'llama-3.1-8b-instant';

const SYSTEM_PROMPT = `Você é o assistente inteligente do MatchImóveis, uma plataforma de CRM imobiliário brasileiro.

REGRAS:
- Responda SEMPRE em português brasileiro
- Seja direto e objetivo — máximo 3 parágrafos
- Use HTML simples quando útil: <strong>, <br>, listas com •
- Nunca invente dados — use apenas o contexto fornecido
- Se não souber, diga "Não tenho essa informação no momento"
- Foque em ajudar o corretor a usar o sistema

SOBRE O SISTEMA:
- MatchImóveis tem: Imóveis, Leads, Visitas, Match automático, Vitrine, WhatsApp, Portais XML, Coins
- Match = cruzar lead com imóvel por bairro + tipo + quartos + valor
- Vitrine = página enviada ao lead com imóveis em match
- Coins = créditos do sistema (R$20 = 1.000 coins)
- Portais = VivaReal, ZAP, OLX, Chaves, ImovelWeb, 123i, QuintoAndar`;

function chamarGroq(mensagem, contexto, historico) {
  return new Promise((resolve, reject) => {
    if (!GROQ_API_KEY) return reject(new Error('GROQ_API_KEY não configurada'));

    const messages = [
      { role: 'system', content: SYSTEM_PROMPT + '\n\nCONTEXTO DO USUÁRIO:\n' + JSON.stringify(contexto || {}, null, 2) }
    ];

    if (historico && historico.length) {
      historico.slice(-4).forEach(h => {
        messages.push({ role: 'user', content: h.pergunta });
        messages.push({ role: 'assistant', content: h.resposta.replace(/<[^>]+>/g,'').slice(0,200) });
      });
    }

    messages.push({ role: 'user', content: mensagem });

    const body = JSON.stringify({
      model: MODEL,
      messages,
      max_tokens: 400,
      temperature: 0.3,
    });

    const options = {
      hostname: 'api.groq.com',
      path: '/openai/v1/chat/completions',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + GROQ_API_KEY,
        'Content-Length': Buffer.byteLength(body),
      },
      timeout: 8000,
    };

    const req = https.request(options, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          const texto = json.choices && json.choices[0] && json.choices[0].message && json.choices[0].message.content;
          if (texto) resolve(texto.trim());
          else reject(new Error('Resposta vazia da Groq'));
        } catch(e) { reject(e); }
      });
    });

    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Timeout Groq')); });
    req.write(body);
    req.end();
  });
}

module.exports = { chamarGroq };
