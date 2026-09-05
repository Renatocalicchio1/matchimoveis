// Next Best Action (ETAPA 5 de implementação, set/2026) — "o que este
// corretor deveria fazer agora?", respondido por regra determinística, não
// IA/ML (pedido explícito: "não crie IA complexa pra isso... comece com
// regras determinísticas"). Cada card do Radar (/app/resumo) que passa por
// aqui ganha `prioridade` (alta/media/baixa) e `motivo` — a resposta visível
// pra "por que estou vendo isso?", que o corretor vê no card.
//
// Puro de propósito (sem DB, sem sessão, sem cache global) — recebe só o
// contexto mínimo já calculado pelo chamador, pra dar pra testar sem
// precisar instanciar nada do resto da plataforma. Ver test/nextBestAction.test.js.
'use strict';

const PRIORIDADE = { ALTA: 'alta', MEDIA: 'media', BAIXA: 'baixa' };

// Ordem numérica pra desempate de sort (menor = mais prioritário) — usado
// pelo chamador como critério SECUNDÁRIO, depois de recência (decisão já
// tomada antes: "priorizar sempre o que aconteceu mais recente" continua
// valendo como critério primário do Radar).
const PESO_PRIORIDADE = { alta: 0, media: 1, baixa: 2 };

// Sinais cobertos, na ordem dos exemplos do pedido original:
// visita não confirmada, lead quente sem contato, match alto, cliente
// parado, XML desatualizado. `contexto` traz só os campos que cada regra
// precisa — nenhuma regra lê o objeto inteiro de lead/imóvel/usuário.
function avaliarPrioridade(tipoSinal, contexto = {}) {
  switch (tipoSinal) {
    case 'visita_pendente': {
      // Tempo-sensível por natureza: visita sem confirmação atrasa o
      // próprio compromisso — sempre alta, não depende de quanto tempo já
      // passou (diferente dos outros sinais, que escalam com o tempo).
      return { prioridade: PRIORIDADE.ALTA, motivo: 'Visita aguardando confirmação — sem resposta, o compromisso fica em risco.' };
    }

    case 'lead_quente_sem_contato': {
      const horasSemContato = Number(contexto.horasSemContato) || 0;
      if (horasSemContato >= 4) {
        return { prioridade: PRIORIDADE.ALTA, motivo: 'Lead quente há ' + Math.round(horasSemContato) + 'h sem retorno do corretor — esfria rápido.' };
      }
      return { prioridade: PRIORIDADE.MEDIA, motivo: 'Lead quente aguardando contato.' };
    }

    case 'match_novo': {
      // "Alta" só quando o match é forte de verdade (score alto) — um
      // match fraco não merece o mesmo destaque que um forte, mesmo sendo
      // igualmente "novo". Sem contexto.score, fica média (não penaliza
      // por falta de dado).
      const score = contexto.score != null ? Number(contexto.score) : null;
      if (score != null && score >= 80) {
        return { prioridade: PRIORIDADE.ALTA, motivo: 'Match de ' + score + ' pontos — compatibilidade forte, vale contato rápido.' };
      }
      return { prioridade: PRIORIDADE.MEDIA, motivo: 'Novo match encontrado automaticamente.' };
    }

    case 'cliente_parado': {
      const diasParado = Number(contexto.diasParado) || 0;
      return { prioridade: PRIORIDADE.MEDIA, motivo: 'Sem novidade há ' + Math.round(diasParado) + ' dias — pode estar esfriando.' };
    }

    case 'xml_desatualizado': {
      const horasSemSync = Number(contexto.horasSemSync) || 0;
      return { prioridade: PRIORIDADE.BAIXA, motivo: 'XML sem sincronizar há ' + Math.round(horasSemSync / 24) + ' dia(s) — carteira pode estar desatualizada nos portais.' };
    }

    default:
      // Sinal não catalogado — nunca quebra o chamador, só não prioriza.
      return { prioridade: PRIORIDADE.BAIXA, motivo: '' };
  }
}

// Comparador pronto pra usar como critério de DESEMPATE (nunca como
// critério primário — recência continua vindo antes, decisão de produto já
// tomada e documentada no CLAUDE.md). Uso: `(b._ts||0)-(a._ts||0) ||
// compararPrioridade(a,b) || a.ordem-b.ordem`.
function compararPrioridade(cardA, cardB) {
  const pa = PESO_PRIORIDADE[cardA?.prioridade] ?? 3;
  const pb = PESO_PRIORIDADE[cardB?.prioridade] ?? 3;
  return pa - pb;
}

module.exports = { avaliarPrioridade, compararPrioridade, PRIORIDADE, PESO_PRIORIDADE };
