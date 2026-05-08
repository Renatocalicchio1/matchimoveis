# MatchImóveis · Patch do Design System

Atualiza 3 arquivos pra alinhar o app real ao design system limpo (cores Airbnb pontuais, KPIs em Source Serif preto, ícones com fundo cinza claro `#F2F2F2`).

## Como aplicar

1. Descompacte `matchimoveis-ds-patch.zip` na **raiz** da pasta `matchimoveis/` (ao lado de `server.js`).
2. No terminal, dentro de `matchimoveis/`:
   ```bash
   bash apply-ds.sh
   node server.js
   ```
3. Abre `http://localhost:3000/app-home` (precisa estar logado) e a `http://localhost:3000/` pra ver.

## Como reverter

```bash
bash rollback-ds.sh
```

Restaura do último backup gerado pelo `apply-ds.sh` (pasta `backups-ds-<timestamp>/`).

## O que muda

- **`views/partials/app-shell.ejs`** — sidebar, brand, user pill, menu icons em tile cinza, sino sem fundo colorido
- **`views/app-home.ejs`** — KPIs em preto + Source Serif (sem cor), feed dots cinza, badges cinza, charts em escala de cinza com toques de vermelho
- **`public/app.css`** — limpa a base global; remove os blocos `!important` que pintavam tudo de roxo/lilás; passa a usar tokens limpos

## O que **não** mexe

- Nenhuma rota / lógica de servidor
- Nenhum dado (`*.json`, `public/uploads/`)
- Outras views (`app-leads.ejs`, `app-imoveis.ejs`, `login.ejs`, `index.ejs` etc.) — me avisa quando quiser que eu inclua na próxima leva
