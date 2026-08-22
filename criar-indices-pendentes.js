// Cria os índices que faltam em leads/imoveis pra acabar com as varreduras
// completas nas queries por conta (WHERE user_id=$1 OR usuario_id=$1 OR
// codigo_usuario=$1 OR corretor_id=$1) — causa raiz do pool de conexões
// esgotando com o volume atual da plataforma (ago/2026).
//
// Rodar UMA VEZ, manual, no Render Shell:
//   node criar-indices-pendentes.js
//
// Não roda automático no boot do servidor de propósito: CREATE INDEX
// CONCURRENTLY numa tabela grande pode levar minutos segurando uma conexão;
// se o processo reiniciasse no meio (crash-loop), o build nunca terminava e
// cada boot tentava de novo, competindo pelo pool logo na subida — piorava
// o próprio problema que tentava resolver. Rodando aqui, fora do processo
// principal, isso não acontece.
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

const INDICES = [
  { nome: 'idx_leads_codigo_usuario', sql: 'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_leads_codigo_usuario ON leads(codigo_usuario)' },
  { nome: 'idx_imoveis_usuario_id', sql: 'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_imoveis_usuario_id ON imoveis(usuario_id)' },
  { nome: 'idx_imoveis_codigo_usuario', sql: 'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_imoveis_codigo_usuario ON imoveis(codigo_usuario)' },
  { nome: 'idx_imoveis_corretor_id', sql: 'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_imoveis_corretor_id ON imoveis(corretor_id)' },
  // Suporte às consultas de /admin/campanha (status, validação de email e
  // cruzamento com usuarios já cadastrados) — sem índice, cada abertura da
  // tela varria a tabela inteira (~118 mil contatos).
  { nome: 'idx_campanha_contatos_status', sql: 'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_campanha_contatos_status ON campanha_contatos(status)' },
  { nome: 'idx_campanha_contatos_email_valido', sql: 'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_campanha_contatos_email_valido ON campanha_contatos(email_valido)' },
  { nome: 'idx_campanha_contatos_email_lower', sql: 'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_campanha_contatos_email_lower ON campanha_contatos(LOWER(email))' },
  { nome: 'idx_usuarios_email_lower', sql: 'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_usuarios_email_lower ON usuarios(LOWER(email))' },
  // Causa raiz encontrada (ago/2026) do servidor caindo o dia todo, não só de
  // madrugada: os caches incrementais de leads/imoveis/usuarios/visitas rodam
  // pra sempre em loop (a cada 15-30s) fazendo `WHERE atualizado_em > $1` — sem
  // índice nessa coluna isso é um Seq Scan na tabela inteira a cada disparo,
  // pra sempre, ficando mais pesado conforme a base cresce (uma conta sozinha
  // já passa de 8.000 imóveis). Com várias dessas rodando em paralelo, cada
  // uma segurando conexão do pool por mais tempo pra terminar o scan, o pool
  // esgota e todo o resto (sessão, jobs, health check) fica sem conexão —
  // bate "timeout exceeded when trying to connect" em cascata e o Render
  // reinicia (SIGTERM) achando o processo travado.
  { nome: 'idx_leads_atualizado_em', sql: 'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_leads_atualizado_em ON leads(atualizado_em)' },
  { nome: 'idx_imoveis_atualizado_em', sql: 'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_imoveis_atualizado_em ON imoveis(atualizado_em)' },
  { nome: 'idx_usuarios_atualizado_em', sql: 'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_usuarios_atualizado_em ON usuarios(atualizado_em)' },
  { nome: 'idx_visitas_atualizado_em', sql: 'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_visitas_atualizado_em ON visitas(atualizado_em)' },
  // /admin/captacao-campanha (services/campanhaCaptacao.js → listarEnvios)
  // busca o telefone mais atual da lead por LOWER(email)+tipo_lead pra cada
  // linha de campanha_captacao_envios — sem índice isso é Seq Scan em leads
  // inteira por linha, o que deixava a tabela "Carregando..." pra sempre com
  // a base atual (ago/2026). criado_em DESC no fim cobre o ORDER BY ... LIMIT 1
  // da subquery, tornando a busca praticamente instantânea.
  { nome: 'idx_leads_email_lower_tipo', sql: "CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_leads_email_lower_tipo ON leads(LOWER(email), tipo_lead, criado_em DESC) WHERE telefone IS NOT NULL AND telefone != ''" },
];

async function run() {
  for (const idx of INDICES) {
    const inicio = Date.now();
    console.log(`[${idx.nome}] criando...`);
    try {
      await pool.query(idx.sql);
      console.log(`[${idx.nome}] OK (${((Date.now() - inicio) / 1000).toFixed(1)}s)`);
    } catch (e) {
      console.error(`[${idx.nome}] ERRO:`, e.message);
    }
  }
  await pool.end();
  console.log('Concluído.');
}

run().catch(e => { console.error('Erro geral:', e.message); process.exit(1); });
