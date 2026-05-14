# MATCH_ENGINEERING_RULES.md
# REGRAS DE ENGENHARIA DA MATCH
## OBJETIVO
Toda arquitetura deve ser:
- escalável
- modular
- multi tenant
- SaaS ready
- preparada para IA
- preparada para crescimento rápido
---
# STACK OBRIGATÓRIA
## Frontend
- Next.js
- TypeScript
- TailwindCSS
---
## Backend
- Node.js
- NestJS
- TypeScript
---
## Banco
- PostgreSQL
- pgvector
---
## Cache
- Redis
---
## Filas
- BullMQ
---
## WhatsApp
- Evolution API
---
## Infraestrutura
- Docker
- Coolify
- Railway/Hetzner
---
# REGRAS OBRIGATÓRIAS
Toda feature deve:
- ser modular
- possuir tipagem forte
- possuir logs
- possuir tratamento de erro
- possuir retry
- possuir validação
- possuir arquitetura desacoplada
---
# ESTRUTURA OBRIGATÓRIA
Separar:
- controllers
- services
- repositories
- workers
- providers
- DTOs
- validators
---
# PRINCÍPIOS DE ARQUITETURA
## Nunca:
- criar código gigante
- misturar responsabilidades
- acoplar IA em tudo
- criar queries pesadas
- criar contexto gigante para IA
---
## Sempre:
- usar memória resumida
- usar embeddings
- usar cache
- usar filas
- usar workers assíncronos
- pensar em milhares de usuários
---
# PRINCÍPIOS IA
A IA deve:
- consumir poucos tokens
- usar contexto resumido
- usar memória inteligente
- evitar chamadas desnecessárias
---
# PRINCÍPIOS DE PRODUTO
Toda feature deve responder:
"isso aumenta retenção?"
Se NÃO:
não é prioridade.
---
# PRIORIDADES ABSOLUTAS
1. WhatsApp
2. Memória operacional
3. Match inteligente
4. Feed operacional
5. IA copiloto
---
# NÃO CONSTRUIR AGORA
- ERP complexo
- financeiro avançado
- dashboards gigantes
- módulos desnecessários
- overengineering
---
# FOCO PRINCIPAL
Construir:
- velocidade
- retenção
- onboarding rápido
- IA útil
- experiência viciante
- operação inteligente
---
# REGRA MAIS IMPORTANTE
A Match NÃO é um software imobiliário comum.
A Match é:
- infraestrutura operacional
- memória operacional
- inteligência imobiliária
- sistema operacional via IA
