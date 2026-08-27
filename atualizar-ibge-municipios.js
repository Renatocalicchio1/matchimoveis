// Re-semeia a tabela `localidades` com o nome REAL (acentuado, do jeito
// certo) de cada município do Brasil, fonte='ibge' de verdade — achado
// ago/2026: a fonte 'normalizado' que já existia (11.170 linhas, cobertura
// nacional completa) foi gravada em minúsculo/sem acento (bug de origem:
// popular-brasil-tudo.js usa a mesma função `norm()` tanto pra montar a
// CHAVE de comparação quanto pro VALOR gravado — devia só ter usado pra
// comparar). Isso fazia normalizarCidadeBR nunca achar "São Paulo" (só
// achava "sao paulo"), então nunca restaurava o acento que faltava.
//
// Esse script só ACRESCENTA linhas novas com fonte='ibge' e a grafia certa
// (nome cru da API do IBGE, sem `norm()`) — não mexe nem apaga as linhas
// 'normalizado'/'interno'/'osm' que já existem, só passa a existir uma
// camada confiável de verdade pro cleanup usar.
//
// Fonte: API pública do IBGE (mesma que popular-brasil-tudo.js já usa),
// uma chamada só, sem scraping de bairro (isso é outra frente, mais lenta
// e sujeita a rate-limit do Nominatim — fora do escopo deste script).
//
// Por padrão roda em modo SIMULAÇÃO (não grava nada). Só grava de verdade
// com a flag --aplicar.
//
// Rodar (Render Shell):
//   node atualizar-ibge-municipios.js            (simula, não grava)
//   node atualizar-ibge-municipios.js --aplicar   (grava de verdade)
require('dotenv').config();
const { query } = require('./services/db');

const APLICAR = process.argv.includes('--aplicar');

async function main() {
  console.log(APLICAR ? '⚠️  MODO APLICAR — vai gravar no banco.' : '🔍 MODO SIMULAÇÃO — não grava nada (rode com --aplicar pra gravar).');

  const res = await fetch('https://servicodados.ibge.gov.br/api/v1/localidades/municipios?orderBy=nome');
  if (!res.ok) throw new Error('Falha ao buscar API do IBGE: HTTP ' + res.status);
  const municipios = await res.json();
  console.log('Municípios recebidos da API do IBGE:', municipios.length);

  const jaExistentes = await query(`SELECT cidade, estado FROM localidades WHERE fonte='ibge' AND bairro IS NULL`);
  const chaveJaExiste = new Set(jaExistentes.rows.map(r => (r.cidade + '|' + r.estado).toLowerCase()));

  let inseridos = 0, jaTinha = 0, semUf = 0, erro = 0;
  const amostra = [];

  for (const m of municipios) {
    try {
      const cidade = (m.nome || '').trim();
      const uf = (m.microrregiao?.mesorregiao?.UF?.sigla || m['regiao-imediata']?.['regiao-intermediaria']?.UF?.sigla || '').toLowerCase();
      if (!cidade || !uf) { semUf++; continue; }

      const chave = (cidade + '|' + uf).toLowerCase();
      if (chaveJaExiste.has(chave)) { jaTinha++; continue; }

      inseridos++;
      if (amostra.length < 30) amostra.push({ cidade, uf });

      if (APLICAR) {
        await query(`INSERT INTO localidades(bairro,cidade,estado,fonte) VALUES(NULL,$1,$2,'ibge') ON CONFLICT DO NOTHING`, [cidade, uf]);
      }
    } catch (e) {
      erro++;
      console.error('[erro município]', m.nome, e.message);
    }
  }

  console.log('\n=== Amostra do que seria inserido (até 30) ===');
  console.table(amostra);

  console.log('\n=== Resumo ===');
  console.log('Já existia (fonte=ibge):', jaTinha);
  console.log(APLICAR ? 'Inseridos:' : 'Seriam inseridos:', inseridos);
  console.log('Sem UF (pulados):', semUf);
  console.log('Erros:', erro);
  if (!APLICAR && inseridos > 0) {
    console.log('\nRode com --aplicar pra gravar de verdade:');
    console.log('  node atualizar-ibge-municipios.js --aplicar');
  }

  process.exit(0);
}

main().catch(e => { console.error('ERRO GERAL:', e.message); process.exit(1); });
