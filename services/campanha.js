const { query } = require('./db');
const { enviarEmail } = require('./email');
const { emailValido } = require('./validarEmailFormato');

const BASE_URL = process.env.RENDER ? 'https://www.matchimoveis.ia.br' : 'http://localhost:3000';

// ── Modelos de e-mail (2 tipos, cada um com várias variações) ──────────────
// "pagina": convida a se cadastrar na plataforma (link geral).
// "demanda": convida a ver quantos clientes tem na região agora (link /demanda).
// A cada envio sorteia o TIPO e depois a VARIAÇÃO dentro dele — mistura os
// dois modelos na mesma fila em vez de mandar tudo de um tipo só, e nunca
// repete o mesmo texto/assunto sempre igual (padrão robótico = spam).
const MODELOS = {
  // Framework PAS (Problema → Agitação → Solução) em todas as variações:
  // nomeia uma dor real do corretor, mostra o custo de não resolver, e só
  // então apresenta a Match Imóveis como solução — com 1 único CTA por
  // email. Assuntos sem emoji de alarme/caps (gatilho de spam), sem
  // promessa não verificável (ex: prazo garantido de venda).
  // Fecho de cada corpo (ago/2026): "1.000 créditos grátis" trocado por uma
  // frase concreta do que dá pra fazer com esse crédito na hora (qualificar
  // lead, mandar vitrine) — "créditos" é jargão que quem nunca usou o
  // sistema não entende ainda; e 3 das 8 variações tinham literalmente o
  // mesmo fecho ("Comece agora com 1.000 créditos grátis, sem
  // compromisso."), o que ia contra o próprio princípio de nunca repetir
  // texto (padrão robótico = sinal de spam).
  pagina: [
    {
      assunto: 'Você está perdendo leads pra quem responde primeiro',
      corpo: `Olá {nome},

Todo dia, alguém procura um imóvel na sua região — e quem responde primeiro, com o imóvel certo, é quem fecha negócio.

A maioria dos corretores descobre o lead horas depois: mensagem perdida no WhatsApp, imóvel certo esquecido na planilha, visita nunca agendada.

A Match Imóveis resolve isso sozinha, 24 horas por dia:

• Cruza cada lead com os imóveis certos da sua carteira e da rede
• Monta a vitrine e envia pro cliente automaticamente
• Agenda a visita sem você precisar lembrar

Sem mensalidade fixa e sem comissão sobre venda — só criar a conta já libera crédito suficiente pra qualificar e mandar vitrine pra dezenas de leads, sem gastar nada agora.

— Equipe Match Imóveis`
    },
    {
      assunto: 'O corretor que usa IA fecha mais rápido que você',
      corpo: `Olá {nome},

Enquanto você responde um cliente no WhatsApp, um corretor que usa IA já está atendendo três — sem perder qualidade e sem esquecer ninguém.

A Match Imóveis faz por você:

• Cruza automaticamente cada lead com os imóveis certos
• Monta a vitrine e agenda a visita sozinha
• Funciona 24 horas por dia, mesmo fora do seu horário

Criar a conta é grátis e libera crédito na hora — dá pra testar o cruzamento automático com seus primeiros leads sem pagar nada.

— Equipe Match Imóveis`
    },
    {
      assunto: 'Sua carteira de imóveis pode estar rendendo mais',
      corpo: `Olá {nome},

Todo imóvel parado na carteira é uma venda que não está acontecendo. Na maioria das vezes o problema não é o imóvel — é não cruzar ele com o lead certo, na hora certa.

A Match Imóveis faz esse cruzamento sozinha, o dia inteiro:

• Recebe cada novo lead automaticamente
• Encontra os imóveis compatíveis na sua carteira e na rede
• Envia a vitrine sem você precisar lembrar

Sem cartão de crédito: você cria a conta, já recebe crédito grátis, e testa o sistema com leads de verdade antes de decidir se vale continuar.

— Equipe Match Imóveis`
    },
    {
      assunto: 'Enquanto você dorme, seus leads continuam chegando',
      corpo: `Olá {nome},

Lead não escolhe horário: chega de madrugada, no fim de semana, no meio de uma visita com outro cliente. Quem demora a responder, perde pro corretor que responde primeiro.

A Match Imóveis trabalha por você 24 horas por dia:

• Recebe o lead assim que ele chega
• Encontra o imóvel certo automaticamente
• Envia a vitrine sem depender da sua disponibilidade

Comece agora — a conta já nasce com crédito suficiente pra rodar o cruzamento automático nos primeiros leads, de graça.

— Equipe Match Imóveis`
    },
    {
      assunto: 'Sua planilha de leads não te avisa quando esfria',
      corpo: `Olá {nome},

Lead numa planilha não muda de cor sozinho quando esfria. Enquanto ninguém percebe, ele já fechou com outro corretor que respondeu primeiro.

A Match Imóveis cuida disso por você:

• Cruza cada lead com o imóvel certo assim que ele chega
• Manda a vitrine sem você precisar lembrar de ninguém
• Avisa quando um lead esquenta, pra você não perder o timing

Sem mensalidade fixa. A conta abre com crédito grátis pra você testar de verdade, não só olhar a tela.

— Equipe Match Imóveis`
    },
    {
      assunto: 'Cada dia sem resposta é um lead a menos fechando com você',
      corpo: `Olá {nome},

Um lead que espera 1 dia de resposta já procurou outro corretor. Não é falta de interesse — é falta de velocidade, e isso custa venda todo mês.

A Match Imóveis responde por você, na hora:

• Recebe o lead e já cruza com os imóveis compatíveis
• Monta e envia a vitrine automaticamente
• Não depende de você estar online pra funcionar

Cadastro rápido e sem custo — o crédito inicial já dá pra qualificar leads e mandar vitrine, sem tirar nada do bolso.

— Equipe Match Imóveis`
    },
    {
      assunto: 'Imagine ter um assistente que nunca esquece um lead',
      corpo: `Olá {nome},

A maioria dos corretores perde venda não por falta de imóvel bom, mas por esquecer de responder um lead no momento certo.

A Match Imóveis é esse assistente que nunca falha:

• Cruza automaticamente cada lead com sua carteira e a rede
• Envia a vitrine certa, pro lead certo, na hora certa
• Trabalha sozinha, 24 horas por dia

Teste com leads de verdade: a conta já vem com crédito grátis, suficiente pra ver o sistema funcionando antes de decidir continuar.

— Equipe Match Imóveis`
    },
    {
      assunto: 'Você não precisa só da sua carteira pra fechar negócio',
      corpo: `Olá {nome},

Quando o imóvel certo não está na sua carteira, a venda para ali — a não ser que você tenha acesso ao que outros corretores parceiros também têm.

Na Match Imóveis:

• Cada lead é cruzado com a sua carteira E com a rede de parceiros
• Mais opções pro cliente, mais chance de fechar pra você
• Tudo automático, sem precisar ligar pra ninguém

Sem compromisso: crie a conta, use o crédito grátis que já vem com ela, e veja funcionando antes de pensar em pagar qualquer coisa.

— Equipe Match Imóveis`
    }
  ],
  demanda: [
    {
      assunto: 'Quantas pessoas buscam imóvel na sua região agora',
      corpo: `Olá {nome},

Agora mesmo, tem gente procurando imóvel na sua cidade e no seu bairro — não é estimativa, é dado real, minerado pela nossa IA todos os dias.

Em segundos você descobre:

• Quantos interessados reais existem na sua região
• Em quais bairros a demanda está maior
• Sem custo pra consultar, sem compromisso

E não é só ver o número: ao criar sua conta, esses leads já entram nela — você abre o painel e já tem gente pra atender hoje mesmo, não precisa esperar chegar cliente do zero.

Quem chega primeiro, atende primeiro.

— Equipe Match Imóveis`
    },
    {
      assunto: 'Tem lead esperando por um corretor na sua região',
      corpo: `Olá {nome},

Não são leads genéricos de cadastro — são pessoas reais buscando imóvel na sua cidade agora, identificadas em tempo real pela nossa IA.

• Veja quantos existem na sua região agora mesmo
• Sem custo pra consultar
• Sua conta já nasce com esses leads dentro — comece a atender hoje, não amanhã

— Equipe Match Imóveis`
    },
    {
      assunto: 'Sua região tem demanda — você só não viu o número ainda',
      corpo: `Olá {nome},

Descubra agora, de graça, quantas pessoas estão buscando imóvel no seu bairro e na sua cidade neste momento.

• Consulta gratuita, sem cadastro
• Sem mensalidade e sem comissão
• Leve esses leads pra sua conta e comece a atender no mesmo dia — ela já abre com eles dentro

— Equipe Match Imóveis`
    },
    {
      assunto: 'Alguém pode estar procurando imóvel perto de você agora',
      corpo: `Olá {nome},

Enquanto você lê este email, pode ter alguém buscando exatamente um imóvel na sua região — e a gente já sabe quem é.

• Veja o número real da sua região
• Grátis e sem cadastro
• Sua conta já entra com essas leads pra você atender — nada de começar do zero

Leva menos de 1 minuto pra consultar.

— Equipe Match Imóveis`
    },
    {
      assunto: 'Outros corretores da sua região já viram esse número',
      corpo: `Olá {nome},

Enquanto você não consulta, outros corretores da sua cidade já estão vendo quantos interessados existem por região — e chegando primeiro nesses leads.

• Descubra a demanda real da sua região agora
• Consulta gratuita, sem compromisso
• Sua conta já nasce com esses leads dentro, pronta pra atender

— Equipe Match Imóveis`
    },
    {
      assunto: 'Qual bairro da sua cidade tem mais gente procurando imóvel?',
      corpo: `Olá {nome},

A gente já sabe: alguns bairros têm muito mais gente procurando imóvel do que outros — e isso muda toda semana.

• Veja o comparativo de demanda por bairro na sua cidade
• Sem custo pra consultar, sem letra miúda
• Comece a atender esses leads no mesmo dia — sua conta já abre com eles

— Equipe Match Imóveis`
    },
    {
      assunto: 'Antes de decidir qualquer coisa, veja esse número',
      corpo: `Olá {nome},

Sem compromisso nenhum: dá pra ver, de graça, quantas pessoas estão buscando imóvel na sua região agora — e decidir depois se vale a pena continuar.

• Consulta 100% gratuita, sem cartão, sem cadastro obrigatório
• Números reais, atualizados pela nossa IA todos os dias
• Se decidir continuar, sua conta já entra com esses leads dentro

— Equipe Match Imóveis`
    },
    {
      assunto: 'O primeiro corretor a ver o lead costuma ser o que fecha',
      corpo: `Olá {nome},

Não é sorte: quem vê o lead primeiro e responde rápido tem muito mais chance de fechar. E o primeiro passo é saber quantos leads existem na sua região.

• Consulte agora, de graça, a demanda da sua região
• Sem compromisso
• Sua conta já abre com esses leads prontos pra atender

— Equipe Match Imóveis`
    }
  ],
  // ── Follow-ups automáticos (jul/2026) ──────────────────────────────────
  // 3 estágios do funil dessa campanha, cada um dispara 24h depois do
  // gatilho correspondente, 1 vez só por contato (ver followup1/2/3_enviado_em
  // e enviarProximo() — quem já recebeu não recebe de novo mesmo rodando o
  // job todo dia). Mesmo framework PAS e esquema de HTML dos modelos acima,
  // só o ângulo do texto muda pra soar como reengajamento, não repetição.

  // Estágio 1: mandou o 1º email, não abriu em 24h — reforça a mesma
  // proposta com um ângulo/assunto diferente (não repete o que já foi
  // ignorado). CTA leva pra página inicial, igual ao modelo "pagina".
  followup1: [
    {
      assunto: 'Você viu esse e-mail? Só reforçando',
      corpo: `Olá {nome},

Te mandei um e-mail sobre a Match Imóveis, mas imagino que deve ter passado batido na correria do dia a dia.

Resumindo em 1 frase: a gente cruza cada lead com o imóvel certo da sua carteira e da rede, automaticamente, 24 horas por dia — sem você precisar ficar de olho na planilha.

• Recebe o lead
• Encontra o imóvel compatível
• Manda a vitrine pro cliente sozinha

Dá uma olhada quando puder, é grátis pra testar.

— Equipe Match Imóveis`
    },
    {
      assunto: 'Reenviando — pode ter passado despercebido',
      corpo: `Olá {nome},

Sei que a caixa de entrada de corretor não para, então vou direto ao ponto: a Match Imóveis existe pra resolver um problema específico — lead que demora a ser atendido e acaba fechando com outro corretor.

Ela faz isso sozinha:

• Cruza o lead com os imóveis certos
• Monta a vitrine automaticamente
• Agenda a visita sem você precisar lembrar

1.000 créditos grátis pra testar, sem cartão.

— Equipe Match Imóveis`
    },
    {
      assunto: 'Um lembrete rápido sobre a Match Imóveis',
      corpo: `Olá {nome},

Passando de novo porque acho que isso pode te ajudar de verdade: enquanto você atende um cliente, outros leads continuam chegando — e quem demora a responder, perde negócio.

A Match Imóveis resolve isso automaticamente:

• Cruza cada lead com o imóvel certo
• Envia a vitrine sozinha
• Funciona mesmo fora do seu horário

Teste grátis, sem compromisso.

— Equipe Match Imóveis`
    },
    {
      assunto: 'Isso pode estar te custando vendas sem você perceber',
      corpo: `Olá {nome},

A maioria dos corretores só percebe o lead perdido quando é tarde demais — mensagem que ficou sem resposta, imóvel certo esquecido na planilha.

A Match Imóveis evita isso: cruza automaticamente cada lead com o imóvel certo da sua carteira e da rede, e manda a vitrine sozinha.

• Sem mensalidade fixa
• Sem comissão sobre venda
• 1.000 créditos grátis pra começar

Dá uma conferida quando puder.

— Equipe Match Imóveis`
    },
    {
      assunto: 'Deixei isso passar? Segue de novo',
      corpo: `Olá {nome},

Talvez esse e-mail tenha se perdido no meio de tantos outros — normal, corretor recebe muito e-mail. Mas acho que vale a pena você dar uma olhada.

A Match Imóveis:

• Recebe cada lead novo automaticamente
• Cruza com os imóveis compatíveis da sua carteira e da rede
• Envia a vitrine sem você precisar lembrar

Testa grátis, com 1.000 créditos pra começar.

— Equipe Match Imóveis`
    },
    {
      assunto: 'Corretores que usam isso fecham mais rápido',
      corpo: `Olá {nome},

Você já deve ter reparado que quem responde primeiro o lead certo, na maioria das vezes, é quem fecha o negócio.

A Match Imóveis existe pra te colocar nessa posição sempre:

• Cruza o lead com o imóvel certo automaticamente
• Monta e envia a vitrine sozinha
• Trabalha por você mesmo quando você está ocupado

Comece agora, grátis, com 1.000 créditos.

— Equipe Match Imóveis`
    },
    {
      assunto: 'Ainda dá tempo de ver como funciona',
      corpo: `Olá {nome},

Não sei se chegou a ver o e-mail anterior, então resumo rápido: a Match Imóveis cruza automaticamente cada lead que chega com os imóveis certos da sua carteira — sem você precisar procurar manualmente.

• Funciona 24h por dia
• Envia a vitrine sozinha pro cliente
• Sem mensalidade obrigatória

Vale a pena conferir, é grátis pra testar.

— Equipe Match Imóveis`
    },
    {
      assunto: 'Sua carteira pode estar rendendo mais que isso',
      corpo: `Olá {nome},

Reforçando o que te mandei antes: a maior parte dos imóveis parados na carteira não tem problema nenhum — só não foram cruzados com o lead certo na hora certa.

A Match Imóveis faz esse cruzamento sozinha, o tempo todo:

• Recebe o lead
• Encontra o imóvel compatível
• Manda a vitrine automaticamente

Teste agora, sem cartão de crédito, com 1.000 créditos grátis.

— Equipe Match Imóveis`
    },
    {
      assunto: 'De novo aqui — pode valer os 2 minutos',
      corpo: `Olá {nome},

Sei que sua caixa de entrada não para, mas queria te dar mais uma chance de ver isso: a Match Imóveis conecta automaticamente cada lead novo com o imóvel certo da sua carteira ou da rede.

• Sem precisar cruzar manualmente
• Vitrine enviada sozinha pro cliente
• Funciona mesmo fora do seu horário comercial

Grátis pra testar, com 1.000 créditos de bônus.

— Equipe Match Imóveis`
    },
    {
      assunto: 'Talvez isso resolva um problema que você já tem',
      corpo: `Olá {nome},

Se você já perdeu um lead por demorar a responder, esse e-mail é pra você. A Match Imóveis cruza automaticamente cada lead com os imóveis certos e manda a vitrine sozinha — 24 horas por dia.

• Sem mensalidade fixa
• Sem comissão sobre venda
• Comece grátis, com 1.000 créditos pra testar

Dá uma olhada, é rápido.

— Equipe Match Imóveis`
    }
  ],
  // Estágio 2: abriu o e-mail (curiosidade real), mas não criou conta —
  // reforça que já viu, remove fricção (é grátis/rápido), reenvia o link.
  followup2: [
    {
      assunto: 'Vi que você deu uma olhada — faltou só criar a conta',
      corpo: `Olá {nome},

Notei que você abriu o e-mail sobre a Match Imóveis — só não chegou a criar a conta ainda.

É rápido e sem custo pra começar:

• Cadastro leva menos de 2 minutos
• Você já sai com 1.000 créditos grátis pra testar
• Sem cartão de crédito, sem compromisso

Vale a pena finalizar — os leads da sua região não esperam.

— Equipe Match Imóveis`
    },
    {
      assunto: 'Faltou só um passo pra você começar a usar',
      corpo: `Olá {nome},

Você chegou a ver a proposta da Match Imóveis, mas o cadastro ainda não foi feito. Fica só esse detalhe entre você e começar a receber leads cruzados automaticamente com sua carteira.

• Grátis pra criar a conta
• 1.000 créditos de bônus já na entrada
• Leva menos tempo que ler esse e-mail

Termina o cadastro quando puder.

— Equipe Match Imóveis`
    },
    {
      assunto: 'Ainda dá tempo de finalizar seu cadastro',
      corpo: `Olá {nome},

Vi que você teve interesse na Match Imóveis, mas o cadastro ficou pela metade. Sem problema — o link continua disponível, e a conta já nasce com 1.000 créditos grátis pra você testar sem gastar nada.

• Cadastro rápido, sem burocracia
• Sem mensalidade obrigatória
• Comece a receber leads cruzados automaticamente

Fico à disposição se tiver qualquer dúvida.

— Equipe Match Imóveis`
    },
    {
      assunto: 'Não deixa esse cadastro pela metade',
      corpo: `Olá {nome},

Você já deu uma conferida na Match Imóveis — agora é só finalizar o cadastro pra sua conta começar a funcionar de verdade.

• 1.000 créditos grátis assim que você entra
• Sem cartão, sem compromisso
• Leva menos de 2 minutos

Enquanto isso, os leads da sua região continuam passando.

— Equipe Match Imóveis`
    },
    {
      assunto: 'O que falta é só 1 clique',
      corpo: `Olá {nome},

Reparei que você já conferiu a Match Imóveis mas ainda não criou sua conta. É bem rápido, e você já sai com 1.000 créditos de bônus pra usar como quiser.

• Sem custo pra cadastrar
• Sem mensalidade obrigatória
• Comece a atender lead cruzado automaticamente hoje mesmo

Termina quando puder, o link continua valendo.

— Equipe Match Imóveis`
    },
    {
      assunto: 'Você chegou perto — falta só o cadastro',
      corpo: `Olá {nome},

Vi que você teve interesse na plataforma. Pra começar a usar de verdade só falta criar a conta — é grátis e você já entra com 1.000 créditos pra testar sem compromisso.

• Cadastro rápido
• Sem cartão de crédito
• Leads cruzados automaticamente com sua carteira

Se travou em algum ponto, é só responder esse e-mail.

— Equipe Match Imóveis`
    },
    {
      assunto: 'Ainda com aquele e-mail em aberto?',
      corpo: `Olá {nome},

Notei que você chegou a abrir a mensagem sobre a Match Imóveis. Pra aproveitar de verdade, só falta o cadastro — que é grátis e rápido.

• 1.000 créditos de bônus na entrada
• Sem mensalidade obrigatória
• Vitrine enviada automaticamente pros seus leads

Vale a pena terminar agora.

— Equipe Match Imóveis`
    },
    {
      assunto: 'Seu cadastro na Match Imóveis está esperando',
      corpo: `Olá {nome},

Você já viu do que se trata — agora é só criar a conta pra começar a receber leads cruzados automaticamente com os imóveis da sua carteira.

• Grátis pra cadastrar
• 1.000 créditos já na entrada
• Sem cartão, sem burocracia

Fico à disposição se precisar de ajuda com o cadastro.

— Equipe Match Imóveis`
    },
    {
      assunto: 'Poucos minutos separam você de começar',
      corpo: `Olá {nome},

Você já conferiu a proposta da Match Imóveis. O próximo passo é rápido: criar sua conta, que já vem com 1.000 créditos grátis pra testar sem gastar nada.

• Sem mensalidade obrigatória
• Sem comissão sobre venda
• Leads cruzados automaticamente com sua carteira

Termina o cadastro quando tiver um minuto.

— Equipe Match Imóveis`
    },
    {
      assunto: 'Reforçando — o cadastro é rápido e grátis',
      corpo: `Olá {nome},

Sei que a rotina de corretor não para, mas queria reforçar: você já viu a Match Imóveis, e falta só o cadastro pra começar a usar. Não tem custo, e você já sai com 1.000 créditos de bônus.

• Menos de 2 minutos pra cadastrar
• Sem cartão de crédito
• Comece a receber leads cruzados automaticamente

Qualquer dúvida, é só responder esse e-mail.

— Equipe Match Imóveis`
    }
  ],
  // Estágio 3: já criou a conta, mas não comprou nenhum combo — não é
  // "cadastre-se" (já tem conta), então o CTA leva pro login, não pra
  // landing page (ver track/click em server.js, caso modelo_usado==='followup3').
  // Foco: explicar o próximo passo dentro da própria plataforma.
  followup3: [
    {
      assunto: 'Sua conta na Match Imóveis já está pronta pra receber leads',
      corpo: `Olá {nome},

Vi que você já criou sua conta na Match Imóveis — só falta um passo pra ela começar a te trazer leads de verdade: escolher um combo dentro da plataforma.

• Você entra com o mesmo login que já criou
• Escolhe o combo que cabe no seu momento
• Os leads da sua região entram direto na sua carteira

Entra na sua conta e dá uma olhada nos combos disponíveis.

— Equipe Match Imóveis`
    },
    {
      assunto: 'Falta só escolher um combo pra começar de verdade',
      corpo: `Olá {nome},

Sua conta na Match Imóveis já existe — o que ainda não aconteceu foi escolher um combo de leads. É esse passo que faz os leads da sua região começarem a entrar na sua carteira.

• Login com os mesmos dados do cadastro
• Combos com preços pra cada momento
• Sem mensalidade obrigatória, você escolhe quando quiser

Entra na plataforma quando puder pra ver as opções.

— Equipe Match Imóveis`
    },
    {
      assunto: 'Sua conta está esperando você escolher um combo',
      corpo: `Olá {nome},

Você já tem conta na Match Imóveis, então o próximo passo é simples: entrar e escolher um combo de leads pra começar a atender de verdade.

• Acesso com o login que você já criou
• Vários tamanhos de combo, pra caber no seu momento
• Compra única, sem compromisso de recorrência

Dá uma olhada nos combos direto na plataforma.

— Equipe Match Imóveis`
    },
    {
      assunto: 'O que falta pra sua conta começar a valer a pena',
      corpo: `Olá {nome},

Reparei que você já se cadastrou mas ainda não pegou nenhum combo. Sem o combo, a conta fica sem leads entrando de verdade — é ele que ativa isso.

• Entre com o login que já tem
• Veja os combos disponíveis pra sua região
• Comece a receber leads assim que escolher

Vale a pena conferir agora.

— Equipe Match Imóveis`
    },
    {
      assunto: 'Sua carteira ainda está vazia de leads — resolve rápido',
      corpo: `Olá {nome},

Sua conta na Match Imóveis já existe, mas sem um combo escolhido os leads não chegam até você. É rápido de resolver:

• Faça login com os dados do seu cadastro
• Escolha o combo que faz sentido pra você agora
• Os leads da sua região já entram assim que confirmar

Entra na plataforma e dá uma olhada.

— Equipe Match Imóveis`
    },
    {
      assunto: 'Você está a um passo de receber leads de verdade',
      corpo: `Olá {nome},

Sua conta já está pronta — o único passo que falta é escolher um combo de leads dentro da plataforma. Sem isso, a conta fica ativa mas sem leads chegando pra você.

• Login com o que você já cadastrou
• Combos pra diferentes tamanhos de carteira
• Você escolhe quando (e se) quiser comprar mais

Confere as opções quando tiver um tempo.

— Equipe Match Imóveis`
    },
    {
      assunto: 'Ainda não escolheu um combo? Fica fácil resolver',
      corpo: `Olá {nome},

Vi que sua conta na Match Imóveis já existe, mas nenhum combo foi escolhido ainda. É esse passo que faz os leads da sua região começarem a entrar na sua carteira de verdade.

• Entra com o login que já criou
• Veja os combos e o que cada um entrega
• Sem mensalidade obrigatória

Dá uma olhada quando puder.

— Equipe Match Imóveis`
    },
    {
      assunto: 'Seus créditos de boas-vindas ainda estão aí',
      corpo: `Olá {nome},

Você ganhou créditos de boas-vindas quando criou sua conta na Match Imóveis, mas pra receber leads de verdade da sua região é preciso escolher um combo dentro da plataforma.

• Login com os dados do seu cadastro
• Combos com preços pra cada momento do seu negócio
• Ativa assim que você escolher

Entra na conta e confere as opções.

— Equipe Match Imóveis`
    },
    {
      assunto: 'Um lembrete sobre sua conta na Match Imóveis',
      corpo: `Olá {nome},

Sua conta já foi criada, mas ainda não tem combo ativo — e é o combo que faz os leads da sua região chegarem até você.

• Faça login normalmente
• Veja os combos disponíveis
• Comece a atender assim que escolher um

Não deixa a conta parada, vale a pena conferir.

— Equipe Match Imóveis`
    },
    {
      assunto: 'Falta pouco pra sua conta começar a trazer resultado',
      corpo: `Olá {nome},

Reforçando: sua conta na Match Imóveis já está criada, só falta escolher um combo pra ela começar a te trazer leads de verdade.

• Entre com o login que já tem
• Escolha o combo que cabe no seu momento
• Leads da sua região entram direto na carteira

Se tiver qualquer dúvida sobre os combos, é só responder esse e-mail.

— Equipe Match Imóveis`
    }
  ]
};

