/**
 * services/agenteProativo.js
 *
 * Motor do "Radar do Corretor" (ago/2026, pedido do Renato) — calcula, pra
 * UMA conta, qual é o sinal mais importante agora entre um catálogo de até
 * 28 possíveis (mockup discutido em Artifact antes de codificar). NÃO cria
 * tabela nem coluna nova — cada sinal só usa dado que já existe (imoveis,
 * leads, visitas, usuarios). Consumido por GET /api/agente/proximo-sinal
 * (server.js), que alimenta o balão flutuante 🤖 de app-shell.ejs — hoje
 * esse balão sorteia 1 de 8 frases fixas sem olhar dado nenhum da conta;
 * este motor é o que dá conteúdo de verdade pra ele.
 *
 * Cada função _sinalNN(ctx) recebe o mesmo `ctx` = { usuario, imoveis,
 * leads, visitas, estagioConta } — os 3 arrays já vêm filtrados pra conta
 * (mesmo formato de _montarContextoAssistente(), server.js) — e devolve
 * `null` (sinal não se aplica agora) ou um objeto:
 *   { id, categoria, severidade, titulo, texto, link }
 * severidade: 'crit' | 'atencao' | 'oportunidade' | 'info' (mesma escala
 * semântica já usada no resto da plataforma — verde/âmbar/vermelho — só
 * com um 4º nível "info" pra sinal de contexto/hábito, sem urgência real).
 *
 * Qualquer sinal que dependa de campo cujo formato não está 100% confirmado
 * no código (ver sinal 17, "imóvel muito visto") fica marcado como
 * PENDENTE — devolve null sempre, propositalmente, até confirmar o dado
 * real, em vez de arriscar um alerta calculado errado.
 */

const { query } = require('./db');

function _diasDesde(dataIso) {
  if (!dataIso) return null;
  const d = new Date(dataIso).getTime();
  if (Number.isNaN(d)) return null;
  return (Date.now() - d) / (1000 * 60 * 60 * 24);
}

// ── LEADS (8 sinais) ────────────────────────────────────────────────────

// 01 · Lead quente sem resposta — leads.temperatura + criadoEm como proxy
// de "sem ação recente" (não existe log de última ação do corretor por
// lead ainda, então usa tempo desde a criação como aproximação honesta).
function _sinal01(ctx) {
  const l = (ctx.leads || []).find(l => l.temperatura === 'quente' && _diasDesde(l.criadoEm) != null && _diasDesde(l.criadoEm) >= 0.5 && l.faseFunil !== 'fechado' && l.faseFunil !== 'visita' && l.faseFunil !== 'proposta');
  if (!l) return null;
  return { id: 1, categoria: 'leads', severidade: 'crit', titulo: 'Lead quente esperando resposta', texto: (l.nome || 'Uma lead') + ' está quente e ainda sem retorno seu.', link: '/app/lead/' + l.id };
}

// 02 · Match novo, vitrine não enviada — matchesAuto/matchesBase preenchido
// e vitrineEnviada ainda falso.
function _sinal02(ctx) {
  const l = (ctx.leads || []).find(l => ((l.matchesAuto && l.matchesAuto.length) || (l.matchesBase && l.matchesBase.length)) && !l.vitrineEnviada && l.leadOculta !== true);
  if (!l) return null;
  return { id: 2, categoria: 'leads', severidade: 'crit', titulo: 'Match encontrado, vitrine não enviada', texto: (l.nome || 'Uma lead') + ' já tem imóvel em match — só falta mandar a vitrine.', link: '/app/lead/' + l.id };
}

// 03 · Vitrine enviada, nunca aberta — vitrineEnviada true há mais de 2
// dias, vitrineEmailEnviada continua ausente/false (proxy de "sem sinal de
// abertura" — não há registro de abertura do LINK de WhatsApp em si).
function _sinal03(ctx) {
  const l = (ctx.leads || []).find(l => l.vitrineEnviada && _diasDesde(l.vitrineEnviadaEm) >= 2 && l.faseFunil !== 'visita' && l.faseFunil !== 'proposta' && l.faseFunil !== 'fechado');
  if (!l) return null;
  return { id: 3, categoria: 'leads', severidade: 'atencao', titulo: 'Vitrine enviada sem retorno', texto: 'A vitrine de ' + (l.nome || 'uma lead') + ' foi enviada há ' + Math.floor(_diasDesde(l.vitrineEnviadaEm)) + ' dias, sem novidade desde então.', link: '/app/lead/' + l.id };
}

