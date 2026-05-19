require('dotenv').config();
const { query } = require('./services/db');

async function main() {
  // USUARIOS
  await query(`CREATE TABLE IF NOT EXISTS usuarios (
    id TEXT PRIMARY KEY, nome TEXT, telefone TEXT, celular TEXT, email TEXT, senha TEXT,
    tipo TEXT DEFAULT 'corretor', ativo BOOLEAN DEFAULT true, codigo_usuario TEXT,
    creci TEXT, cpf TEXT, match_coins INTEGER DEFAULT 0, match_coins_total INTEGER DEFAULT 0,
    match_coins_bonus_inicial INTEGER DEFAULT 0, whatsapp_instance TEXT,
    whatsapp_status TEXT, whatsapp_numero TEXT, bloqueados JSONB DEFAULT '[]',
    lat DOUBLE PRECISION, lng DOUBLE PRECISION, endereco TEXT, xml_url TEXT,
    xml_atualizado_em TIMESTAMPTZ, xml_total INTEGER DEFAULT 0,
    historico_assistente JSONB DEFAULT '[]',
    criado_em TIMESTAMPTZ DEFAULT NOW(), atualizado_em TIMESTAMPTZ DEFAULT NOW(),
    dados JSONB DEFAULT '{}'
  )`);
  console.log('✅ usuarios');

  // LEADS — campos extras
  const leadsAlter = [
    "ADD COLUMN IF NOT EXISTS ultima_mensagem TEXT",
    "ADD COLUMN IF NOT EXISTS ultima_mensagem_em TIMESTAMPTZ",
    "ADD COLUMN IF NOT EXISTS tipo_lead TEXT DEFAULT 'cliente'",
    "ADD COLUMN IF NOT EXISTS vitrine_visualizada BOOLEAN DEFAULT false",
    "ADD COLUMN IF NOT EXISTS vitrine_link TEXT",
    "ADD COLUMN IF NOT EXISTS matches_quintoandar JSONB DEFAULT '[]'",
    "ADD COLUMN IF NOT EXISTS historico_imoveis JSONB DEFAULT '[]'",
    "ADD COLUMN IF NOT EXISTS tipo TEXT",
    "ADD COLUMN IF NOT EXISTS bairro TEXT",
    "ADD COLUMN IF NOT EXISTS cidade TEXT",
    "ADD COLUMN IF NOT EXISTS estado TEXT",
    "ADD COLUMN IF NOT EXISTS valor_max NUMERIC DEFAULT 0",
    "ADD COLUMN IF NOT EXISTS quartos INTEGER DEFAULT 0",
    "ADD COLUMN IF NOT EXISTS area_m2 NUMERIC DEFAULT 0"
  ];
  for (const col of leadsAlter) {
    await query('ALTER TABLE leads ' + col).catch(()=>{});
  }
  console.log('✅ leads');

  // VISITAS — campos extras
  const visitasAlter = [
    "ADD COLUMN IF NOT EXISTS imovel_cidade TEXT",
    "ADD COLUMN IF NOT EXISTS imovel_estado TEXT",
    "ADD COLUMN IF NOT EXISTS corretor_nome TEXT",
    "ADD COLUMN IF NOT EXISTS corretor_telefone TEXT",
    "ADD COLUMN IF NOT EXISTS usuario_destino_id TEXT",
    "ADD COLUMN IF NOT EXISTS usuario_destino_nome TEXT",
    "ADD COLUMN IF NOT EXISTS usuario_destino_perfil TEXT",
    "ADD COLUMN IF NOT EXISTS usuario_destino_telefone TEXT",
    "ADD COLUMN IF NOT EXISTS lead_owner_id TEXT",
    "ADD COLUMN IF NOT EXISTS pipeline_status TEXT",
    "ADD COLUMN IF NOT EXISTS workflow_status TEXT",
    "ADD COLUMN IF NOT EXISTS prioridade TEXT DEFAULT 'NORMAL'",
    "ADD COLUMN IF NOT EXISTS responsavel_operacional TEXT",
    "ADD COLUMN IF NOT EXISTS confirmacao_proprietario_status TEXT",
    "ADD COLUMN IF NOT EXISTS proprietario_confirmou BOOLEAN DEFAULT false",
    "ADD COLUMN IF NOT EXISTS cliente_notificado BOOLEAN DEFAULT false",
    "ADD COLUMN IF NOT EXISTS whatsapp_cliente_link TEXT",
    "ADD COLUMN IF NOT EXISTS fonte TEXT",
    "ADD COLUMN IF NOT EXISTS data TEXT",
    "ADD COLUMN IF NOT EXISTS data_br TEXT",
    "ADD COLUMN IF NOT EXISTS observacoes JSONB DEFAULT '[]'",
    "ADD COLUMN IF NOT EXISTS valor_proposta TEXT",
    "ADD COLUMN IF NOT EXISTS motivo_perda TEXT",
    "ADD COLUMN IF NOT EXISTS proxima_acao TEXT",
    "ADD COLUMN IF NOT EXISTS alerta_operacional BOOLEAN DEFAULT false"
  ];
  for (const col of visitasAlter) {
    await query('ALTER TABLE visitas ' + col).catch(()=>{});
  }
  console.log('✅ visitas');

  // NOTIFICACOES
  await query(`CREATE TABLE IF NOT EXISTS notificacoes (
    id TEXT PRIMARY KEY, tipo TEXT, titulo TEXT, mensagem TEXT,
    usuario_id TEXT, lida BOOLEAN DEFAULT false,
    lead_id TEXT, imovel_id TEXT, visita_id TEXT, criada_em TEXT,
    dados JSONB DEFAULT '{}'
  )`);
  console.log('✅ notificacoes');

  console.log('\n🎉 Todas as tabelas prontas!');
  process.exit(0);
}

main().catch(e => { console.error('Erro:', e.message); process.exit(1); });
