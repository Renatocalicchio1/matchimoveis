# MatchImoveis

MVP local para testar o fluxo do app de matching imobiliário.

## O que esta versão faz
- Upload de Excel/CSV
- Considera apenas os campos:
  - nome do cliente
  - telefone / contato
  - email
  - ID do anúncio
  - URL do anúncio
- Ignora qualquer outro campo da planilha
- Remove duplicados antes de processar
- Quando houver URL, usa a URL como origem
- Quando houver só ID, marca que precisa da URL base do portal
- Filtra apenas imóveis em São Paulo/SP
- Aplica a regra de matching:
  - tipo, bairro, cidade, estado e quartos obrigatoriamente iguais
  - valor e área útil em ±10%
  - suítes, banheiros e vagas em ±1
- Retorna top 5 matches por imóvel
- Traz filtros de resultados por cidade, bairro, status e busca textual
- Permite zerar a base local da sessão

## Limitação desta versão
A extração do imóvel de origem e a busca no QuintoAndar ainda estão em modo MVP com base local.
A arquitetura já está separada para trocar por scraper real depois.

## Como rodar
```bash
npm install
npm start
```

Depois abra:
```bash
http://localhost:3000
```

## Reiniciar depois de atualizar
```bash
CTRL + C
npm start
```
