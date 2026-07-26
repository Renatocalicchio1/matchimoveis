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
cadastrar_imovel=15, editar_imovel=0, importar_xml=2, gerar_xml_portal=10, sync_xml_24h=5, lead_ativo_dia=0.2, ia_qualifica_lead=30, match_encontrado=20, vitrine_whatsapp=30, ia_responde_whatsapp=30, followup_auto=25, visita_agendada_ia=40, notificacao_prop=15, confirmacao_auto=15, nova_lead=20, importar_lead=10, imovel_divulgado=2.
R$50 mínimo = 2.500 coins (R$1 = 50 coins). Sem limite de importação.
- `imovel_divulgado` (2 coins, jul/2026): debitado do **dono do imóvel** — não do dono da lead — toda vez que o imóvel entra no top 9 da vitrine pública (`/cliente/oferta/:leadId`) por ter gerado match, mesmo que o imóvel seja da rede (outro corretor). Cobrado 1x por par imóvel+lead (dedup via `lead.imoveisDivulgados`), disparado em `cerebro/match-core.js` (`_debitarDivulgacaoVitrine`, chamado no Caso 1 e Caso 2). O imóvel âncora do Caso 1 (o que a lead já clicou/buscou) NÃO é cobrado — só os demais sugeridos por match.

## Regras de match atuais
- Critérios mínimos obrigatórios: tipo transação, tipo imóvel, estado, cidade, bairro, valor
- Tolerância de valor: -20%/+20% (histórico: -30%/+20%, antes disso -15%/+10% testado e revertido — jul/2026 ajustado pra -20%/+20%)
- Quartos: exato (histórico: aceitava igual ou mais que o pedido — jul/2026 mudado pra exigir exato)
- Prioriza imóveis próprios do corretor antes dos da rede

## Leads
- Origem armazenada no campo `origem`: valores conhecidos `manual`, `webhook_imovelweb_global`, `captacao_link`, entre outros de portais (OLX/ZAP/VivaReal, 123i, Chaves)
- `leadOculta:true` para leads criadas via WhatsApp sem perfil mínimo — ficam escondidas do kanban até gerar 1º match (match-core.js seta `leadOculta=false` quando `matchesNovos.length > matchesAntes`)
- Esse comportamento só se aplica ao fluxo automático de WhatsApp — leads de planilha/manual/webhook de portal aparecem direto
- Lead oculta (sem match ainda) também não gera notificação sino, não é contada em `/app-home` (KPI `leadsNovos`) e não é cobrada em `lead_ativo_dia` (jobCreditos.js) — só passa a valer como lead de fato quando `leadOculta` vira `false`. Filtro padrão: `!(l.leadOculta === true && !((l.matches||[]).length || (l.matchesBase||[]).length))` — mesmo filtro usado em `/app/leads`, `/app-home` e `jobCreditos.debitarLeadsAtivos()`
- Webhook global ImovelWeb: `/webhook/imovelweb-global` — atribui lead ao dono do imóvel via `id_externo`/`id_interno`/`id`
- Notificações sino (tabela `notificacoes`, tipos): `novo_lead` (lead visível chegou — todos os webhooks de portal + captação; NÃO dispara pro fluxo WhatsApp até a lead ser revelada, ver `_notificarNovaLead()` em server.js), `lead_quente` (transição pra temperatura quente, só depois de revelada), `lead_gostei` (clicou "Gostei" em algum imóvel, ver `_registrarGostei()`), `captacao` (proprietário se cadastrou via `/captar/:userId`), `match_gerado`, `nova_visita`/`visita_proprietario`, `recarga`, `saldo_zerado`/`saldo_baixo`/`saldo_medio` (consumir), `conta_pausada`/`creditos_criticos`/`creditos_baixos` (job diário)
- Email de captação automático pra toda lead nova com email cadastrado (services/salvarLead.js)

## Infra
- 4 serviços Render: matchimoveis (web), match-evolution-api (web), matchimoveis-db (PG), match-evolution-db (PG)
- Health check: `/health`
- WhatsApp via Evolution API — instâncias abertas: match-suporte, MAU-EHAM, JAN-MGF9, ROD-AFQ4, VAL-9PCH
- AWS SES: domínio matchimoveis.online, produção liberada, ~118k contatos em /admin/campanha
- Backup: GitHub Actions pg_dump horário + on push

## Dashboard `/app-home` (refeito jul/2026)
- Paleta Airbnb fixa (categórica, nunca ciclada): vermelho Rausch `#FF385C` (marca), teal Babu `#00A699`, laranja Arches `#FC642D` — validada contra CVD (script `validate_palette.js` do skill dataviz, PASS em modo claro). Cores de status (visitas por status) usam paleta semântica separada (verde/âmbar/vermelho), não a categórica.
- Antes disso, o dashboard tinha 2 gráficos com **dado 100% inventado** hardcoded no JS ("Leads por canal" com números fixos tipo `[3,5,4,6,4,2,1]`, "Tipos de imóvel" com `tipoData=[45,25,12,8,6,4]`) — removidos. Todo gráfico agora usa campo real já calculado em `stats`/`locals` no route `/app-home` (server.js)
- Novo campo `graficoLeadsOrigem` (server.js, rota `/app-home`) — agrupa `leadsArr` por `origem`/`origemEntrada` com rótulos amigáveis, substitui o gráfico de canal fake
- Cards novos usando dados que já eram calculados no backend mas nunca apareciam na tela: Demanda×Oferta por bairro (`graficoLeadsBairro` x `graficoImoveisBairro`), Confirmação & tendência mensal (`visitasTaxaConfirmacao`, `visitasRealizadasMes` vs `visitasRealizadasMesPassado`), Próximas visitas (`stats.proximasVisitas`), imóvel mais visitado e lead mais antiga sem visita (dentro do card Saúde da carteira)

## Onboarding inteligente (jul/2026)
- `GET /api/onboarding/status` (server.js) — calcula ao vivo os 6 passos de onboarding a partir do estado real da conta: XML importado (`user.xmlUrl`), WhatsApp conectado (`whatsappStatus==='open'`), Instagram conectado (`instagramContaId`), cadastrou lead manual (`filtrarPorUsuario(leads)` com `origemEntrada==='manual'`), já conversou com o assistente (`historicoAssistente.length>0`), conheceu a área de perfil (flag `onboardingPerfilVisto`, setada na 1ª visita a `/app/perfil`, persistida em `dados` JSONB via `atualizarUsuario`)
- Modal "Primeiros Passos" (`views/partials/app-shell.ejs`) consome esse endpoint via fetch em qualquer página — mostra só os passos pendentes (os concluídos somem da lista, não ficam só marcados) e um badge com a contagem de pendentes no botão do menu (desktop + mobile)
- Substituiu 2 mecanismos antigos que não funcionavam: o modal estático anterior (4 passos, só texto informativo, sem checagem real) e um widget de progresso que já tinha sido construído mas ficou desativado (`if(false && ...)`) e só funcionaria certo em `/app/imoveis` (dependia de `totalImoveis`, variável que só essa rota passava pro render) — ambos removidos

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