function _sorteia(lista) { return lista[Math.floor(Math.random() * lista.length)]; }
function _sortearModelo() {
  const tipo = Math.random() < 0.5 ? 'pagina' : 'demanda';
  return { tipo, ...(_sorteia(MODELOS[tipo])) };
}

// ── DDD por região (prioridade de envio) ────────────────────────────────────
const _DDD_SP = ['11','12','13','14','15','16','17','18','19'];
const _DDD_RJ = ['21','22','24'];
const _DDD_SC = ['47','48','49'];
function _dddDigits(celular) {
  let d = String(celular || '').replace(/\D/g, '');
  if (d.length >= 12 && d.startsWith('55')) d = d.slice(2);
  return d.slice(0, 2);
}
function _calcularDddGrupo(celular) {
  const ddd = _dddDigits(celular);
  if (_DDD_SP.includes(ddd)) return 0;
  if (_DDD_RJ.includes(ddd)) return 1;
  if (_DDD_SC.includes(ddd)) return 2;
  return 3;
}
function _pareceCorretor(nome, email) {
  const t = (String(nome || '') + ' ' + String(email || '')).toLowerCase();
  return /corretor|corretora|imobiliari|broker/.test(t);
}

let _colunasProntas = false;
async function _garantirColunas() {
  if (_colunasProntas) return;
  await query(`ALTER TABLE campanha_contatos ADD COLUMN IF NOT EXISTS ddd_grupo INT`);
  await query(`ALTER TABLE campanha_contatos ADD COLUMN IF NOT EXISTS parece_corretor BOOLEAN DEFAULT false`);
  await query(`ALTER TABLE campanha_contatos ADD COLUMN IF NOT EXISTS email_valido BOOLEAN`);
  await query(`ALTER TABLE campanha_contatos ADD COLUMN IF NOT EXISTS modelo_usado TEXT`);
  await query(`ALTER TABLE campanha_contatos ADD COLUMN IF NOT EXISTS titulo_usado TEXT`);
  await query(`ALTER TABLE campanha_contatos ADD COLUMN IF NOT EXISTS corpo_usado TEXT`);
  await query(`ALTER TABLE campanha_contatos ADD COLUMN IF NOT EXISTS aberto_em TIMESTAMP`);
  await query(`ALTER TABLE campanha_contatos ADD COLUMN IF NOT EXISTS clicado_em TIMESTAMP`);
  await query(`ALTER TABLE campanha_contatos ADD COLUMN IF NOT EXISTS followup1_enviado_em TIMESTAMP`);
  await query(`ALTER TABLE campanha_contatos ADD COLUMN IF NOT EXISTS followup2_enviado_em TIMESTAMP`);
  await query(`ALTER TABLE campanha_contatos ADD COLUMN IF NOT EXISTS followup3_enviado_em TIMESTAMP`);
  // "Atender" manualmente pelo WhatsApp (jul/2026) — quem clicou (admin ou
  // conta admin secundária), pra colorir a linha e evitar 2 pessoas
  // chamando o mesmo lead. Cor guardada junto (não via join) porque é a cor
  // QUE A CONTA TINHA no momento do atendimento — se o superadmin trocar a
  // cor dela depois, atendimentos antigos mantêm a cor de quando aconteceram.
  await query(`ALTER TABLE campanha_contatos ADD COLUMN IF NOT EXISTS atendido_por TEXT`);
  await query(`ALTER TABLE campanha_contatos ADD COLUMN IF NOT EXISTS atendido_por_nome TEXT`);
  await query(`ALTER TABLE campanha_contatos ADD COLUMN IF NOT EXISTS atendido_por_cor TEXT`);
  await query(`ALTER TABLE campanha_contatos ADD COLUMN IF NOT EXISTS atendido_em TIMESTAMP`);
  // Diferente de atendido_por (que é "quem ficou responsável por esse
  // contato", setado 1x no primeiro clique) — isso aqui marca toda vez que
  // o botão de WhatsApp manual foi clicado de fato (mensagem aberta pra
  // envio), pra distinguir na tela quem já foi contactado de quem ainda não
  // foi, mesmo que os dois já estejam atribuídos ao mesmo sub-admin.
  await query(`ALTER TABLE campanha_contatos ADD COLUMN IF NOT EXISTS wa_manual_enviado_em TIMESTAMP`);
  await query(`CREATE TABLE IF NOT EXISTS campanha_config (
    id INT PRIMARY KEY DEFAULT 1,
    ativo BOOLEAN DEFAULT false,
    atualizado_em TIMESTAMP DEFAULT NOW()
  )`);
  await query(`INSERT INTO campanha_config (id, ativo) VALUES (1, false) ON CONFLICT (id) DO NOTHING`);
  _colunasProntas = true;
  await _limparInvalidosAntigos();
}

