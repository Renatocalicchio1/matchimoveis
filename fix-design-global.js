'use strict';
const fs = require('fs');

// ── SHELL — tipografia e espaçamento refinados ────────────────────────────────
let shell = fs.readFileSync('views/partials/app-shell.ejs', 'utf8');

// Fonte: trocar DM Sans por sistema mais limpo estilo Claude
shell = shell.replace(
  "family=Syne:wght@400;500;600;700;800&family=DM+Sans:wght@300;400;500;600&display=swap",
  "family=Inter:wght@300;400;500;600;700&family=Syne:wght@600;700;800&display=swap"
);
shell = shell.replace(
  "font-family:'DM Sans',sans-serif",
  "font-family:'Inter',sans-serif"
);
shell = shell.replace(
  "font-family:'DM Sans',sans-serif;background:var(--light);color:var(--dark);font-size:11px;line-height:1.6",
  "font-family:'Inter',sans-serif;background:#f9f9f8;color:#1a1a1a;font-size:13px;line-height:1.6;-webkit-font-smoothing:antialiased"
);

// Background mais limpo
shell = shell.replace('--light:#f7f7f7;', '--light:#f9f9f8;');

// Sidebar mais refinada
shell = shell.replace(
  '.menu a{display:flex;align-items:center;gap:10px;padding:9px 12px;border-radius:10px;color:var(--gray);text-decoration:none;font-size:11px;font-weight:500;transition:all .15s;margin-bottom:1px}',
  '.menu a{display:flex;align-items:center;gap:10px;padding:8px 12px;border-radius:8px;color:#666;text-decoration:none;font-size:13px;font-weight:400;transition:all .12s;margin-bottom:1px}'
);
shell = shell.replace(
  '.menu a.active{background:var(--brand-light);color:var(--brand);font-weight:600}',
  '.menu a.active{background:#fff1f3;color:#ff385c;font-weight:600}'
);
shell = shell.replace(
  '.menu-sec{font-size:10px;font-weight:700;color:#bbb;text-transform:uppercase;letter-spacing:.8px;padding:14px 8px 6px}',
  '.menu-sec{font-size:11px;font-weight:600;color:#bbb;text-transform:uppercase;letter-spacing:.6px;padding:16px 8px 6px}'
);

// Content padding
shell = shell.replace(
  '.content{margin-left:var(--sidebar);width:calc(100% - var(--sidebar));min-height:100vh;padding:28px 32px}',
  '.content{margin-left:var(--sidebar);width:calc(100% - var(--sidebar));min-height:100vh;padding:32px 40px}'
);

// Page head mais limpo
shell = shell.replace(
  `.page-head{margin-bottom:24px;padding-bottom:20px;border-bottom:1px solid var(--border)}
    .page-head h1{font-family:'Syne',sans-serif;font-size:24px;font-weight:700;color:var(--dark);letter-spacing:-.5px;margin-bottom:2px}
    .page-head p{color:var(--gray);font-size:13px}`,
  `.page-head{margin-bottom:28px}
    .page-head h1{font-family:'Syne',sans-serif;font-size:22px;font-weight:700;color:#1a1a1a;letter-spacing:-.4px;margin-bottom:3px}
    .page-head p{color:#888;font-size:13px;font-weight:400}`
);

// Tabela mais limpa
shell = shell.replace(
  'table{width:100%;border-collapse:collapse;font-size:13px}',
  'table{width:100%;border-collapse:collapse;font-size:13px;font-family:\'Inter\',sans-serif}'
);
shell = shell.replace(
  'th{text-align:left;padding:10px 14px;font-size:11px;font-weight:700;color:var(--gray);text-transform:uppercase;letter-spacing:.5px;border-bottom:1.5px solid var(--border)}',
  'th{text-align:left;padding:10px 16px;font-size:11px;font-weight:600;color:#999;text-transform:uppercase;letter-spacing:.5px;border-bottom:1px solid #f0f0f0}'
);
shell = shell.replace(
  'td{padding:13px 14px;border-bottom:1px solid var(--border);color:var(--dark);vertical-align:middle}',
  'td{padding:13px 16px;border-bottom:1px solid #f5f5f5;color:#1a1a1a;vertical-align:middle}'
);

// Brand name menor
shell = shell.replace(
  '.brand-name{font-family:\'Syne\',sans-serif;font-size:17px;font-weight:700;color:var(--dark);letter-spacing:-.3px}',
  '.brand-name{font-family:\'Syne\',sans-serif;font-size:16px;font-weight:700;color:#1a1a1a;letter-spacing:-.3px}'
);

// User pill mais sutil
shell = shell.replace(
  '.user-nm{font-size:11px;font-weight:600;color:var(--dark);white-space:nowrap;overflow:hidden; display:flex; flex-direction:column;text-overflow:ellipsis;max-width:130px}',
  '.user-nm{font-size:13px;font-weight:500;color:#1a1a1a;white-space:nowrap;overflow:hidden;display:flex;flex-direction:column;text-overflow:ellipsis;max-width:130px}'
);