## Bugs encontrados (auditoria jul/2026) — confirmados, aguardando correção
- **Webhook Mercado Pago sem proteção contra replay** (`POST /webhook/mercadopago`, server.js ~7026): credita `adicionarCreditos()` toda vez que recebe evento `payment` aprovado, sem checar se aquele `data.id` já foi processado. MP reenvia webhook (retry/duplicata é comportamento normal deles) — usuário pode ser creditado 2x pelo mesmo pagamento. Fix: guardar `payment.id` processado (tabela ou coluna) e checar antes de creditar.
- **`match_coins_total` nunca atualiza após o cadastro do usuário**: mesma causa raiz do bug já corrigido em `jobCreditos.js` (upsert de `salvarUsuario()` exclui a coluna do UPDATE). `adicionarCreditos()` em `creditos.js` incrementa `matchCoinsTotal` em memória mas o UPDATE direto no PG só grava `match_coins`. Efeito: % de saldo baixo usado nos alertas fica cada vez mais impreciso conforme o usuário recarrega. Fix: incluir `match_coins_total` no mesmo UPDATE direto que já existe pro `match_coins`.
- **Segundo sistema de notificação com colunas que talvez não existam**: `services/notificacoes/criarNotificacao.js` (usado só por `services/workflow/atualizarWorkflowVisita.js`) grava/lê colunas (`prioridade`,`status`,`acao`,`link`,`created_at`) que não estão na `CREATE TABLE notificacoes` de `setupDB.js` — não confirmado contra o banco de produção (sem acesso a partir daqui), mas se as colunas não existem, toda notificação de transição de workflow de visita falha silenciosamente. Verificar contra o banco real (`\d notificacoes`) antes de mexer.
- **Confirmado, sem ação necessária**: `services/matcher.js` tem bug de sintaxe (chave sobrando) mas não é importado em lugar nenhum — código morto de fato.

## Bugs recentes corrigidos (referência — não repetir a causa)
- Email de nova lead/captação não disparava: checagem de "lead já existia" rodava depois do INSERT, sempre achava a própria lead — movida pra antes do INSERT
- Índice único `idx_imoveis_externo_user (id_externo, user_id)` bloqueava 2º imóvel manual (id_externo vazio tratado como duplicata) — recriado como índice parcial `WHERE id_externo IS NOT NULL AND id_externo != ''`
- Busca por ID em /app/imoveis era só client-side (não achava fora da página atual) — Enter agora navega usando busca server-side
- Filtros de /app/imoveis (tipo, valor, quartos etc.) eram só client-side — estendidos pro servidor via query string
- ILIKE com placeholder posicional sem `$` (`ILIKE 2` em vez de `ILIKE $2`) no matching de captação por telefone/email
- `jobCreditos.js`: custo hardcoded em 10/dia (divergente do `lead_ativo_dia=0.2`) — agora importa `CUSTO.lead_ativo_dia` de `creditos.js`; e o débito nunca persistia no PG (upsert de `salvarUsuario()` exclui `match_coins` do SET) — adicionado `UPDATE` direto
- Sistema de notificações (jul/2026): `lerNotificacoes()` lia `criado_em` mas a coluna real é `criada_em` — toda leitura falhava e caía num fallback de JSON local desatualizado/vazio; corrigido. `jobCreditos.verificarAlertas()` chamava `criarNotificacao(uid, tipo, msg, {pct})` com argumentos posicionais, mas a função espera um objeto único — alertas de saldo baixo/crítico/zerado do job diário nunca funcionaram; corrigido pra passar objeto. `creditos.js` → `adicionarCreditos()` tinha um bloco de aviso de saldo baixo copiado de `consumir()` que referenciava `saldoAtual` (variável que não existe nessa função) — dava erro silencioso sempre; removido (não fazia sentido mesmo: aviso de saldo baixo numa função que só aumenta saldo). Notificação "novo lead" de WhatsApp disparava na hora que a lead chegava, mesmo com `leadOculta:true` (antes de gerar match) — movida pro momento em que a lead é revelada (`cerebro/match-core.js`, junto do e-mail que já existia ali)
- Importar um 2º XML desativava imóveis manuais/de outro feed (jul/2026): `importXMLCompleto.js` marca como `inativo` todo imóvel do usuário que não veio no XML importado — a proteção "veio de outra fonte" só considerava protegido quem já tinha um `xml_url` preenchido e DIFERENTE do atual; imóveis manuais (`xml_url` vazio) ou de qualquer origem sem esse campo caíam na regra geral e eram desativados à toa em qualquer importação de XML, não só na 2ª. A tabela `xml_feeds` já suporta múltiplos feeds por conta (unique em `user_id+url`, `/app/cadastro` já lista todos) — o mecanismo de multi-XML já existia, só esse bug de desativação indevida que atrapalhava. Fix: só marca inativo quem tem `xml_url` **igual** ao XML sendo importado agora (não "diferente e preenchido") — protege manuais e outros feeds corretamente.
- `/app/cadastro` (tela "Importar via XML") tinha um `<form>` aninhado dentro de outro `<form>` (o card "XML Cadastrado" com os botões Atualizar/Excluir ficava dentro do form principal de `action="/app/importar"`) — HTML inválido, o navegador descarta a tag `<form>` interna, misturando os hidden inputs dela (duplicados de `xmlUrl`) no form externo. Efeito: clicar "Importar agora" pra importar um 2º XML não funcionava (o valor de `xmlUrl` submetido ficava contaminado pelos hidden inputs do feed já cadastrado). Os botões Atualizar/Excluir já funcionavam 100% via fetch() direto (JS lê a URL do próprio `onclick`, não lê os hidden inputs) — o `<form>` interno era morto, removido. Também corrigido: o total salvo em `xml_feeds.total` sempre gravava 0 (bug: `typeof _totalIm !== 'undefined'` — variável `_totalIm` nunca existiu, então a checagem sempre dava falso) — trocado por `COUNT(*)` real na tabela `imoveis` filtrado por `user_id` + `xml_url`.
- Assistente IA (jul/2026): `GET /app/assistente` (as 2 cópias), `GET /api/assistente/dados`, `POST /app/assistente/chat` e `GET /app/assistente/historico` filtravam imóveis/leads/visitas comparando com `req.session.user.userId` — campo que não existe na sessão (o campo real é `.id`/`.codigoUsuario`, setado por `rowToUser()`). Resultado: o contexto passado pro Groq no chat sempre via 0 imóveis/0 leads/0 visitas do corretor, então a IA respondia sem saber nada da carteira real. Corrigido trocando pra `filtrarPorUsuario()` (mesmo helper usado em `/app-home`, `/app/leads` etc — múltiplos campos de dono + fallback de telefone). `/api/assistente/dados` e `/app/assistente/historico` tinham o mesmo bug mas não são chamados por nenhuma view hoje (endpoints órfãos) — corrigidos por consistência, sem impacto visível imediato.

