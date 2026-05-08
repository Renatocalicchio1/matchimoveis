const fs   = require('fs');
const path = require('path');
const BASE = __dirname;

// Substituições de cores nas views
const SUBS = [
  // Cores inline → neutras
  [/color:#1a56db/g,          'color:#1A1A1A'],
  [/color:#16a34a/g,          'color:#1A1A1A'],
  [/color:#FF385C/g,          'color:#FF385C'],
  [/color:#f59e0b/g,          'color:#6B6B6B'],
  [/color:#7c3aed/g,          'color:#1A1A1A'],
  [/color:#ea580c/g,          'color:#1A1A1A'],
  [/color:#0284c7/g,          'color:#1A1A1A'],
  [/color:#059669/g,          'color:#1A1A1A'],
  [/color:#d97706/g,          'color:#1A1A1A'],
  [/color:#be185d/g,          'color:#1A1A1A'],
  [/color:#2563eb/g,          'color:#FF385C'],
  [/color:#1d4ed8/g,          'color:#FF385C'],
  // Backgrounds coloridos → neutros
  [/background:#1a1a2e/g,     'background:#1A1A1A'],
  [/background:#7c3aed/g,     'background:#1A1A1A'],
  [/background:#ea580c/g,     'background:#555'],
  [/background:#0284c7/g,     'background:#333'],
  [/background:#059669/g,     'background:#444'],
  [/background:#d97706/g,     'background:#666'],
  [/background:#be185d/g,     'background:#777'],
  [/background:#eff6ff/g,     'background:#F5F5F5'],
  [/background:#f0fdf4/g,     'background:#F5F5F5'],
  [/background:#fef3c7/g,     'background:#F5F5F5'],
  [/background:#d1fae5/g,     'background:#F5F5F5'],
  [/background:#f0f9ff/g,     'background:#F5F5F5'],
  [/background:linear-gradient\(135deg,#ff385c,#ff6b35\)/g, 'background:#FF385C'],
  // Bordas coloridas → neutras
  [/border-color:#1a56db/g,   'border-color:#E5E5E5'],
  [/border-color:#16a34a/g,   'border-color:#E5E5E5'],
  [/border:2px solid #1a56db/g,'border:2px solid #E5E5E5'],
  // origin-row colorida → neutra
  [/background:#eff6ff.*?color:#1d4ed8/g, 'background:#F5F5F5;color:#1A1A1A'],
  [/background:#f0fdf4.*?color:#166534/g, 'background:#FAFAFA;color:#1A1A1A'],
  // KPI colors
  [/\.kpi\.blue.*?\{/g,       '.kpi{'],
  [/\.kpi\.green.*?\{/g,      '.kpi{'],
  [/\.kpi\.red.*?\{/g,        '.kpi{'],
  [/\.kpi\.orange.*?\{/g,     '.kpi{'],
  // Botões coloridos na barra de seleção
  [/background:#7c3aed;border:none;color:#fff/g, 'background:#1A1A1A;border:none;color:#fff'],
  [/background:#ea580c;border:none;color:#fff/g, 'background:#333;border:none;color:#fff'],
  [/background:#0284c7;border:none;color:#fff/g, 'background:#444;border:none;color:#fff'],
  [/background:#059669;border:none;color:#fff/g, 'background:#555;border:none;color:#fff'],
  [/background:#d97706;border:none;color:#fff/g, 'background:#666;border:none;color:#fff'],
  [/background:#be185d;border:none;color:#fff/g, 'background:#777;border:none;color:#fff'],
  // rate-fill colors
  [/background:#1a56db/g,     'background:#1A1A1A'],
  [/background:#16a34a/g,     'background:#6B6B6B'],
  // chip colors
  [/background:#d1fae5;color:#065f46/g, 'background:#F0F0F0;color:#1A1A1A'],
  [/background:#fef3c7;color:#92400e/g, 'background:#F0F0F0;color:#6B6B6B'],
  [/background:#111;color:#fff/g,       'background:#1A1A1A;color:#fff'],
  // Coins kpi
  [/class="kpi amber"/g,      'class="kpi"'],
  [/class="kpi blue"/g,       'class="kpi"'],
  // Verde confirmada
  [/style='color:green'/g,    "style='color:#1A1A1A;font-weight:600'"],
  [/style='color:red'/g,      "style='color:#FF385C;font-weight:600'"],
  [/style="color:green"/g,    'style="color:#1A1A1A;font-weight:600"'],
  [/style="color:red"/g,      'style="color:#FF385C;font-weight:600"'],
  // Notificações não lidas
  [/background:#fff7f8/g,     'background:#FAFAFA'],
];

const VIEWS = [
  'views/app-leads.ejs',
  'views/app-imoveis.ejs',
  'views/app-visitas.ejs',
  'views/app-notificacoes.ejs',
  'views/app-portais.ejs',
  'views/app-perfil.ejs',
  'views/app-coins.ejs',
  'views/app-assistente.ejs',
  'views/app-cadastro.ejs',
  'views/app-editar-imovel.ejs',
  'views/app-importar-leads.ejs',
];

let totalAlteracoes = 0;

VIEWS.forEach(viewPath => {
  const fullPath = path.join(BASE, viewPath);
  if (!fs.existsSync(fullPath)) {
    console.log(`⏭️  ${viewPath} não encontrado`);
    return;
  }
  let content = fs.readFileSync(fullPath, 'utf8');
  let alteracoes = 0;
  SUBS.forEach(([regex, sub]) => {
    const antes = content;
    content = content.replace(regex, sub);
    if (content !== antes) alteracoes++;
  });
  fs.writeFileSync(fullPath, content);
  console.log(`✅ ${viewPath} — ${alteracoes} substituições`);
  totalAlteracoes += alteracoes;
});

console.log(`\n✅ Total: ${totalAlteracoes} substituições em ${VIEWS.length} views`);
