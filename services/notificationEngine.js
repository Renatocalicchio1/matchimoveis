// Motor de Retenção, Fase 7 — Notification Engine (ver CLAUDE.md).
// Função central chamada ANTES de qualquer canal disparar: decide se e
// como notificar, generalizando o dedup+cooldown que já existia (job de
// propensão) e resolvendo o gargalo #4 (nenhum canal tinha limite
// agregado). Não substitui o envio de cada canal — só decide.
const { getPool, dbOk } = require('./db');
const { criarNotificacao } = require('./salvarNotificacao');
const { atualizarUsuario } = require('./salvarUsuario');
const { enviarPush } = require('./pushNotificacoes');

// 3 tiers do desenho da Fase 7 — urgente tem teto próprio (fora do limite
// agregado normal, mas pequeno, pra não virar alarme falso constante).
const CAP_NORMAL_DIARIO = 6;   // informativo + reconhecimento, juntos
const CAP_URGENTE_DIARIO = 3;

function _hojeBrasilia() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
}

// Dedup por tipo (+ lead, quando aplicável) numa janela de horas —
// generaliza o padrão já usado no job de propensão.
async function _dedupRecente(usuarioId, tipo, leadId, horasJanela) {
  if (!dbOk()) return false;
  try {
    const r = await getPool().query(
      `SELECT 1 FROM notificacoes WHERE usuario_id=$1 AND tipo=$2 AND ($3::text IS NULL OR lead_id=$3)
       AND criada_em::timestamptz > now() - ($4 || ' hours')::interval LIMIT 1`,
      [String(usuarioId), tipo, leadId ? String(leadId) : null, String(horasJanela || 24)]
    );
    return r.rows.length > 0;
  } catch (e) { console.error('[notificationEngine] dedup', e.message); return false; }
}

async function _capDiario(usuarioId, tier) {
  if (!dbOk()) return true;
  try {
    const r = await getPool().query(`SELECT dados->'notifCap' AS cap FROM usuarios WHERE codigo_usuario=$1 OR id=$1 LIMIT 1`, [String(usuarioId)]);
    const hoje = _hojeBrasilia();
    let cap = (r.rows[0] && r.rows[0].cap) || {};
    if (cap.data !== hoje) cap = { data: hoje, normal: 0, urgente: 0 };
    const chave = tier === 'urgente' ? 'urgente' : 'normal';
    const limite = tier === 'urgente' ? CAP_URGENTE_DIARIO : CAP_NORMAL_DIARIO;
    if ((cap[chave] || 0) >= limite) return false;
    cap[chave] = (cap[chave] || 0) + 1;
    await atualizarUsuario(usuarioId, { notifCap: cap });
    return true;
  } catch (e) { console.error('[notificationEngine] capDiario', e.message); return true; }
}

// evento: { tipo, tier ('urgente'|'informativo'|'reconhecimento'), titulo,
// mensagem, leadId, url, dedupHoras }. Só decide + registra no sino —
// quem chama que sabe se também quer mandar WhatsApp/email (canais
// próprios, não duplicados aqui).
async function _notificacoesPausadas(usuarioId) {
  if (!dbOk()) return false;
  try {
    const r = await getPool().query(`SELECT COALESCE((dados->>'notificacoesPausadas')::boolean, false) AS pausado FROM usuarios WHERE codigo_usuario=$1 OR id=$1 LIMIT 1`, [String(usuarioId)]);
    return !!(r.rows[0] && r.rows[0].pausado);
  } catch (e) { console.error('[notificationEngine] pausado', e.message); return false; }
}

// Motor de Retenção, Fase 16 — Segurança contra spam (ver CLAUDE.md):
// dedup (generaliza o padrão do job de propensão), cap diário agregado
// (gargalo #4 da Fase 1) e este kill-switch — 3 camadas antes de
// qualquer notificação sair. Nível/urgência não vira exceção.
async function decidirNotificacao(usuarioId, evento) {
  if (!usuarioId || !evento || !evento.tipo || !evento.titulo) return { enviado: false, motivo: 'evento_invalido' };
  const tier = evento.tier || 'informativo';

  if (await _notificacoesPausadas(usuarioId)) return { enviado: false, motivo: 'opt_out' };

  if (await _dedupRecente(usuarioId, evento.tipo, evento.leadId, evento.dedupHoras)) {
    return { enviado: false, motivo: 'dedup' };
  }
  const podeEnviar = await _capDiario(usuarioId, tier);
  if (!podeEnviar) return { enviado: false, motivo: 'cap_diario' };

  try {
    await criarNotificacao({
      id: Date.now().toString() + '_' + Math.random().toString(36).slice(2, 7),
      tipo: evento.tipo,
      titulo: evento.titulo,
      mensagem: evento.mensagem || '',
      usuarioId: String(usuarioId),
      leadId: evento.leadId || '',
      lida: false,
      criadaEm: new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })
    });
  } catch (e) { console.error('[notificationEngine] criarNotificacao', e.message); }

  // Push só no tier urgente (Fase 7) — informativo/reconhecimento ficam
  // só no sino + digest periódico, nunca push avulso.
  if (tier === 'urgente') {
    enviarPush(usuarioId, { titulo: evento.titulo, corpo: evento.mensagem, url: evento.url || '/app/resumo' }).catch(() => {});
  }
  return { enviado: true };
}

module.exports = { decidirNotificacao };
