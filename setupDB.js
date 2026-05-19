require('dotenv').config();
const { query } = require('./services/db');

async function main() {
  console.log('🔧 Configurando banco de dados...\n');

  // ── LEADS ────────────────────────────────────────────────
  await query(`CREATE TABLE IF NOT EXISTS leads (
    id TEXT PRIMARY KEY,
    nome TEXT, telefone TEXT, whatsapp TEXT, contato TEXT,
    origem TEXT, status TEXT DEFAULT 'novo', fase_funil TEXT DEFAULT 'novo',
    temperatura TEXT DEFAULT 'frio', score NUMERIC DEFAULT 0,
    user_id TEXT, codigo_usuario TEXT, corretor_id TEXT, corretor_nome TEXT,
    tipo_lead TEXT DEFAULT 'cliente', tipo TEXT, bairro TEXT, cidade TEXT, estado TEXT,
    valor_max NUMERIC DEFAULT 0, quartos INTEGER DEFAULT 0, area_m2 NUMERIC DEFAULT 0,
    vagas INTEGER DEFAULT 0, extraction_status TEXT,
    perfil_ia JSONB DEFAULT '{}', mensagens JSONB DEFAULT '[]',
    matches JSONB DEFAULT '[]', matches_auto JSONB DEFAULT '[]',
    matches_base JSONB DEFAULT '[]', matches_quintoandar JSONB DEFAULT '[]',
    historico JSONB DEFAULT '[]', historico_imoveis JSONB DEFAULT '[]',
    timeline JSONB DEFAULT '[]', eventos JSONB DEFAULT '[]',
    follow_ups JSONB DEFAULT '[]', jornada JSONB DEFAULT '[]',
    deletado_por JSONB DEFAULT '[]',
    vitrine_enviada BOOLEAN DEFAULT false, vitrine_enviada_em TIMESTAMPTZ,
    vitrine_visualizada BOOLEAN DEFAULT false, vitrine_visualizada_em TIMESTAMPTZ,
    vitrine_link TEXT,
    visita_agendada BOOLEAN DEFAULT false, visita_agendada_em TIMESTAMPTZ,
    visita_solicitada_em TIMESTAMPTZ,
    ultima_mensagem TEXT, ultima_mensagem_em TIMESTAMPTZ,
    score_atualizado_em TIMESTAMPTZ,
    tipo_lead_atualizado_em TIMESTAMPTZ, tipo_lead_atualizado_por TEXT,
    imovel_vendedor JSONB DEFAULT '{}',
    imovel_escolhido JSONB DEFAULT '{}',
    imovel_visita JSONB DEFAULT '{}',
    imovel_interesse TEXT, id_anuncio TEXT,
    match_count INTEGER DEFAULT 0, match_count_base INTEGER DEFAULT 0,
    match_quintoandar_status TEXT, match_quintoandar_count INTEGER DEFAULT 0,
    match_quintoandar_at TIMESTAMPTZ,
    comissao_parceiro TEXT,
    ciclo_anterior TEXT, ciclo_seguinte TEXT,
    etapa_atual TEXT,
    wa_followup_vitrine_enviado_em TIMESTAMPTZ,
    wa_qualificacao_enviado_em TIMESTAMPTZ,
    wa_agendar_visita_enviado_em TIMESTAMPTZ,
    wa_followup_visita_enviado_em TIMESTAMPTZ,
    wa_proposta_enviado_em TIMESTAMPTZ,
    criado_em TIMESTAMPTZ DEFAULT NOW(), atualizado_em TIMESTAMPTZ DEFAULT NOW(),
    dados JSONB DEFAULT '{}'
  )`);
  await query(`CREATE INDEX IF NOT EXISTS idx_leads_user_id ON leads(user_id)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_leads_telefone ON leads(telefone)`);
  console.log('✅ leads');

  // ── VISITAS ──────────────────────────────────────────────
  await query(`CREATE TABLE IF NOT EXISTS visitas (
    id TEXT PRIMARY KEY,
    lead_id TEXT, nome TEXT, telefone TEXT, contato TEXT,
    imovel_id TEXT, imovel_titulo TEXT, imovel_bairro TEXT,
    imovel_cidade TEXT, imovel_estado TEXT, imovel_url TEXT,
    imovel_usuario_id TEXT, imovel_usuario_nome TEXT, imovel_usuario_telefone TEXT,
    data_visita TEXT, hora_visita TEXT,
    status TEXT DEFAULT 'solicitada', origem TEXT, fonte TEXT,
    user_id TEXT, corretor_id TEXT, corretor_nome TEXT, corretor_telefone TEXT,
    owner_user_id TEXT, lead_owner_id TEXT,
    usuario_destino_id TEXT, usuario_destino_nome TEXT,
    usuario_destino_perfil TEXT, usuario_destino_telefone TEXT,
    codigo_usuario TEXT,
    proprietario_nome TEXT, proprietario_telefone TEXT,
    proprietario_confirmou BOOLEAN DEFAULT false,
    confirmacao_proprietario_status TEXT,
    confirmacao_cliente_status TEXT, confirmacao_cliente_em TIMESTAMPTZ,
    confirmacao_solicitada_at TIMESTAMPTZ,
    resposta_proprietario TEXT, resposta_em TIMESTAMPTZ,
    cliente_notificado BOOLEAN DEFAULT false,
    whatsapp_cliente_link TEXT,
    pipeline_status TEXT, workflow_status TEXT,
    prioridade TEXT DEFAULT 'NORMAL',
    responsavel_operacional TEXT, responsavel_updated_at TIMESTAMPTZ,
    proxima_acao TEXT, alerta_operacional BOOLEAN DEFAULT false,
    observacoes JSONB DEFAULT '[]',
    valor_proposta TEXT, motivo_perda TEXT,
    data TEXT, data_br TEXT,
    agendada_at TIMESTAMPTZ, cancelada_at TIMESTAMPTZ,
    concluida_at TIMESTAMPTZ, realizada_em TIMESTAMPTZ,
    checkin_at TIMESTAMPTZ, visita_finalizada_at TIMESTAMPTZ,
    cliente_chegou_at TIMESTAMPTZ, no_show_at TIMESTAMPTZ,
    proposta_at TIMESTAMPTZ, proposta_updated_at TIMESTAMPTZ,
    fechado_at TIMESTAMPTZ, perdido_at TIMESTAMPTZ,
    negociacao_at TIMESTAMPTZ, cliente_gostou_at TIMESTAMPTZ,
    parceiro_confirmou_at TIMESTAMPTZ, proprietario_confirmou_at TIMESTAMPTZ,
    remarcar_at TIMESTAMPTZ, remarcar_solicitado_at TIMESTAMPTZ,
    nova_data_solicitada TEXT, nova_hora_solicitada TEXT,
    observacao_remarcacao TEXT,
    criado_em TIMESTAMPTZ DEFAULT NOW(), atualizado_em TIMESTAMPTZ DEFAULT NOW(),
    dados JSONB DEFAULT '{}'
  )`);
  await query(`CREATE INDEX IF NOT EXISTS idx_visitas_user_id ON visitas(user_id)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_visitas_lead_id ON visitas(lead_id)`);
  console.log('✅ visitas');

  // ── USUARIOS ─────────────────────────────────────────────
  await query(`CREATE TABLE IF NOT EXISTS usuarios (
    id TEXT PRIMARY KEY,
    nome TEXT, telefone TEXT, celular TEXT, email TEXT, senha TEXT,
    tipo TEXT DEFAULT 'corretor', ativo BOOLEAN DEFAULT true,
    codigo_usuario TEXT, creci TEXT, cpf TEXT,
    match_coins INTEGER DEFAULT 0, match_coins_total INTEGER DEFAULT 0,
    match_coins_bonus_inicial INTEGER DEFAULT 0,
    whatsapp_instance TEXT, whatsapp_status TEXT, whatsapp_numero TEXT,
    bloqueados JSONB DEFAULT '[]',
    lat DOUBLE PRECISION, lng DOUBLE PRECISION, endereco TEXT,
    xml_url TEXT, xml_atualizado_em TIMESTAMPTZ, xml_total INTEGER DEFAULT 0,
    historico_assistente JSONB DEFAULT '[]',
    criado_em TIMESTAMPTZ DEFAULT NOW(), atualizado_em TIMESTAMPTZ DEFAULT NOW(),
    dados JSONB DEFAULT '{}'
  )`);
  console.log('✅ usuarios');

  // ── IMOVEIS ──────────────────────────────────────────────
  await query(`CREATE TABLE IF NOT EXISTS imoveis (
    id TEXT PRIMARY KEY,
    id_externo TEXT, id_original TEXT, id_interno TEXT, codigo_imovel TEXT,
    titulo TEXT, tipo TEXT, categoria TEXT, transacao TEXT, condicao TEXT,
    status TEXT DEFAULT 'ativo',
    bairro TEXT, cidade TEXT, estado TEXT, endereco TEXT, numero TEXT,
    complemento TEXT, cep TEXT,
    latitude DOUBLE PRECISION, longitude DOUBLE PRECISION,
    andar TEXT, torre TEXT, unidade TEXT, condominio_nome TEXT,
    valor_imovel NUMERIC DEFAULT 0, condominio NUMERIC DEFAULT 0,
    iptu NUMERIC DEFAULT 0, area_m2 NUMERIC DEFAULT 0, area_total NUMERIC DEFAULT 0,
    quartos INTEGER DEFAULT 0, suites INTEGER DEFAULT 0,
    banheiros INTEGER DEFAULT 0, vagas INTEGER DEFAULT 0, salas INTEGER DEFAULT 0,
    descricao TEXT, descricao_editada BOOLEAN DEFAULT false,
    fotos JSONB DEFAULT '[]', proprietario JSONB DEFAULT '{}',
    portais JSONB DEFAULT '{}', corretor JSONB DEFAULT '{}',
    fonte TEXT, source TEXT,
    user_id TEXT, usuario_id TEXT, codigo_usuario TEXT,
    usuario_nome TEXT, usuario_perfil TEXT, usuario_telefone TEXT,
    corretor_id TEXT, corretor_nome TEXT, corretor_email TEXT, corretor_telefone TEXT,
    url TEXT, url_publica TEXT, tour_virtual TEXT,
    inativado_em TIMESTAMPTZ, inativado_por TEXT,
    xml_url TEXT, last_update TIMESTAMPTZ,
    criado_em TIMESTAMPTZ DEFAULT NOW(), atualizado_em TIMESTAMPTZ DEFAULT NOW(),
    dados JSONB DEFAULT '{}'
  )`);
  await query(`CREATE INDEX IF NOT EXISTS idx_imoveis_user_id ON imoveis(user_id)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_imoveis_bairro ON imoveis(bairro)`);
  console.log('✅ imoveis');

  // ── NOTIFICACOES ─────────────────────────────────────────
  await query(`CREATE TABLE IF NOT EXISTS notificacoes (
    id TEXT PRIMARY KEY,
    tipo TEXT, titulo TEXT, mensagem TEXT,
    usuario_id TEXT, lida BOOLEAN DEFAULT false,
    lead_id TEXT, imovel_id TEXT, visita_id TEXT,
    criada_em TEXT,
    dados JSONB DEFAULT '{}'
  )`);
  await query(`CREATE INDEX IF NOT EXISTS idx_notificacoes_usuario_id ON notificacoes(usuario_id)`);
  console.log('✅ notificacoes');

  console.log('\n🎉 Banco de dados 100% configurado!');
  process.exit(0);
}

main().catch(e => { console.error('Erro:', e.message); process.exit(1); });
