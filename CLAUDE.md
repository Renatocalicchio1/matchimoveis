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
- **Toda rota/menu novo pro corretor → atualizar `cerebro.js` no mesmo commit.** O assistente (cerebro/groq-ia.js) só sabe o que estiver em `cerebro.js` (array `rotas` + `fluxos` + `conceitos`) — não lê o código nem os menus direto. Já causou o assistente inventar resposta errada pra Instagram/Meta Ads/Meu Site por semanas até alguém notar (jul/2026). Depois de editar `cerebro.js`, rodar `node cerebro.js` (regera `assistente-mapa.json` e `cerebro/contexto-groq.json`) e `node verificar-cerebro.js` (confere se algum link do menu ficou sem entrada) antes de dar deploy. Todo o conteúdo estático mora só em `cerebro.js` — `groq-ia.js` nunca deve ter texto de conhecimento da plataforma hardcoded (só monta o prompt com dados dinâmicos do corretor + o que vem de `contexto-groq.json`).

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
- **Convite pro portal global (`services/emailPortalGlobal.js`, ago/2026)**: email periódico pra toda lead do sistema com email cadastrado convidando a conhecer `/portal` (vitrine agregada de todos os corretores), 10 variações de assunto/copy/botão rotativas por hash do id da lead. Antes só alcançava lead nova (histórico marcado como "já enviado" na criação da coluna); liberado pra base toda trocando o corte pra tempo — reenvia a cada 7 dias por lead (`portal_email_enviado_em`), cadência de disparo igual à campanha geral de corretor (1 email por vez, 10s-2min aleatório, nunca lote fechado). Como lead nunca autorizou marketing direto da plataforma, todo email tem link de descadastro próprio (`/email/cancelar-portal?id=`, marca `leads.dados->>'portalEmailOptOut'` — mecanismo separado do opt-out de `usuarios`, que é outra tabela).
- **Captação — 1 caminho só de WhatsApp + preview sem foto + auto-publicar (ago/2026)**: `/app/captacao` tinha 3 botões de WhatsApp por imóvel (solicitar dados, solicitar foto, enviar link) apontando pra lugares diferentes — unificado num botão só ("💬 Falar no WhatsApp") que sempre manda o mesmo link, o de completar cadastro (`/captar/:userId?imovelId=X`, já existia mas só era usado pelo botão "Solicitar fotos"), nunca o link público direto. Mensagem: "Veja como está ficando o cadastro do seu imóvel". Dentro da tela de cadastro (`captar-imovel.ejs`) foi adicionada uma barra fixa "👀 Veja como seu anúncio está ficando" com link pro `/imovel/:id?preview=1` assim que o proprietário completa a tela 2 (endereço) — `?preview=1` faz `GET /imovel/:id` pular as 2 checagens que existem só pra visitante público (tem foto / valor acima do mínimo), pra dono ver o rascunho mesmo incompleto (`imovel-publico.ejs` já tinha um estado vazio "📷 Sem fotos cadastradas" pronto pra isso). Reabrir o link de cadastro agora pula direto pra 1ª etapa com dado faltando (`_primeiroStepIncompleto()`) em vez de sempre reiniciar em "onde fica o imóvel". `POST /captar/imovel/:imovelId` (`finalizar:true`) agora publica sozinho (`status='ativo'`) qualquer imóvel captado assim que fica completo (endereço + `imovelVisivelPublico`: foto + valor acima do mínimo) — antes só existia essa auto-publicação pro caminho específico da Campanha de Captação com sub-admin (bônus QuintoAndar), agora vale geral pra qualquer corretor.

## Infra
- 4 serviços Render: matchimoveis (web), match-evolution-api (web), matchimoveis-db (PG), match-evolution-db (PG)
- Health check: `/health`
- WhatsApp via Evolution API — instâncias abertas: match-suporte, MAU-EHAM, JAN-MGF9, ROD-AFQ4, VAL-9PCH
- AWS SES: domínio matchimoveis.online, produção liberada, ~118k contatos em /admin/campanha
- Backup: GitHub Actions pg_dump horário + on push

## Paleta de cores — padronização Airbnb (jul/2026)
- Auditoria em todas as 57 views ativas (`views/*.ejs` + `views/partials/*.ejs`, excluindo os `*.backup-*.ejs` que são só histórico/ignorados): dezenas de tons de azul/índigo/violeta (Tailwind blue/indigo/violet — `#3b82f6`, `#2563eb`, `#1d4ed8`, `#6366f1`, `#4f46e5`, `#7c3aed`, `#8b5cf6` etc, ~130 ocorrências em 23 arquivos) usados como cor decorativa/categórica sem nenhum motivo — trocados por teal Babu `#00A699` (família azul) e laranja Arches `#FC642D` (família índigo/violeta), consistente com a paleta já usada no dashboard.
- `#1D9E75` (um teal "quase certo" mas fora do padrão, usado em ~7 arquivos — mapa, feed reels, cards de imóvel) unificado pro teal oficial `#00A699`.
- Mantidas como exceção justificada (não são "bagunça", representam a marca real de terceiros): azul da OLX em `app-portais.ejs` (`cores.olx`), magenta/roxo do Instagram no botão `.im-btn.instagram` de `app-imoveis.ejs`, verde do WhatsApp (`#25D366`), e o gradiente escuro decorativo de fundo em `feed-reels.ejs` (não é cor de marca, é só backdrop antes do vídeo carregar).
- `mapa.ejs`: marcador/legenda "Venda" era azul (`#185FA5`), virou vermelho da marca `#FF385C`; "Aluguel" já era teal-based, mantido.
- Não mexido: grays (`#6b7280`/`#9ca3af`/`#e5e7eb` etc — já é a mesma escala usada nas variáveis `--text-sec`/`--text-ter`/`--border` do `app-shell.ejs`) nem as cores semânticas de status (verde=sucesso, âmbar=aviso, vermelho=erro/crítico) — são papéis diferentes de "categórica decorativa" e universalmente entendidos, trocar tudo pra vermelho/teal/laranja reduziria clareza.

