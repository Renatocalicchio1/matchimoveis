# MATCH IMÓVEIS — LEVANTAMENTO COMPLETO
**Data:** 14/05/2026
**Status:** MVP em produção

---

## 1. VISÃO DO PRODUTO

A Match NÃO é um CRM tradicional.
É um **sistema operacional imobiliário com IA** — a memória operacional do corretor brasileiro.

**Missão:** Transformar o WhatsApp no centro operacional do mercado imobiliário.

**Lock-in:** Não são os dados. É a memória operacional acumulada — histórico inteligente, contexto, padrões aprendidos. Sair da Match = perder o cérebro operacional.

---

## 2. STACK ATUAL (MVP)

| Camada | Tecnologia |
|--------|-----------|
| Backend | Node.js + Express |
| Frontend | EJS (server-side rendering) |
| Dados | JSON files (data.json, visitas.json, notificacoes.json, imoveis.json) |
| WhatsApp | Evolution API (Render free tier) |
| Deploy | Render.com |
| Repositório | github.com/Renatocalicchio1/matchimoveis |

**Stack futura (Engineering Rules):**
Next.js + NestJS + TypeScript + PostgreSQL + pgvector + Redis + BullMQ + Docker + Coolify/Hetzner

---

## 3. CONTAS E DADOS

| Conta | ID | UserID | Imóveis | Fonte |
|-------|-----|--------|---------|-------|
| ALE-2442 | - | imobiliaria-47991919191 | 846 | Rankim |
| RAN-0888 | - | imobiliaria-47992010888 | 781 | rankim 2 |
| Teste local | TES-0889 | corretor-47992010889 | - | - |
| REN-3894 | - | cor_as61p840px | - | - |

**Arquivos principais no Render:**
- `/opt/render/project/src/data/data.json` — leads (1714+)
- `/opt/render/project/src/data/imoveis.json` — imóveis
- `/opt/render/project/src/data/visitas.json` — visitas
- `/opt/render/project/src/data/notificacoes.json` — notificações

---

## 4. INFRAESTRUTURA

### MatchImóveis (principal)
- URL: https://matchimoveis.onrender.com
- Porta local: 3000
- Path local: ~/Downloads/matchimoveis (note o espaço)
- Restart: `pkill -f "node server.js" && lsof -ti:3000 | xargs kill -9 && cd ~/Downloads/matchimoveis\  && node server.js > /tmp/match-log.txt 2>&1 &`

### Evolution API (WhatsApp)
- URL: https://match-evolution-api.onrender.com
- API Key: match2025evolution
- Instância: match-corretor
- Número conectado: 47992010888
- Status: LIVE (free tier — hiberna após inatividade)
- Webhook: https://matchimoveis.onrender.com/webhook/whatsapp
- PostgreSQL: match-evolution-db

---

## 5. O QUE ESTÁ FEITO E FUNCIONANDO

### 5.1 Core do Sistema
- ✅ Login com senha
- ✅ Multi-conta (isolamento por userId)
- ✅ Dashboard com gráficos
- ✅ Gestão de imóveis (CRUD completo)
- ✅ ID interno (MI-xxx) em todos os imóveis
- ✅ Fase do imóvel (pronto/lançamento)
- ✅ Inativar imóvel

### 5.2 Importação
- ✅ XML import com removeNSPrefix + suporte a arquivo local e URL
- ✅ XML portal export (VivaReal, ZAP, OLX, Chaves, ImovelWeb, 123i)
- ✅ Checkboxes por card para seleção de portais
- ✅ autoUpdateXML comentado (não reimporta no startup)

### 5.3 Leads
- ✅ Tela de leads com filtros inteligentes
- ✅ Smart search nos leads
- ✅ Tela de detalhe do lead completa
- ✅ Textos gerados por IA para leads

### 5.4 Matching
- ✅ Match base interna (matchBaseInterna.js) — bairro + tipo + quartos exato
- ✅ Match QuintoAndar (matchquintoandarcorreto.js) — tipo, bairro, quartos≥, valor -30%/+25%, área -20%/+35%
- ✅ Score: cheap value +50, larger area +30, extra quartos +20, suítes +15, vagas +15, base interna bonus +25
- ✅ Top 8 resultados

### 5.5 Visitas
- ✅ Card view de visitas
- ✅ Guia de ações por status
- ✅ WhatsApp button → prop confirma via /proprietario/visita/:id
- ✅ Cliente confirma via /cliente/visita/:id
- ✅ "🎉 ambos confirmaram" guide
- ✅ Notificações de visita (3 casos)

