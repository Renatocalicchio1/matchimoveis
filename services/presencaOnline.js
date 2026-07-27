// Rastreamento de presença em memória — quem está usando o sistema agora e em qual tela.
// Não persiste em banco (é dado efêmero, minuto a minuto) — some sozinho quando a janela expira.

const _presenca = new Map(); // codigoUsuario -> { nome, codigoUsuario, rota, rotaLabel, atualizadoEm }

const _ROTA_LABEL = {
  '/app-home': 'Dashboard',
  '/app/imoveis': 'Meus Imóveis',
  '/app/cadastro': 'Cadastrar Imóvel',
  '/app/leads': 'Leads',
  '/app/leads/planilha': 'Planilha de Leads',
  '/app/importar-leads': 'Importar Leads',
  '/app/captacao': 'Captação',
  '/app/visitas': 'Visitas',
  '/app/visitas-kanban': 'Visitas Kanban',
  '/app/mapa': 'Mapa',
  '/app/feed': 'Feed',
  '/app/portais': 'Portais / XML',
  '/app/assistente': 'Assistente IA',
  '/app/central': 'Central Operacional',
  '/app/notificacoes': 'Notificações',
  '/app/parceiros': 'Parceiros',
  '/app/indicacoes': 'Indicar Parceiro',
  '/app/parceria-quintoandar': 'Parceria QuintoAndar',
  '/app/coins': 'Créditos',
  '/app/perfil': 'Perfil',
  '/app/meu-site': 'Meu Site',
  '/app/whatsapp': 'WhatsApp',
};

const _ROTA_PREFIXO = [
  { prefixo: '/app/lead/', label: 'Detalhe da Lead' },
  { prefixo: '/app/imovel/', label: 'Detalhe do Imóvel' },
  { prefixo: '/app/visita', label: 'Visitas' },
];

function rotaParaLabel(caminho) {
  if (_ROTA_LABEL[caminho]) return _ROTA_LABEL[caminho];
  const prefixo = _ROTA_PREFIXO.find(p => caminho.startsWith(p.prefixo));
  if (prefixo) return prefixo.label;
  return caminho;
}

function registrar(uid, dados) {
  if (!uid) return;
  const atual = _presenca.get(uid) || {};
  _presenca.set(uid, { ...atual, ...dados, atualizadoEm: Date.now() });
}

// janelaMs: considerado "online" se teve atividade dentro desse intervalo
function listarOnline(janelaMs) {
  const janela = janelaMs || 3 * 60 * 1000;
  const agora = Date.now();
  const online = [];
  for (const [uid, dados] of _presenca.entries()) {
    const decorrido = agora - dados.atualizadoEm;
    if (decorrido <= janela) {
      online.push({ uid, ...dados, segundosAtras: Math.floor(decorrido / 1000) });
    } else {
      _presenca.delete(uid);
    }
  }
  online.sort((a, b) => a.segundosAtras - b.segundosAtras);
  return online;
}

module.exports = { registrar, listarOnline, rotaParaLabel };