// Prioridade calculada 1x no import — evita recalcular DDD/regex a cada
// query de envio. Roda automaticamente pra quem ainda não tem (contatos
// importados antes dessa coluna existir).
async function _backfillPrioridadePendente() {
  await _garantirColunas();
  const { rows } = await query(`SELECT id, nome, email, celular FROM campanha_contatos WHERE ddd_grupo IS NULL LIMIT 500`);
  if (!rows.length) return 0;
  for (const c of rows) {
    await query(
      `UPDATE campanha_contatos SET ddd_grupo=$1, parece_corretor=$2 WHERE id=$3`,
      [_calcularDddGrupo(c.celular), _pareceCorretor(c.nome, c.email), c.id]
    );
  }
  return rows.length;
}

async function importarContatos(contatos) {
  await _garantirColunas();
  let importados = 0, duplicados = 0;
  for (const c of contatos) {
    try {
      await query(
        `INSERT INTO campanha_contatos (nome, email, celular, ddd_grupo, parece_corretor) VALUES ($1,$2,$3,$4,$5) ON CONFLICT (email) DO NOTHING`,
        [c.nome || '', c.email.toLowerCase().trim(), c.celular || '', _calcularDddGrupo(c.celular), _pareceCorretor(c.nome, c.email)]
      );
      importados++;
    } catch (e) { duplicados++; }
  }
  return { importados, duplicados };
}