## Padrão de comunicação do usuário (Renato)
- Português, direto, abreviado, às vezes com typos
- Quer um comando por vez, sem explicação a menos que peça
- Não modificar arquivos além do pedido
- Sempre referenciar como coisas parecidas já foram feitas antes de propor algo novo

---

# Mapa Técnico Completo (gerado por auditoria em jul/2026)

As seções abaixo documentam o estado real do código (server.js, services/, cerebro/, views/, banco). Complementam — não substituem — o contexto acima.

## Mapa de rotas (server.js, 11.000+ linhas)

⚠️ **Achado**: existe um bloco inteiro de rotas duplicado em server.js — as rotas registradas entre as linhas ~2050–9955 (cliente/oferta, corretor/visita, proprietario/visita, dev/diagnostico-leads, app-leads/:idx/match, import-status, logout, app-imoveis legado, app-portais legado, app-perfil legado) reaparecem quase idênticas entre ~10023–10577. Express usa o primeiro handler registrado, então o segundo bloco é morto/inacessível — mas é lido e mantido junto. Ao editar uma dessas rotas, checar se a edição precisa ir nos dois lugares (ou considerar remover o bloco morto num PR dedicado).

### Middlewares globais e infra (linhas ~136–320)
- Sessão (`express-session`), rastreamento de navegação pro cérebro (`navegacao.rastrear`), `express.static('public')`, static de uploads em `/data-uploads`, `helmet`, rate limiters gerais e de login, `express.urlencoded`/`express.json` (limit 50mb), middleware de auth pra `/app/*`, router de visitas V2 (`visitasRouter`, de `routes/visitas-v2.js`)

### Autenticação e sessão
- `GET/POST /admin/login`, `GET /admin/logout` — login do admin
- `POST /login` — login de corretor (multi-tentativa: senha, telefone, etc)
- `GET /cadastro-secreto`, `POST /cadastro-secreto` — cadastro manual desativado (redireciona pra `/`)
- `GET /logout` (múltiplas definições — ver duplicação acima) — encerra sessão
- `GET /`, `GET /entrar` — landing page / redirect pro login

### Admin (painel interno, `authAdmin`)
- `GET /admin` — dashboard admin (métricas gerais)
- `GET /admin/status` — status do sistema
- `GET /admin/leads-auditoria` — auditoria de leads
- `GET /admin/acessar/:codigo` — login-as (impersonar usuário)
- `GET/POST /admin/usuario/:codigo` — ver/editar usuário, `/creditos` (ajustar saldo), `/senha` (resetar senha)
- `GET /admin/deletar/:codigo` — deletar usuário
- `GET /admin/regenerar-xml/:userId` — força regeração de XML
- `GET /admin/quintoandar-liberar/:codigo`, `/admin/quintoandar-solicitacoes` — libera acesso à parceria QuintoAndar (cria tabela `solicitacoes_quintoandar` on-the-fly)
- `GET /admin/xml/imovelweb-global`, `/admin/xml/quintoandar-global` — feeds XML globais agregando todos os corretores
- `GET/POST /admin/cerebro`, `/admin/cerebro/testar`, `/admin/cerebro/salvar` — editor/testador do "cérebro" (config do assistente IA)
- `POST /admin/cruzar-proprietarios-alex`, `GET /admin/executar-cruzar-alex` — rotina específica de cruzamento de proprietários pra conta do Alexandre (ALE-DU2K)
- `GET /admin/campanha`, `/admin/campanha/contatos`, `POST /admin/campanha/importar`, `/teste`, `/disparar-lote` — painel de campanha de email em massa (usa `services/campanha.js`)
- `GET /campanha/track/open/:id`, `/campanha/track/click/:id` — pixel de abertura e redirect de clique pra tracking de campanha

### `/app/imoveis` — carteira de imóveis
- `GET /app/imoveis` — listagem com filtros server-side (tipo, valor, quartos, busca por ID/texto)
- `GET /app/imoveis/exportar-excel` — exporta carteira em XLSX
- `GET /app/imoveis-ids` — lista só IDs (autocomplete)
- `POST /app/imoveis/portais-lote` — ativa/desativa portais em lote
- `GET /app/cadastro`, `POST /app/imovel/cadastrar` — form e submissão de novo imóvel (cobra `cadastrar_imovel`)
- `GET /app/imovel/:id`, `/editar` — detalhe e form de edição
- `POST /app/imovel/:id/editar`, `/excluir`, `/upload-foto`, `/excluir-foto`, `/capa-foto` — CRUD de imóvel e fotos
- `POST /api/gerar-descricao-imovel` — gera descrição via IA
- `GET /imovel/:id` — página pública do imóvel (compartilhável)
- `POST /app/importar`, `/app/importar-proprietarios` — upload de planilha/XML de imóveis e vínculo de proprietários (`upload.any()`)
- `GET/POST /app/importar-xml-upload` — upload direto de arquivo XML
- `POST /app/atualizar-xml`, `/app/excluir-xml` — reimporta ou remove XML já vinculado (cobra `importar_xml`)
- `POST /app/gerar-xml` — gera XML pros portais (cobra `gerar_xml_portal`)
- `GET /app/portais`, `POST /app/portais` — tela e ativação de portais (VivaReal, ZAP, OLX etc)
- `GET /feed-xml/:portal/:token`, `/feed-:portal.xml`, `/feed/:portal` — feeds XML públicos consumidos pelos portais
- `GET /api/geocodificar-bairros`, `/api/bairros-coords` — geocodificação de bairros da carteira
- `GET /app/mapa`, `GET /mapa`, `GET /api/imoveis` — mapa da carteira (OpenStreetMap)

### `/app/leads`
- `GET /app/leads` — kanban/lista de leads
- `POST /app/leads` (upload), `POST /app/leads/manual` (cobra 10 coins), `POST /app/lead/manual` — criação de lead (planilha ou manual)
- `GET /app/lead/:id` — detalhe da lead
- `DELETE /app/lead/:id` — excluir (soft-delete via `deletadoPor`)
- `POST /app/lead/:id/bloquear`, `/perfil`, `/classificar`, `/imovel-vendedor`, `/comportamento` — edição de atributos da lead
- `GET /app/lead/:id/recomendacoes` — sugestões da IA pra aquela lead
- `GET /api/leads/status-hash` — hash pra polling incremental do kanban
- `POST /app-leads/:idx/match` (legado por índice), `GET /dev/diagnostico-leads` — ferramentas de debug de match
- `GET /app-importar-leads`, `/app/importar-leads`, `/app/modelo-leads.xlsx` — wizard de import + modelo de planilha
- `GET /api/import/status/:jobId` — status de job assíncrono de importação (worker thread)

### Webhooks de portais (entrada de leads)
- `POST /webhook/imovelweb/:userId`, `POST /webhook/imovelweb-global` — leads do ImovelWeb (o `-global` atribui ao dono do imóvel via `id_externo`)
- `POST /webhook/grupoolx/:userId` — leads OLX/ZAP/VivaReal (grupo Movinga); `/webhook/zap/:userId`, `/webhook/vivareal/:userId`, `/webhook/olx/:userId` reescrevem a URL e delegam pra este
- `POST /webhook/123i/:userId` — leads do portal 123i
- `POST /webhook/chaves/:userId` — leads do Chaves na Mão
- `POST /webhook/whatsapp`, `/webhook/whatsapp/*` — mensagens recebidas via Evolution API (fluxo do assistente conversacional)
- `POST /webhook/mercadopago` — confirmação de pagamento

