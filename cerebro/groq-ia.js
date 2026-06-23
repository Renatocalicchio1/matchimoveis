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

MENUS: Dashboard, Leads, Imóveis, Visitas, Mapa, Portais, Perfil, Créditos, Feed, QuintoAndar.
PORTAIS DISPONÍVEIS (apenas estes 6): ZAP Imóveis, VivaReal, OLX, Chaves na Mão, 123i, ImovelWeb. O XML é gerado automaticamente — o corretor só precisa cadastrar a URL do feed no portal desejado. Acesse em Portais no menu.
QUINTOANDAR — 2 tipos de parceria:
1) ENVIAR IMÓVEIS: corretor ativa o toggle no Perfil e seus imóveis elegíveis são enviados ao feed XML do QuintoAndar. Se o QuintoAndar vender, corretor recebe até 25% da comissão.
2) CARTEIRA QUINTOANDAR: corretor solicita acesso à carteira de imóveis do QuintoAndar. O MatchImóveis faz o match dos leads do corretor com os imóveis do QuintoAndar. Se o corretor vender, recebe 50% da comissão — os outros 50% ficam com o QuintoAndar. Acesse em QuintoAndar no menu.
IMPORTAR IMÓVEIS: Acesse Imóveis no menu → clique em Cadastrar Imóvel → cole a URL do XML (padrão VRSync do VivaReal) → clique em Importar. Não existe botão Testar nem Gerar XML.
EXPORTAR IMÓVEIS PARA PORTAIS PARCEIROS: Na página de Imóveis, selecione os imóveis desejados clicando neles (ou edite um por vez na página de edição) → use a opção Exportar XML. O XML gerado pode ser levado para portais parceiros.
CONCEITOS: Match=cruzar lead+imóvel. Vitrine=link WA com imóveis. Temperatura:fria>morna>quente. Funil:novo>contato>visita>proposta>fechado.
CRÉDITOS (Match Coins): R$50 mínimo = 2.500 coins (R$1 = 50 coins). Os valores abaixo são em COINS, NÃO em reais. NUNCA diga "R$" ao falar de consumo de coins. Valores EXATOS em COINS: cadastrar imóvel=15 coins, editar imóvel=0 coins (grátis), importar XML=2 coins por imóvel, gerar XML portal=10 coins, lead ativo por dia=0.2 coins, qualificar lead via IA=30 coins, match encontrado=20 coins, vitrine WhatsApp=30 coins, IA responde WA=30 coins, follow-up automático=25 coins, visita agendada pela IA=40 coins, notificação proprietário=15 coins, confirmação automática=15 coins, nova lead=20 coins, importar lead planilha=10 coins. Para recarregar: Créditos no menu → valor em reais (mínimo R$50) → Adicionar créditos.
REGRAS: Português BR. MUITO direto, máx 2 linhas. Negrito para números. Nunca invente dados. Nunca cite URLs técnicas, use nome do menu. Sem enrolação.`;

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