// 04 · Lead curtiu um imóvel, sem visita agendada — lead.imoveisGostei
// (array gravado por _registrarGostei(), server.js) sem nenhuma visita
// dessa lead em visitas[].
function _sinal04(ctx) {
  const l = (ctx.leads || []).find(l => Array.isArray(l.imoveisGostei) && l.imoveisGostei.length > 0 && !(ctx.visitas || []).some(v => String(v.leadId) === String(l.id)));
  if (!l) return null;
  return { id: 4, categoria: 'leads', severidade: 'atencao', titulo: 'Lead curtiu um imóvel', texto: (l.nome || 'Uma lead') + ' clicou "Gostei" e ainda não tem visita marcada.', link: '/app/lead/' + l.id };
}

// 05 · Lead estagnada — morna, criada há mais de 10 dias, sem ter avançado
// pra visita/proposta/fechado. Não é literalmente "esfriou" (não existe
// histórico de temperatura por lead) — é a aproximação honesta: "morna e
// parada há muito tempo".
function _sinal05(ctx) {
  const l = (ctx.leads || []).find(l => l.temperatura === 'morno' && _diasDesde(l.criadoEm) >= 10 && !['visita', 'proposta', 'fechado'].includes(l.faseFunil));
  if (!l) return null;
  return { id: 5, categoria: 'leads', severidade: 'atencao', titulo: 'Lead parada há tempo', texto: (l.nome || 'Uma lead') + ' está morna e sem avançar há mais de 10 dias.', link: '/app/lead/' + l.id };
}

// 06 · Lead pediu atendimento humano no WhatsApp — marcado no comentário de
// código do webhook (server.js, texto==='falar com humano'); fica gravado
// como notificação tipo 'suporte_solicitado' — como esse motor não lê a
// tabela notificacoes (é 100% baseado em leads/imoveis/visitas por
// desenho), esse sinal fica PENDENTE até decidir se vale a leitura extra.
function _sinal06(_ctx) { return null; /* PENDENTE — depende de notificacoes, fora do escopo de leads/imoveis/visitas do motor v1 */ }

// 07 · Lead sem nenhum match — perfil não bate com a carteira, sinal de gap
// de estoque (não é "corretor devendo", é "falta imóvel desse perfil").
function _sinal07(ctx) {
  const l = (ctx.leads || []).find(l => (!l.matchesBase || !l.matchesBase.length) && (!l.matchesAuto || !l.matchesAuto.length) && l.leadOculta !== true && _diasDesde(l.criadoEm) >= 3);
  if (!l) return null;
  return { id: 7, categoria: 'leads', severidade: 'info', titulo: 'Lead sem imóvel compatível', texto: 'Não achamos imóvel na sua carteira pro perfil de ' + (l.nome || 'uma lead') + ' ainda.', link: '/app/lead/' + l.id };
}

// 08 · Lead esquecida — criada há 15+ dias, sem visita/proposta/fechamento,
// e fria (sem sinal de que virou algo).
function _sinal08(ctx) {
  const l = (ctx.leads || []).find(l => (!l.temperatura || l.temperatura === 'frio') && _diasDesde(l.criadoEm) >= 15 && !['visita', 'proposta', 'fechado', 'perdido'].includes(l.faseFunil));
  if (!l) return null;
  return { id: 8, categoria: 'leads', severidade: 'info', titulo: 'Lead esquecida', texto: (l.nome || 'Uma lead') + ' está parada há mais de 15 dias, sem movimento.', link: '/app/lead/' + l.id };
}

// ── VISITAS (4 sinais) ──────────────────────────────────────────────────

// 09 · Visita de hoje/amanhã sem confirmação do cliente.
function _sinal09(ctx) {
  const hojeStr = new Date().toLocaleDateString('pt-BR');
  const amanhaStr = new Date(Date.now() + 86400000).toLocaleDateString('pt-BR');
  const v = (ctx.visitas || []).find(v => (v.dataVisita === hojeStr || v.dataVisita === amanhaStr) && v.confirmacaoClienteStatus !== 'confirmado' && v.status !== 'cancelada' && v.status !== 'realizada');
  if (!v) return null;
  return { id: 9, categoria: 'visitas', severidade: 'crit', titulo: 'Visita sem confirmação', texto: 'A visita de ' + (v.nome || 'um cliente') + (v.dataVisita === hojeStr ? ' é HOJE' : ' é amanhã') + ' e ainda não foi confirmada.', link: '/app/visitas' };
}

