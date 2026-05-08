const fs   = require('fs');
const path = require('path');
const BASE = __dirname;

// As 3 frases estão sendo capturadas por outros módulos antes do sistema.js
// "como cadastrar imóvel" → vai para imoveis.js (domínio=imoveis)
// "como adicionar fotos"  → domínio null → fallback
// "como conectar whatsapp" → vai para portais.js (tem "conectar")

// FIX: no index.js, checar sistema ANTES de rotear por domínio
let idx = fs.readFileSync(path.join(BASE,'cerebro','index.js'),'utf8');

// Adicionar verificação de sistema logo após suporte
const CHECK_SISTEMA = `
  // SISTEMA — respostas de suporte/how-to têm prioridade sobre domínio
  const isSistema = /como cadastrar imovel|como adicionar foto|como subir foto|como inativar imovel|como importar lead|como trocar senha|como conectar whatsapp|como acessar celular|como confirmar visita/.test(mNorm);
  if (isSistema) {
    const resSis = modSistema.responder(mNorm, d, btn, chip);
    if (resSis) return resSis;
  }
`;

// Inserir depois do check de estrategia
idx = idx.replace(
  `  const isScoring=/atender primeiro|mais chance|chance de fechar|pronto para proposta|ranking lead/.test(mNorm);`,
  CHECK_SISTEMA + `  const isScoring=/atender primeiro|mais chance|chance de fechar|pronto para proposta|ranking lead/.test(mNorm);`
);

fs.writeFileSync(path.join(BASE,'cerebro','index.js'), idx);
console.log('✅ index.js — sistema tem prioridade sobre domínio');

// Rodar teste
console.log('\n🧪 Testando...\n');
const {execSync} = require('child_process');
const r = execSync('node teste-automatico.js', {cwd: BASE}).toString();
console.log(r.split('\n').filter(l=>/═|%|COBERTURA|❌|✅|🟡|🔴|\[/.test(l)).join('\n'));
