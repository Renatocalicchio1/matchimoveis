'use strict';
const https = require('https');
const fs    = require('fs');
const path  = require('path');

const GROQ_API_KEY = (process.env.GROQ_API_KEY||'').trim();
const MODEL = 'llama-3.1-8b-instant';

let _contextoGroq = null;
function getContextoGroq() {
  if (_contextoGroq) return _contextoGroq;
  try {
    const raw = JSON.parse(fs.readFileSync(path.join(__dirname,'contexto-groq.json'),'utf8'));
    const paginas  = (raw.paginas||[]).map(p => p.label+' → '+p.rota+(p.descricao?' ('+p.descricao+')':'')).join('\n');
    const fluxos   = (raw.fluxos||[]).map(f => '• '+f.titulo+': '+f.passos.join(' → ')).join('\n');
    const conceitos = Object.entries(raw.conceitos||{}).map(e => e[0]+': '+e[1]).join('\n');
    _contextoGroq = 'PÁGINAS:\n'+paginas+'\n\nFLUXOS:\n'+fluxos+'\n\nCONCEITOS:\n'+conceitos;
  } catch(e) { _contextoGroq = ''; }
  return _contextoGroq;
}

function chamarGroq(mensagem, ctx, historico) {
  return new Promise(function(resolve, reject) {
    if (!GROQ_API_KEY) return reject(new Error('GROQ_API_KEY não configurada'));

    const ctxGroq = getContextoGroq();

    const systemPrompt = `Você é o assistente inteligente do MatchImóveis, CRM imobiliário brasileiro.

DADOS REAIS DO CORRETOR (${ctx.corretor}):
- Imóveis: ${ctx.ativos} ativos | ${ctx.inativos} inativos | ${ctx.semFoto} sem foto | ${ctx.semProprietario} sem proprietário
- Leads: ${ctx.leads} total | ${ctx.comMatch} com match | ${ctx.semMatch} sem match | ${ctx.importadas||0} importadas | ${ctx.organicas||0} orgânicas
- Leads por temperatura: ${ctx.quentes} quentes | ${ctx.mornos||0} mornas | ${ctx.frias} frias
- Leads por funil: ${ctx.comVisita} em visita | ${ctx.comProposta||0} em proposta | ${ctx.fechadas} fechadas
- Leads por status: ${ctx.vitrine_enviada||0} com vitrine enviada | ${ctx.comPerfilIA||0} com perfil IA | ${ctx.comMensagensWA||0} com mensagens WA
- Visitas: ${ctx.visitas} total | ${ctx.visitasHoje} hoje | ${ctx.pendentes} solicitadas | ${ctx.confirmadas} confirmadas | ${ctx.realizadas} realizadas | ${ctx.canceladas||0} canceladas
- Bairros na carteira: ${ctx.bairrosCarteira||'nenhum'}

LEADS QUENTES:
${ctx.leadsQuentes||'nenhuma lead quente'}

LEADS RECENTES:
${ctx.leadsRecentes||'nenhuma lead recente'}

BAIRROS MAIS BUSCADOS:
${ctx.topBairros||'sem dados'}

TIPOS MAIS BUSCADOS:
${ctx.topTipos||'sem dados'}

${/* limite bem folgado (~20k chars = ~5k tokens) pro modelo llama-3.1-8b-instant,
   que suporta contexto bem maior — cerebro.js é a fonte única de conhecimento
   da plataforma, não duplicar texto aqui nunca mais */ ''}${ctxGroq ? ctxGroq.slice(0,20000) : ''}

${ctx.feedbacks ? ctx.feedbacks.slice(0,500) : ''}

REGRAS: Português BR. MUITO direto, máx 2 linhas. Negrito para números. Nunca invente dados — se a página/fluxo não estiver nas seções acima, diga que não sabe em vez de inventar. Nunca cite URLs técnicas, use nome do menu. Sem enrolação. Nunca diga "R$" ao falar de consumo de coins — coins e reais são unidades diferentes.`;

    const messages = [{ role: 'system', content: [{ type: 'text', text: systemPrompt, cache_control: { type: 'ephemeral' } }] }];

    if (historico && historico.length) {
      historico.slice(-4).forEach(function(h) {
        messages.push({ role: 'user', content: String(h.pergunta||'').slice(0,300) });
        messages.push({ role: 'assistant', content: String(h.resposta||'').replace(/<[^>]+>/g,'').slice(0,400) });
      });
    }

    messages.push({ role: 'user', content: mensagem });

    const body = JSON.stringify({
      model: MODEL,
      messages,
      max_tokens: 500,
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
      timeout: 12000,
    };

    const req = https.request(options, function(res) {
      let data = '';
      res.on('data', function(chunk) { data += chunk; });
      res.on('end', function() {
        try {
          const json = JSON.parse(data);
          const texto = json.choices?.[0]?.message?.content;
          if (texto) resolve(texto.trim());
          else reject(new Error('Resposta vazia: ' + data.slice(0,200)));
        } catch(e) { reject(e); }
      });
    });

    req.on('error', reject);
    req.on('timeout', function() { req.destroy(); reject(new Error('Timeout Groq')); });
    req.write(body);
    req.end();
  });
}

module.exports = { chamarGroq };
