// Copia todos os imóveis da conta VIE-XK9H para TIA-A6PG.
// id_interno/id_externo/id_original/codigo_imovel ficam IDÊNTICOS ao original
// (a pedido) — só o id (chave primária da tabela) é gerado novo, senão o
// Postgres rejeita a linha duplicada.
//
// Rodar no Render Shell (ou local com DATABASE_URL configurada): node copiar-imoveis-vie-tia.js

const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

const ORIGEM = 'VIE-XK9H';
const DESTINO = 'TIA-A6PG';

function serializarValor(v) {
  if (v !== null && typeof v === 'object' && !(v instanceof Date)) return JSON.stringify(v);
  return v;
}

async function run() {
  const { rows: destUsers } = await pool.query(
    'SELECT nome, email, celular, telefone, tipo FROM usuarios WHERE codigo_usuario=$1 OR id=$1 LIMIT 1',
    [DESTINO]
  );
  if (!destUsers.length) {
    console.error('❌ Conta de destino não encontrada:', DESTINO);
    await pool.end();
    return;
  }
  const dest = destUsers[0];
  const destTelefone = dest.celular || dest.telefone || '';

  const { rows: origem } = await pool.query(
    'SELECT * FROM imoveis WHERE user_id=$1 OR usuario_id=$1 OR codigo_usuario=$1 OR corretor_id=$1',
    [ORIGEM]
  );
  console.log(`Imóveis encontrados em ${ORIGEM}: ${origem.length}`);

  let copiados = 0, jaExistia = 0, erros = 0;

  for (const imovel of origem) {
    const copia = { ...imovel };

    copia.id = `${DESTINO}-${imovel.id}`;
    // id_interno / id_externo / id_original / codigo_imovel NÃO são tocados — ficam iguais ao original

    copia.user_id = DESTINO;
    copia.usuario_id = DESTINO;
    copia.codigo_usuario = DESTINO;
    copia.corretor_id = DESTINO;
    copia.usuario_nome = dest.nome || '';
    copia.usuario_perfil = dest.tipo || '';
    copia.usuario_telefone = destTelefone;
    copia.corretor_nome = dest.nome || '';
    copia.corretor_email = dest.email || '';
    copia.corretor_telefone = destTelefone;
    copia.corretor = { id: DESTINO, nome: dest.nome || '', email: dest.email || '', telefone: destTelefone };

    copia.criado_em = new Date();
    copia.atualizado_em = new Date();

    const colunas = Object.keys(copia);
    const placeholders = colunas.map((_, i) => `$${i + 1}`).join(',');
    const valores = colunas.map(c => serializarValor(copia[c]));

    try {
      const r = await pool.query(
        `INSERT INTO imoveis (${colunas.join(',')}) VALUES (${placeholders}) ON CONFLICT (id) DO NOTHING`,
        valores
      );
      if (r.rowCount > 0) copiados++;
      else jaExistia++;
    } catch (e) {
      console.error('Erro ao copiar imóvel', imovel.id, ':', e.message);
      erros++;
    }

    if ((copiados + jaExistia + erros) % 100 === 0) {
      console.log(`  ... ${copiados + jaExistia + erros}/${origem.length} processados`);
    }
  }

  console.log(`✅ Copiados: ${copiados}`);
  console.log(`⏭️  Já existiam (rodou antes): ${jaExistia}`);
  console.log(`❌ Erros: ${erros}`);
  await pool.end();
}

run().catch(e => { console.error('Erro fatal:', e.message); process.exit(1); });
