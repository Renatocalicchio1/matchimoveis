# Registros DNS — infraestrutura de e-mail marketing

Publicar no provedor de DNS de **matchimoveis.online** (o domínio usado
pra e-mail, separado do domínio principal `matchimoveis.ia.br` de
propósito — mantém a reputação de envio em massa isolada da reputação do
domínio principal/app, prática comum em empresas grandes).

Troca `SEU_IP_AQUI` pelo IP público real da VPS antes de publicar.

## 1. Registro A — aponta o subdomínio de e-mail pro IP da VPS

| Tipo | Nome | Valor | TTL |
|---|---|---|---|
| A | `mail.matchimoveis.online` | `SEU_IP_AQUI` | 3600 |

## 2. MX — obrigatório mesmo esse domínio não recebendo e-mail de verdade

| Tipo | Nome | Valor | Prioridade | TTL |
|---|---|---|---|---|
| MX | `matchimoveis.online` | `mail.matchimoveis.online` | 10 | 3600 |

Sem isso, ferramentas de teste (mail-tester.com etc.) e alguns filtros
antispam penalizam a entrega por não acharem servidor de e-mail nenhum
por trás do domínio remetente — mesmo o Postfix só enviando, precisa
existir um MX apontando pra algum lugar.

## 3. PTR (reverse DNS) — configurado no PAINEL DO PROVEDOR DA VPS, não no
   DNS do domínio

Não é um registro que se publica no DNS do domínio — é configurado do lado
do provedor da VPS (Hetzner, DigitalOcean, etc. têm essa opção no painel,
geralmente em "Rede" ou "Reverse DNS"). Aponta o IP da VPS de volta pro
hostname:

```
SEU_IP_AQUI  →  mail.matchimoveis.online
```

**Isso é obrigatório.** A maioria dos provedores grandes de e-mail rejeita
ou joga direto pra spam qualquer servidor sem PTR batendo com o hostname
do HELO/EHLO.

## 4. SPF — autoriza o IP da VPS a mandar e-mail em nome do domínio

| Tipo | Nome | Valor | TTL |
|---|---|---|---|
| TXT | `matchimoveis.online` | `v=spf1 ip4:SEU_IP_AQUI -all` | 3600 |

`-all` no final = rejeita rigorosamente qualquer servidor que não esteja
na lista (mais rigoroso que `~all`, que só "sugere" rejeitar). Só usa
`-all` depois de ter certeza que o SEU_IP_AQUI é o único que manda e-mail
desse domínio — se também usar SES ou outro serviço no mesmo domínio,
inclui os dois: `v=spf1 ip4:SEU_IP_AQUI include:amazonses.com -all`.

## 5. DKIM — chave pública gerada pelo `setup_email_infra.sh`

| Tipo | Nome | Valor | TTL |
|---|---|---|---|
| TXT | `match2026._domainkey.matchimoveis.online` | *(conteúdo de `/etc/opendkim/keys/matchimoveis.online/match2026.txt`, gerado pelo script)* | 3600 |

O arquivo `.txt` gerado já vem no formato certo pra colar — algo como:

```
match2026._domainkey IN TXT ( "v=DKIM1; h=sha256; k=rsa; p=MIIBIjANBgkqhk..." )
```

Alguns provedores de DNS pedem só o valor entre aspas (a parte
`v=DKIM1; ...`), outros aceitam a linha inteira — se o provedor limitar o
tamanho do TXT (255 caracteres por "string"), a maioria já quebra em
múltiplas strings automaticamente entre parênteses, como no exemplo acima.

## 6. DMARC — política de o que fazer com e-mail que falha SPF/DKIM

| Tipo | Nome | Valor | TTL |
|---|---|---|---|
| TXT | `_dmarc.matchimoveis.online` | `v=DMARC1; p=none; rua=mailto:dmarc-reports@matchimoveis.online; pct=100` | 3600 |

**Começa com `p=none`** (só monitora, não rejeita nada) — deixa rodando
assim por 2-4 semanas conferindo os relatórios (`rua=`) antes de
apertar. Depois de confirmar que SPF/DKIM estão passando consistentemente,
evolui gradualmente:

```
p=quarantine  (manda pra spam o que falhar)   →  depois de confiante
p=reject      (rejeita de vez o que falhar)   →  só depois de MESES estável
```

Subir a régua cedo demais (`p=reject` num domínio recém-configurado) é uma
das causas mais comuns de e-mail legítimo desaparecer sem aviso.

## 7. Checklist antes de mandar pra base real

- [ ] Registro A publicado e propagado (`dig mail.matchimoveis.online`)
- [ ] MX publicado (`dig +short MX matchimoveis.online`)
- [ ] PTR configurado no provedor da VPS e batendo (`dig -x SEU_IP_AQUI`)
- [ ] SPF publicado (`dig txt matchimoveis.online`)
- [ ] DKIM publicado (`dig txt match2026._domainkey.matchimoveis.online`)
- [ ] DMARC publicado em modo `p=none`
- [ ] Teste em [mail-tester.com](https://www.mail-tester.com) com nota 9+/10
- [ ] Teste em [dkimvalidator.com](https://dkimvalidator.com) sem erro de SPF/DKIM/DMARC
- [ ] E-mail de teste chegou na caixa principal do Gmail/Outlook (não em spam)