## Dashboard `/app-home` (refeito jul/2026)
- Paleta Airbnb fixa (categórica, nunca ciclada): vermelho Rausch `#FF385C` (marca), teal Babu `#00A699`, laranja Arches `#FC642D` — validada contra CVD (script `validate_palette.js` do skill dataviz, PASS em modo claro). Cores de status (visitas por status) usam paleta semântica separada (verde/âmbar/vermelho), não a categórica.
- Antes disso, o dashboard tinha 2 gráficos com **dado 100% inventado** hardcoded no JS ("Leads por canal" com números fixos tipo `[3,5,4,6,4,2,1]`, "Tipos de imóvel" com `tipoData=[45,25,12,8,6,4]`) — removidos. Todo gráfico agora usa campo real já calculado em `stats`/`locals` no route `/app-home` (server.js)
- Novo campo `graficoLeadsOrigem` (server.js, rota `/app-home`) — agrupa `leadsArr` por `origem`/`origemEntrada` com rótulos amigáveis, substitui o gráfico de canal fake
- Cards novos usando dados que já eram calculados no backend mas nunca apareciam na tela: Demanda×Oferta por bairro (`graficoLeadsBairro` x `graficoImoveisBairro`), Confirmação & tendência mensal (`visitasTaxaConfirmacao`, `visitasRealizadasMes` vs `visitasRealizadasMesPassado`), Próximas visitas (`stats.proximasVisitas`), imóvel mais visitado e lead mais antiga sem visita (dentro do card Saúde da carteira)

## Área de atuação (estado/cidade/bairro) — multi-cidade + autocomplete (ago/2026)
- Antes: 1 cidade só por conta (`areaAtuacaoCidade`, string) + lista de bairro em `<div style="overflow-y:auto">` com checkbox (rolagem ruim, reclamação direta do Renato). Trocado por um widget único de chips (digita → aparece sugestão → clica → vira chip removível), reaproveitado nos 3 lugares que tinham essa seleção: `views/landing.ejs` (modal de cadastro), o modal `signup-box` de `/demanda` (server.js, prefixo `suArea`) e `views/app-perfil.ejs` (prefixo `pfArea`).
- Componente: `public/area-atuacao-widget.js`, função global `criarSeletorAreaAtuacao(prefixo, opts)` — contrato de IDs documentado no topo do arquivo (`<prefixo>EstadoInput/CidadeInput/CidadeSugestoes/CidadesChips/BairroInput/BairroSugestoes/BairrosChips` + 3 hidden opcionais). Baseado no padrão de chips que já existia no formulário principal de busca de `/demanda` (não no modal de cadastro dela) e em `/admin/rematch`.
- Dado salvo mudou de forma: `areaAtuacaoCidade` (string) virou `areaAtuacaoCidades` (array de string); `areaAtuacaoBairros` deixou de ser array de bairro solto (implicitamente da única cidade) e virou array de pares `{cidade,bairro}` — mesmo formato que a busca de `/demanda` já usava internamente (`_paresMarcados`). `areaAtuacaoEstado` continua string única (não pedido multi-estado).
- Gravação em 3 rotas: `POST /login` (cadastro), `POST /app/perfil` (edição), `_criarContaDemanda`/`_areaAtuacaoDeCriterios` (cadastro via `/demanda` — antes truncava pra 1ª cidade só, comentário no próprio código já admitia isso; agora usa todas as cidades buscadas).
- Consumo em `services/distribuicaoAreaAtuacao.js` (job diário de distribuição de lead por área) — `_buscarCorretoresComAreaAtuacao()` agora retorna uma linha por PAR corretor+cidade (achatado), pra não precisar mudar a lógica de tier/teto/saldo do resto do job (já indexada por `userId`, soma certo entre cidades da mesma conta). **Lê os dois formatos**: array novo (`areaAtuacaoCidades`) com fallback pro string antigo (`areaAtuacaoCidade`) via `COALESCE`/checagem de tipo no SQL — conta que não resalvou o perfil depois da mudança continua entrando na distribuição. `check-distribuicao-area.js` (script de diagnóstico manual) atualizado em paralelo com o mesmo fallback.

## Onboarding inteligente (jul/2026)
- `GET /api/onboarding/status` (server.js) — calcula ao vivo os 6 passos de onboarding a partir do estado real da conta: XML importado (`user.xmlUrl`), WhatsApp conectado (`whatsappStatus==='open'`), Instagram conectado (`instagramContaId`), cadastrou lead manual (`filtrarPorUsuario(leads)` com `origemEntrada==='manual'`), já conversou com o assistente (`historicoAssistente.length>0`), conheceu a área de perfil (flag `onboardingPerfilVisto`, setada na 1ª visita a `/app/perfil`, persistida em `dados` JSONB via `atualizarUsuario`)
- Modal "Primeiros Passos" (`views/partials/app-shell.ejs`) consome esse endpoint via fetch em qualquer página — mostra só os passos pendentes (os concluídos somem da lista, não ficam só marcados) e um badge com a contagem de pendentes no botão do menu (desktop + mobile)
- Substituiu 2 mecanismos antigos que não funcionavam: o modal estático anterior (4 passos, só texto informativo, sem checagem real) e um widget de progresso que já tinha sido construído mas ficou desativado (`if(false && ...)`) e só funcionaria certo em `/app/imoveis` (dependia de `totalImoveis`, variável que só essa rota passava pro render) — ambos removidos