### Visitas (`/app/visitas`, `/app/visitas-kanban`, rotas legadas de confirmação)
- `GET /app/visitas`, `GET /app/visitas-kanban` — lista e kanban de visitas
- `POST /app/visitas/agendar/:id`, `/remarcar/:id`, `/cancelar/:id`, `/concluir/:id` — transições básicas
- `POST /app/visitas/checkin/:id`, `/finalizar/:id`, `/negociacao/:id`, `/perdido/:id`, `/cliente-chegou/:id`, `/no-show/:id`, `/proposta-valor/:id`, `/perda-motivo/:id` — etapas do funil de visita (pipeline pós-visita)
- `POST /app/visitas/parceiro-confirmou/:id`, `/proprietario-confirmou/:id` — confirmação de terceiros
- `POST /app/visitas/observacao/:id`, `/prioridade/:id`, `/responsavel/:id`, `/cliente-gostou/:id`, `/proposta/:id`, `/fechado/:id` — metadados/anotações
- `POST /app/visita/:id/confirmar-caso2`, `POST /app/visita/agendar-corretor` — fluxo de agendamento pelo corretor
- `POST /api/visita/:id/workflow`, `/confirmar`, `/remarcar`; `GET /api/visita/:id/whatsapp` — API de workflow de visita (usa `services/visitaWorkflow.js`)
- `GET/POST /cliente/visita/:id`, `/confirmar`, `/recusar`, `/remarcar`, `/responder` — páginas públicas pro **cliente** confirmar visita (⚠️ pendência: status não avança em `/confirmar` e `/recusar` — ver Pendências)
- `GET/POST /corretor/visita/:id`, `/responder` — página pro corretor responder solicitação
- `GET/POST /proprietario/visita/:visitaId/responder` — página pro proprietário confirmar disponibilidade
- `GET/POST /visita/:id/confirmar-lead`, `/confirmar-corretor` — confirmação bilateral (rotas mais antigas)
- `GET /visita/:id/realizada-corretor`, `/realizada-lead`; `POST /marcar-realizada`, `/marcar-nao-realizada`, `/lead-gostou`, `/lead-nao-gostou` — registro pós-visita
- `GET /cliente/oferta/:leadId`, `/escolher/:idx`, `/visita/:idx` — vitrine pública de imóveis em match pra lead (link compartilhado via WhatsApp)

### `/app/perfil` e Instagram
- `GET/POST /app/perfil` — dados do corretor
- `POST /app/perfil/senha`, `/vitrine`, `/localizacao`, `/quintoandar` — sub-formulários (senha, config de vitrine, geolocalização do escritório, autorização QuintoAndar)
- `GET /app/instagram/conectar`, `/callback`; `POST /desconectar`, `/postar` — fluxo OAuth "Instagram API with Instagram Login" (`graph.instagram.com`, sem Página do Facebook) + publicação de posts/stories de imóveis (integração adicionada recentemente, ver `services/instagram.js`)
  - Liberado pra todas as contas desde jul/2026 (a restrição temporária a `REN-G9K6`, usada enquanto o app aguardava aprovação da Meta, foi removida de server.js e das views `app-perfil.ejs`/`app-imoveis.ejs`)

### WhatsApp / Evolution API
- `GET /app/whatsapp`, `/app/whatsapp/qrcode` (+ versão `_old_disabled`), `/app/whatsapp/status` — conexão da instância WhatsApp do corretor
- `POST /app/whatsapp/desconectar`
- `POST /app/lead/:id/whatsapp/enviar` — envia vitrine de imóveis por WhatsApp (cobra `vitrine_whatsapp`, 20 coins conforme código — CLAUDE.md lista 30 no catálogo de custos; conferir se está desatualizado)

### Assistente IA / Central operacional
- `GET /app/assistente`, `/api/assistente/dados`, `/app/assistente/historico`, `/abertura` — tela e dados do assistente
- `POST /app/assistente/chat` — mensagem pro assistente (Groq)
- `POST /app/assistente/upload` — upload de arquivo dentro do chat
- `POST /app/assistente/acao-direta`, `/feedback` — ações rápidas e feedback de qualidade de resposta
- `GET /app/central`, `POST /api/central-operacional` — "Central Operacional" (usa `services/centralOperacional.js`, um NLU mais simples baseado em regex/keywords, separado do cérebro completo)
- `GET /api/memoria-operacional` — memória de contexto (último lead/visita mencionados)

### Captação de imóveis (proprietário se auto-cadastra)
- `GET /app/captacao` — painel do corretor com leads/imóveis captados
- `GET /captar/:userId` — página pública de captação (proprietário preenche dados do imóvel)
- `POST /captar/salvar/:userId`, `/captar/nao/:leadId` — salva captação ou recusa
- `POST /app/captacao/marcar/:leadId`, `/app/lead/:id/excluir-captacao` — marca como tratada / exclui

### Feed (estilo reels) e favoritos
- `GET /app/feed` — feed vertical de imóveis (estilo Instagram/TikTok)
- `POST /api/feed/like`, `GET /api/feed/likes/:imovelId` — curtidas
- `GET /api/feed/com-lead`, `/api/feed/novos` — imóveis pra oferecer a uma lead / novos desde `since`
- `POST /api/feed/marcar-visto`, `/api/feed/limpar-vistos` — marca vistos (armazenado em `usuarios.feed_vistos`, JSONB — não é tabela própria)
- `GET /api/favoritos`, `POST /api/favoritos/toggle` — favoritos (armazenado em `usuarios.favoritos`, JSONB)

### Parceiros / comissão
- `GET /app/parceiros` — lista de corretores parceiros na rede
- `POST /app/parceiro/:id/comissao` — define % de comissão de parceria

### Notificações
- `GET /app/notificacoes` — lista
- `POST /app/notificacoes/:id/lida`, `/marcar-todas-lidas` — marcar como lida

### Pagamento / coins
- `GET /app/coins` — saldo e histórico de créditos
- `POST /pagamento/criar`, `/pagamento/processar`, `GET /pagamento/sucesso` — checkout Mercado Pago
- `POST /webhook/mercadopago` — confirmação assíncrona de pagamento

### Diversos
- `GET /health` — health check (usado pelo Render)
- `GET /sw.js` — service worker (PWA)
- `GET /politica-privacidade`, `/termos-de-uso` — páginas legais
- `GET /app/parceria-quintoandar`, `POST /app/quintoandar/solicitar-acesso` — landing da parceria QuintoAndar
- `POST /process` — endpoint genérico de upload/processamento (legado)
- `POST /api/lead-interesse` — captura de interesse vindo de página pública de imóvel

