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
- Imóveis ativos: ${ctx.ativos} | Inativos: ${ctx.inativos} | Sem foto: ${ctx.semFoto} | Sem proprietário: ${ctx.semProprietario}
- Leads: ${ctx.leads} total | Com match: ${ctx.comMatch} | Sem match: ${ctx.semMatch}
- Leads quentes: ${ctx.quentes} | Frias: ${ctx.frias} | Com visita: ${ctx.comVisita} | Fechadas: ${ctx.fechadas}
- Visitas: ${ctx.visitas} total | Hoje: ${ctx.visitasHoje} | Pendentes: ${ctx.pendentes} | Confirmadas: ${ctx.confirmadas} | Realizadas: ${ctx.realizadas}
- Bairros na carteira: ${ctx.bairrosCarteira||'nenhum'}

LEADS QUENTES:
${ctx.leadsQuentes||'nenhuma lead quente'}

LEADS RECENTES:
${ctx.leadsRecentes||'nenhuma lead recente'}

BAIRROS MAIS BUSCADOS:
${ctx.topBairros||'sem dados'}

TIPOS MAIS BUSCADOS:
${ctx.topTipos||'sem dados'}

${ctxGroq ? ctxGroq.slice(0,2000) : ''}

${ctx.feedbacks ? ctx.feedbacks.slice(0,500) : ''}

PÁGINAS DO SISTEMA (use para dar links):
- /app-home → Dashboard
- /app/imoveis → Carteira de imóveis
- /app/leads → Kanban de leads
- /app/visitas → Kanban de visitas
- /app/mapa → Mapa interativo
- /app/portais → URLs XML para portais
- /app/perfil → Dados da conta e WhatsApp
- /app/coins → Saldo de créditos
- /app/feed → Feed de imóveis
- /app/parceria-quintoandar → Integração QuintoAndar

CONCEITOS:
- Match = cruzar lead com imóvel por bairro+tipo+quartos+valor
- Vitrine = página exclusiva enviada ao lead via WhatsApp com imóveis em match
- Match Coins = créditos da plataforma (R$1 = 50 coins)
- Temperatura lead: fria → morna → quente → super quente
- fase_funil: novo → contato → visita → proposta → fechado

REGRAS:
- Responda SEMPRE em português brasileiro
- Seja MUITO direto — máximo 2 linhas por resposta, sem enrolação
- Use **negrito** para destacar números e termos importantes
- Use • para listas
- Nunca invente dados — use apenas os dados acima
- Se perguntarem sobre uma lead específica que não está nos dados, diga que não tem esse detalhe disponível aqui
- NUNCA mencione caminhos de URL como /app/leads ou /app/imoveis — use sempre linguagem natural como "no menu clique em Leads", "acesse Imóveis no menu", "vá em Visitas"
- Quando sugerir uma ação, use o nome do menu, não o caminho técnico`;

    const messages = [{ role: 'system', content: systemPrompt }];

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
      max_tokens: 250,
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