// ── Validação de email (formato + MX do domínio) ────────────────────────────
// 100k+ contatos não dá pra validar tudo de uma vez (DNS custa tempo) —
// roda em lotes pequenos via job periódico (server.js). Email inválido é
// EXCLUÍDO da tabela (não só marcado) — não faz sentido guardar um contato
// que nunca vai poder receber nada.
async function validarProximoLote(limite = 50) {
  await _garantirColunas();
  const { rows } = await query(
    `SELECT id, email FROM campanha_contatos WHERE email_valido IS NULL LIMIT $1`,
    [limite]
  );
  let validos = 0, invalidos = 0;
  for (const c of rows) {
    const valido = await emailValido(c.email);
    if (valido) {
      validos++;
      await query(`UPDATE campanha_contatos SET email_valido=true WHERE id=$1`, [c.id]);
    } else {
      invalidos++;
      await query(`DELETE FROM campanha_contatos WHERE id=$1`, [c.id]);
    }
  }
  return { processados: rows.length, validos, invalidos };
}

// Limpeza única de inválidos que já tinham sido marcados email_valido=false
// em execuções anteriores (antes da validação passar a excluir na hora).
// Chamada só dentro de _garantirColunas(), que já roda 1x por boot.
async function _limparInvalidosAntigos() {
  try {
    const { rowCount } = await query(`DELETE FROM campanha_contatos WHERE email_valido = false`);
    if (rowCount) console.log(`[CAMPANHA] limpeza única: ${rowCount} contatos com email inválido excluídos`);
  } catch (e) { console.error('[CAMPANHA] erro na limpeza de invalidos antigos:', e.message); }
}

