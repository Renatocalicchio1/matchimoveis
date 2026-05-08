#!/bin/bash
cat > "$HOME/Downloads/matchimoveis /cerebro/limpeza.js" << 'JSEOF'
'use strict';
/**
 * LIMPEZA DO CÉREBRO
 * Remove dados velhos, inconsistências resolvidas e lixo acumulado.
 * Rodar: node cerebro/limpeza.js
 * Ou via: npm run limpar
 */

const fs   = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const log  = (...a) => console.log(...a);

let totalRemovido = 0;

// ── HELPER ────────────────────────────────────────────────────────────────────
function lerJSON(arquivo, padrao) {
  try { return JSON.parse(fs.readFileSync(arquivo,'utf8')); } catch(_) { return padrao; }
}
function salvarJSON(arquivo, dados) {
  fs.writeFileSync(arquivo, JSON.stringify(dados, null, 2));
}

// ── 1. LIMPAR NÃO-ENTENDIDOS ANTIGOS (30+ dias sem repetição) ─────────────────
function limparNaoEntendidos() {
  const arquivo = path.join(ROOT, 'assistente-nao-entendidos.json');
  if (!fs.existsSync(arquivo)) return;
  const d = lerJSON(arquivo, { nao_entendidos:[], sugestoes:[], inconsistencias:[], confirmadas:[] });
  const limite = new Date(Date.now() - 30*24*60*60*1000);

  const antes = d.nao_entendidos.length;
  d.nao_entendidos = (d.nao_entendidos||[]).filter(item => {
    const ultima = new Date(item.ultima||item.primeira||0);
    return ultima > limite || item.count >= 3; // manter se recente ou relevante
  });
  const removidos = antes - d.nao_entendidos.length;
  totalRemovido += removidos;
  log(`  🗑️  Não-entendidos antigos removidos: ${removidos}`);

  // Limpar inconsistências já resolvidas (confirmadas)
  const antesInc = (d.inconsistencias||[]).length;
  d.inconsistencias = (d.inconsistencias||[]).filter(i => !i.rejeitada || new Date(i.rejeitadaEm||0) > limite);
  log(`  🗑️  Inconsistências limpas: ${antesInc - d.inconsistencias.length}`);

  // Limpar sugestões antigas já processadas
  d.sugestoes = (d.sugestoes||[]).filter(s => s.status === 'pendente');

  // Manter só últimas 200 confirmadas
  if ((d.confirmadas||[]).length > 200) {
    d.confirmadas = d.confirmadas.slice(-200);
    log(`  🗑️  Confirmadas truncadas para 200`);
  }

  salvarJSON(arquivo, d);
}

// ── 2. LIMPAR MEMÓRIA DE USUÁRIOS (histórico > 500 por usuário) ───────────────
function limparMemoria() {
  const arquivo = path.join(ROOT, 'assistente-memoria.json');
  if (!fs.existsSync(arquivo)) return;
  const mem = lerJSON(arquivo, { historico:[], perfis:{} });

  // Histórico: manter últimas 500 entradas globais
  const antesHist = mem.historico.length;
  if (mem.historico.length > 500) {
    mem.historico = mem.historico.slice(-500);
    totalRemovido += antesHist - mem.historico.length;
    log(`  🗑️  Histórico de memória truncado: ${antesHist} → 500`);
  }

  // Perfis: remover perfis sem atividade há 60 dias
  const limite60 = new Date(Date.now() - 60*24*60*60*1000);
  const antesPerf = Object.keys(mem.perfis||{}).length;
  for (const [uid, perfil] of Object.entries(mem.perfis||{})) {
    if (perfil.ultimaAtividade && new Date(perfil.ultimaAtividade) < limite60) {
      delete mem.perfis[uid];
    }
  }
  const removidosPerf = antesPerf - Object.keys(mem.perfis||{}).length;
  if (removidosPerf) log(`  🗑️  Perfis inativos removidos: ${removidosPerf}`);

  salvarJSON(arquivo, mem);
}

// ── 3. LIMPAR MÉTRICAS DO ASSISTENTE ─────────────────────────────────────────
function limparMetricas() {
  const arquivo = path.join(ROOT, 'assistente-metricas.json');
  if (!fs.existsSync(arquivo)) return;
  const m = lerJSON(arquivo, {});

  // Manter só últimas 30 entradas de métricas diárias
  if (m.historicoDiario && m.historicoDiario.length > 30) {
    m.historicoDiario = m.historicoDiario.slice(-30);
    log(`  🗑️  Métricas diárias truncadas para 30 dias`);
  }
  salvarJSON(arquivo, m);
}

