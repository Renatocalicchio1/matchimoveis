// Exporta as leads que já receberam vitrine (vitrine_enviada=true) de uma conta,
// no mesmo padrão de colunas do modelo de importação de leads
// (GET /app/modelo-leads.xlsx em server.js).
//
// Rodar no Render Shell (ou local com DATABASE_URL configurada):
//   node exportar-vitrines-enviadas.js CODIGO_USUARIO
// Exemplo:
//   node exportar-vitrines-enviadas.js VIE-XK9H

const XLSX = require('xlsx');
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

const USER_ID = process.argv[2];

if (!USER_ID) {
  console.error('Uso: node exportar-vitrines-enviadas.js CODIGO_USUARIO');
  process.exit(1);
}

async function run() {
  const { rows } = await pool.query(
    `SELECT * FROM leads
     WHERE (user_id=$1 OR codigo_usuario=$1)
       AND vitrine_enviada = true
       AND NOT (deletado_por @> to_jsonb($1::text))
     ORDER BY vitrine_enviada_em DESC NULLS LAST, criado_em DESC`,
    [USER_ID]
  );
  console.log(`Leads com vitrine enviada em ${USER_ID}: ${rows.length}`);

  const linhas = rows.map(r => {
    const perfil = r.perfil_ia || {};
    const dados = r.dados || {};
    return {
      Nome: r.nome || '',
      Telefone: r.telefone || r.whatsapp || r.contato || '',
      Email: dados.email || '',
      Origem: r.origem || '',
      Tipo: perfil.tipo || '',
      Transacao: perfil.intencao || '',
      Condicao: perfil.condicao || '',
      Bairro: perfil.bairro || '',
      Cidade: perfil.cidade || '',
      Estado: perfil.estado || '',
      Quartos: perfil.quartos || '',
      Suites: perfil.suites || '',
      Vagas: perfil.vagas || '',
      Banheiros: perfil.banheiros || '',
      Area_max: perfil.area || '',
      Valor_max: perfil.valorMax || '',
      Observacoes: ''
    };
  });

  const ws = XLSX.utils.json_to_sheet(linhas);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Leads');
  const nomeArquivo = `vitrines-enviadas-${USER_ID}.xlsx`;
  XLSX.writeFile(wb, nomeArquivo);

  console.log(`✅ Planilha gerada: ${nomeArquivo}`);
  await pool.end();
}

run().catch(e => { console.error('Erro fatal:', e.message); process.exit(1); });