// Cache curto (60s) pras 4 consultas de estatística abaixo — rodam sem
// índice de apoio numa tabela de ~118 mil contatos (statsCadastrados em
// particular compara LOWER(email) dos dois lados, o que impede usar índice
// normal) e eram recalculadas do zero toda vez que alguém abria
// /admin/campanha, e de novo a cada poll automático de /admin/campanha/status
// (a cada poucos segundos enquanto a tela ficava aberta) — consumindo o
// servidor à toa. Ago/2026.
const _CACHE_STATS_TTL_MS = 60000;
const _cacheStats = {};
async function _comCache(chave, fn) {
  const c = _cacheStats[chave];
  if (c && (Date.now() - c.em) < _CACHE_STATS_TTL_MS) return c.valor;
  const valor = await fn();
  _cacheStats[chave] = { valor, em: Date.now() };
  return valor;
}

async function statsBase() {
  return _comCache('base', async () => {
    await _garantirColunas();
    const { rows } = await query(`SELECT status, COUNT(*) as total FROM campanha_contatos GROUP BY status`);
    return rows;
  });
}

async function statsValidacao() {
  return _comCache('validacao', async () => {
    await _garantirColunas();
    const { rows } = await query(`
      SELECT
        COUNT(*) FILTER (WHERE email_valido IS NULL)::int AS pendente_validar,
        COUNT(*) FILTER (WHERE email_valido = true)::int AS validos,
        COUNT(*) FILTER (WHERE email_valido = false)::int AS invalidos
      FROM campanha_contatos
    `);
    return rows[0] || { pendente_validar: 0, validos: 0, invalidos: 0 };
  });
}

