function fluxoVisita(v, usuarioLogado){

  const eMeuImovel = String(v.imovelUserId || v.userId || v.usuarioId) === String(usuarioLogado.id);
  const temProprietario = !!v.proprietarioTelefone;
  const eParceiro = !eMeuImovel;

  // 1. IMÓVEL DO USUÁRIO
  if(eMeuImovel){

    if(temProprietario){
      return {
        tipo: "PROPRIETARIO",
        destino: v.proprietarioTelefone,
        acao: "NOTIFICAR_PROPRIETARIO"
      };
    }

    return {
      tipo: "MANUAL",
      destino: usuarioLogado.telefone,
      acao: "CONFIRMACAO_MANUAL"
    };
  }

  // 2. IMÓVEL DE PARCEIRO
  if(eParceiro){

    if(temProprietario){
      return {
        tipo: "PARCEIRO_COM_PROPRIETARIO",
        destino: v.usuarioDestinoTelefone,
        acao: "FLUXO_PARCEIRO"
      };
    }

    return {
      tipo: "PARCEIRO_SEM_PROPRIETARIO",
      destino: v.usuarioDestinoTelefone,
      acao: "NOTIFICAR_PARCEIRO"
    };
  }

}
module.exports = { fluxoVisita };