## services/ — responsabilidade de cada arquivo

**Persistência (padrão comum: PG como fonte de verdade via `services/db.js`, com fallback pra JSON em disco via `services/storage.js` quando `dbOk()` falha; cada arquivo expõe `ler*`/`salvar*`/`atualizar*` e faz o mapeamento linha↔objeto camelCase↔snake_case, guardando o resto em coluna `dados JSONB`)**
- `db.js` — pool único do PostgreSQL (`pg.Pool`, singleton `getPool()`), helper `query()` e `dbOk()` usados por todo o resto do código
- `storage.js` — núcleo de I/O de JSON em disco (`lerJSON`/`salvarJSON`), com fila por arquivo (`_comLock`) pra evitar corrupção por escrita concorrente — é o fallback quando o PG está offline
- `salvarUsuario.js` — CRUD de `usuarios`; cria a tabela on-boot (`_inicializarUsuarios`); `rowToUser`/`userToRow` fazem o de-para camelCase/snake_case + campos extras em `dados`
- `salvarImovel.js` — CRUD de `imoveis`; cria a tabela e índices on-boot (`criarTabelaImoveis`); tem `_geocodificarCep` (geocodifica via Nominatim ao salvar); é o service mais completo em termos de colunas mapeadas
- `salvarLead.js` — CRUD de `leads`; dispara email de "nova lead" pro corretor e email de captação pra própria lead (com checagem de "já existia" ANTES do insert — fix documentado nos Bugs recentes); tem migração automática de coluna (`_migrarColunaMapa` adiciona `mapa_intencao` se não existir)
- `salvarVisita.js` — CRUD de `visitas`; nota: grava campos de workflow (`confirmacao_corretor_status`, `lembrete_enviado`) que não estão no `schema.sql` original — schema real do banco divergiu do arquivo `.sql`
- `salvarNotificacao.js` — CRUD de `notificacoes` (schema: `usuario_id`, `lida`, `criado_em`) — ⚠️ **atenção**: existe um SEGUNDO sistema de notificação paralelo em `notificacoes/criarNotificacao.js` com schema diferente (`user_id`, `status`, `prioridade`, `acao`, `link`, `created_at`) — os dois escrevem na mesma tabela `notificacoes` com nomes de coluna incompatíveis; confirmar antes de mexer em notificações qual dos dois caminhos está de fato em uso em cada rota
- `creditos.js` — sistema de coins: `consumir(userId, acao)` debita conforme tabela `CUSTO`, `adicionarCreditos()` credita, dispara notificação de saldo baixo/zerado/médio; resolve `userId` legado pra `codigo_usuario` atual antes de debitar
- `campanha.js` — campanha de email em massa: importa contatos, monta HTML com pixel de abertura + tracking de clique, dispara em lote com 1.1s de intervalo (rate limit SES)
- `centralOperacional.js` (521 linhas, maior service) — NLU leve baseado em regex (`interpretarComando`) pra comandos em linguagem natural na "Central Operacional" (`/app/central`) — resolve leads quentes, visitas, matches, resumo do dia, inteligência de mercado, diagnóstico de match, estratégia de venda; guarda memória de curto prazo por usuário (`ultimoLead`, `ultimaVisita`) em `assistente-contexto-operacional.json`
- `cerebro-nlp.js` — "v3.0 — NÃO EDITAR — gerado por npm run cerebro": dicionário de sinônimos + tabela de intenções com keywords/boost/penalize, usado pra detecção rápida de intenção fora do fluxo Groq
- `backup.js` — backup automático: a cada 1 min faz dump de `leads/visitas/usuarios/imoveis/notificacoes` pra tabela `backups` (JSONB), mantém só os 3 últimos
- `email.js` — wrapper fino do AWS SES (`enviarEmail`)
- `emailReengajamento.js` — email pra usuários inativos há 7+ dias
- `emailResumo.js` — email de resumo de conta (imóveis, leads, matches, visitas dos últimos 3 dias) + alerta se WhatsApp desconectado
- `extratorcorreto-ajustado.js` — scraper Playwright do ImovelWeb (extrai dados de um anúncio a partir da URL, usa `avisoInfo` do próprio site quando disponível, fallback por regex no texto, geocodifica reverso se só tiver lat/lng); **usa `executablePath` fixo do Chrome no macOS — não roda no Render as-is**, é ferramenta local
- `importJobs.js` — CRUD simples da tabela `import_jobs` (status de importações assíncronas, consultado por `/api/import/status/:jobId`)
- `instagram.js` — integração Instagram Business Login (fluxo OAuth direto com `graph.instagram.com`, sem precisar de Página do Facebook); publica feed (com carrossel até 10 fotos) e stories; trata IDs do Instagram como string (evita perda de precisão de `Number.MAX_SAFE_INTEGER` no parse do JSON) — **integração recente**
- `jobCreditos.js` — job diário (`setInterval` 24h) que debita créditos por lead ativo e dispara alertas de saldo — **nota: usa custo fixo `CUSTO_LEAD_DIA=10`, divergente do `lead_ativo_dia=0.2` documentado no catálogo de coins; parece código desatualizado/não sincronizado com `creditos.js`**
- `leadPipeline.js` — calcula estágio/prioridade de uma lead pro kanban (`getLeadStage`: visita confirmada > visita pendente > quente (3+ matches) > morno > sem resposta > frio) e ordena (`rankLeads`)
- `locationEngine.js` / `bairroEngine.js` — resolução de bairro a partir de texto livre pra São Paulo (dicionário fixo de bairros + CEP); parecem protótipos mais antigos e específicos de SP, hoje o `extrator-perfil.js` usa a tabela `localidades` (IBGE) como fonte principal
- `bairroResolver.js` — outra função de resolução de bairro, prioriza planilha → texto (regex de breadcrumb ImovelWeb) → rua (mapa fixo de logradouro→bairro)
- `matcher.js` — motor de match standalone mais antigo (score por diferença de preço/área/quartos/suítes/vagas) — **tem um bug de sintaxe**: chave `}` sobrando após `searchRankim` (linha 79) que quebraria o `require()` do arquivo; não referenciado por nenhum outro arquivo do projeto — parece código morto
- `matchquintoandarcorreto.js` — variante corrigida do `matcher.js` (mesma lógica, tolerância de valor -35%/+25% e suítes/vagas com 1 a menos aceito) — usado pelo fluxo de busca no QuintoAndar
- `memory.js` — log de eventos genérico em `events.json` (`logEvent`/`readEvents`)
- `olxMemory.js` — memória chave-valor por URL em `olx-memory.json`, usada pelo scraper de OLX
- `monitor.js` — monitor de segurança: alerta via WhatsApp (Evolution) quando o banco cai/volta e quando há 5+ tentativas de login falhas do mesmo IP em <10min
- `quintoandar.js` — scraper Playwright que varre páginas de busca do QuintoAndar por bairro (múltiplas variações de URL/slug) e enriquece cada resultado com `services/details.js` (não lido — não existe no repo atual, possível dependência quebrada)
- `remax.js` — scraper Playwright da REMAX (lista + detalhe de cada imóvel)
- `salvarXmlFeed.js` — CRUD da tabela `xml_feeds` (URL/portal/status de sync de cada feed XML importado)
- `visitaWorkflow.js` — `detectarWorkflowVisita`: decide o próximo responsável no fluxo de confirmação de visita (proprietário vs parceiro vs corretor) e monta a mensagem de WhatsApp correspondente
- `workerDispatch.js` — dispara `worker_threads` pra importação de XML e de leads em background (`workers/importXmlWorker.js`, `workers/importLeadsWorker.js`)
- `xmlScheduler.js` — agenda sync de XML a cada 1h; sincroniza `xml-feeds.json` com `users[].xmlUrl` e chama `xmlSync.syncXmlFeeds()`
- `xmlSync.js` — reimporta XML de cada feed que passou 24h sem sync (`execSync('node importXMLCompleto.js ...')`), faz merge preservando campos manuais do corretor (proprietário, destaque, observações) e marca como `removido_xml` o que saiu do feed — cobra `sync_xml_24h`
- `xmlVivaReal.js` — monta XML no formato do VivaReal/Canal Pro a partir de uma lista de imóveis (`buildVivaRealXML`)
- `schema.sql` — schema "de referência" original do projeto; **está desatualizado** frente ao schema real (várias colunas hoje em produção — `mapa_intencao`, `workflow_*` em visitas, `codigo_usuario`/`match_coins` em usuários — vêm de `CREATE TABLE`/`ALTER TABLE` embutidos nos próprios `services/*.js`, não deste arquivo)