async function statsTracking() {
  return _comCache('tracking', async () => {
    const { rows } = await query(`SELECT tipo, COUNT(*) as total FROM campanha_tracking GROUP BY tipo`);
    return rows;
  });
}

async function statsCadastrados() {
  return _comCache('cadastrados', async () => {
    const { rows } = await query(`
      SELECT COUNT(*) as total FROM campanha_contatos cc
      WHERE LOWER(cc.email) IN (SELECT LOWER(email) FROM usuarios WHERE email IS NOT NULL AND email != '')
      AND cc.status = 'enviado'
    `);
    return rows[0]?.total || 0;
  });
}

async function estaAtiva() {
  await _garantirColunas();
  const { rows } = await query('SELECT ativo FROM campanha_config WHERE id=1');
  return !!(rows[0] && rows[0].ativo);
}
async function iniciarCampanha() {
  await _garantirColunas();
  await query(`UPDATE campanha_config SET ativo=true, atualizado_em=NOW() WHERE id=1`);
}
async function pausarCampanha() {
  await _garantirColunas();
  await query(`UPDATE campanha_config SET ativo=false, atualizado_em=NOW() WHERE id=1`);
}

// Só considera enviável quem: está pendente, teve o email validado como
// existente, não bate email NEM celular com conta já cadastrada (usuarios).
// Prioridade: região primeiro (SP > RJ > SC > resto), e DENTRO de cada
// região quem parece corretor/imobiliária/broker vai antes do resto —
// nunca mistura regiões (não manda um corretor do RJ antes de esgotar todo
// mundo de SP, mesmo os que não parecem corretor).
async function proximoLote(limite) {
  await _garantirColunas();
  const { rows } = await query(`
    SELECT cc.id, cc.nome, cc.email, cc.celular
    FROM campanha_contatos cc
    WHERE cc.status = 'pendente'
      AND cc.email_valido = true
      AND LOWER(cc.email) NOT IN (SELECT LOWER(email) FROM usuarios WHERE email IS NOT NULL AND email != '')
      AND NOT EXISTS (
        SELECT 1 FROM usuarios u
        WHERE u.celular IS NOT NULL AND u.celular != ''
          AND cc.celular IS NOT NULL AND cc.celular != ''
          AND RIGHT(regexp_replace(u.celular, '\\D', '', 'g'), 8) = RIGHT(regexp_replace(cc.celular, '\\D', '', 'g'), 8)
      )
    ORDER BY COALESCE(cc.ddd_grupo, 3), (CASE WHEN cc.parece_corretor THEN 0 ELSE 1 END), cc.criado_em ASC
    LIMIT $1
  `, [limite]);
  return rows;
}

async function marcarEnviado(id, erro, extra = {}) {
  if (erro) {
    await query(`UPDATE campanha_contatos SET status='erro', erro=$1, enviado_em=NOW() WHERE id=$2`, [erro, id]);
  } else {
    await query(
      `UPDATE campanha_contatos SET status='enviado', enviado_em=NOW(), modelo_usado=$1, titulo_usado=$2, corpo_usado=$3 WHERE id=$4`,
      [extra.modelo || null, extra.titulo || null, extra.corpo || null, id]
    );
  }
}

// CTA em botão de verdade (não link solto no meio do texto), separado por
// tipo de modelo — "pagina" convida a testar a plataforma, "demanda" convida
// a consultar a demanda da região.
const CTA_POR_TIPO = {
  pagina: 'Testar grátis agora →',
  demanda: 'Ver demanda da minha região →',
  followup1: 'Testar grátis agora →',
  followup2: 'Criar minha conta grátis →',
  // followup3 é o único cujo CTA leva pro login (não pra landing page) —
  // esse contato já tem conta, o link de clique (track/click/:id em
  // server.js) redireciona pra /entrar quando modelo_usado === 'followup3'.
  followup3: 'Ver meus combos →'
};

