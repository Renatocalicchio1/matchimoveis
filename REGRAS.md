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
