const contexto = require('./cerebro/contexto');
const intencao = require('./cerebro/intencao');

const testes = {
  'SAUDACAO': ['oi','oii','oiii','ola','olá','hey','opa','bom dia','boa tarde','boa noite','tudo bem?','tudo bom?','e ai?'],
  'CADASTRAR_LEAD': ['cadastra lead João, 47999991234','novo cliente: Maria, 11988881234','pode cadastrar um cliente pra mim?','quero cadastrar um lead','anota esse cliente: Pedro, 47977771234','salva esse lead','adiciona um novo cliente','tenho um novo interessado'],
  'BUSCAR_IMOVEL': ['preciso de apartamento 2 quartos na Vila Andrade até 800 mil','tem casa com 3 dorm no Brooklin?','apartamento entre 500 e 700 mil','quero apartamento até 600 mil','meu cliente quer casa 3 quartos com 2 vagas','tem algo no Jaguaré até 1 milhão?','procurando apto 2 dorm com suíte','cliente busca cobertura na Vila Olímpia','encontrar imóvel até 500k','imóvel 3 quartos 2 vagas até 900 mil'],
  'IMPORTAR_XML': ['quero importar meus imóveis','como importo do Tecimob?','trazer imóveis do Rankim','subir xml','importar do meu CRM','tenho um feed xml','como faço para importar?','puxar imóveis do Vista'],
  'EXPORTAR_XML': ['gera xml vivareal','quero publicar no ZAP','exportar para OLX','gerar feed para ImovelWeb','xml para Chaves na Mão','publicar imóveis no VivaReal','quero subir no ZAP','gera xml 123i'],
  'VISITAS': ['quantas visitas tenho?','visitas hoje','visitas pendentes','tem visita marcada?','quem confirmou visita?','visitas da semana','minhas visitas'],
  'NOTIFICACOES': ['tenho alguma notificação?','tem algo novo?','minhas notificações','o que aconteceu?','novidades'],
  'LEADS': ['quantos leads tenho?','ver leads','leads com match','meus leads','leads sem match','leads quentes','quantos clientes tenho?','leads novos'],
  'IMOVEIS': ['meus imóveis','quantos imóveis tenho?','ver carteira','imóveis ativos','imóveis sem proprietário','valor médio da carteira','quais bairros tenho?']
};

let erros = [];
let ok = 0;

for (const [esperado, frases] of Object.entries(testes)) {
  for (const frase of frases) {
    const ctx = contexto.analisar(frase, [], [], []);
    const int = intencao.detectar(frase.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,''));
    const detectado = ctx.intencao || (int && int.tipo) || 'null';
    const acertou = detectado === esperado || 
      (esperado === 'BUSCAR_IMOVEL' && ctx.temDados) ||
      (esperado === 'VISITAS' && detectado && detectado.includes('visita')) ||
      (esperado === 'LEADS' && detectado && detectado.includes('lead')) ||
      (esperado === 'IMOVEIS' && detectado && detectado.includes('imovel')) ||
      (esperado === 'NOTIFICACOES' && detectado && detectado.includes('notif'));
    
    if (!acertou) {
      erros.push({ frase, esperado, detectado });
    } else {
      ok++;
    }
  }
}

console.log('\n✅ OK:', ok, '| ❌ ERROS:', erros.length);
console.log('\n❌ FRASES COM ERRO:');
erros.forEach(e => console.log('  "'+e.frase+'" → esperado: '+e.esperado+' | detectado: '+e.detectado));
