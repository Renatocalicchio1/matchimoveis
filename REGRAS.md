# Regras e Padrões do MatchImóveis

## Comportamento esperado
- Ir direto ao ponto, sem passo a passo desnecessário
- Pensar como um desenvolvedor sênior ágil
- Dar ideias proativas, não esperar ser perguntado
- Conhecer o sistema de memória — não perguntar o óbvio

## Leads
- Leads orgânicas (pagina_externa_imovel) já vêm com perfil preenchido → `extractionStatus: 'ok'`
- Leads importadas (CSV) precisam passar pelo extrator
- Badge visual: 🌐 Orgânica | 📋 Importada
- Filtro por origem na tela de leads

## Contas
- RAN-9191 (imobiliaria-47991919191) → desenvolvimento e testes pelo localhost:3000
- RAN-0888 (imobiliaria-47992010888) → usa pelo Render
- Cada conta vê apenas seus próprios dados

## Visitas
- Fluxo: Lead solicita → Proprietário confirma/recusa/remarca → Cliente remarca → Corretor notifica
- Todas as ações geram notificação para o corretor dono da lead
- Horário de visita: 06:00 às 21:00
- Fuso horário: sempre America/Sao_Paulo

## Notificações
- Campo: `usuarioId` (não `id`)
- Fuso: `new Date().toLocaleString('pt-BR', {timeZone:'America/Sao_Paulo'})`

## Arquivos importantes
- server.js — servidor principal
- data.json — leads
- imoveis.json — imóveis
- visitas.json — visitas
- notificacoes.json — notificações
- users.json — usuários
- extractAllAdmin.js — extrator de leads
- matchLeadsOk.js — match base interna
- matchQuintoAndarLeads.js — match QuintoAndar
- matchFoxterLeads.js — match Foxter
- services/foxter.js — scraper Foxter
- services/quintoandar.js — scraper QuintoAndar

## Git
- Sempre commitar antes de ir para o Render
- Push separa do commit quando travar

## Terminal
- Sempre adicionar '2>&1 | pbcopy; echo "Copiado!"' no final dos comandos para copiar resultado automaticamente

## Assistente IA Interno
- Tela dedicada /app/assistente com chat flutuante
- O assistente conhece tudo do sistema: leads, imóveis, visitas, notificações
- Cada ação do sistema deve ser registrada para o assistente poder consultar
- Ações disponíveis: importar leads, importar XML, ver leads, gerar XML, ver visitas, notificações, stats
- O assistente executa ações reais no sistema via chat
- Não depende de API externa (Claude, OpenAI, etc)
- Baseado em intenções + palavras-chave + dados reais dos JSONs

## Assistente Chat (/app/assistente)
- View: views/app-assistente.ejs
- Rota: GET /app/assistente (auth)
- Recebe stats do server.js igual ao app-home
- Respostas baseadas em palavras-chave (sem API externa)
- Ações: stats, importar leads, importar XML, leads com match, visitas, imóveis, notificações
- Sugestões rápidas na tela
- Expandir com novas intenções conforme o sistema cresce

## Geração de arquivos
Sempre fornecer o comando completo para criar o arquivo no terminal via:
  cat << 'EOF' > caminho/arquivo.txt ... EOF
Nunca depender de download — o usuário cola o comando e o arquivo é criado direto no projeto.

## Cérebro do Assistente
Sempre que criar nova rota, view, upload ou ação no sistema:
1. Atualizar cerebro.js com a nova informação
2. Rodar `npm run cerebro` para regenerar assistente-mapa.json
3. O cérebro é a fonte de verdade do assistente — sem ele o assistente não aprende