function gerarHTML(mensagem, contato, tipo) {
  const trackPixel = `${BASE_URL}/campanha/track/open/${contato.id || 0}`;
  const trackLink = `${BASE_URL}/campanha/track/click/${contato.id || 0}`;
  const msg = mensagem.replace(/{nome}/g, contato.nome || 'Corretor');

  // Blocos separados por linha em branco. Bloco em que TODA linha começa
  // com "• " vira lista de tópicos; senão vira parágrafo normal.
  const corpoHtml = msg.split(/\n\n+/).map(bloco => {
    const linhas = bloco.split('\n').filter(l => l.trim());
    const ehLista = linhas.length > 1 && linhas.every(l => l.trim().startsWith('•'));
    if (ehLista) {
      const itens = linhas.map(l =>
        '<li style="margin:8px 0;padding-left:22px;position:relative"><span style="position:absolute;left:0;color:#00A699;font-weight:bold">✓</span>'
        + l.trim().replace(/^•\s*/, '') + '</li>'
      ).join('');
      return '<ul style="list-style:none;padding:18px 22px;margin:16px 0;background:#f9fafb;border-radius:10px;font-size:14.5px;color:#374151">' + itens + '</ul>';
    }
    return '<p style="margin:0 0 16px 0;font-size:15px;line-height:1.7;color:#222">' + bloco.replace(/\n/g, '<br>') + '</p>';
  }).join('');

  const ctaTexto = tipo && CTA_POR_TIPO[tipo];
  let ctaHtml = '';
  if (ctaTexto) {
    ctaHtml = '<a href="' + trackLink + '" style="display:inline-block;margin:8px 0 4px 0;padding:14px 28px;background:#FF385C;color:#fff;text-decoration:none;border-radius:8px;font-weight:bold;font-size:15px">' + ctaTexto + '</a>';
  }
  // Sem tipo (ex: envio de teste com texto livre) — mantém o link clicável
  // dentro do próprio texto, como já funcionava antes do botão existir.
  let corpoFinal = corpoHtml;
  if (!ctaTexto) {
    const _urlRegex = new RegExp(BASE_URL.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(/demanda)?', 'g');
    corpoFinal = corpoHtml.replace(_urlRegex, (match) => '<a href="' + trackLink + '" style="color:#FF385C">' + match + '</a>');
  }

  return `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:32px;color:#222">
    ${corpoFinal}
    ${ctaHtml}
    <p style="margin-top:20px;font-size:13px;color:#888">Para não receber mais emails, responda com CANCELAR.</p>
    <img src="${trackPixel}" width="1" height="1" style="display:none">
  </div>`;
}

// ── Follow-ups automáticos ──────────────────────────────────────────────
// Cada função abaixo acha 1 contato elegível pra aquele estágio — 24h desde
// o gatilho (envio original / abertura / cadastro), e que ainda não recebeu
// ESSE follow-up especificamente (followupN_enviado_em IS NULL garante que
// só manda 1 vez por contato, mesmo o job rodando toda hora).
async function proximoFollowup1() {
  await _garantirColunas();
  // Não abrir o e-mail não significa que não tem conta — pode ter chegado
  // na plataforma por outro caminho (busca orgânica, indicação) sem nunca
  // clicar nesse e-mail específico. Confere de novo contra `usuarios` na
  // hora de enviar, senão manda "conhece a Match Imóveis?" pra quem já é
  // cadastrado — mesma checagem que proximoLote() e proximoFollowup2() já
  // fazem.
  const { rows } = await query(`
    SELECT cc.id, cc.nome, cc.email, cc.celular FROM campanha_contatos cc
    WHERE cc.status = 'enviado'
      AND cc.aberto_em IS NULL
      AND cc.enviado_em <= NOW() - INTERVAL '24 hours'
      AND cc.followup1_enviado_em IS NULL
      AND LOWER(cc.email) NOT IN (SELECT LOWER(email) FROM usuarios WHERE email IS NOT NULL AND email != '')
    ORDER BY cc.enviado_em ASC LIMIT 1
  `);
  return rows[0] || null;
}
async function proximoFollowup2() {
  await _garantirColunas();
  const { rows } = await query(`
    SELECT cc.id, cc.nome, cc.email, cc.celular FROM campanha_contatos cc
    WHERE cc.aberto_em IS NOT NULL
      AND cc.aberto_em <= NOW() - INTERVAL '24 hours'
      AND cc.followup2_enviado_em IS NULL
      AND LOWER(cc.email) NOT IN (SELECT LOWER(email) FROM usuarios WHERE email IS NOT NULL AND email != '')
    ORDER BY cc.aberto_em ASC LIMIT 1
  `);
  return rows[0] || null;
}
async function proximoFollowup3() {
  await _garantirColunas();
  // Gatilho é o cadastro em si (usuarios.criado_em), não o e-mail original —
  // por isso o JOIN em vez de olhar só campanha_contatos.
  const { rows } = await query(`
    SELECT cc.id, cc.nome, cc.email, cc.celular FROM campanha_contatos cc
    JOIN usuarios u ON LOWER(u.email) = LOWER(cc.email)
    WHERE u.criado_em <= NOW() - INTERVAL '24 hours'
      AND cc.followup3_enviado_em IS NULL
      AND COALESCE(u.match_coins_total, 0) <= 1000
    ORDER BY u.criado_em ASC LIMIT 1
  `);
  return rows[0] || null;
}
const _FOLLOWUP_COLUNA = { 1: 'followup1_enviado_em', 2: 'followup2_enviado_em', 3: 'followup3_enviado_em' };
async function marcarFollowupEnviado(id, numero) {
  const coluna = _FOLLOWUP_COLUNA[numero];
  if (!coluna) throw new Error('número de follow-up inválido: ' + numero);
  await query(`UPDATE campanha_contatos SET ${coluna}=NOW() WHERE id=$1`, [id]);
}

// Registra quem (admin ou conta admin secundária) clicou pra falar com esse
// contato pelo WhatsApp — usado pra colorir a linha na tela e sinalizar pra
// quem mais está vendo que já tem alguém tratando. Não sobrescreve se já
// tiver alguém atendendo (evita 1 clique acidental de outra conta roubar a
// atribuição de quem já estava conversando).
async function marcarAtendido(id, { por, nome, cor }) {
  await _garantirColunas();
  const { rows } = await query('SELECT atendido_por, atendido_por_nome, atendido_por_cor FROM campanha_contatos WHERE id=$1', [id]);
  if (rows[0] && rows[0].atendido_por) {
    return { ok: false, jaAtendido: true, nome: rows[0].atendido_por_nome, cor: rows[0].atendido_por_cor };
  }
  await query(
    `UPDATE campanha_contatos SET atendido_por=$1, atendido_por_nome=$2, atendido_por_cor=$3, atendido_em=NOW() WHERE id=$4`,
    [por, nome, cor, id]
  );
  return { ok: true, nome, cor };
}

// Marca que o botão de WhatsApp manual foi clicado de fato (mensagem aberta
// pra envio) — separado de atendido_por, que só marca "de quem é esse
// contato" 1x. Chamado a cada clique, então pode sobrescrever (reenviar
// atualiza a data pro envio mais recente).
async function marcarWhatsappManualEnviado(id) {
  await _garantirColunas();
  await query(`UPDATE campanha_contatos SET wa_manual_enviado_em=NOW() WHERE id=$1`, [id]);
}

// Contatos que interagiram (clicou ou pelo menos abriu o e-mail) e ninguém
// pegou pra atender ainda ficavam soltos — agora divide em round-robin entre
// os sub-admins ativos, do mesmo jeito que o disparo de WhatsApp já faz.
// Antes só pegava quem tinha CLICADO; passou a pegar todo o backlog sem dono
// (status='enviado' ou 'erro', que são os únicos estados finais de uma linha
// já processada) — quem abriu o e-mail já tem que aparecer marcado dentro da
// conta do sub-admin responsável, mesmo sem ter clicado ainda (mesmo motivo
// da mudança equivalente em campanhaCaptacao.js: reativar quem tá parado é
// trabalho de atendimento manual até o disparo virar 100% automático).
// Prioriza quem clicou (interesse mais forte), depois quem abriu, depois o
// resto. Idempotente: só mexe em quem tá com atendido_por vazio.
async function distribuirAtendimentosAbertos(contasAtivas) {
  await _garantirColunas();
  if (!contasAtivas || !contasAtivas.length) return { distribuidos: 0 };
  const { rows } = await query(
    `SELECT id FROM campanha_contatos
     WHERE status IN ('enviado','erro') AND (atendido_por IS NULL OR atendido_por = '')
     ORDER BY (clicado_em IS NULL), (aberto_em IS NULL), COALESCE(clicado_em, aberto_em, enviado_em) ASC`
  );
  let distribuidos = 0;
  for (let i = 0; i < rows.length; i++) {
    const conta = contasAtivas[i % contasAtivas.length];
    await query(
      `UPDATE campanha_contatos SET atendido_por=$1, atendido_por_nome=$2, atendido_por_cor=$3, atendido_em=NOW() WHERE id=$4`,
      [conta.usuario, conta.nome || conta.usuario, conta.cor, rows[i].id]
    );
    distribuidos++;
  }
  return { distribuidos };
}

// Número pode ter sido reciclado pra outra pessoa (ou o lead simplesmente
// não quer mais mensagem) — só apaga o celular, mantém nome/email/histórico
// intactos (e-mail é o identificador estável, nunca muda).
async function excluirCelularContato(id) {
  await _garantirColunas();
  await query('UPDATE campanha_contatos SET celular=$1 WHERE id=$2', ['', id]);
}
async function _enviarFollowup(contato, tipo, numero) {
  const variacao = _sorteia(MODELOS[tipo]);
  const corpoPersonalizado = variacao.corpo.replace(/\{nome\}/g, contato.nome || 'Corretor');
  const html = gerarHTML(corpoPersonalizado, contato, tipo);
  try {
    await enviarEmail({ para: contato.email, assunto: variacao.assunto, html, texto: variacao.assunto });
    await marcarFollowupEnviado(contato.id, numero);
    return { enviado: true, email: contato.email, modelo: tipo, titulo: variacao.assunto };
  } catch (e) {
    // não marca followupN_enviado_em em caso de erro — tenta de novo no próximo ciclo
    return { enviado: false, motivo: 'erro_envio', erro: e.message };
  }
}

async function _enviarDaFilaPrincipal() {
  const [contato] = await proximoLote(1);
  if (!contato) return null;
  const modelo = _sortearModelo();
  const corpoPersonalizado = modelo.corpo.replace(/\{nome\}/g, contato.nome || 'Corretor');
  const html = gerarHTML(corpoPersonalizado, contato, modelo.tipo);
  try {
    await enviarEmail({ para: contato.email, assunto: modelo.assunto, html, texto: modelo.assunto });
    await marcarEnviado(contato.id, null, { modelo: modelo.tipo, titulo: modelo.assunto, corpo: modelo.corpo });
    return { enviado: true, email: contato.email, modelo: modelo.tipo, titulo: modelo.assunto };
  } catch (e) {
    await marcarEnviado(contato.id, e.message);
    return { enviado: false, motivo: 'erro_envio', erro: e.message };
  }
}

async function _enviarDosFollowups() {
  const f1 = await proximoFollowup1();
  if (f1) {
    const r1 = await _enviarFollowup(f1, 'followup1', 1);
    if (r1.enviado) return r1;
  }
  const f2 = await proximoFollowup2();
  if (f2) {
    const r2 = await _enviarFollowup(f2, 'followup2', 2);
    if (r2.enviado) return r2;
  }
  const f3 = await proximoFollowup3();
  if (f3) {
    const r3 = await _enviarFollowup(f3, 'followup3', 3);
    if (r3.enviado) return r3;
  }
  return null;
}

// Um envio — chamado pelo job automático (server.js, intervalo aleatório
// de 30s a 5min entre cada chamada).
//
// Follow-up tem prazo (24h desde o gatilho) e sempre teve prioridade sobre
// a fila principal — mas "sempre prioridade" significava, na prática,
// NUNCA avançar a fila de 118k contatos enquanto existisse QUALQUER
// follow-up pendente, o que é o normal em operação contínua (todo dia
// vence follow-up de gente nova). Confirmado em produção (ago/2026): a
// fila principal ficou horas paralisada com só ~100 follow-ups pendentes.
// Fix: proporção 3 contato novo pra 1 follow-up (pedido do Renato) — 3 a
// cada 4 chamadas tenta a fila principal PRIMEIRO, só 1 a cada 4 prioriza
// follow-up primeiro.
let _tickCampanhaGeral = 0;
async function enviarProximo() {
  await _garantirColunas();
  await _backfillPrioridadePendente();
  if (!(await estaAtiva())) return { enviado: false, motivo: 'pausada' };

  _tickCampanhaGeral++;
  const priorizarFilaPrincipal = (_tickCampanhaGeral % 4 !== 0);

  if (priorizarFilaPrincipal) {
    const rPrincipal = await _enviarDaFilaPrincipal();
    if (rPrincipal) return rPrincipal;
    const rFollow = await _enviarDosFollowups();
    if (rFollow) return rFollow;
    return { enviado: false, motivo: 'sem_elegiveis' };
  }

  // Follow-up com erro NÃO marca followupN_enviado_em (de propósito, pra
  // tentar de novo no próximo ciclo) — mas isso significa que o MESMO
  // contato quebrado (ex: SES rejeitando aquele endereço) volta a ser "o
  // próximo elegível" pra sempre. Segue pra próxima camada (e por fim pra
  // fila normal) sempre que o envio falha, em vez de parar o ciclo ali.
  const rFollow = await _enviarDosFollowups();
  if (rFollow) return rFollow;

  const rPrincipal = await _enviarDaFilaPrincipal();
  if (rPrincipal) return rPrincipal;
  return { enviado: false, motivo: 'sem_elegiveis' };
}

async function enviarTeste(emailTeste, { assunto, mensagem }) {
  const html = gerarHTML(mensagem.replace(/\{nome\}/g, 'Corretor Teste'), { id: 'teste' });
  await enviarEmail({ para: emailTeste, assunto: '[TESTE] ' + assunto, html, texto: assunto });
}

async function listarEnvios({ limite = 50, offset = 0 } = {}) {
  await _garantirColunas();
  const { rows } = await query(
    `SELECT cc.id, cc.nome, cc.email, cc.celular, cc.status, cc.modelo_usado, cc.titulo_usado, cc.enviado_em, cc.aberto_em, cc.clicado_em, cc.erro,
            (LOWER(cc.email) IN (SELECT LOWER(email) FROM usuarios WHERE email IS NOT NULL AND email != '')) AS cadastrou
     FROM campanha_contatos cc
     WHERE cc.status = 'enviado' OR cc.status = 'erro'
     ORDER BY cc.enviado_em DESC
     LIMIT $1 OFFSET $2`,
    [limite, offset]
  );
  return rows;
}

// Reconstrói o HTML exatamente como foi enviado (mesmo assunto/corpo), pro
// admin conferir no modal de preview.
async function buscarEnvioParaPreview(id) {
  await _garantirColunas();
  const { rows } = await query(`SELECT * FROM campanha_contatos WHERE id=$1`, [id]);
  const envio = rows[0];
  if (!envio) return null;
  const corpoPersonalizado = (envio.corpo_usado || '').replace(/\{nome\}/g, envio.nome || 'Corretor');
  const html = gerarHTML(corpoPersonalizado, envio, envio.modelo_usado);
  return { ...envio, html };
}

module.exports = {
  importarContatos, statsBase, statsTracking, statsCadastrados, statsValidacao,
  proximoLote, enviarTeste, enviarProximo, marcarAtendido, excluirCelularContato,
  iniciarCampanha, pausarCampanha, estaAtiva, buscarEnvioParaPreview,
  validarProximoLote, listarEnvios, distribuirAtendimentosAbertos,
  marcarWhatsappManualEnviado
};
