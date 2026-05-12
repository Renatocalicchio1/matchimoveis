function limparTelefone(v){
  return String(v || '').replace(/\D/g,'');
}

function detectarWorkflowVisita(visita = {}) {
  const proprietarioTelefone = limparTelefone(visita.proprietarioTelefone || visita.proprietarioCelular || visita.proprietarioWhatsapp || '');
  const parceiroTelefone = limparTelefone(visita.imovelUsuarioTelefone || visita.parceiroTelefone || visita.corretorParceiroTelefone || '');
  const donoLeadId = String(visita.userId || visita.corretorId || visita.usuarioDestinoId || '');
  const donoImovelId = String(visita.imovelUsuarioId || visita.donoImovelId || '');
  const temParceiro = donoImovelId && donoLeadId && donoImovelId !== donoLeadId;

  const status = String(visita.status || '').toLowerCase().trim();

  if (
    status === 'confirmada' ||
    status === 'confirmado' ||
    status.includes('confirm')
  ) {
    return {
      workflowStatus: 'CONFIRMADA',
      workflowResponsavel: 'cliente_corretor',
      workflowProximaAcao: 'Notificar cliente e acompanhar visita',
      workflowLabel: '✅ Visita confirmada'
    };
  }

  if (
    status === 'cancelada' ||
    status === 'cancelado' ||
    status.includes('cancel')
  ) {
    return {
      workflowStatus: 'CANCELADA',
      workflowResponsavel: 'corretor',
      workflowProximaAcao: 'Reativar atendimento ou oferecer outro imóvel',
      workflowLabel: '❌ Visita cancelada'
    };
  }

  if (
    status === 'remarcar' ||
    status === 'reagendar' ||
    status.includes('remar')
  ) {
    return {
      workflowStatus: 'REMARCAR',
      workflowResponsavel: 'corretor',
      workflowProximaAcao: 'Pedir nova data ao cliente',
      workflowLabel: '📅 Precisa remarcar'
    };
  }

  if (temParceiro) {
    return {
      workflowStatus: 'AGUARDANDO_PARCEIRO',
      workflowResponsavel: 'corretor_parceiro',
      workflowProximaAcao: 'Falar com o corretor parceiro para confirmar disponibilidade',
      workflowLabel: '🤝 Aguardando corretor parceiro',
      workflowWhatsappDestino: parceiroTelefone,
      workflowWhatsappTexto: montarMensagemParceiro(visita)
    };
  }

  if (proprietarioTelefone) {
    return {
      workflowStatus: 'AGUARDANDO_PROPRIETARIO',
      workflowResponsavel: 'proprietario',
      workflowProximaAcao: 'Notificar proprietário para confirmar disponibilidade',
      workflowLabel: '🏠 Aguardando proprietário',
      workflowWhatsappDestino: proprietarioTelefone,
      workflowWhatsappTexto: montarMensagemProprietario(visita)
    };
  }

  return {
    workflowStatus: 'AGUARDANDO_CORRETOR',
    workflowResponsavel: 'corretor_dono_lead',
    workflowProximaAcao: 'Corretor deve falar manualmente com o responsável pelo imóvel',
    workflowLabel: '👤 Aguardando ação do corretor'
  };
}

function montarMensagemProprietario(visita = {}) {
  const cliente = visita.nome || 'cliente';
  const imovel = visita.imovelTitulo || visita.imovelBairro || 'seu imóvel';
  const data = visita.dataVisita || '';
  const hora = visita.horaVisita || '';
  const quando = data ? ` para ${data}${hora ? ' às ' + hora : ''}` : '';
  return `Olá! O cliente ${cliente} solicitou visita ao imóvel ${imovel}${quando}. O imóvel está disponível para visita?`;
}

function montarMensagemParceiro(visita = {}) {
  const cliente = visita.nome || 'cliente';
  const imovel = visita.imovelTitulo || visita.imovelBairro || 'imóvel';
  const data = visita.dataVisita || '';
  const hora = visita.horaVisita || '';
  const quando = data ? ` para ${data}${hora ? ' às ' + hora : ''}` : '';
  return `Olá! Tenho um cliente interessado em visitar o imóvel ${imovel}${quando}. Você consegue confirmar disponibilidade? Cliente: ${cliente}.`;
}

function aplicarWorkflowVisita(visita = {}) {
  const workflow = detectarWorkflowVisita(visita);
  return {
    ...visita,
    ...workflow,
    workflowAtualizadoEm: new Date().toISOString()
  };
}

module.exports = {
  detectarWorkflowVisita,
  aplicarWorkflowVisita,
  montarMensagemProprietario,
  montarMensagemParceiro
};