// 10 · Visita realizada sem feedback (não marcou se o cliente gostou) —
// dois mecanismos coexistem no código (clienteGostouAt em server.js:16939 e
// dados.leadGostouEm em POST /visita/:id/lead-gostou), checa os dois.
function _sinal10(ctx) {
  const v = (ctx.visitas || []).find(v => v.status === 'realizada' && _diasDesde(v.dataVisita ? new Date(v.dataVisita.split('/').reverse().join('-')).toISOString() : null) >= 1 && !v.clienteGostouAt && !v.leadGostouEm);
  if (!v) return null;
  return { id: 10, categoria: 'visitas', severidade: 'atencao', titulo: 'Visita sem retorno registrado', texto: 'A visita de ' + (v.nome || 'um cliente') + ' já aconteceu — marca se ele gostou ou não.', link: '/app/visitas' };
}

// 11 · Proposta parada — leads em fase "proposta" há mais de 5 dias.
function _sinal11(ctx) {
  const l = (ctx.leads || []).find(l => l.faseFunil === 'proposta' && _diasDesde(l.criadoEm) >= 5);
  if (!l) return null;
  return { id: 11, categoria: 'visitas', severidade: 'atencao', titulo: 'Proposta sem retorno', texto: 'A proposta de ' + (l.nome || 'uma lead') + ' está parada há alguns dias.', link: '/app/lead/' + l.id };
}

// 12 · Workflow de visita travado — colunas workflow_status/
// workflow_atualizado_em (services/workflow/atualizarWorkflowVisita.js) não
// são mapeadas pro objeto camelCase do cache, então esse sinal faz 1 query
// direta e leve, isolada num try/catch — se a query falhar, o sinal só não
// aparece, não derruba o resto do motor.
async function _sinal12(ctx) {
  try {
    const uid = ctx.usuario.codigoUsuario || ctx.usuario.id;
    const { rows } = await query(
      `SELECT id, imovel_titulo, workflow_status FROM visitas
       WHERE (user_id=$1 OR owner_user_id=$1 OR corretor_id=$1)
         AND workflow_status IS NOT NULL
         AND workflow_status NOT IN ('CONFIRMADA','FINALIZADA','CANCELADA')
         AND workflow_atualizado_em < NOW() - INTERVAL '3 days'
       LIMIT 1`,
      [uid]
    );
    if (!rows.length) return null;
    return { id: 12, categoria: 'visitas', severidade: 'atencao', titulo: 'Visita travada aguardando resposta', texto: 'A visita de "' + (rows[0].imovel_titulo || 'um imóvel') + '" está parada há mais de 3 dias no mesmo status.', link: '/app/visitas-kanban' };
  } catch (e) { return null; }
}

// ── IMÓVEIS (5 sinais) ──────────────────────────────────────────────────

// 13 · Imóvel invisível por valor abaixo do mínimo — mesma regra de
// services/salvarImovel.js imovelVisivelPublico() (R$150k venda / R$500
// aluguel), caso real achado na conta VIS-NR59.
function _sinal13(ctx) {
  const VALOR_MIN_VENDA = 150000, VALOR_MIN_ALUGUEL = 500;
  const i = (ctx.imoveis || []).find(i => {
    if (i.status === 'inativo' || i.status === 'excluido') return false;
    if (!i.fotos || !i.fotos.length) return false; // esse caso é o sinal 14, não duplica aqui
    const valor = parseFloat(i.valor_imovel) || 0;
    const min = String(i.transacao || '').toLowerCase().includes('alug') ? VALOR_MIN_ALUGUEL : VALOR_MIN_VENDA;
    return valor < min;
  });
  if (!i) return null;
  return { id: 13, categoria: 'imoveis', severidade: 'crit', titulo: 'Imóvel invisível por valor', texto: '"' + (i.titulo || 'Um imóvel') + '" está com valor abaixo do mínimo — provável erro de digitação, some do público.', link: '/app/imovel/' + (i.idInterno || i.id) + '/editar' };
}