### 5.6 WhatsApp (FEITO HOJE)
- ✅ Evolution API no Render — LIVE
- ✅ QR Code conectado (47992010888)
- ✅ Webhook POST /webhook/whatsapp + sub-rotas
- ✅ Recebe mensagens reais do WhatsApp
- ✅ Salva mensagens no lead correspondente
- ✅ Timeline de mensagens na tela do lead
- ✅ Mensagens com cores: verde=corretor, azul=IA, cinza=cliente
- ✅ Campo de envio de mensagem pelo painel
- ✅ Envio via Evolution API pelo corretor

### 5.7 IA — Memória Operacional (FEITO HOJE)
- ✅ extrator-perfil.js — extrai automaticamente de cada mensagem:
  - tipo, quartos, suítes, vagas, área
  - valorMin, valorMax
  - intenção (comprar/alugar/investir)
  - urgência (alta/baixa)
  - família (crianças/casal/sozinho)
  - motivação (mudança/primeiro_imóvel/investimento/upgrade)
  - sentimento (satisfeito/frustrado/impaciente/empolgado)
  - faseFunil (novo/qualificado/interessado/decidido)
  - temperatura (quente/morno/frio)
- ✅ perfilIA salvo automaticamente no lead
- ✅ Card 🧠 Perfil IA na tela do lead com badge de temperatura
- ✅ Match automático via perfilIA quando mensagem chega
- ✅ matchesAuto salvo no lead

### 5.8 Feed Operacional (FEITO HOJE)
- ✅ Inbox WhatsApp (/app/whatsapp)
- ✅ Badge com contagem de não lidas no menu
- ✅ Filtros: todos / não lidas / quentes / mornos
- ✅ Auto-refresh a cada 30 segundos
- ✅ Marcar como lida ao abrir o lead
- ✅ Middleware que injeta mensagensNaoLidas em todas as rotas

### 5.9 IA Copiloto (FEITO HOJE)
- ✅ copiloto.js — gera sugestões baseadas no perfil do lead
- ✅ Card 🤖 Copiloto IA na tela do lead
- ✅ Botão "Enviar no WhatsApp" — abre WA com texto pronto
- ✅ Botão "Copiar" — copia para clipboard

### 5.10 Resposta Automática IA (FEITO HOJE — parcial)
- ✅ resposta-auto.js — gera resposta contextual baseada em:
  - Histórico de mensagens
  - perfilIA extraído
  - matchesAuto disponíveis
  - Fase do funil
- ✅ Integrado no webhook (fire-and-forget)
- ✅ Keep-alive da Evolution API a cada 10 minutos
- ⚠️ Limitação: Evolution API free tier hiberna — primeira resposta pode demorar 30-60s

### 5.11 Cérebro (35+ módulos)
- ✅ index.js — orquestrador principal
- ✅ contexto.js — 9 intenções
- ✅ navegacao.js — 12 páginas + fluxos
- ✅ rag.js — extração de slots (bairro, tipo, valor, quartos, etc.)
- ✅ memoria.js — memória persistente por userId
- ✅ nlp.js — 413 sinônimos, tokenização, Jaccard similarity
- ✅ extrator-perfil.js — perfil do cliente via WhatsApp
- ✅ copiloto.js — sugestões de resposta
- ✅ resposta-auto.js — resposta automática
- ✅ leads.js, visitas.js, imoveis.js, funil.js
- ✅ emocao.js, multiturno.js, fluxo-guiado.js
- ✅ auto-diagnostico.js, slot-filling.js
- ✅ inteligencia-mercado.js, sugestao-proativa.js
- ✅ cache-inteligente.js, metricas.js
- ✅ context-engineering.js, feedback-loop.js
- ✅ busca-semantica.js, resposta-progressiva.js
- ✅ decompositor.js, verificador.js, auto-correcao.js
- ✅ notas-usuario.js, compactador.js

### 5.12 Outros
- ✅ Match Coins
- ✅ autoEngine com 7 regras
- ✅ Textos IA para imóveis
- ✅ Backup de leads por conta
- ✅ Rota de diagnóstico de descrições
- ✅ URL secreta de cadastro: /cadastro-secreto?token=match2025
- ✅ baseUrl dinâmico
- ✅ dataPath para Render Disk

---

## 6. O QUE FALTA FAZER

### 6.1 🔴 CRÍTICO — Bugs

