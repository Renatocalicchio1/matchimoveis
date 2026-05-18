const fs = require('fs');
const path = require('path');
require('dotenv').config();

const { query, dbOk } = require('./db');

const DATA_DIR = process.env.RENDER ? '/opt/render/project/src/data' : path.join(__dirname, '..');

function lerJSON(file) {
  const p = path.join(DATA_DIR, file);
  if (!fs.existsSync(p)) return [];
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch(e) { return []; }
}

async function migrar() {
  console.log('🔄 Iniciando migração JSON → PostgreSQL...');

  if (!await dbOk()) {
    console.error('❌ DATABASE_URL não configurada ou banco inacessível');
    process.exit(1);
  }

  // Criar schema
  console.log('📋 Criando tabelas...');
  const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  await query(schema);
  console.log('✅ Tabelas criadas');

  // Migrar users
  const users = lerJSON('users.json');
  console.log(`👤 Migrando ${users.length} usuários...`);
  for (const u of users) {
    try {
      const dados = { ...u };
      ['id','nome','email','senha','telefone','tipo','ativo','creditos','whatsappInstance','whatsappStatus','whatsappNumero','bloqueados','plano'].forEach(k => delete dados[k]);
      await query(`
        INSERT INTO users (id,nome,email,senha,telefone,tipo,ativo,creditos,whatsapp_instance,whatsapp_status,whatsapp_numero,bloqueados,plano,dados)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
        ON CONFLICT (id) DO NOTHING
      `, [
        u.id, u.nome||'', u.email||'', u.senha||'', u.telefone||'',
        u.tipo||'corretor', u.ativo!==false, u.creditos||0,
        u.whatsappInstance||null, u.whatsappStatus||null, u.whatsappNumero||null,
        JSON.stringify(u.bloqueados||[]), u.plano||'basico',
        JSON.stringify(dados)
      ]);
    } catch(e) { console.error('Erro user', u.id, e.message); }
  }
  console.log('✅ Usuários migrados');

  // Migrar leads
  const leads = lerJSON('data.json');
  console.log(`📋 Migrando ${leads.length} leads...`);
  for (const l of leads) {
    try {
      const dados = { ...l };
      ['id','nome','telefone','whatsapp','contato','origem','status','faseFunil','temperatura','score','userId','codigoUsuario','corretorId','tipoLead','perfilIA','mensagens','matches','matchesAuto','matchesBase','historico','timeline','eventos','followUps','deletadoPor','vitrineEnviada','vitrineEnviadaEm','visitaAgendada','visitaAgendadaEm','imovelVendedor','comissaoParceiro','cicloAnterior','cicloSeguinte','criadoEm','data_cadastro'].forEach(k => delete dados[k]);
      await query(`
        INSERT INTO leads (id,nome,telefone,whatsapp,contato,origem,status,fase_funil,temperatura,score,user_id,codigo_usuario,tipo_lead,perfil_ia,mensagens,matches,matches_auto,matches_base,historico,timeline,eventos,follow_ups,deletado_por,vitrine_enviada,vitrine_enviada_em,visita_agendada,visita_agendada_em,imovel_vendedor,comissao_parceiro,ciclo_anterior,ciclo_seguinte,dados,criado_em)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31,$32,$33)
        ON CONFLICT (id) DO NOTHING
      `, [
        l.id, l.nome||'', l.telefone||'', l.whatsapp||'', l.contato||'',
        l.origem||'whatsapp', l.status||'novo', l.faseFunil||'novo',
        l.temperatura||'frio', l.score||0,
        l.userId||l.codigoUsuario||l.corretorId||null,
        l.codigoUsuario||l.userId||null, l.tipoLead||'cliente',
        JSON.stringify(l.perfilIA||{}), JSON.stringify(l.mensagens||[]),
        JSON.stringify(l.matches||[]), JSON.stringify(l.matchesAuto||[]),
        JSON.stringify(l.matchesBase||[]), JSON.stringify(l.historico||[]),
        JSON.stringify(l.timeline||[]), JSON.stringify(l.eventos||[]),
        JSON.stringify(l.followUps||[]), JSON.stringify(l.deletadoPor||[]),
        l.vitrineEnviada||false, l.vitrineEnviadaEm||null,
        l.visitaAgendada||false, l.visitaAgendadaEm||null,
        l.imovelVendedor ? JSON.stringify(l.imovelVendedor) : null,
        l.comissaoParceiro||null, l.cicloAnterior||null, l.cicloSeguinte||null,
        JSON.stringify(dados),
        l.criadoEm||l.data_cadastro||new Date().toISOString()
      ]);
    } catch(e) { console.error('Erro lead', l.id, e.message); }
  }
  console.log('✅ Leads migradas');

  // Migrar visitas
  const visitas = lerJSON('visitas.json');
  console.log(`📅 Migrando ${visitas.length} visitas...`);
  for (const v of visitas) {
    try {
      const dados = { ...v };
      ['id','leadId','lead_id','nome','telefone','contato','imovelId','imovelTitulo','imovelBairro','dataVisita','horaVisita','status','origem','userId','corretorId','ownerUserId','imovelUsuarioId','proprietarioNome','proprietarioTelefone','respostaProprietario','confirmacaoClienteStatus','obs','data','createdAt'].forEach(k => delete dados[k]);
      await query(`
        INSERT INTO visitas (id,lead_id,nome,telefone,contato,imovel_id,imovel_titulo,imovel_bairro,data_visita,hora_visita,status,origem,user_id,corretor_id,owner_user_id,imovel_usuario_id,proprietario_nome,proprietario_telefone,resposta_proprietario,confirmacao_cliente_status,obs,dados,criado_em)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23)
        ON CONFLICT (id) DO NOTHING
      `, [
        v.id, v.leadId||v.lead_id||null, v.nome||'',
        (v.telefone||'').replace(/\D/g,''), (v.contato||v.telefone||'').replace(/\D/g,''),
        v.imovelId||null, v.imovelTitulo||'', v.imovelBairro||'',
        v.dataVisita||null, v.horaVisita||null, v.status||'solicitada',
        v.origem||'sistema', v.userId||null, v.corretorId||null,
        v.ownerUserId||null, v.imovelUsuarioId||null,
        v.proprietarioNome||'', (v.proprietarioTelefone||'').replace(/\D/g,''),
        v.respostaProprietario||null, v.confirmacaoClienteStatus||null,
        v.obs||'', JSON.stringify(dados),
        v.data||v.createdAt||new Date().toISOString()
      ]);
    } catch(e) { console.error('Erro visita', v.id, e.message); }
  }
  console.log('✅ Visitas migradas');

  console.log('🎉 Migração concluída!');
  process.exit(0);
}

migrar().catch(e => { console.error('❌ Erro fatal:', e.message); process.exit(1); });
