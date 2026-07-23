# MatchImóveis — Contexto do Projeto

Plataforma de match imobiliário para corretores/imobiliárias brasileiras. Node.js/Express/EJS, PostgreSQL, deploy no Render.

- Produção: https://www.matchimoveis.ia.br
- Repositório: GitHub → Render (auto-deploy no push em main)
- Local (Mac): `~/Downloads/matchimoveis /` (⚠️ espaço no final do nome da pasta)
- Render Shell path: `/opt/render/project/src/`
- server.js tem 9000+ linhas

## Estrutura principal
- `cerebro/match-core.js` — motor de match (Caso 1: imóvel âncora, Caso 2: perfil de busca)
- `cerebro/motor-intencao.js` — scoring, detecção de intenção oculta, mapaIntencao
- `cerebro/portal-processor.js`, `cerebro/index.js` (assistente IA, 3 camadas: saudação → Groq → fallback)
- `import-processor.js`, `importXMLCompleto.js`, `extrator-perfil.js`, `geocode-imoveis.js`
- `services/salvarLead.js`, `salvarImovel.js`, `salvarVisita.js`, `db.js`, `creditos.js`
- `visitas-v2.js` — router do fluxo de visitas V2
- Pool do banco: `_pgPool`; no Render Shell: `require('./services/db')`

## Convenções de código (seguir sempre — não inventar padrão novo)
- Edits em server.js: patch scripts Node.js com string match exato + `node --check` antes de qualquer deploy
- Nunca colar heredoc gigante no terminal — quebrar em passos pequenos, testar cada um
- Placeholders SQL dinâmicos: construir `$` via `String.fromCharCode(36)`, nunca literal colado (causou incidente antes)
- Campo de usuário: usar `userId`/`user_id` com fallback duplo (`lead.user_id || lead.userId || lead.codigoUsuario`) — o banco mistura camelCase e snake_case dependendo do fluxo de criação
- `codigo_usuario` é o identificador primário de usuário (id legado foi migrado pra igualar)
- Normalização de estado/cidade/bairro: `unaccent + INITCAP/LOWER` (função `filtrarCidadesBairros`)
- Deploy Mac: `cd ~/Downloads/matchimoveis\  && git add -A && git commit -m "..." && git pull origin main --rebase && git push origin main`

## Sistema de coins (services/creditos.js)
cadastrar_imovel=15, editar_imovel=0, importar_xml=2, gerar_xml_portal=10, sync_xml_24h=5, lead_ativo_dia=0.2, ia_qualifica_lead=30, match_encontrado=20, vitrine_whatsapp=30, ia_responde_whatsapp=30, followup_auto=25, visita_agendada_ia=40, notificacao_prop=15, confirmacao_auto=15, nova_lead=20, importar_lead=10.
R$50 mínimo = 2.500 coins (R$1 = 50 coins). Sem limite de importação.

## Regras de match atuais
- Critérios mínimos obrigatórios: tipo transação, tipo imóvel, estado, cidade, bairro, valor
- Tolerância de valor: -30%/+20% (foi testado -15%/+10%, revertido a pedido do usuário)
- Quartos: imóvel precisa ter igual ou mais quartos que o pedido (ignorado pra terreno/comercial)
- Prioriza imóveis próprios do corretor antes dos da rede

## Leads
- Origem armazenada no campo `origem`: valores conhecidos `manual`, `webhook_imovelweb_global`, `captacao_link`, entre outros de portais (OLX/ZAP/VivaReal, 123i, Chaves)
- `leadOculta:true` para leads criadas via WhatsApp sem perfil mínimo — ficam escondidas do kanban até gerar 1º match (match-core.js seta `leadOculta=false` quando `matchesNovos.length > matchesAntes`)
- Esse comportamento só se aplica ao fluxo automático de WhatsApp — leads de planilha/manual/webhook de portal aparecem direto
- Webhook global ImovelWeb: `/webhook/imovelweb-global` — atribui lead ao dono do imóvel via `id_externo`/`id_interno`/`id`
- Email de captação automático pra toda lead nova com email cadastrado (services/salvarLead.js)

## Infra
- 4 serviços Render: matchimoveis (web), match-evolution-api (web), matchimoveis-db (PG), match-evolution-db (PG)
- Health check: `/health`
- WhatsApp via Evolution API — instâncias abertas: match-suporte, MAU-EHAM, JAN-MGF9, ROD-AFQ4, VAL-9PCH
- AWS SES: domínio matchimoveis.online, produção liberada, ~118k contatos em /admin/campanha
- Backup: GitHub Actions pg_dump horário + on push

## Usuários/contas de referência
Jane: JAN-MGF9 (~1.700 imóveis) | Mauricio: MAU-EHAM (~432) | Alexandre: ALE-DU2K (~845, enriquecido via CADIMO/CADCLI) | Barros: BAR-GALN | Valdete: VAL-9PCH | Rodrigo: ROD-AFQ4

## Pendências ativas (jul/2026)
- [ ] sync_xml_24h: não implementado
- [ ] lead_ativo_dia: implementado mas não testado às 8h
- [ ] Visitas V2: bug POST /confirmar /recusar — status não avança; Caso 1 e 3 não implementados
- [ ] Feed não embaralha ao atualizar (since=0)
- [ ] Mapa OpenStreetMap não aparece no mobile
- [ ] Captação: badge/botões do topo da linha da lead ainda usam campo morto `imovelCaptadoId` — trocar fonte pra `l.imoveisRelacionados[0]`
- [ ] Toggle vitrineApenasPropriosImoveis: já tentado 2x, quebrou envio de vitrine WA, revertido — permanece pendente

## Bugs recentes corrigidos (referência — não repetir a causa)
- Email de nova lead/captação não disparava: checagem de "lead já existia" rodava depois do INSERT, sempre achava a própria lead — movida pra antes do INSERT
- Índice único `idx_imoveis_externo_user (id_externo, user_id)` bloqueava 2º imóvel manual (id_externo vazio tratado como duplicata) — recriado como índice parcial `WHERE id_externo IS NOT NULL AND id_externo != ''`
- Busca por ID em /app/imoveis era só client-side (não achava fora da página atual) — Enter agora navega usando busca server-side
- Filtros de /app/imoveis (tipo, valor, quartos etc.) eram só client-side — estendidos pro servidor via query string
- ILIKE com placeholder posicional sem `$` (`ILIKE 2` em vez de `ILIKE $2`) no matching de captação por telefone/email

## Padrão de comunicação do usuário (Renato)
- Português, direto, abreviado, às vezes com typos
- Quer um comando por vez, sem explicação a menos que peça
- Não modificar arquivos além do pedido
- Sempre referenciar como coisas parecidas já foram feitas antes de propor algo novo