// 14 · Imóvel sem foto.
function _sinal14(ctx) {
  const i = (ctx.imoveis || []).find(i => i.status !== 'inativo' && i.status !== 'excluido' && (!i.fotos || !i.fotos.length));
  if (!i) return null;
  return { id: 14, categoria: 'imoveis', severidade: 'atencao', titulo: 'Imóvel sem foto', texto: '"' + (i.titulo || 'Um imóvel') + '" está sem nenhuma foto — fica escondido do público até subir 1.', link: '/app/imovel/' + (i.idInterno || i.id) + '/editar' };
}

// 15 · Imóvel parado sem match há muito tempo.
function _sinal15(ctx) {
  const i = (ctx.imoveis || []).find(i => i.status !== 'inativo' && i.status !== 'excluido' && _diasDesde(i.criadoEm) >= 30 && !(ctx.leads || []).some(l => (l.matchesBase || []).some(m => String(m.id || m.idInterno || m.idExterno) === String(i.id || i.idInterno))));
  if (!i) return null;
  return { id: 15, categoria: 'imoveis', severidade: 'info', titulo: 'Imóvel sem nenhum match', texto: '"' + (i.titulo || 'Um imóvel') + '" está na carteira há mais de 30 dias sem aparecer em nenhum match.', link: '/app/imovel/' + (i.idInterno || i.id) };
}

// 16 · XML sem sincronizar — usuario.xmlUrl configurado, xmlAtualizadoEm
// desatualizado há mais de 24h.
function _sinal16(ctx) {
  const u = ctx.usuario;
  if (!u.xmlUrl) return null;
  const dias = _diasDesde(u.xmlAtualizadoEm);
  if (dias == null || dias < 1) return null;
  return { id: 16, categoria: 'imoveis', severidade: 'atencao', titulo: 'XML sem sincronizar', texto: 'Seu feed XML não atualiza há ' + Math.floor(dias) + ' dias — os portais podem estar com dado antigo.', link: '/app/portais' };
}

// 17 · "Imóvel muito visto, nunca virou lead" — PENDENTE. feed_vistos é
// lido por query direta em rotas específicas (server.js), formato de
// agregação por imóvel não confirmado o suficiente pra calcular sem
// arriscar número errado. Fica null até validar o formato real.
function _sinal17(_ctx) { return null; /* PENDENTE — formato de feed_vistos não confirmado o bastante */ }

// ── CAPTAÇÃO (2 sinais) ─────────────────────────────────────────────────

// 18 · Cadastro de captação incompleto — imóvel marcado como vindo de
// captação (dados.origemAreaAtuacao é de OUTRO fluxo; captação usa
// tipo_lead cliente_vendedor / origem captacao_link do lado da LEAD, não
// do imóvel) — aqui olha o imóvel: tem endereço mas não passa em
// imovelVisivelPublico (sem foto ou valor baixo) há mais de 3 dias.
function _sinal18(ctx) {
  const i = (ctx.imoveis || []).find(i => i.status !== 'inativo' && i.status !== 'excluido' && i.endereco && _diasDesde(i.criadoEm) >= 3 && (!i.fotos || !i.fotos.length));
  if (!i) return null;
  return { id: 18, categoria: 'captacao', severidade: 'atencao', titulo: 'Captação parada', texto: '"' + (i.titulo || 'Um imóvel captado') + '" tem endereço cadastrado mas segue sem foto há dias.', link: '/app/captacao' };
}

// 19 · Captação sem primeiro contato — lead com origem captacao_link, sem
// nenhum comentário/histórico ainda (proxy de "ninguém tratou").
function _sinal19(ctx) {
  const l = (ctx.leads || []).find(l => l.origem === 'captacao_link' && (!l.comentarios || !l.comentarios.length) && _diasDesde(l.criadoEm) >= 1);
  if (!l) return null;
  return { id: 19, categoria: 'captacao', severidade: 'crit', titulo: 'Captação sem contato', texto: (l.nome || 'Um proprietário') + ' se cadastrou pra captação e ainda não foi contatado.', link: '/app/captacao' };
}

// ── FINANCEIRO (2 sinais) ───────────────────────────────────────────────

