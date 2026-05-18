# MatchImóveis — Roadmap Completo (18/05/2026)

## ✅ Feito hoje (18/05)

- Fix delete lead por userId — qualquer corretor pode ocultar lead para si sem afetar outras contas
- Fix lerLeads — objeto vs string (lerLeads(req.session.user.id))
- Classificar lead — botão 🚩 animado no card, tipos: cliente/vendedor/corretor
- Fluxo lead vendedor — modal cadastro imóvel iframe + rota POST imovel-vendedor
- Tela parceiros /app/parceiros — kanban separado, comissão, menu sidebar
- Timeline lead sem msgs WhatsApp — só eventos e ações relevantes
- Extrator bairro vs rua — logradouros vão para perfil.rua, não bairro
- 9.250 bairros do Brasil (IBGE) — todos os estados via API IBGE distritos
- Match base interna usa perfilIA — bairro/tipo/quartos corretos
- Webhook lead por telefone+userId — lead não vaza entre contas
- Lead some do kanban quando visita avança
- Modal agendar visita no detalhe da lead
- Vitrine/imóvel público preenchido — nome e telefone já preenchidos se leadId na URL
- Novo ciclo de busca — nova lead quando cliente volta com perfil diferente após visita
- Instância no match-core — webhook passa instância correta para envio de vitrine
- Diagnóstico completo /admin/diagnostico-completo

---

## 🔴 Crítico — antes do lançamento (hoje/amanhã)

- [ ] **PostgreSQL** — migrar todos JSONs para banco real (sem isso com 50+ usuários os dados corrompem)
- [ ] **Evolution API na Hetzner VPS** — mover de Render para VPS dedicada, aguenta 50+ instâncias WhatsApp
- [ ] **Onboarding automático** — ao cadastrar: créditos iniciais + tutorial + guia conectar WhatsApp (100% autoexplicativo)

---

## 🟡 Importante — quarta e quinta

- [ ] Tela planos/créditos — saldo visível, como funciona, como recarregar via PIX
- [ ] Notificações sino — sino no menu atualiza quando IA age (match, visita, lead nova)
- [ ] Testes beta com 3-5 corretores — cadastro → WhatsApp → lead → match → vitrine → visita
- [ ] Relatório do corretor — resumo de leads, visitas, matches, conversão

---

## 🚀 Lançamento — sexta-feira

- [ ] Go live — abrir cadastros, monitorar logs, suporte via WhatsApp

---

## ⚪ Pós-lançamento

- [ ] App iOS/Android — React Native + Expo
- [ ] processLeads CSV no Render — fix DATA_FILE duplicate bug
- [ ] Pipeline comercial — reconectar à tela de visitas

---

## 💰 Infraestrutura para escala

| Usuários | Evolution API | Custo/mês |
|----------|--------------|-----------|
| Até 10 | Render atual | ~$25 |
| 10–50 | Hetzner VPS 4GB | ~$45 |
| 50–200 | Hetzner VPS 8GB | ~$65 |
| 200–1000 | 3x Hetzner 32GB | ~$185 |

**Stack atual:** Node.js + Express + EJS + JSONs → migrando para PostgreSQL
**Deploy:** matchimoveis.onrender.com | Evolution API: match-evolution-api.onrender.com
