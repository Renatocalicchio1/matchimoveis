function resolverDestinoVisita(v, user){

  const ehParceiro =
    v.usuarioDestinoTelefone ||
    v.corretorTelefone ||
    v.usuarioDestinoId;

  if (ehParceiro) {
    return {
      tipo: 'PARCEIRO',
      nome: v.usuarioDestinoNome || v.corretorNome || 'Corretor parceiro',
      telefone: v.usuarioDestinoTelefone || v.corretorTelefone || '',
      origem: 'corretor_parceiro'
    };
  }

  if (v.proprietarioTelefone) {
    return {
      tipo: 'PROPRIETARIO',
      nome: v.proprietarioNome || 'Proprietário',
      telefone: v.proprietarioTelefone,
      origem: 'proprietario'
    };
  }

  return {
    tipo: 'CORRETOR',
    nome: user.nome || 'Corretor',
    telefone: user.celular || user.telefone || '',
    origem: 'fallback_corretor'
  };
}

module.exports = { resolverDestinoVisita };