fs.writeFileSync('views/partials/app-shell.ejs', shell);
console.log('1. shell.ejs refinado');

// ── APP-VISITAS — remover <main> duplicado, adicionar title ──────────────────
let visitas = fs.readFileSync('views/app-visitas.ejs', 'utf8');
visitas = visitas.replace(
  '<%- include("partials/app-shell",{active:"visitas",user:user}) %>\n\n<main style="padding:30px">\n  <div class="card" style="background:white;border-radius:16px;padding:24px;box-shadow:0 6px 20px rgba(0,0,0,.08)">\n    <h1>Visitas solicitadas</h1>',
  '<%- include("partials/app-shell",{active:"visitas",title:"Visitas",subtitle:"Gerencie visitas solicitadas pelos seus clientes.",user:user}) %>\n\n<div class="card">'
);
// Fechar div extra no final
visitas = visitas.replace('  </div>\n</main>', '</div>');
fs.writeFileSync('views/app-visitas.ejs', visitas);
console.log('2. app-visitas.ejs atualizado');

// ── APP-NOTIFICACOES — remover main duplicado, limpar header ─────────────────
let notif = fs.readFileSync('views/app-notificacoes.ejs', 'utf8');
notif = notif.replace(
  '<%- include("partials/app-shell",{active:"notificacoes",user:user}) %>\n\n<main style="padding:30px">\n  <div style="background:white;border-radius:18px;padding:24px;box-shadow:0 8px 24px rgba(0,0,0,.08)">\n    <h1 style="margin-bottom:8px">🔔 Central de Notificações</h1>\n    <p style="color:#666;margin-bottom:22px">Acompanhe solicitações de visita, novos matches e avisos importantes.</p>',
  '<%- include("partials/app-shell",{active:"notificacoes",title:"Notificações",subtitle:"Acompanhe visitas, matches e avisos importantes.",user:user}) %>\n\n<div class="card">'
);
notif = notif.replace('  </div>\n</main>', '</div>');
fs.writeFileSync('views/app-notificacoes.ejs', notif);
console.log('3. app-notificacoes.ejs atualizado');

// ── APP-LEADS — adicionar title ───────────────────────────────────────────────
let leads = fs.readFileSync('views/app-leads.ejs', 'utf8');
leads = leads.replace(
  "<%- include('partials/app-shell', {active:'leads'}) %>",
  "<%- include('partials/app-shell', {active:'leads',title:'Leads',subtitle:'Gerencie e acompanhe seus clientes em busca de imóveis.'}) %>"
);
fs.writeFileSync('views/app-leads.ejs', leads);
console.log('4. app-leads.ejs atualizado');

// ── APP-PERFIL — adicionar title se não tiver ─────────────────────────────────
let perfil = fs.readFileSync('views/app-perfil.ejs', 'utf8');
if (!perfil.includes('title:')) {
  perfil = perfil.replace(
    /<%- include\(["']partials\/app-shell["'],\s*\{([^}]+)\}\) %>/,
    (m, inner) => m.replace(inner, inner.trimEnd() + ",title:'Perfil',subtitle:'Gerencie suas informações e conta.'")
  );
  fs.writeFileSync('views/app-perfil.ejs', perfil);
  console.log('5. app-perfil.ejs atualizado');
} else {
  console.log('5. app-perfil.ejs ja tem title');
}

// ── APP-COINS — adicionar title ───────────────────────────────────────────────
let coins = fs.readFileSync('views/app-coins.ejs', 'utf8');
if (!coins.includes('title:')) {
  coins = coins.replace(
    /<%- include\(["']partials\/app-shell["'],\s*\{([^}]+)\}\) %>/,
    (m, inner) => m.replace(inner, inner.trimEnd() + ",title:'Match Coins',subtitle:'Seu saldo e histórico de moedas.'")
  );
  fs.writeFileSync('views/app-coins.ejs', coins);
  console.log('6. app-coins.ejs atualizado');
} else {
  console.log('6. app-coins.ejs ja tem title');
}

// ── APP-PORTAIS — adicionar title ─────────────────────────────────────────────
let portais = fs.readFileSync('views/app-portais.ejs', 'utf8');
if (!portais.includes('title:')) {
  portais = portais.replace(
    /<%- include\(["']partials\/app-shell["'],\s*\{([^}]+)\}\) %>/,
    (m, inner) => m.replace(inner, inner.trimEnd() + ",title:'Portais / XML',subtitle:'Gerencie seus feeds para os portais imobiliários.'")
  );
  fs.writeFileSync('views/app-portais.ejs', portais);
  console.log('7. app-portais.ejs atualizado');
} else {
  console.log('7. app-portais.ejs ja tem title');
}

console.log('\nPronto! Rode: git add -A && git commit -m "..." && git push');