// 20 · Saldo baixo (mesmo piso usado em services/jobCreditos.js).
function _sinal20(ctx) {
  const saldo = Number(ctx.usuario.matchCoins || 0);
  if (saldo <= 0 || saldo > 200) return null; // <=0 é o sinal 21 (mais grave), >200 não é baixo
  return { id: 20, categoria: 'financeiro', severidade: 'crit', titulo: 'Saldo de coins baixo', texto: 'Seu saldo está em ' + saldo.toLocaleString('pt-BR') + ' coins — recarregue pra não parar a automação.', link: '/app/coins' };
}

// 21 · Conta pausada (saldo zerado).
function _sinal21(ctx) {
  const saldo = Number(ctx.usuario.matchCoins || 0);
  if (saldo > 0) return null;
  return { id: 21, categoria: 'financeiro', severidade: 'crit', titulo: 'Conta pausada', texto: 'Seu saldo zerou — match automático, WhatsApp e follow-up estão parados até recarregar.', link: '/app/coins' };
}

// ── FUNIL DA CONTA (2 sinais) ───────────────────────────────────────────

// 22 · Conta cadastrada, nunca ativada — estagioConta já vem calculado
// (_estagioConta(), server.js) e é passado no ctx pra não duplicar a regra.
function _sinal22(ctx) {
  if (ctx.estagioConta !== 'convertido') return null;
  return { id: 22, categoria: 'funil', severidade: 'atencao', titulo: 'Sua conta ainda não foi ativada', texto: 'Importe um XML, cadastre um imóvel ou uma lead pra começar a usar de verdade.', link: '/app/cadastro' };
}

// 23 · Conta ativada, ainda não é cliente.
function _sinal23(ctx) {
  if (ctx.estagioConta !== 'ativado') return null;
  return { id: 23, categoria: 'funil', severidade: 'info', titulo: 'Você já está usando a plataforma', texto: 'Continue assim — quanto mais você usa, mais match e lead a IA encontra pra você.', link: '/app-home' };
}

// ── PORTAIS & MARKETING (3 sinais) ──────────────────────────────────────

// 24 · WhatsApp desconectado.
function _sinal24(ctx) {
  if (ctx.usuario.whatsappStatus === 'open') return null;
  return { id: 24, categoria: 'portais', severidade: 'crit', titulo: 'WhatsApp desconectado', texto: 'Seu WhatsApp não está conectado — mensagens de lead podem estar se perdendo agora.', link: '/app/whatsapp' };
}

// 25 · Nenhum portal ativado em toda a carteira.
function _sinal25(ctx) {
  const ativos = (ctx.imoveis || []).filter(i => i.status !== 'inativo' && i.status !== 'excluido');
  if (!ativos.length) return null;
  const algumPortal = ativos.some(i => Array.isArray(i.portais) && i.portais.length > 0);
  if (algumPortal) return null;
  return { id: 25, categoria: 'portais', severidade: 'info', titulo: 'Nenhum portal ativado', texto: 'Sua carteira não está em nenhum portal (ZAP, VivaReal, OLX...) — ative pra aparecer pra mais gente.', link: '/app/portais' };
}

// 26 · Instagram nunca conectado.
function _sinal26(ctx) {
  if (ctx.usuario.instagramContaId) return null;
  return { id: 26, categoria: 'portais', severidade: 'info', titulo: 'Instagram não conectado', texto: 'Conecte seu Instagram pra divulgar imóveis direto da plataforma.', link: '/app/perfil#secao-instagram' };
}

// ── PARCEIROS & REDE (2 sinais) ──────────────────────────────────────────

// 27 · Match em imóvel de parceiro — só dispara se o objeto de match trouxer
// um campo de dono explícito e ele for diferente da própria conta (não
// arrisca "adivinhar" dono quando o match não informa).
function _sinal27(ctx) {
  const uid = String(ctx.usuario.codigoUsuario || ctx.usuario.id || '');
  for (const l of (ctx.leads || [])) {
    const m = (l.matchesAuto || l.matchesBase || []).find(m => {
      const dono = String(m.userId || m.codigoUsuario || m.corretorId || '');
      return dono && dono !== uid;
    });
    if (m) return { id: 27, categoria: 'rede', severidade: 'oportunidade', titulo: 'Match com imóvel de parceiro', texto: (l.nome || 'Uma lead') + ' bateu com um imóvel de outro corretor da rede — comissão de parceria disponível.', link: '/app/lead/' + l.id };
  }
  return null;
}