## Gerenciador de Negócios — app mobile (conceito, ago/2026, ainda não codificado)
- Produto novo, separado da plataforma web — app iOS/Android, voz/áudio-first: o corretor faz tudo por comando de voz, sem precisar navegar menu. Nome de trabalho "Gerenciador de Negócios" (usuário citou também "Gerenciador de Anúncio" numa mensagem — nome final ainda não fechado, confirmar antes de nomear pastas/repo).
- Serve dois papéis no mesmo motor: **corretor** (gerencia o negócio) e **cliente/lead** (recebe/interage com os imóveis do match) — não é só uma ferramenta interna.
- UI não é dashboard nem lista estática — é formato **story/carrossel que se move sozinho**: cada card já é uma ação (não só um dado), passa pro próximo sozinho depois de um tempo se ninguém mexer, e desliza pro lado tipo Tinder/site de relacionamento quando o usuário interage manualmente (toque ou fala).
- Tela de repouso do corretor = "resumo inteligente": cruza Leads + Visitas + Captações num feed só, ordenado pelo que precisa de ação agora (não por menu separado, não por ordem cronológica) — cada card já traz a ação certa embaixo, pra tocar ou falar.
- Tela do cliente/lead = carrossel de imóveis do match, uma foto cheia de tela por vez, com like/dislike/voz — cada gostei/não-gostei realimenta o match (mesma ideia de swipe, aplicada a imóvel em vez de ação).
- Visão de plataforma: motor é neutro/white-label (pensado desde já pra qualquer empresa usar, com a marca/cores de cada uma — não hardcoded MatchImóveis no código), mas o primeiro uso real é 100% MatchImóveis. Cada empresa conectaria a conta e definiria a marca (logo, cores) numa tela de Configurações, reaproveitando o padrão que já existe em `site_config`/"Meu Site".
- Processo de construção acordado: nada de código ainda — primeiro visualizar/validar cada ideia com o usuário (mockups em Artifact), fase por fase seguindo os itens do menu atual (Leads → Visitas → Imóveis → Portais → Perfil → Coins), só implementar depois de confirmado. Regra geral da sessão continua valendo: não commitar/dar push sem autorização explícita, mesmo pra esse projeto novo.
- Ideias de capacidade levantadas (ainda não implementadas, ligadas a dado que já existe hoje): modo dirigindo (só áudio, usa Evolution API + Central Operacional), feed priorizado por valor/score do match em vez de por hora, sistema aprendendo o vocabulário de cada corretor (usa extrator-perfil.js/cerebro-nlp.js), resumo falado de fim de dia (usa stats de /app-home), ação em lote por frase (usa JOB_FOLLOWUPS/vitrine_enviada), alerta proativo antes da lead esfriar (usa fase_funil/leadPipeline.js).
- Dois mockups publicados como Artifact (privados, no scratchpad da sessão) mostrando o conceito: um com o carrossel de ações do corretor, outro com o carrossel de imóveis do cliente lado a lado.
- **Insight de dor do corretor (ago/2026)**: a dor não é só "gerenciar" (organizar lead/visita), é também "conseguir cliente" (aquisição) — e a plataforma já tem várias ferramentas de aquisição (Meta Ads, Instagram, captação, indicação, portais) só que espalhadas em menus que o corretor esquece de usar. Ideia em aberto, **ainda não decidida**: incluir uma 3ª categoria "Aquisição parada" no resumo inteligente (ex: imóvel sem lead há X dias → sugere publicar/impulsionar; campanha parada → sugere reativar; indicação pendente → sugere mandar link), no mesmo padrão proativo dos cards de Leads/Visitas/Captação — ou deixar isso pra uma fase separada, depois da base (Leads/Imóveis) validada. Retomar essa decisão antes de fechar o roadmap de fases.

