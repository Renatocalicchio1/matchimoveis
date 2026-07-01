const mc = require('./cerebro/match-core');
require('./services/db').query("SELECT * FROM leads WHERE id='1782878225802'").then(async r=>{
  const row = r.rows[0];
  const lead = {...(row.dados||{}), ...row, userId: row.user_id, mapaIntencao: row.mapa_intencao, perfilIA: row.perfil_ia};
  console.log('perfilIA:', JSON.stringify(lead.perfilIA));
  await mc.processar({lead, mensagem:'', canal:'ImovelWeb', userId: row.user_id});
  console.log('Match gerado');
}).catch(console.error);
