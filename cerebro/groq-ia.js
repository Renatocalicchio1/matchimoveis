'use strict';
const https = require('https');
const fs = require('fs');
const path = require('path');

const GROQ_API_KEY = process.env.GROQ_API_KEY;
const MODEL = 'llama-3.1-8b-instant';

// Carregar contexto-groq.json uma vez
let _contextoGroq = null;
function getContextoGroq() {
  if (_contextoGroq) return _contextoGroq;
  try {
    const raw = JSON.parse(fs.readFileSync(path.join(__dirname,'contexto-groq.json'),'utf8'));
    const paginas = raw.paginas.map(function(p){ return p.label + ' → ' + p.rota + (p.descricao?' ('+p.descricao+')':''); }).join('\n');
    const fluxos = raw.fluxos.map(function(f){ return '• ' + f.titulo + ': ' + f.passos.join(' → '); }).join('\n');
    const conceitos = Object.entries(raw.conceitos || {}).map(function(e){ return e[0]+': '+e[1]; }).join('\n');
    _contextoGroq = 'PÁGINAS:\n'+paginas+'\n\nFLUXOS:\n'+fluxos+'\n\nCONCEITOS:\n'+conceitos;
  } catch(e) { _contextoGroq = ''; }
  return _contextoGroq;
}

// Carregar mapa do sistema uma vez
let _mapaCompleto = null;
function getMapaCompleto() {
  if (_mapaCompleto) return _mapaCompleto;
  try {
    const raw = JSON.parse(fs.readFileSync(path.join(__dirname,'mapa-completo.json'),'utf8'));
    
    // Rotas principais do app
    const rotasApp = (raw.server && raw.server.rotas || [])
      .filter(function(r){ return r.rota && r.rota.startsWith('/app'); })
      .map(function(r){ return r.metodo + ' ' + r.rota; })
      .join('\n');
    
    // Views com campos e links
    const views = raw.views || {};
    const viewsStr = Object.entries(views)
      .filter(function(e){ return e[0].startsWith('app-'); })
      .slice(0, 20)
      .map(function(e) {
        const nome = e[0];
        const v = e[1];
        const campos = (v.inputs || []).slice(0,5).join(', ');
        const links = (v.links || []).slice(0,5).join(', ');
        return nome + (campos ? ' [campos: '+campos+']' : '') + (links ? ' [links: '+links+']' : '');
      })
      .join('\n');
    
    _mapaCompleto = 'ROTAS:\n' + rotasApp + '\n\nVIEWS:\n' + viewsStr;
  } catch(e) { _mapaCompleto = ''; }
  return _mapaCompleto;
}

const SYSTEM_PROMPT = `Você é o assistente inteligente do MatchImóveis, plataforma brasileira de CRM imobiliário.

PÁGINAS DO SISTEMA:
- /app-home → Dashboard com KPIs, funil de leads, heatmap de bairros
- /app/imoveis → Carteira de imóveis com filtros e seleção em lote
- /app/cadastro → Cadastrar imóvel ou importar via URL XML
- /app/leads → Kanban de leads por status e temperatura
- /app/lead/:id → Detalhe da lead com perfil, match e histórico
- /app/visitas → Kanban de visitas por status
- /app/mapa → Mapa com imóveis e visitas
- /app/portais → URLs XML para portais (VivaReal, ZAP, OLX, Chaves, ImovelWeb, 123i)
- /app/perfil → Dados da conta, WhatsApp, QuintoAndar, senha
- /app/whatsapp → Inbox de mensagens WhatsApp
- /app/whatsapp/qrcode → Conectar WhatsApp via QR code
- /app/coins → Saldo de Match Coins e histórico
- /app/assistente → Este chat assistente
- /app/parceiros → Corretores parceiros e comissões
- /app/feed → Feed de imóveis

CONCEITOS:
- Match = cruzar lead com imóvel por bairro + tipo + quartos + valor (-30%/+20%)
- Vitrine = página exclusiva enviada ao lead com imóveis em match
- Coins = créditos: match 20, vitrine WA 30, IA WA 30, XML 2/imóvel, R$20=1.000 coins
- Temperatura lead: frio → morno → quente → super quente
- Caso 1 = imóvel com proprietário WA → notifica automaticamente
- Caso 2 = sem proprietário → corretor confirma direto
- QuintoAndar = toggle no Perfil, exige CEP+endereço+número+proprietário

REGRAS DE RESPOSTA:
- Responda SEMPRE em português brasileiro
- Seja direto e objetivo — máximo 3 parágrafos
- Use **negrito** para termos importantes
- Use • para listas
- Nunca invente dados — use apenas o contexto fornecido
- Se não souber, diga claramente
- Foque em ajudar o corretor a usar o sistema`;

function chamarGroq(mensagem, contexto, historico) {
  return new Promise(function(resolve, reject) {
    if (!GROQ_API_KEY) return reject(new Error('GROQ_API_KEY não configurada'));

    const ctxStr = [
      'DADOS DO CORRETOR:',
      '• Imóveis ativos: ' + (contexto.ativos||0),
      '• Leads: ' + (contexto.leads||0) + ' (com match: ' + (contexto.comMatch||0) + ')',
      '• Visitas: ' + (contexto.visitas||0) + ' (pendentes: ' + (contexto.pendentes||0) + ')',
      '• Leads quentes: ' + (contexto.quentes||0),
      contexto.topBairrosDemanda && contexto.topBairrosDemanda.length 
        ? '• Bairros mais buscados: ' + contexto.topBairrosDemanda.slice(0,3).map(function(b){ return b.bairro+'('+b.total+')'; }).join(', ')
        : '',
      contexto.bairrosCarteira && contexto.bairrosCarteira.length
        ? '• Bairros na carteira: ' + contexto.bairrosCarteira.slice(0,5).join(', ')
        : '',
    ].filter(Boolean).join('\n');

    const ctxGroq = getContextoGroq();
    const messages = [
      { role: 'system', content: SYSTEM_PROMPT + '\n\n' + ctxStr + (ctxGroq ? '\n\n' + ctxGroq.slice(0,1500) : '') }
    ];

    // Histórico recente
    if (historico && historico.length) {
      historico.slice(-4).forEach(function(h) {
        messages.push({ role: 'user', content: String(h.pergunta||'').slice(0,200) });
        messages.push({ role: 'assistant', content: String(h.resposta||'').replace(/<[^>]+>/g,'').slice(0,300) });
      });
    }

    messages.push({ role: 'user', content: mensagem });

    const body = JSON.stringify({
      model: MODEL,
      messages: messages,
      max_tokens: 350,
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
      timeout: 10000,
    };

    const req = https.request(options, function(res) {
      let data = '';
      res.on('data', function(chunk) { data += chunk; });
      res.on('end', function() {
        try {
          const json = JSON.parse(data);
          const texto = json.choices && json.choices[0] && json.choices[0].message && json.choices[0].message.content;
          if (texto) resolve(texto.trim());
          else reject(new Error('Resposta vazia da Groq: ' + data.slice(0,200)));
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