## Vídeos tutoriais das telas (FAQ/suporte, ago/2026, em planejamento)
Objetivo: gravar vídeo curto de cada tela do app explicando como usar, pra servir de FAQ/suporte ao usuário dentro da plataforma — depois reaproveitar o mesmo material pra posts (Instagram/redes). Vídeo com texto (legenda) + narração falada (TTS), os dois juntos.
- Abordagem técnica planejada: reaproveitar a mesma base já validada no gerador de posts de Instagram (`services/instagramCardImagem.js`) — Playwright/Chromium headless, só que aqui gravando vídeo da navegação real pelas telas do app (`context.recordVideo` do Playwright) em vez de só um screenshot estático, mais narração TTS sincronizada e composição final via ffmpeg.
- Ainda não decidido/verificado: provedor de TTS (nenhum integrado hoje — cogitado AWS Polly por já ter a mesma conta AWS em uso pro SES, mas a credencial atual só tem permissão de SES, precisa o Renato liberar `polly:SynthesizeSpeech` no IAM se for esse o caminho), se ffmpeg está disponível no ambiente do Render (produção) ou se a geração roda só como pipeline manual/local por enquanto, se o vídeo final vai morar como asset embutido no app (ex: botão "Como usar" em cada tela) ou só publicado fora (central de ajuda/YouTube).
- **Ordem completa das 30 telas, definida com o Renato (ago/2026) — seguir essa ordem, não pular pra outra sem avisar**:
  1. Dashboard (`/app-home`)
  2. Perfil — dados da conta, área de atuação (`/app/perfil`)
  3. WhatsApp — inbox e conectar instância (`/app/whatsapp`)
  4. **Meus Imóveis — listagem/filtros (`/app/imoveis`) ← piloto, começar por aqui**
  5. Cadastrar imóvel (`/app/cadastro`)
  6. Editar imóvel (`/app/imovel/:id/editar`)
  7. Detalhe do imóvel (`/app/imovel/:id`)
  8. Importar XML de portal
  9. Portais — ativar VivaReal/ZAP/OLX etc (`/app/portais`)
  10. Mapa da carteira (`/app/mapa`)
  11. Captação — proprietário se auto-cadastra (`/app/captacao`)
  12. Leads — kanban (`/app/leads`)
  13. Detalhe da lead (`/app/lead/:id`)
  14. Importar leads via planilha
  15. Recomendações da IA pra uma lead
  16. Visitas — lista (`/app/visitas`)
  17. Visitas — kanban (`/app/visitas-kanban`)
  18. Assistente IA (`/app/assistente`)
  19. Central Operacional — comando por texto (`/app/central`)
  20. Parceiros (`/app/parceiros`)
  21. Indicações (`/app/indicacoes`)
  22. Parceria QuintoAndar (`/app/parceria-quintoandar`)
  23. Feed estilo reels (`/app/feed`)
  24. Meu Site (`/app/meu-site`)
  25. Instagram — conectar e postar
  26. Meta Ads — conectar, contas, públicos salvos
  27. Posts gerados (`/app/posts`)
  28. Campanha de redes sociais
  29. Notificações (`/app/notificacoes`)
  30. Coins — saldo e créditos (`/app/coins`)

## Usuários/contas de referência
Jane: JAN-MGF9 (~1.700 imóveis) | Mauricio: MAU-EHAM (~432) | Alexandre: ALE-DU2K (~845, enriquecido via CADIMO/CADCLI) | Barros: BAR-GALN | Valdete: VAL-9PCH | Rodrigo: ROD-AFQ4

## Páginas de conteúdo SEO/AEO (ago/2026)
Estratégia de tráfego orgânico (Google + IA tipo ChatGPT) pra reduzir dependência de campanha paga — decidida com o Renato depois de mapear que `/demanda` (principal destino de campanha) não tinha nenhum SEO e não existia nenhuma página de conteúdo institucional.
- Template único `views/conteudo-seo.ejs` recebe um objeto de conteúdo (`_CONTEUDO_SEO` em server.js, perto da rota `/`) por página — meta description, OG/Twitter, canonical e 2 JSON-LD (`SoftwareApplication` + `FAQPage`, com a FAQ visível na página em `<details>`, não escondida). Rotas registradas via `Object.keys(_CONTEUDO_SEO).forEach(...)`, então toda página nova nesse objeto já ganha rota e entra automaticamente no `/sitemap.xml` sem precisar mexer em mais nada.
- CTA de todas usa `/?cadastro=1` (landing.ejs) — abre o modal de cadastro direto na aba certa, decoupled do `?ref=` (que continua exclusivo pra atribuição de sub-admin).
- 17 páginas no ar: as 6 "pilar" (`crm-para-corretores`, `ia-para-corretores`, `geracao-de-leads-imobiliarios`, `automacao-para-imobiliarias`, `plataforma-para-corretores`, `divulgacao-de-imoveis-com-ia`) + 11 de apoio — definição (`o-que-e-match-automatico-de-imoveis`, `o-que-e-vitrine-automatica-pelo-whatsapp`, `o-que-e-follow-up-automatico-imobiliario`), persona (`matchimoveis-para-corretor-autonomo`, `matchimoveis-para-imobiliaria`), integração (`integracao-xml-vivareal-zap`, `integracao-olx-imovelweb`), preço (`crm-imobiliario-sem-mensalidade`), FAQ hub (`perguntas-frequentes`) e guia (`como-organizar-leads-de-imobiliaria`, `como-automatizar-postagem-de-imovel-no-instagram`). Todas linkadas entre si (`relacionados`) e as principais também no footer da landing.
- Decisão explícita do Renato: **nunca** criar página comparando com concorrente nomeado nem página por cidade ("corretor em São Paulo") — público errado pro produto (isso atrai quem busca corretor, não quem busca ferramenta pra corretor).
- Pendente (ver Pendências ativas): Google Analytics — falta Measurement ID de uma propriedade GA4 pro domínio principal.

