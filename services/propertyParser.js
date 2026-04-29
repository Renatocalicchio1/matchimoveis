function parseProperty(text='') {
  const t = text.toLowerCase();

  const get = (regex) => {
    const m = t.match(regex);
    return m ? m[1] : null;
  };

  const bairros = [
    'bela vista','moema','pinheiros','vila mariana','morumbi',
    'brooklin','perdizes','jabaquara','santana','tatuape',
    'lapa','barra funda','mirandopolis'
  ];

  const bairro = bairros.find(b => t.includes(b)) || null;

  return {
    tipo: t.includes('apartamento') ? 'Apartamento' :
          t.includes('casa') ? 'Casa' : null,

    bairro,

    valor: get(/r\$[\s]?([\d\.\,]+)/),

    area: get(/(\d+)\s*m²/),

    quartos: get(/(\d+)\s*quartos?/),

    suites: get(/(\d+)\s*suite/),

    banheiros: get(/(\d+)\s*banheiro/),

    vagas: get(/(\d+)\s*vagas?/)
  };
}

module.exports = { parseProperty };
