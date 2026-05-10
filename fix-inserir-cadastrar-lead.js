const fs = require('fs');
let ctx = fs.readFileSync('cerebro/contexto.js', 'utf8');

const ancora = `  if (intencao === 'IMPORTAR_XML') {`;

const bloco = `  // ── CADASTRAR LEAD ──────────────────────────────────────────────────────────
  if (intencao === 'CADASTRAR_LEAD') {
    const frase = ctx.fraseOriginal;
    // Extrai nome
    const nomeMatch = frase.match(/(?:lead|cliente)[:\\s]+([A-ZÀ-Úa-zà-ú][a-zà-ú]+(?:\\s+[A-ZÀ-Úa-zà-ú][a-zà-ú]+)*)/i)
      || frase.match(/cadastra\\s+([A-ZÀ-Ú][a-zà-ú]+(?:\\s+[A-ZÀ-Ú][a-zà-ú]+)*)/i);
    const nome = nomeMatch ? nomeMatch[1].trim() : null;
    // Extrai celular
    const celularMatch = frase.match(/(\\(?\\d{2}\\)?\\s?\\d{4,5}[-\\s]?\\d{4})/);
    const celular = celularMatch ? celularMatch[1].replace(/\\D/g,'') : null;
    // Extrai tipo
    const tipoMatch = frase.match(/\\b(apto|apartamento|casa|terreno|comercial|cobertura|studio|kitnet)\\b/i);
    const tipo = tipoMatch ? (tipoMatch[1].toLowerCase()==='apto'?'Apartamento': tipoMatch[1].charAt(0).toUpperCase()+tipoMatch[1].slice(1)) : '';
    // Extrai quartos
    const quartosMatch = frase.match(/(\\d+)\\s*(?:q(?:uartos?)?|dorm)/i);
    const quartos = quartosMatch ? Number(quartosMatch[1]) : 0;
    // Extrai valor
    const valorMatch = frase.match(/(?:ate|até|por|valor)?\\s*R?\\$?\\s*([\\d.,]+)\\s*(mil|k|m)?/i);
    let valor = 0;
    if (valorMatch) {
      let v = parseFloat(valorMatch[1].replace(/\\./g,'').replace(',','.'));
      const suf = (valorMatch[2]||'').toLowerCase();
      if (suf==='mil'||suf==='k') v*=1000;
      if (suf==='m') v*=1000000;
      valor = v;
    }
    // Extrai bairro
    const bairroMatch = frase.match(/\\b(?:em|no|na|bairro)\\s+([A-ZÀ-Úa-zà-ú][a-zà-ú]+(?:\\s+[A-ZÀ-Úa-zà-ú][a-zà-ú]+){0,2})/i);
    const bairro = bairroMatch ? bairroMatch[1].trim() : '';

    if (nome && celular) {
      return 'ACAO_CADASTRAR_LEAD:' + JSON.stringify({ nome, celular, tipo, quartos, valor_imovel: valor, bairro });
    }
    if (nome && !celular) {
      return '📋 Entendido! Quer cadastrar <strong>' + nome + '</strong>.<br><br>Qual o celular do cliente?';
    }
    return '📋 <strong>Cadastrar novo lead:</strong><br><br>Me passa nome e celular do cliente.<br><br>💡 Exemplo: <em>"cadastra lead João Silva, 47999991234, quer apto 3q em Itajaí até 600k"</em>';
  }

`;

if (!ctx.includes("if (intencao === 'CADASTRAR_LEAD')")) {
  ctx = ctx.replace(ancora, bloco + ancora);
  fs.writeFileSync('cerebro/contexto.js', ctx);
  console.log('ok — bloco inserido');
} else {
  console.log('ja existe');
}