## Integração com app do ChatGPT / MCP (ago/2026, em andamento)
Ideia do Renato: corretor poder "impulsionar" um imóvel pra aparecer com prioridade quando alguém pergunta sobre imóvel dentro do ChatGPT — pagando em coins, mesmo esquema já usado pra Instagram/Meta Ads. Pesquisado antes de codificar: **não existe** "chave por corretor" pra postar individualmente no ChatGPT (diferente de Instagram) — o modelo real da OpenAI é um **app único da MatchImóveis inteira** (Apps SDK / App Directory, renomeado pra "Plugin directory" em jul/2026), que expõe uma ferramenta de busca que o ChatGPT aciona quando relevante. Não é "publicar por imóvel" — é o imóvel entrar no ranking de prioridade de UM feed só, compartilhado. Confirmado também: **sem custo repassado pela OpenAI** (sem taxa de submissão, sem cobrança por chamada) — o preço cobrado do corretor seria 100% decisão interna da MatchImóveis, não um repasse. E diferente de Meta Ads: não tem garantia de impressão, o ChatGPT decide quando chamar o app.
- **Construído e no ar**: `POST /mcp` em server.js (commit `99fcb091`) — servidor MCP (Model Context Protocol) genérico, testado localmente (`initialize`, `tools/list`, `tools/call`, `notifications/initialized`, `GET` retorna 405 de propósito). 2 ferramentas: `buscar_imoveis` (cidade/estado/bairro/transação/tipo/valor máx/quartos mín) e `detalhes_imovel` (por id) — reaproveita a MESMA lógica de visibilidade/filtro do `/portal` (`imovelVisivelPublico`, `_dedupRodizioImoveis`, `_filtrarEPaginarImoveis`), sem duplicar regra.
- **Ainda não implementado**: as extensões específicas do Apps SDK da OpenAI (widget de UI rica dentro da conversa, campos extras do manifesto) — acesso à documentação oficial (`developers.openai.com`, `help.openai.com`) fica bloqueado pelo proxy de saída do sandbox onde isso foi escrito, só deu pra pesquisar via busca. Ajustar isso quando a tela de submissão real pedir algo específico.
- **O recurso de "impulsionar" pago (cobrar coins do corretor) ainda não foi construído** — só a busca básica. Próximo passo depois do app aprovado.
- **Status do processo com a OpenAI** (feito pelo próprio Renato, fora do código): conta criada em platform.openai.com → menu → **Plugins** (não "Apps", renomeado) → Create plugin → escolheu **"With MCP"** → caiu em "Organization settings" (a OpenAI exige verificar a organização antes de submeter um plugin) → duas opções, **Individual** (solo dev, rápido) ou **Business** (empresa, pede documento) → escolhido **Individual** pra testar rápido primeiro (pode verificar como Business depois se lançar oficial) → está completando a verificação de identidade via Persona (parceiro da OpenAI, `withpersona.com` — foto de documento + selfie, é entre o Renato e a Persona, não passa por aqui).
- **Próximo passo assim que a verificação terminar**: voltar pra tela de Plugins da OpenAI, criar o plugin de fato (nome, logo, descrição, URL do MCP = `https://www.matchimoveis.ia.br/mcp`, política de privacidade = `matchimoveis.ia.br/politica-privacidade`), depois submeter pra revisão.

## Pendências ativas (jul/2026)
- [ ] sync_xml_24h: não implementado
- [ ] **Campanha de email corretor — item 1 do plano de 4 pontos (ago/2026) segue adiado**: o Renato pediu explicitamente "3 e 4 apenas ajustamos agora" (intervalo de envio + revisão de copy), deixando de fora (1) retirar o template `demanda` da rotação em `services/campanha.js` (hoje ainda roda junto com `pagina`, com fricção maior por pedir busca antes do cadastro) e (2) já resolvido de outro jeito — ver item abaixo.
- [ ] **Novo param `?cadastro=1` (landing.ejs, ago/2026) existe mas a campanha geral ainda não usa** — abre o modal de cadastro direto na aba certa, sem misturar com a atribuição de sub-admin do `?ref=` (que hoje é o único jeito do template `pagina` da campanha abrir o cadastro automaticamente, por efeito colateral do fluxo de atendimento por sub-admin). Dá pra trocar os links do email pra usar `?cadastro=1` deliberadamente em vez de depender desse efeito colateral, mas ainda não foi feito.
- [ ] **SEO/AEO (ago/2026): páginas de conteúdo e metadados no ar, falta Google Analytics** — 6 páginas novas (`/crm-para-corretores`, `/ia-para-corretores`, `/geracao-de-leads-imobiliarios`, `/automacao-para-imobiliarias`, `/plataforma-para-corretores`, `/divulgacao-de-imoveis-com-ia`), `/demanda` com SEO completo, sitemap atualizado — tudo commitado e no ar. Falta só GA4: não existe Measurement ID configurado pro domínio principal (só existe GA por corretor em "Meu Site", `site_config.googleAnalyticsId`) — sem isso não dá pra medir se o tráfego orgânico está convertendo. Precisa o Renato criar a propriedade no GA4 e passar o ID.
- [ ] **Google Search Console não configurado pro domínio principal (ago/2026)** — piloto de páginas de SEO por localização (`/portal/:uf/:cidade[/:bairro]`, ver seção de SEO/AEO) já está no ar e testado, mas o Renato ainda não tem o Search Console configurado pra `matchimoveis.ia.br` — falta registrar o `/sitemap.xml` lá antes de conseguir medir impressão/clique por página do piloto.
- [ ] **Campanha Meta Ads com questões em aberto, ainda não detalhadas (ago/2026)** — o Renato sinalizou que precisa resolver pendências na campanha do Meta e também posts (Instagram) que ficaram em aberto, mas ainda não descreveu o problema específico. Retomar com ele pra levantar o que exatamente está pendente antes de agir.

## Bugs encontrados (auditoria jul/2026) — confirmados, aguardando correção
- **Confirmado, sem ação necessária**: `services/matcher.js` tem bug de sintaxe (chave sobrando) mas não é importado em lugar nenhum — código morto de fato.

