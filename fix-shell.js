const fs = require('fs');
let shell = fs.readFileSync('views/partials/app-shell.ejs', 'utf8');

// 1. Remover animação do sino
shell = shell.replace(`<style>
    @keyframes sinoPulse {
      0% { transform: scale(1); }
      50% { transform: scale(1.15); }
      100% { transform: scale(1); }
    }
    .sino-alerta {
      animation: sinoPulse 1s infinite;
    }
    </style>`, '');

// 2. Remover bloco do sino/notificacao no topo
const sinoBloco = `  <div id="sino-notificacao-topo-content" style="display:flex;justify-content:flex-end;gap:10px;margin-bottom:12px">
<a href="/app/notificacoes" title="Central de notificações" style="position:relative;text-decoration:none;background:white;border:1px solid #eee;border-radius:999px;width:42px;height:42px;display:flex;align-items:center;justify-content:center;box-shadow:0 4px 14px rgba(0,0,0,.06)">
      <span class="<%= (typeof notificacoesNaoLidas !== 'undefined' && notificacoesNaoLidas > 0) ? 'sino-alerta' : '' %>" style="font-size:22px">🔔</span>
      <% if (typeof notificacoesNaoLidas !== 'undefined' && notificacoesNaoLidas > 0) { %>
        <span style="position:absolute;top:-5px;right:-5px;background:#ff385c;color:white;font-size:11px;font-weight:800;padding:2px 6px;border-radius:999px">
          <%= notificacoesNaoLidas %>
        </span>
      <% } %>
    </a>
  </div>`;
shell = shell.replace(sinoBloco, '');

// 3. Melhorar page-head — mais limpo, fonte maior, sem margem excessiva
shell = shell.replace(
  `.page-head{margin-bottom:28px}
    .page-head h1{font-family:'Syne',sans-serif;font-size:26px;font-weight:700;color:var(--dark);letter-spacing:-.5px;margin-bottom:4px}
    .page-head p{color:var(--gray);font-size:14px}`,
  `.page-head{margin-bottom:24px;padding-bottom:20px;border-bottom:1px solid var(--border)}
    .page-head h1{font-family:'Syne',sans-serif;font-size:24px;font-weight:700;color:var(--dark);letter-spacing:-.5px;margin-bottom:2px}
    .page-head p{color:var(--gray);font-size:13px}`
);

// 4. Reduzir padding do content para dar mais respiro
shell = shell.replace(
  '.content{margin-left:var(--sidebar);width:calc(100% - var(--sidebar));min-height:100vh;padding:32px 36px}',
  '.content{margin-left:var(--sidebar);width:calc(100% - var(--sidebar));min-height:100vh;padding:28px 32px}'
);

// 5. Adicionar notificacoes no menu com badge discreto (sem sino)
shell = shell.replace(
  `<a class="<%= active==='notificacoes'?'active':'' %>" href="/app/notificacoes"><span class="menu-ic">🔔</span>Notificações</a>`,
  `<a class="<%= active==='notificacoes'?'active':'' %>" href="/app/notificacoes" style="justify-content:space-between">
      <span style="display:flex;align-items:center;gap:10px"><span class="menu-ic">🔔</span>Notificações</span>
      <% if (typeof notificacoesNaoLidas !== 'undefined' && notificacoesNaoLidas > 0) { %>
        <span style="background:#ff385c;color:white;font-size:10px;font-weight:700;padding:1px 7px;border-radius:999px;min-width:18px;text-align:center"><%= notificacoesNaoLidas %></span>
      <% } %>
    </a>`
);

fs.writeFileSync('views/partials/app-shell.ejs', shell);
console.log('ok');
