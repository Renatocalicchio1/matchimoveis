# Infraestrutura própria de e-mail marketing (Listmonk + Postfix + OpenDKIM)

Módulo self-hosted pra disparar campanha pra até 118.000 corretores sem
depender de SES/SendGrid. **Leia isto antes de rodar qualquer coisa** — tem
avisos importantes sobre risco de entregabilidade que valem mais que
qualquer script aqui.

## ⚠️ Antes de começar — o que isso realmente exige

Autoenviar email em massa só funciona se a reputação do IP/domínio for
construída do jeito certo. Sem os passos abaixo, a very maioria das
mensagens cai em spam ou é recusada — não é um problema de configuração
que "conserta depois", é assim que todo provedor grande (Gmail, Outlook,
Yahoo) funciona:

1. **Precisa de uma VPS de verdade, com IP dedicado** — não dá pra rodar
   isso no Render (onde a plataforma já roda hoje). Render é PaaS
   compartilhado e normalmente bloqueia a porta 25 de saída — mesmo que não
   bloqueasse, IP compartilhado de PaaS já costuma estar em blacklist de
   spam de fábrica. Precisa de uma VPS (Hetzner, DigitalOcean, Contabo,
   OVH, AWS EC2 "de verdade" com Elastic IP) só pra isso, IP fixo, que
   NUNCA foi usado por outra pessoa pra spam antes.
2. **Precisa poder configurar PTR (reverse DNS)** — o provedor da VPS tem
   que deixar você apontar o IP de volta pro hostname (`mail.matchimoveis.online`
   → IP → IP volta pro mesmo hostname). Sem PTR batendo, a maioria dos
   provedores recusa de cara. Nem toda VPS barata deixa configurar isso —
   confirma ANTES de contratar.
3. **Aquecimento de verdade leva 2-4 semanas**, mandando pouco e devagar,
   só pra endereços que você tem certeza que existem (ex: comece pelos
   corretores que já abriram email seu antes via SES — não pela base toda
   fria de uma vez). O script de aquecimento aqui (`warmup-schedule.js`) só
   ajuda a não estourar o ritmo, não substitui isso.
4. **Ainda assim, é bem provável que a taxa de entrega fique pior que a de
   um SES bem configurado**, pelo menos nos primeiros meses. Provedor
   grande de ESP (SES, SendGrid, etc.) já tem reputação de IP prévia,
   monitora bounce/reclamação automaticamente e tem gente cuidando disso
   em escala — um MTA próprio não tem nada disso de graça.

Se o problema real com o SES for outro (custo, limite de envio, aprovação
de produção) pode valer mais a pena resolver isso direto com a AWS do que
montar essa estrutura inteira do zero — mas os arquivos abaixo estão
prontos pra quem decidir seguir mesmo assim.

## O que tem aqui

```
infra/email-marketing/
├── docker-compose.yml       # listmonk + postgres do listmonk + postfix + opendkim
├── postfix/main.cf          # config do MTA (comentado linha a linha)
├── opendkim/                # config de assinatura DKIM (comentado)
├── setup_email_infra.sh     # provisiona tudo numa VPS Ubuntu/Debian limpa
├── DNS-RECORDS.md           # tabela exata dos registros DNS pra publicar
├── warmup-schedule.js       # cronograma de aquecimento progressivo (14-21 dias)
└── README.md                # este arquivo
```

Fora dessa pasta, também criei (fazem parte do código real da plataforma,
não são infra de VPS):
- `services/listmonkSync.js` — sincroniza os corretores da base MatchImóveis
  pro Listmonk via API REST.
- `server.js` → `POST /webhook/listmonk` — recebe bounce/unsubscribe do
  Listmonk e reaproveita a MESMA lista de supressão que o SES já usa
  (`descadastrarEmail()`, `services/email.js`) — um e-mail suprimido por
  bounce em qualquer um dos dois canais fica suprimido nos dois.

## Passo a passo de implantação

1. **Contrata a VPS** (mínimo 2 vCPU / 4GB RAM pra Listmonk+Postgres+Postfix
   rodando junto). Confirma que dá pra configurar PTR antes de fechar.
2. **Aponta o DNS** — cria o registro A de `mail.matchimoveis.online` pro
   IP da VPS (ver `DNS-RECORDS.md` pra tudo, incluindo SPF/DKIM/DMARC).
3. **Acessa a VPS via SSH** e roda:
   ```bash
   scp -r infra/email-marketing usuario@SEU_IP:~/email-infra
   ssh usuario@SEU_IP
   cd ~/email-infra
   sudo bash setup_email_infra.sh
   ```
   O script instala Postfix + OpenDKIM, gera o par de chaves DKIM (2048
   bits) e imprime a chave pública no final — copia ela pro registro TXT
   do DKIM (`DNS-RECORDS.md` explica onde).
4. **Sobe o Listmonk**:
   ```bash
   docker compose up -d
   ```
   Acessa `http://SEU_IP:9000` na primeira vez pra criar o admin.
5. **Configura o SMTP de saída do Listmonk** (dentro do painel, Settings →
   SMTP) apontando pro Postfix local (`postfix:25` dentro da rede Docker,
   sem autenticação — o Postfix só aceita relay da própria rede interna,
   ver `main.cf`).
6. **Testa a entregabilidade ANTES de mandar pra base real**:
   - Manda um teste pra [mail-tester.com](https://www.mail-tester.com) e
     confere a nota (mira em 9+/10 antes de considerar pronto).
   - Confere autenticação em [dkimvalidator.com](https://dkimvalidator.com).
   - Manda pra uma conta Gmail/Outlook de teste sua e confere se caiu na
     caixa principal ou em spam.
7. **Só depois disso**, roda a sincronização da base:
   ```bash
   node services/listmonkSync.js
   ```
8. **Segue o cronograma de aquecimento** (`warmup-schedule.js`) — NÃO
   dispara pra base toda de uma vez, nem no primeiro dia nem no décimo.

## O que eu não consigo fazer daqui

Não tenho acesso a nenhuma VPS nem terminal fora deste repositório — todo
o código/config abaixo foi escrito e validado como texto (sintaxe do
Postfix/Docker Compose conferida manualmente), mas **nada disso foi
testado rodando de verdade**. A implantação real, os testes de
entregabilidade e o aquecimento são passos que só você consegue rodar,
acompanhando os números (Mail-Tester, taxa de bounce, taxa de spam) a
cada etapa.