## Bugs recentes corrigidos (referência — não repetir a causa)
- **Assinatura SNS do webhook de bounce/reclamação presa em "Confirmação pendente" (ago/2026)** — código do webhook (`/webhook/ses-notificacoes`, `services/sesWebhook.js`) já confirmava a assinatura sozinho ao receber a mensagem `SubscriptionConfirmation` (faz `GET` na `SubscribeURL`), não tinha bug — a causa era cold start do plano free do Render: a AWS manda essa confirmação uma única vez, e se o serviço tava hibernado nesse instante a requisição dava timeout antes do servidor acordar, deixando a assinatura pendente pra sempre (sem retry automático). Fix operacional (sem código): Renato excluiu a assinatura antiga no console SNS e criou uma nova apontando pro mesmo endpoint com o serviço já Live — confirmou em ~30s. Do lado do SES (identidade `matchimoveis.online`, aba Notifications), Bounce e Complaint já estavam configurados apontando pro tópico `ses-bounces-complaints` desde antes — só faltava mesmo a assinatura SNS. Cadeia end-to-end validada: SES → SNS → webhook.
- **Toggle `vitrineApenasPropriosImoveis` (ago/2026)** — item ficou listado como pendente ("já tentado 2x, quebrou envio de vitrine WA, revertido") mas checagem no código confirmou que está implementado e funcionando: `cerebro/match-core.js` filtra o pool de imóveis pra só os do próprio corretor ANTES de rodar `matchPorMapa`, tanto no Caso 1 (linha ~543) quanto no Caso 2 (linha ~695), gated por `=== true` (git blame aponta commit `feat: toggle vitrine apenas proprios imoveis` + um fix logo em seguida, jun/2026 — parece ter sido a 3ª tentativa que colou). A rota de envio manual de vitrine (`POST /app/lead/:id/whatsapp/enviar`) só envia o `texto` que já vem pronto no request — não recalcula match nem lê esse toggle, então não tem como esse filtro quebrar o envio. Doc estava desatualizada, corrigido só o registro.
- **Captação — badge/botão do topo da lead usava campo morto `imovelCaptadoId` (ago/2026)** — `dados.imovelCaptadoId` (gravado em server.js na finalização da captação) virou uma string fixa `'captado'` (não um ID real) desde que o mecanismo de vínculo passou a ser `l.imoveisRelacionados` — mas `views/app-captacao.ejs` ainda usava `dados.imovelCaptadoId || primeiroVinculado.id` (nessa ordem) pra montar os links de "Editar para completar"/"Link público" no topo do card, gerando URL quebrada tipo `/app/imovel/captado/editar` sempre que o vínculo real ainda não existia. Fix: os links de topo agora usam só `l.imoveisRelacionados[0]` como fonte de ID; sem imóvel vinculado, mostra "+ Cadastrar imóvel" (a seção "Imóveis vinculados" logo abaixo já cobria o caso com vínculo real, sem esse bug). O badge "✅ Captado"/"⏳ Pendente" não tinha esse bug (só checagem de truthy) e não mudou.
- **`match_coins_total` nunca atualizava depois do cadastro do usuário** — item ficou listado como pendente mas checagem no código (ago/2026) confirmou que já está implementado: `adicionarCreditos()` em `services/creditos.js` já faz `UPDATE usuarios SET match_coins = $1, match_coins_total = $2, ...` (as duas colunas juntas, com comentário explícito no código sobre o motivo), não achado nenhum outro caminho que credite `match_coins` sem atualizar `match_coins_total` junto. Doc estava desatualizada, corrigido só o registro.
- **Segundo sistema de notificação gravando em colunas que não existem (ago/2026)** — confirmado contra o banco real via `check-colunas-notificacoes.js`: `services/notificacoes/criarNotificacao.js` (único chamador: `services/workflow/atualizarWorkflowVisita.js`) tentava gravar em `user_id`, `status`, `acao`, `link`, `created_at` — nenhuma dessas colunas existe (a tabela real tem `usuario_id`, `criada_em`, `dados` JSONB, além de `canal`/`icone`/`lida_em`/`expira_em`/`acao_url` que nem `setupDB.js` nem esse arquivo conheciam). Toda notificação de transição de workflow de visita falhava silenciosa (catch engolindo o erro). Havia uma SEGUNDA função `criarNotificacao` com o mesmo nome em `services/salvarNotificacao.js` — essa sim usada por todo o resto do sistema, gravando certo nas colunas reais e já jogando qualquer campo extra em `dados` JSONB automaticamente. Fix: a versão órfã agora delega pra essa (`_criarNotificacaoBase`), em vez de duplicar lógica de INSERT — `loadNotificacoes()` também passou a delegar pra `lerNotificacoes()`.
- **Webhook Mercado Pago sem proteção contra replay** — item ficou listado como "aguardando correção" mas checagem no código (ago/2026) confirmou que já está implementado: `tentarMarcarProcessado()` (`services/salvarPagamentoMP.js`, `INSERT ... ON CONFLICT DO NOTHING`) já é chamado em `/webhook/mercadopago` e em `/pagamento/processar` antes de creditar — reenvio/duplicata da MP não credita 2x. Doc estava desatualizada, corrigido só o registro.
- **Feed não embaralhava ao atualizar (`since=0`)** — item ficou listado como pendente mas checagem no código (ago/2026) confirmou que já está implementado: tanto `GET /app/feed` (embaralha a ordem dos grupos por usuário + os imóveis sem vídeo dentro de cada grupo, toda carga) quanto `GET /api/feed/novos` (embaralha o pool inteiro antes de agrupar e de novo dentro de cada grupo, sempre — só quando `since>0` prioriza os itens novos na frente, sem desligar o embaralhamento) já rodam o shuffle de forma incondicional. Doc estava desatualizada, corrigido só o registro.
- **Visitas V2 (`routes/visitas-v2.js`) — WhatsApp do fluxo nunca saía de verdade (ago/2026)**: `getInstancia(userId)` é `async` mas era chamado sem `await` nos ~10 lugares que mandam mensagem (`dispararProprietario`, `dispararParceiro`, `dispararCliente`, `dispararLembrete`, `notificarCorretorManual` e os disparos direto nas rotas de confirmar/recusar/remarcar) — `enviarWA` recebia uma Promise em vez do nome da instância, virava `[object Promise]` na URL do Evolution, e a chamada falhava silenciosa (erro engolido pelo catch). Efeito prático: proprietário/parceiro/cliente nunca recebiam o link de confirmação por WhatsApp, então o fluxo "travava" (não era o UPDATE de status que falhava — esse sempre funcionou). Fix: `enviarWA` agora dá `await` no parâmetro `instancia` internamente (funciona igual com Promise ou valor já resolvido), resolve todos os call sites de uma vez sem precisar editar cada um. De quebra, "Caso 1 e 3 não implementados" também estava desatualizado — as rotas `/proprietario/visita/:id` (Caso 1) e `/parceiro/visita/:id` (Caso 3), com GET + POST /responder completos, já existem e funcionam.
- Email de nova lead/captação não disparava: checagem de "lead já existia" rodava depois do INSERT, sempre achava a própria lead — movida pra antes do INSERT
- Índice único `idx_imoveis_externo_user (id_externo, user_id)` bloqueava 2º imóvel manual (id_externo vazio tratado como duplicata) — recriado como índice parcial `WHERE id_externo IS NOT NULL AND id_externo != ''`
- Busca por ID em /app/imoveis era só client-side (não achava fora da página atual) — Enter agora navega usando busca server-side
- Filtros de /app/imoveis (tipo, valor, quartos etc.) eram só client-side — estendidos pro servidor via query string
- Auditoria de filtros (jul/2026, varredura em toda a plataforma): botão "Limpar" de `/app/imoveis` só limpava os campos visualmente e filtrava client-side os cards já carregados — se a página já tinha vindo filtrada do servidor (ex: só imóveis de um estado), "Limpar" continuava mostrando só esse subconjunto como se fosse a lista completa; agora recarrega `/app/imoveis` sem filtros (preserva só `rede`/`corretor`/`embed`). Filtro de período (Hoje/Amanhã/Atrasada/Semana) em `/app/visitas` tinha bug clássico de timezone: `new Date('YYYY-MM-DD')` é interpretado como meia-noite UTC — pra um usuário no fuso do Brasil (UTC-3), isso vira "dia anterior às 21h", e o `setHours(0,0,0,0)` local subsequente confirmava esse dia errado; visita de HOJE aparecia como "Atrasada" e nunca batia o filtro "Hoje". Corrigido com parse manual (`split('-')` + `new Date(ano,mes-1,dia)`) tanto no filtro client-side quanto no KPI "Hoje" da mesma tela (que já tinha o mesmo bug) — o resto do arquivo (badge por card) já usava esse parse seguro. `mapa.ejs` (rota legada `/mapa`, não usada pela navegação principal que é `/app/mapa`): filtro Aluguel/Venda comparava contra `im.tipo` (tipo do imóvel, ex. Apartamento) em vez de `im.transacao` — nunca batia nada, os dois chips sempre voltavam vazio; e a função `loadImoveis()` dessa rota tinha um `console.log(req.body)` órfão (variável `req` não existe nesse escopo) que derrubava a função sempre, retornando lista vazia sempre — ambos corrigidos.
- ILIKE com placeholder posicional sem `$` (`ILIKE 2` em vez de `ILIKE $2`) no matching de captação por telefone/email
- `jobCreditos.js`: custo hardcoded em 10/dia (divergente do `lead_ativo_dia=0.2`) — agora importa `CUSTO.lead_ativo_dia` de `creditos.js`; e o débito nunca persistia no PG (upsert de `salvarUsuario()` exclui `match_coins` do SET) — adicionado `UPDATE` direto
- Sistema de notificações (jul/2026): `lerNotificacoes()` lia `criado_em` mas a coluna real é `criada_em` — toda leitura falhava e caía num fallback de JSON local desatualizado/vazio; corrigido. `jobCreditos.verificarAlertas()` chamava `criarNotificacao(uid, tipo, msg, {pct})` com argumentos posicionais, mas a função espera um objeto único — alertas de saldo baixo/crítico/zerado do job diário nunca funcionaram; corrigido pra passar objeto. `creditos.js` → `adicionarCreditos()` tinha um bloco de aviso de saldo baixo copiado de `consumir()` que referenciava `saldoAtual` (variável que não existe nessa função) — dava erro silencioso sempre; removido (não fazia sentido mesmo: aviso de saldo baixo numa função que só aumenta saldo). Notificação "novo lead" de WhatsApp disparava na hora que a lead chegava, mesmo com `leadOculta:true` (antes de gerar match) — movida pro momento em que a lead é revelada (`cerebro/match-core.js`, junto do e-mail que já existia ali)
- Importar um 2º XML desativava imóveis manuais/de outro feed (jul/2026): `importXMLCompleto.js` marca como `inativo` todo imóvel do usuário que não veio no XML importado — a proteção "veio de outra fonte" só considerava protegido quem já tinha um `xml_url` preenchido e DIFERENTE do atual; imóveis manuais (`xml_url` vazio) ou de qualquer origem sem esse campo caíam na regra geral e eram desativados à toa em qualquer importação de XML, não só na 2ª. A tabela `xml_feeds` já suporta múltiplos feeds por conta (unique em `user_id+url`, `/app/cadastro` já lista todos) — o mecanismo de multi-XML já existia, só esse bug de desativação indevida que atrapalhava. Fix: só marca inativo quem tem `xml_url` **igual** ao XML sendo importado agora (não "diferente e preenchido") — protege manuais e outros feeds corretamente.
- `/app/cadastro` (tela "Importar via XML") tinha um `<form>` aninhado dentro de outro `<form>` (o card "XML Cadastrado" com os botões Atualizar/Excluir ficava dentro do form principal de `action="/app/importar"`) — HTML inválido, o navegador descarta a tag `<form>` interna, misturando os hidden inputs dela (duplicados de `xmlUrl`) no form externo. Efeito: clicar "Importar agora" pra importar um 2º XML não funcionava (o valor de `xmlUrl` submetido ficava contaminado pelos hidden inputs do feed já cadastrado). Os botões Atualizar/Excluir já funcionavam 100% via fetch() direto (JS lê a URL do próprio `onclick`, não lê os hidden inputs) — o `<form>` interno era morto, removido. Também corrigido: o total salvo em `xml_feeds.total` sempre gravava 0 (bug: `typeof _totalIm !== 'undefined'` — variável `_totalIm` nunca existiu, então a checagem sempre dava falso) — trocado por `COUNT(*)` real na tabela `imoveis` filtrado por `user_id` + `xml_url`.
- Assistente IA (jul/2026): `GET /app/assistente` (as 2 cópias), `GET /api/assistente/dados`, `POST /app/assistente/chat` e `GET /app/assistente/historico` filtravam imóveis/leads/visitas comparando com `req.session.user.userId` — campo que não existe na sessão (o campo real é `.id`/`.codigoUsuario`, setado por `rowToUser()`). Resultado: o contexto passado pro Groq no chat sempre via 0 imóveis/0 leads/0 visitas do corretor, então a IA respondia sem saber nada da carteira real. Corrigido trocando pra `filtrarPorUsuario()` (mesmo helper usado em `/app-home`, `/app/leads` etc — múltiplos campos de dono + fallback de telefone). `/api/assistente/dados` e `/app/assistente/historico` tinham o mesmo bug mas não são chamados por nenhuma view hoje (endpoints órfãos) — corrigidos por consistência, sem impacto visível imediato.
- Auditoria de responsividade mobile (jul/2026): menu mobile (bottom-nav + "Mais" em `app-shell.ejs`) não tinha Captação, Parceria QuintoAndar nem Fale Conosco — só existiam no menu desktop, adicionados. `/app/mapa` (era a pendência "Mapa OpenStreetMap não aparece no mobile"): o wrapper do mapa usava `margin:-20px` fixo pra sangrar até a borda, mas o `.content` no mobile usa `padding:16px 12px 80px` (não 20px) — a margem não batia, causando ~8px de overflow horizontal (confirmado com Playwright em viewport 390×844: `body.scrollWidth` 398 vs `clientWidth` 390) e o rodapé do mapa ficava ~43px escondido atrás da bottom-nav fixa (que o CSS antigo não descontava da altura). Corrigido com override por media query casando a margem com o padding mobile real e subtraindo a altura da bottom-nav (64px); desktop confirmado sem regressão. `feed-reels.ejs` tinha o mesmo tipo de bug (`left:240px`/`left:250px` fixos assumindo a sidebar desktop) mas não é renderizado por nenhuma rota (órfão, a página real de `/app/feed` é `app-feed.ejs` e já está correta) — não mexido.
- **Vazamento de dado entre contas por telefone vazio (ago/2026, CRÍTICO)** — `filtrarPorUsuario()` (helper mais usado do sistema — leads, imóveis etc, usado em `/app-home`, `/app/leads`, `/api/assistente/dados` etc.) e mais 5 rotas com o mesmo padrão inline (`/api/menu/badges`, `/app-home`, `/app/visitas`, `/api/assistente/dados`, `/app/assistente/chat`) comparavam telefone da conta logada com telefone do registro (`item.corretorCelular === tel`) sem checar se os dois lados eram não-vazios — conta nova sem celular cadastrado (`tel=''`) batia `'' === ''` contra QUALQUER lead/imóvel/visita de QUALQUER outra conta que também estivesse com telefone vazio naquele campo, vazando dado real de terceiros. Reportado pelo Renato na conta `EDS-8B58` (nova, sem celular, via 66 visitas que não eram dela). Fix: nova função `_telsBatemNaoVazio(tel1, tel2)` (`!!a && !!b && a===b`) substituindo a comparação direta nos 7 pontos (2 cópias de `filtrarPorUsuario`, mais 5 rotas) — mesmo padrão de guard que `cod`/`codigoUsuario` já usava no `filtrarPorUsuario` (`cod && ...`), só faltava aplicar no telefone. Testado: conta sem celular não vê mais lead de outra conta com telefone vazio; match por telefone real (dois preenchidos) continua funcionando; match por ID e por `codigoUsuario` não foram afetados.

## Padrão de comunicação do usuário (Renato)
- Português, direto, abreviado, às vezes com typos
- Quer um comando por vez, sem explicação a menos que peça
- Não modificar arquivos além do pedido
- Sempre referenciar como coisas parecidas já foram feitas antes de propor algo novo
- **Commit/push (ago/2026): não pedir confirmação — sempre commitar e dar push pra main direto depois de validar (node --check / EJS compile).** Regra antiga era só commitar quando ele mandasse explicitamente; substituída por pedido direto do usuário ("nao precis ame perguntar mais, sempre fac o commit e peush para man").

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