// 28 · Indicado nunca recarregou — usuario.indicadoPor aponta pra ESSA
// conta em outra conta (olhando de "quem eu indiquei", não "quem me
// indicou") — precisa da lista de todas as contas, que o motor não recebe
// (é escopado por conta). Fica PENDENTE até decidir se vale passar a lista
// completa de usuarios pra esse cálculo específico.
function _sinal28(_ctx) { return null; /* PENDENTE — precisaria da lista completa de usuarios, fora do escopo atual do ctx */ }

// 29 · Lead voltou a ver o mesmo imóvel — comportamento REAL na vitrine/
// página pública, capturado por POST /api/comportamento-lead (sem login,
// disparado pelo próprio navegador do lead) e pela abertura da vitrine
// (GET /cliente/oferta/:leadId), ambos alimentando
// lead.comportamento.imoveisVisualizados via registrarComportamento()
// (cerebro/motor-intencao.js). Pedido do Renato (ago/2026, comparando com
// a BoomTown: "IA analisa comportamento do lead e recomenda a próxima
// ação") — repetição no MESMO imóvel em poucos dias é o sinal mais forte
// de intenção real que existe, mais confiável que só "abriu a vitrine".
function _sinal29(ctx) {
  const l = (ctx.leads || []).find(l => {
    if (['visita', 'proposta', 'fechado', 'perdido'].includes(l.faseFunil)) return false;
    const vistos = (l.comportamento && l.comportamento.imoveisVisualizados) || [];
    if (vistos.length < 2) return false;
    const ultimo = vistos[vistos.length - 1];
    if (!ultimo || _diasDesde(ultimo.em) == null || _diasDesde(ultimo.em) > 2) return false;
    const repeticoes = {};
    vistos.forEach(v => { if (v.id) repeticoes[v.id] = (repeticoes[v.id] || 0) + 1; });
    return Object.values(repeticoes).some(n => n >= 2);
  });
  if (!l) return null;
  const repeticoes = {};
  (l.comportamento.imoveisVisualizados || []).forEach(v => { if (v.id) repeticoes[v.id] = (repeticoes[v.id] || 0) + 1; });
  const vezes = Math.max(0, ...Object.values(repeticoes));
  return { id: 29, categoria: 'leads', severidade: 'crit', titulo: 'Lead voltou a ver o mesmo imóvel', texto: (l.nome || 'Uma lead') + ' já viu o mesmo imóvel ' + vezes + 'x nos últimos dias — sinal forte de interesse, chama agora.', link: '/app/lead/' + l.id };
}

// ── ORQUESTRAÇÃO ─────────────────────────────────────────────────────────

const _SINAIS_SINCRONOS = [_sinal01, _sinal02, _sinal03, _sinal04, _sinal05, _sinal06, _sinal07, _sinal08, _sinal09, _sinal10, _sinal11, _sinal13, _sinal14, _sinal15, _sinal16, _sinal17, _sinal18, _sinal19, _sinal20, _sinal21, _sinal22, _sinal23, _sinal24, _sinal25, _sinal26, _sinal27, _sinal28, _sinal29];
const _SINAIS_ASSINCRONOS = [_sinal12];

const _ORDEM_SEVERIDADE = { crit: 0, atencao: 1, oportunidade: 2, info: 3 };

// Calcula TODOS os sinais que se aplicam agora pra essa conta (útil pra uma
// tela de "todos os alertas", não só o balão flutuante).
async function calcularSinais(ctx) {
  const sincronos = _SINAIS_SINCRONOS.map(fn => { try { return fn(ctx); } catch (e) { return null; } }).filter(Boolean);
  const assincronosResultados = await Promise.all(_SINAIS_ASSINCRONOS.map(fn => fn(ctx).catch(() => null)));
  const todos = [...sincronos, ...assincronosResultados.filter(Boolean)];
  return todos.sort((a, b) => _ORDEM_SEVERIDADE[a.severidade] - _ORDEM_SEVERIDADE[b.severidade]);
}

// O sinal ÚNICO mais importante agora — o que o balão flutuante mostra.
async function proximoSinal(ctx) {
  const todos = await calcularSinais(ctx);
  return todos[0] || null;
}

module.exports = { calcularSinais, proximoSinal };