**Subpastas**
- `memoria/registrarEvento.js` — grava eventos de memória operacional em `memoria-operacional.json` (arquivo local, não PG)
- `notificacoes/criarNotificacao.js` — ver nota de duplicidade acima; grava em PG com schema próprio (`user_id`, `prioridade`, `status`, `acao`, `link`)
- `visita/fluxoVisita.js` — `fluxoVisita()`: decide se a visita é de imóvel próprio (proprietário/manual) ou de parceiro, retorna tipo+destino+ação
- `visita/resolverDestinoVisita.js` — `resolverDestinoVisita()`: resolve pra quem mandar a notificação de uma visita (parceiro > proprietário > corretor, com fallback)
- `workflow/atualizarWorkflowVisita.js` — atualiza `workflow_status`/`workflow_label`/etc de uma visita no PG, propaga a fase da lead (`fase_funil`) quando o workflow vira `confirmada`/`realizada`, registra evento e cria notificação

## cerebro/ — motor de match e assistente IA

**Fluxo do motor de match** (`match-core.js`, classe `MatchCore`, ponto de entrada `processar({lead, mensagem, canal, userId, ...})`):
1. `detectarCaso(lead)` — Caso 1 se a lead tem `imovel_interesse`/`imovelId`/`idAnuncio` (clicou num anúncio específico); Caso 2 caso contrário (perfil de busca via WhatsApp/planilha/manual)
2. Monta/atualiza `mapaIntencao` da lead (estrutura de sinais com `valor/confiança/score/origem` por campo: transação, tipo, cidade, bairro, valor, quartos etc)
3. **Caso 1** (`_matchCaso1`): busca o imóvel âncora no PG, monta um `mapaIntencao` temporário a partir dos atributos desse imóvel (tolerância de preço -30%/+20%, área ±20%) e roda `matchPorMapa` contra a base do corretor + rede do mesmo estado; imóvel âncora sempre fica no topo com score 100
4. **Caso 2** (`_matchCaso2`): só roda se `_perfilSuficiente()` (exige transação+tipo+cidade+bairro+valor+quartos, ou +área pra terreno/comercial); resolve o estado da lead (sigla↔nome completo) pra filtrar `imoveis` no PG; roda `matchPorMapa`; só substitui os matches antigos se a nova lista for igual ou maior (evita "piorar" um resultado já bom); se for a primeira vez que gera match e a lead tinha `leadOculta=true`, revela a lead (`leadOculta=false`) e dispara email pro corretor
5. Em ambos os casos, respeita a preferência `vitrineApenasPropriosImoveis` do usuário (filtra pool pra só imóveis próprios se ativado) e prioriza imóveis do próprio corretor no ranking antes dos da rede
6. Depois do match: registra evento (`_evento`), calcula follow-ups pendentes (`_followUp` — regras por temperatura/fase/nº de mensagens), persiste a lead (`_salvarLead`) e gera resposta de WhatsApp se aplicável (`_responderEEnviar`, via `resposta-auto.js`)

**`motor-intencao.js`** — o coração do scoring:
- `matchPorMapa(lead, imoveis)`: aplica primeiro os **critérios mínimos eliminatórios** (transação, tipo, estado, cidade, bairro, valor -30%/+20%, área ±20% pra terreno/comercial, quartos ≥ pedido, suítes ≥ pedido-1, vagas ≥ pedido-1) e só depois pontua (0–100, ponderado: valor 20pts, bairro 15pts, quartos 15pts, tipo 10pts, transação 5pts, cidade 5pts + outros critérios) os imóveis que sobreviveram ao corte
- `inferirOcultos(lead)` — detecta intenção oculta a partir de comportamento (tempo gasto, cliques) além do que a lead disse explicitamente
- `registrarComportamento`, `recomendar` — acumulam sinais de comportamento e recalculam recomendações incrementalmente

**`portal-processor.js`** — processa leads vindas de webhooks de portal (ImovelWeb, ZAP, VivaReal, OLX, 123i, Chaves): tenta achar o imóvel do anúncio pelo `idAnuncio` no PG (alta confiança, score 95) e monta o `mapaIntencao` a partir dele; se não achar o imóvel, cai pro `extrator-perfil.js` pra tentar extrair da mensagem (confiança menor, score 75–90); classifica fase (`novo`/`interesse`/`qualificado`) e temperatura conforme quantos campos foram preenchidos

**`index.js`** — orquestra a resposta do assistente conversacional em 3 camadas (conforme já documentado acima): (1) saudação — resposta fixa com resumo rápido de pendências; (2) se `GROQ_API_KEY` setada, monta um contexto rico (leads quentes/recentes, top bairros/tipos de demanda, feedbacks positivos/negativos recentes de `assistente-feedbacks.json`) e chama `groq-ia.js`; (3) fallback estático se não tiver Groq configurado. Usa `memoria-conversa.js` pra manter histórico da conversa por usuário.