// ── 4. LIMPAR SINÔNIMOS APRENDIDOS DUPLICADOS ─────────────────────────────────
function limparSinonimos() {
  const arquivo = path.join(ROOT, 'cerebro', 'sinonimos-aprendidos.json');
  if (!fs.existsSync(arquivo)) return;
  const s = lerJSON(arquivo, {});

  // Remover sinônimos que mapeiam para si mesmos
  let removidos = 0;
  for (const [chave, valor] of Object.entries(s)) {
    if (chave === valor) { delete s[chave]; removidos++; }
  }
  if (removidos) log(`  🗑️  Sinônimos inválidos removidos: ${removidos}`);
  salvarJSON(arquivo, s);
}

// ── 5. LIMPAR BASE DE CONHECIMENTO EXPANDIDA ─────────────────────────────────
function limparBaseConhecimento() {
  const arquivo = path.join(ROOT, 'cerebro', 'base-conhecimento-expandida.json');
  if (!fs.existsSync(arquivo)) return;
  const b = lerJSON(arquivo, { items:[] });

  // Remover duplicatas por pergunta
  const vistas = new Set();
  const antes = b.items.length;
  b.items = b.items.filter(item => {
    const key = item.p.toLowerCase().trim();
    if (vistas.has(key)) return false;
    vistas.add(key);
    return true;
  });
  const removidos = antes - b.items.length;
  if (removidos) {
    totalRemovido += removidos;
    log(`  🗑️  Base conhecimento duplicatas removidas: ${removidos}`);
  }
  b.total = b.items.length;
  b.limpezaEm = new Date().toISOString();
  salvarJSON(arquivo, b);
}

// ── 6. LIMPAR ARQUIVO DE TREINO (manter só última rodada) ────────────────────
function limparTreino() {
  const arquivo = path.join(ROOT, 'cerebro', 'treino-relatorio.json');
  if (!fs.existsSync(arquivo)) return;
  const t = lerJSON(arquivo, {});
  // Já é só uma rodada, mas limpar naoEntendidas antigas
  if (t.naoEntendidas && t.naoEntendidas.length > 50) {
    t.naoEntendidas = t.naoEntendidas.slice(0,50);
    log(`  🗑️  Treino: nao-entendidas truncadas para 50`);
  }
  salvarJSON(arquivo, t);
}

// ── 7. RESETAR PESOS DA ÁRVORE SEMANALMENTE ──────────────────────────────────
function verificarResetPesos() {
  const arquivo = path.join(ROOT, 'cerebro', 'pesos-arvore.json');
  const pesos = lerJSON(arquivo, { ultimoReset: null });
  const limite = new Date(Date.now() - 7*24*60*60*1000);

  if (!pesos.ultimoReset || new Date(pesos.ultimoReset) < limite) {
    salvarJSON(arquivo, { ultimoReset: new Date().toISOString(), pesos:{} });
    log(`  🔄  Pesos da árvore resetados (semanal)`);
  } else {
    log(`  ✅  Pesos da árvore ok (próximo reset: ${new Date(new Date(pesos.ultimoReset).getTime()+7*24*60*60*1000).toLocaleDateString('pt-BR')})`);
  }
}

// ── EXECUTAR LIMPEZA ──────────────────────────────────────────────────────────
console.log('\n🧹 LIMPEZA DO CÉREBRO');
console.log('═'.repeat(40));
console.log(`⏰ ${new Date().toLocaleString('pt-BR')}\n`);

limparNaoEntendidos();
limparMemoria();
limparMetricas();
limparSinonimos();
limparBaseConhecimento();
limparTreino();
verificarResetPesos();

console.log(`\n✅ Limpeza concluída!`);
console.log(`   Total removido: ${totalRemovido} registros`);
console.log('═'.repeat(40));
JSEOF

# Adicionar scripts no package.json
cd "$HOME/Downloads/matchimoveis "
node -e "
const fs=require('fs');
const pkg=JSON.parse(fs.readFileSync('package.json','utf8'));
pkg.scripts['limpar']='node cerebro/limpeza.js';
pkg.scripts['cerebro']='node cerebro.js && node auto-expansor.js && node cerebro/limpeza.js';
pkg.scripts['treino']='node treino-cerebro.js';
pkg.scripts['treino:loop']='node treino-cerebro.js --loop';
pkg.scripts['treino:silent']='node treino-cerebro.js --silent';
fs.writeFileSync('package.json',JSON.stringify(pkg,null,2));
console.log('✅ Scripts atualizados!');
cat package.json | grep -A10 scripts || true;
"

echo ""
echo "Rodando limpeza..."
node cerebro/limpeza.js

echo ""
echo "Scripts disponíveis:"
npm run
