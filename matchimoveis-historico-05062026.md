# MatchImóveis — Histórico de Desenvolvimento
*Gerado em 05/06/2026*

---

## Sessão 05/06/2026 — Webhooks Portais, XML VRSync, Fixes

### XML VRSync
- Corrigido gerarXMLPortal para padrão oficial Grupo OLX (VRSync)
- Tag raiz com xmlns e xsi:schemaLocation corretos
- Campos dentro de <Details>, ListPrice currency="BRL", Iptu currency="BRL" period="Yearly"
- Media com <Item primary="true/false" type="IMAGE">
- QuintoAndar NÃO foi alterado — formato próprio preservado
- gerarXMLPortais() agora chama gerarXMLPortal() em vez de gerar inline
- Redirect 301 onrender.com → matchimoveis.ia.br nos feeds XML

### Webhooks de Portais
- Payload ImovelWeb mapeado: name→nome, phone→telefone, reference→idAnuncio
- phone separado por "/" — pega último número (cliente)
- mensagem limpa URLs e ¡...! antes de processar
- _cruzarImovelWebhook(): busca imóvel por id_externo OR id_interno OR id
- perfilIA completo: tipo, quartos, suites, vagas, banheiros, area, bairro, cidade, estado, valorMax, valorMin
- snap inclui perfilIA e origemEntrada
- portal-processor busca imóvel por id_externo OR id_interno OR id
- match-core não sobrescreve perfilIA quando origemEntrada contém 'webhook_'
- perfilIA merge: dados do imóvel prevalecem sobre IA
- WhatsApp não cria lead com mensagem de portal
- Todos os portais receberam os mesmos fixes: ImovelWeb, grupoolx (ZAP/VivaReal/OLX), 123i, Chaves

### processLeads.js (Importação de Planilha)
- Criado do zero — não existia
- Normalização do 55 no telefone
- Detecção automática comercial/residencial pelo tipo
- Campos: nome, telefone, email, origem, tipo, transacao, bairro, cidade, estado, quartos, suites, vagas, banheiros, area_min, area_max, valor_min, valor_max, observacoes

### Admin
- Coluna Coins adicionada ao painel (saldo atual de cada usuário)

### Modal Importar Leads
- Informativo rosa com dados mínimos por segmento (residencial e comercial)

### Fixes
- Fuzzy match: palavras ≤4 letras só aceitam exato (fix "casa"→"casca")
- match-core: _estadoMapC1 undefined corrigido
- Tela cadastro: bloco XML só mostra XMLs importados externos
- ListingID no XML usa id_interno quando não tem id_externo

### BUG PENDENTE
- Vitrine disparada para leads no kanban novo com 0 imóveis
- Precisa verificar condição que agenda enviar_vitrine no server.js
- Grep: grep -n "enviar_vitrine\|followUps.*push" ./server.js

### Commit atual
- Último commit estável: verificar git log --oneline -1
