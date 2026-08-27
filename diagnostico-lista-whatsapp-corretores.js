// Passo do disparo WhatsApp combinado com o Renato: dos contatos da campanha
// de e-mail que (a) abriram o 1º e-mail, (b) têm palavra relacionada a
// corretor/imóvel/imobiliária no nome ou e-mail, tenta extrair um celular
// BR válido de verdade do campo `celular` — que vem sujo em boa parte dos
// casos (formatado com parênteses/espaço, telefone fixo junto, ou vários
// números na mesma célula separados por vírgula).
//
// SÓ IMPRIME NA TELA — não grava nada no banco nem em arquivo. Nome/e-mail/
// celular de contato real não deve virar arquivo commitado no repositório
// (vazaria dado de contato no histórico do Git).
//
// Rodar (Render Shell):
//   node diagnostico-lista-whatsapp-corretores.js
require('dotenv').config();
const { query } = require('./services/db');

function extrairCelularValido(bruto) {
  if (!bruto) return null;
  // celular às vezes vem com mais de 1 número na mesma célula, separados
  // por vírgula — tenta cada pedaço até achar um que bate com celular BR
  // de verdade (DDD 2 dígitos + 9 + 8 dígitos = 11 dígitos, 3º dígito '9').
  const partes = String(bruto).split(',');
  for (let parte of partes) {
    let d = parte.replace(/\D/g, '');
    if (d.length === 13 && d.startsWith('55')) d = d.slice(2); // remove DDI 55
    if (/^[1-9][0-9]9[0-9]{8}$/.test(d)) return d;
  }
  return null;
}

async function main() {
  const { rows } = await query(`
    SELECT id, celular FROM campanha_contatos
    WHERE aberto_em IS NOT NULL
      AND (unaccent(lower(nome)) ~ 'corretor|imov|imobili|broker' OR unaccent(lower(email)) ~ 'corretor|imov|imobili|broker')
      AND celular IS NOT NULL AND celular != ''
  `);

  let validos = 0, invalidos = 0;
  for (const c of rows) {
    if (extrairCelularValido(c.celular)) validos++; else invalidos++;
  }

  console.log('Total com algo no campo celular:', rows.length);
  console.log('Celular válido extraído (pronto pra WhatsApp):', validos);
  console.log('Sem celular válido mesmo tentando limpar:', invalidos);

  process.exit(0);
}

main().catch(e => { console.error('ERRO:', e.message); process.exit(1); });
