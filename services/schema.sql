-- MatchImóveis — Schema PostgreSQL

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  nome TEXT,
  email TEXT,
  senha TEXT,
  telefone TEXT,
  tipo TEXT DEFAULT 'corretor',
  ativo BOOLEAN DEFAULT true,
  creditos INTEGER DEFAULT 0,
  whatsapp_instance TEXT,
  whatsapp_status TEXT,
  whatsapp_numero TEXT,
  bloqueados JSONB DEFAULT '[]',
  plano TEXT DEFAULT 'basico',
  dados JSONB DEFAULT '{}',
  criado_em TIMESTAMPTZ DEFAULT NOW(),
  atualizado_em TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS leads (
  id TEXT PRIMARY KEY,
  nome TEXT,
  telefone TEXT,
  whatsapp TEXT,
  contato TEXT,
  origem TEXT DEFAULT 'whatsapp',
  status TEXT DEFAULT 'novo',
  fase_funil TEXT DEFAULT 'novo',
  temperatura TEXT DEFAULT 'frio',
  score INTEGER DEFAULT 0,
  user_id TEXT REFERENCES users(id),
  codigo_usuario TEXT,
  tipo_lead TEXT DEFAULT 'cliente',
  perfil_ia JSONB DEFAULT '{}',
  mensagens JSONB DEFAULT '[]',
  matches JSONB DEFAULT '[]',
  matches_auto JSONB DEFAULT '[]',
  matches_base JSONB DEFAULT '[]',
  historico JSONB DEFAULT '[]',
  timeline JSONB DEFAULT '[]',
  eventos JSONB DEFAULT '[]',
  follow_ups JSONB DEFAULT '[]',
  deletado_por JSONB DEFAULT '[]',
  vitrine_enviada BOOLEAN DEFAULT false,
  vitrine_enviada_em TIMESTAMPTZ,
  visita_agendada BOOLEAN DEFAULT false,
  visita_agendada_em TIMESTAMPTZ,
  imovel_vendedor JSONB,
  comissao_parceiro TEXT,
  ciclo_anterior TEXT,
  ciclo_seguinte TEXT,
  dados JSONB DEFAULT '{}',
  criado_em TIMESTAMPTZ DEFAULT NOW(),
  atualizado_em TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS visitas (
  id TEXT PRIMARY KEY,
  lead_id TEXT,
  nome TEXT,
  telefone TEXT,
  contato TEXT,
  imovel_id TEXT,
  imovel_titulo TEXT,
  imovel_bairro TEXT,
  data_visita TEXT,
  hora_visita TEXT,
  status TEXT DEFAULT 'solicitada',
  origem TEXT DEFAULT 'sistema',
  user_id TEXT,
  corretor_id TEXT,
  owner_user_id TEXT,
  imovel_usuario_id TEXT,
  proprietario_nome TEXT,
  proprietario_telefone TEXT,
  resposta_proprietario TEXT,
  confirmacao_cliente_status TEXT,
  obs TEXT,
  dados JSONB DEFAULT '{}',
  criado_em TIMESTAMPTZ DEFAULT NOW(),
  atualizado_em TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS imoveis (
  id TEXT PRIMARY KEY,
  codigo_interno TEXT,
  titulo TEXT,
  tipo TEXT,
  finalidade TEXT DEFAULT 'venda',
  bairro TEXT,
  cidade TEXT,
  estado TEXT,
  cep TEXT,
  endereco TEXT,
  numero TEXT,
  complemento TEXT,
  valor NUMERIC,
  valor_condominio NUMERIC,
  valor_iptu NUMERIC,
  area NUMERIC,
  quartos INTEGER,
  suites INTEGER,
  banheiros INTEGER,
  vagas INTEGER,
  descricao TEXT,
  user_id TEXT,
  codigo_usuario TEXT,
  ativo BOOLEAN DEFAULT true,
  fotos JSONB DEFAULT '[]',
  diferenciais JSONB DEFAULT '[]',
  proprietario JSONB DEFAULT '{}',
  portais JSONB DEFAULT '[]',
  dados JSONB DEFAULT '{}',
  criado_em TIMESTAMPTZ DEFAULT NOW(),
  atualizado_em TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS notificacoes (
  id TEXT PRIMARY KEY,
  tipo TEXT,
  titulo TEXT,
  mensagem TEXT,
  usuario_id TEXT,
  lida BOOLEAN DEFAULT false,
  dados JSONB DEFAULT '{}',
  criado_em TIMESTAMPTZ DEFAULT NOW()
);

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_leads_user_id ON leads(user_id);
CREATE INDEX IF NOT EXISTS idx_leads_telefone ON leads(telefone);
CREATE INDEX IF NOT EXISTS idx_leads_criado_em ON leads(criado_em DESC);
CREATE INDEX IF NOT EXISTS idx_visitas_lead_id ON visitas(lead_id);
CREATE INDEX IF NOT EXISTS idx_visitas_user_id ON visitas(user_id);
CREATE INDEX IF NOT EXISTS idx_imoveis_user_id ON imoveis(user_id);
CREATE INDEX IF NOT EXISTS idx_notificacoes_usuario_id ON notificacoes(usuario_id);