| Bug | Descrição |
|-----|-----------|
| processLeads.js | DATA_FILE duplicado linhas 6-7 — importação CSV falha no Render |
| /admin/limpar-descricoes | Retorna limpos:0 — bug no filtro userId |
| Evolution API hibernação | Free tier hiberna — resposta auto demora 30-60s na primeira vez |

### 6.2 🟡 IMPORTANTE — Features incompletas

| Feature | Status |
|---------|--------|
| Pipeline comercial | Existe no código mas desconectado da nova tela de visitas |
| Follow-up automático | Não iniciado — lead sem resposta X horas → IA manda mensagem |
| Remarcação de visita | Não iniciado — prop/parceiro sugere nova data |
| Auto-inativar imóvel | Não iniciado — quando prop marca indisponível |

### 6.3 🟢 MELHORIAS

| Feature | Status |
|---------|--------|
| XML auto-update 24h | Não iniciado |
| Múltiplos XMLs por conta | Não iniciado |
| Match automático ao chegar lead no Render | Não iniciado |
| baseUrl em todas as views | Parcial |

### 6.4 🔵 ROADMAP FUTURO

| Etapa | Descrição |
|-------|-----------|
| Etapa 7 | Rede imobiliária — corretores compartilham imóveis |
| Etapa 8 | Crescimento viral — indicações, referências |
| Migração de stack | Node/EJS → Next.js + NestJS + TypeScript + PostgreSQL |
| MercadoPago | Pagamento e cobrança |
| Twilio | WhatsApp alternativo |
| Gmail | Integração email |
| Render Disk $7 | Upgrade storage |

---

## 7. FLUXO COMPLETO ATUAL

```
Cliente manda WA para 47992010888
         ↓
Evolution API recebe
         ↓
Webhook POST /webhook/whatsapp
         ↓
extrator-perfil.js processa texto
→ extrai tipo, quartos, valor, urgência, etc.
→ salva perfilIA no lead
         ↓
matchBaseInterna.js busca imóveis compatíveis
→ salva matchesAuto no lead
         ↓
resposta-auto.js gera resposta contextual
→ Evolution API envia resposta para o cliente
         ↓
Corretor abre tela do lead e vê:
→ 💬 Timeline de mensagens
→ 🧠 Card Perfil IA com temperatura
→ ⚡ Matches automáticos
→ 🤖 Copiloto com sugestões de resposta
→ Campo para enviar mensagem pelo painel
```

---

## 8. LIMITAÇÕES ATUAIS

| Limitação | Causa | Solução |
|-----------|-------|---------|
| Evolution API hiberna | Render free tier | Upgrade $7/mês ou keep-alive |
| JSON files em vez de DB | MVP rápido | Migrar para PostgreSQL |
| EJS em vez de React | MVP rápido | Migrar para Next.js |
| server.js com 5284 linhas | Crescimento orgânico | Refatorar em módulos NestJS |
| Sem filas | MVP rápido | Implementar BullMQ |
| Sem cache | MVP rápido | Implementar Redis |

---

## 9. PRÓXIMAS AÇÕES PRIORITÁRIAS

1. **Testar resposta automática real** — aguardar keep-alive funcionar (10 min)
2. **Corrigir processLeads.js** — DATA_FILE duplicado
3. **Reconectar pipeline comercial** — proposta/negociação/fechado/perdido
4. **Follow-up automático** — cron job para leads inativos
5. **Iniciar Etapa 7** — rede imobiliária

---

## 10. COMMITS DO DIA

1. `feat: webhook whatsapp Evolution API`
2. `feat: timeline e secao mensagens whatsapp no lead`
3. `feat: extrator-perfil IA + card perfil na tela do lead`
4. `feat: match auto webhook + card perfil IA + matches auto na tela do lead`
5. `feat: secao mensagens whatsapp na tela do lead`
6. `feat: copiloto IA sugestoes de resposta no lead`
7. `feat: envio mensagem whatsapp pelo corretor no lead`
8. `feat: badge mensagens nao lidas no menu whatsapp`
9. `feat: marcar mensagens como lidas ao abrir lead`
10. `feat: inbox whatsapp funcionando`
11. `feat: resposta automatica IA via WhatsApp`
12. `feat: keep-alive Evolution API a cada 10 minutos`
13. `fix: webhook aceita sub-rotas evolution api`
14. `fix: formato numero resposta auto`
15. `fix: resposta auto em background sem bloquear webhook`
16. `fix: passes variaveis por copia para setImmediate`
17. `fix: fetch sem await fire and forget`
18. `feat: pre-aquece Evolution API no inicio do webhook`