**Outros arquivos relevantes em cerebro/** (não lidos em detalhe — pasta tem 80+ arquivos, muitos protótipos/experimentos de NLP local que competem/complementam o Groq): `extrator-perfil.js` (175KB — o maior arquivo do repo depois do server.js; extrai perfil de busca de mensagens de texto livre, usa tabela `localidades` como dicionário de bairros/cidades com cache de 1h), `resposta-auto.js` (gera respostas de WhatsApp "slot a slot"), `groq-ia.js` (chamada à API Groq), `nlp.js`/`portugues.js`/`tfidf.js`/`embeddings.js`/`rag.js` (infraestrutura de NLP local, possivelmente legado de antes da adoção do Groq), `acoes-diretas.js` (gera links de ação — WhatsApp, vitrine, XML), `mercado.js`/`inteligencia-mercado.js` (estatísticas de demanda por bairro/tipo).

## views/ (EJS ativos — excluindo backups)

- `index.ejs` — landing/home pública (raiz `/`)
- `landing.ejs` — landing page alternativa ("MatchImóveis — Inteligência imobiliária com memória")
- `admin-cerebro.ejs` — editor/testador do cérebro do assistente (painel admin)
- `app-home.ejs` — dashboard principal do corretor logado (`/app-home`), saudação + métricas
- `app-central.ejs` — tela da "Central Operacional" (`/app/central`), chat de comando em linguagem natural
- `app-assistente.ejs` — chat do assistente IA (`/app/assistente`)
- `app-cadastro.ejs` — formulário de cadastro de novo imóvel
- `app-editar-imovel.ejs` — formulário de edição de imóvel existente
- `app-imoveis.ejs` — listagem/carteira de imóveis com filtros
- `app-imovel-detalhe.ejs` — detalhe de um imóvel (visão interna do corretor)
- `imovel-form.ejs` — form de cadastro alternativo/legado ("Cadastrar Imóvel")
- `imovel.ejs`, `imovel-publico.ejs` — página pública do imóvel (link compartilhável, `/imovel/:id`)
- `app-leads.ejs` (+ `app-leads.backup.ejs`, ignorado) — kanban/lista de leads
- `app-lead-detalhe.ejs` — detalhe de uma lead (perfil, matches, histórico)
- `app-importar-leads.ejs` — wizard de importação de leads via planilha
- `app-captacao.ejs` — painel de captação de imóveis (leads que viraram proprietários)
- `captar-imovel.ejs` — página pública onde o proprietário cadastra o imóvel próprio ("Tenho imóvel para captar")
- `app-visitas.ejs` — lista de visitas
- `app-visitas-kanban.ejs` — kanban de visitas (funil pós-agendamento)
- `agendar.ejs` — form de agendamento de visita
- `agendamento-ok.ejs` — confirmação de "visita solicitada"
- `cliente-visita.ejs`, `cliente-visita-confirmar.ejs`, `cliente-visita-remarcar.ejs`, `cliente-remarcar.ejs`, `cliente-remarcar-visita.ejs`, `cliente-confirmado.ejs` — páginas públicas pro **cliente** confirmar/remarcar visita
- `corretor-visita.ejs` — página pro corretor responder solicitação de visita
- `proprietario-visita.ejs`, `proprietario-confirmado.ejs` — páginas pro **proprietário** confirmar disponibilidade
- `parceiro-visita.ejs`, `parceiro-confirmado.ejs` — páginas pro **corretor parceiro** confirmar disponibilidade
- `visita-confirmar.ejs` — confirmação de presença (rota mais antiga/genérica)
- `visita-realizada-corretor.ejs`, `visita-realizada-lead.ejs` — registro pós-visita (corretor marca realizada; lead informa se gostou)
- `cliente-oferta.ejs`, `oferta.ejs` — vitrine pública de imóveis em match pra uma lead (link `/cliente/oferta/:leadId`)
- `app-feed.ejs`, `feed-reels.ejs` — feed vertical de imóveis estilo reels
- `app-mapa.ejs`, `mapa.ejs` — mapa de imóveis (OpenStreetMap)
- `app-parceiros.ejs` — lista de corretores parceiros / comissões
- `app-portais.ejs`, `app-portais-xml.ejs` — configuração de portais e feeds XML
- `app-exportar.ejs` — tela mínima de exportação (6 linhas — provavelmente só dispara o download)
- `app-notificacoes.ejs` — lista de notificações
- `app-perfil.ejs` — perfil/configurações do corretor
- `app-whatsapp-inbox.ejs` — inbox de conversas WhatsApp
- `app-coins.ejs` — saldo e compra de créditos (Mercado Pago)
- `app-corretor.ejs` — perfil público de um corretor
- `parceria-quintoandar.ejs` — landing da parceria QuintoAndar ("Seus imóveis no QuintoAndar")
- `politica-privacidade.ejs`, `termos-de-uso.ejs` — páginas legais

**partials/** — `app-shell.ejs` (591 linhas: `<head>`/CSS/nav compartilhados por todas as telas `/app/*`), `app-end.ejs` (fecha o shell), `workflow-visita.ejs` (badge colorido de status de workflow — `AGUARDANDO_PROPRIETARIO`/`AGUARDANDO_PARCEIRO`/`AGUARDANDO_CORRETOR`/`CONFIRMADA`/`REMARCAR`/`CANCELADA`/`FINALIZADA`)

## Banco de dados — tabelas principais

⚠️ O `services/schema.sql` está desatualizado; o schema real vem das `CREATE TABLE IF NOT EXISTS`/`ALTER TABLE` embutidas em cada `services/*.js` (rodam no boot da aplicação) e de tabelas criadas diretamente no banco sem DDL versionada no repo (marcadas abaixo).

- **`usuarios`** (`services/salvarUsuario.js`) — `id`, `codigo_usuario` (identificador primário de fato), `nome`, `email`, `senha`, `telefone`/`celular`, `tipo`, `ativo`, `creci`, `cpf`, `match_coins`, `match_coins_total`, `whatsapp_instance`/`whatsapp_status`/`whatsapp_numero`, `bloqueados` (JSONB), `lat`/`lng`/`endereco`, `xml_url`/`xml_atualizado_em`/`xml_total`, `historico_assistente` (JSONB), `favoritos` (JSONB, coluna solta usada por `/api/favoritos` — não declarada na `CREATE TABLE` base, deve ter sido adicionada por `ALTER` fora do repo), `feed_vistos` (JSONB, idem), `dados` (JSONB — pega o resto)
- **`imoveis`** (`services/salvarImovel.js`) — `id`, `id_externo`/`id_original`/`id_interno`/`codigo_imovel`, `titulo`, `tipo`, `categoria`, `transacao`, `status`, `bairro`/`cidade`/`estado`/`endereco`/`cep`, `latitude`/`longitude`, `valor_imovel`/`condominio`/`iptu`, `area_m2`/`area_total`/`area_construida`, `quartos`/`suites`/`banheiros`/`vagas`/`salas`, `descricao`, `fotos`/`proprietario`/`portais`/`diferenciais`/`corretor` (todos JSONB), `fonte`/`source`, `user_id`/`usuario_id`/`codigo_usuario`/`corretor_id` (múltiplos campos de dono — ver convenção de fallback duplo no topo do arquivo), `url`/`url_publica`/`tour_virtual`, `inativado_em`/`inativado_por`, `xml_url`, `dados` (JSONB)
- **`leads`** (`services/salvarLead.js`, base em `schema.sql`) — `id`, `nome`/`telefone`/`whatsapp`/`contato`, `origem`, `status`, `fase_funil`, `temperatura`, `score`, `user_id`/`codigo_usuario`, `tipo_lead`, `perfil_ia`/`mensagens`/`matches`/`matches_auto`/`matches_base`/`historico`/`timeline`/`eventos`/`follow_ups`/`deletado_por` (JSONB), `vitrine_enviada(_em)`, `visita_agendada(_em)`, `imovel_vendedor`, `comissao_parceiro`, `ciclo_anterior`/`ciclo_seguinte`, `mapa_intencao` (JSONB, adicionada via `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` em `salvarLead.js`), `comportamento`/`intencoes_ocultas` (JSONB), `dados` (JSONB)
- **`visitas`** (`services/salvarVisita.js`, base em `schema.sql`) — `id`, `lead_id`, `nome`/`telefone`/`contato`, `imovel_id`/`imovel_titulo`/`imovel_bairro`, `data_visita`/`hora_visita`, `status`, `origem`, `user_id`/`corretor_id`/`owner_user_id`/`imovel_usuario_id`, `proprietario_nome`/`proprietario_telefone`, `resposta_proprietario`, `confirmacao_cliente_status`/`confirmacao_corretor_status`, `lembrete_enviado`, `obs`, `workflow_status`/`workflow_atualizado_em`/`workflow_responsavel`/`workflow_label`/`workflow_proxima_acao` (usadas por `services/workflow/atualizarWorkflowVisita.js`, não declaradas em nenhuma `CREATE TABLE` do repo — criadas fora), `dados` (JSONB)
- **`notificacoes`** — ⚠️ dois formatos concorrentes gravando na mesma tabela (ver nota em services/ acima): formato A (`schema.sql`/`salvarNotificacao.js`): `id`,`tipo`,`titulo`,`mensagem`,`usuario_id`,`lida`,`lead_id`,`imovel_id`,`visita_id`,`criado_em`,`dados`; formato B (`notificacoes/criarNotificacao.js`): `id`,`tipo`,`titulo`,`mensagem`,`prioridade`,`status`,`user_id`,`lead_id`,`visita_id`,`imovel_id`,`acao`,`link`,`created_at`
- **`backups`** (`services/backup.js`) — `id`, `timestamp`, `totais` (JSONB), `dados` (JSONB, dump completo de leads/visitas/usuarios/imoveis/notificacoes) — mantém só os 3 últimos registros, backup a cada 1 min
- **`xml_feeds`** (DDL em `setupDB.js`, CRUD em `services/salvarXmlFeed.js`) — `user_id`, `url`, `tipo`, `portal`, `arquivo`, `last_sync_at`, `total`, `last_result`, `ativo` — unique em `(user_id, url)`
- **`import_jobs`** (`services/importJobs.js`, DDL não encontrada no repo — criada direto no banco) — `id` (uuid), `tipo`, `usuario_id`, `status`, `arquivo`, `updated_at`, e outras colunas de progresso/resultado atualizadas dinamicamente via `atualizarJob`
- **`solicitacoes_quintoandar`** (DDL inline em `server.js`, linha ~1010) — `id`, `user_id`, `nome`, `telefone`, `email`, `criado_em`, `atendido`
- **`log_seguranca`** (DDL em `tmp-cria-log.js`, script avulso já rodado) — `id`, `tipo`, `ip`, `user_agent`, `dados`, `criado_em`
- **`localidades`** (DDL não encontrada no repo — populada por `popular-brasil-tudo.js` a partir da API do IBGE + Overpass/OSM) — `bairro`, `cidade`, `estado`, `fonte` (`ibge`/`osm`); é o dicionário usado por `extrator-perfil.js` pra reconhecer bairro/cidade em texto livre
- **`campanha_contatos`**, **`campanha_tracking`** (DDL não encontrada no repo — usadas por `services/campanha.js` e rotas `/admin/campanha/*`) — contatos de email marketing (~118k) e eventos de abertura/clique
- Tabelas usadas mas cuja DDL não está versionada em lugar nenhum do repo (criadas manualmente no Render em algum momento): `import_jobs`, `localidades`, `campanha_contatos`, `campanha_tracking` — considerar extrair um `pg_dump --schema-only` real do banco de produção se for preciso reconstruir do zero

## Scripts utilitários na raiz (não geram rota — rodados manualmente/via `node script.js`)

**Importação de dados**
- `importXMLCompleto.js` — importador principal de feed XML de portal pra `imoveis` (usado por `xmlSync.js` via `execSync`, e manualmente)
- `processLeads.js` — importa planilha de leads (XLSX) pro banco
- `inserir_leads_teste.js`, `inserir_leads_teste2.js` — scripts de seed com leads fictícias (conta `REN-HUH6`) pra testar match
- `popular-brasil-tudo.js` — popula a tabela `localidades` com todos os municípios do IBGE + bairros via Overpass/OSM

**Cruzamento/enriquecimento de dados de proprietários (conta Alexandre, ALE-DU2K)**
- `gerar-mapa-alex.js` — faz parse de `CADIMO.sql`/`CADCLI.sql` (exports de sistema legado) e monta um mapa código→proprietário
- `cruzar-alex.js` — cruza esse mapa com os imóveis já importados no banco
- `atualizar-proprietarios-alex.js` — aplica o mapa gerado (lido de `/tmp/mapa-alex.json`) nos imóveis da conta

**Geração/manutenção de mapa e geo**
- `geocode-imoveis.js` — geocodifica imóveis sem lat/lng (dicionário fixo de bairros de SP + fallback)

**Match e diagnóstico**
- `matchBaseInterna.js` — motor de match standalone contra a base interna (usado pela Central Operacional pra "fazer_match" sob demanda)
- `forcematch.js` — força reprocessamento de match de uma lead específica via `cerebro/match-core.js` (script de debug, ID hardcoded)
- `check_lead.js` — consulta rápida de uma lead específica no PG (debug, ID hardcoded)
- `test-extrator.js` — testa `extrairPerfil` do `cerebro/extrator-perfil.js` com uma mensagem de exemplo
- `extractAllAdmin.js` — roda o extrator Playwright (`services/extratorcorreto-ajustado.js`) em lote sobre leads salvas em `data.json`
- `visualizador-leads.js` — pequeno servidor HTTP standalone (porta própria) pra rodar e acompanhar extração de leads em lote com barra de progresso

**Setup/infra**
- `setupDB.js` — cria as tabelas base (`leads`, `visitas`, `usuarios`, `imoveis`, `notificacoes`, `xml_feeds`) — redundante com as `CREATE TABLE` embutidas nos `services/*.js`, parece ter sido o script original antes de migrar pra criação lazy em cada service
- `tmp-cria-log.js` — script avulso já executado que criou a tabela `log_seguranca`

**Geração de config/manifesto do cérebro**
- `cerebro.js` — gera `assistente-mapa.json` (mapa de rotas + labels/descrições usado pelo assistente pra saber navegar o sistema)
- `cerebro-scanner.js` — varre `server.js` com regex pra extrair todas as rotas `app.get/post/put/delete` (ferramenta auxiliar de `cerebro.js`)
