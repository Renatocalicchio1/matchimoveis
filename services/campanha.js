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
  // Framework reescrito (ago/2026, pedido explícito do Renato): antes era
  // PAS clássico (Problema → Agitação → Solução), focado em listar
  // benefício. Agora o eixo principal é AVERSÃO À PERDA — ciência de
  // persuasão (Kahneman/Tversky: perda pesa mais que ganho equivalente na
  // decisão humana; Cialdini, "As Armas da Persuasão": escassez/urgência
  // como um dos 6 gatilhos centrais) — cada e-mail abre com uma cena
  // concreta e específica (não abstrata) do que o corretor JÁ ESTÁ perdendo
  // agora, não do que ele ganharia. Um dado real dá autoridade: pesquisa do
  // setor mostra que a conversão de lead cai de 35% pra 15% quando não há
  // retorno no primeiro minuto (fonte: imobilead.me). Assunto sempre com
  // gancho de curiosidade (loop aberto, só fecha no clique) — sem emoji de
  // alarme/caps (gatilho de spam), sem promessa não verificável. 1 único
  // CTA por email, corpo termina sem link solto (o botão já vem embutido
  // por CTA_POR_TIPO, ver gerarHTML). Nunca repete a mesma cena/fecho entre
  // variações — texto repetido é o principal sinal de spam pro provedor.
  pagina: [
    {
      assunto: 'Enquanto você lê isso, um lead seu pode estar esfriando',
      corpo: `Olá {nome},

São 23h47 de uma terça. Alguém entra buscando um apartamento de R$400 mil, pede informação. Espera resposta.

A cada minuto sem retorno, a chance de fechar despenca — pesquisa do setor mostra que a conversão cai de 35% pra 15% quando o lead não recebe resposta no primeiro minuto.

Você não está online às 23h47. Ninguém fica.

Só que dá pra ter algo trabalhando enquanto você dorme: cruzando o lead com o imóvel certo da sua carteira, montando a vitrine, deixando tudo pronto pra quando ele acordar — e você responder primeiro, mesmo tendo dormido a noite inteira.

— Equipe Match Imóveis`
    },
    {
      assunto: 'O corretor que fechou ontem não foi mais rápido que você',
      corpo: `Olá {nome},

Foi mais preparado. Ele não madrugou, não checou o celular de hora em hora — só tinha algo cruzando os leads dele com os imóveis certos automaticamente, o dia inteiro, enquanto fazia outra coisa.

Você já perdeu negócio pra alguém que respondeu primeiro. Não porque ele trabalhou mais. Porque a ferramenta dele trabalhou por ele.

A Match Imóveis faz esse cruzamento sozinha, 24 horas por dia, e já libera crédito suficiente pra você testar com os primeiros leads sem gastar nada.

— Equipe Match Imóveis`
    },
    {
      assunto: 'Sua planilha de leads não avisa quando um deles esfria',
      corpo: `Olá {nome},

Tem um lead parado na sua planilha agora. Você não sabe quanto tempo faz que ele não recebe retorno, nem se já está sendo atendido por outro corretor.

Enquanto isso, ele continua procurando — só que agora com outra pessoa.

A Match Imóveis cruza cada lead com o imóvel certo assim que ele chega, sem esperar você abrir a planilha. É a diferença entre reagir e já estar na frente.

— Equipe Match Imóveis`
    },
    {
      assunto: 'O que separa quem fecha do que quase fechou: 1 minuto',
      corpo: `Olá {nome},

Pesquisa do setor mostra: quando o lead recebe resposta em menos de 1 minuto, a conversão passa de 35%. Depois disso, despenca pra 15%.

1 minuto. É o tempo que você levou pra ler até aqui.

Ninguém consegue vigiar o celular o dia inteiro — mas dá pra ter algo que cruza automaticamente cada lead com o imóvel certo e já prepara a resposta, assim que ele chega.

— Equipe Match Imóveis`
    },
    {
      assunto: 'Imagina perder uma venda por 40 segundos',
      corpo: `Olá {nome},

Não é hipotético. É a diferença real entre o corretor que abre o WhatsApp na hora e o que abre 20 minutos depois — mesmo que os dois sejam igualmente bons.

A Match Imóveis elimina essa diferença: cruza o lead com o imóvel certo da sua carteira no instante em que ele chega, sem depender de você estar de olho no celular.

Comece agora, é grátis pra testar.

— Equipe Match Imóveis`
    },
    {
      assunto: 'Você não perde vendas por falta de talento',
      corpo: `Olá {nome},

Perde por timing. Por não ver o lead a tempo, por responder depois de outro corretor já ter respondido, por um imóvel certo ficar esquecido na carteira enquanto o cliente certo procurava exatamente ele.

Nada disso é sobre esforço. É sobre ter algo cruzando isso automaticamente, o tempo todo, mesmo quando você não está olhando.

Teste agora, sem custo.

— Equipe Match Imóveis`
    },
    {
      assunto: 'Enquanto você atende um cliente, outro está esfriando',
      corpo: `Olá {nome},

Não tem como estar em dois lugares ao mesmo tempo. Enquanto você fecha uma visita, outro lead está esperando resposta — e quem demora, perde pro corretor que não demorou.

A Match Imóveis resolve isso sem você precisar se dividir: cruza automaticamente cada lead novo com o imóvel certo, mesmo enquanto você está ocupado com outra coisa.

— Equipe Match Imóveis`
    },
    {
      assunto: 'Todo dia sem isso é um lead que você nunca vai saber que perdeu',
      corpo: `Olá {nome},

O pior lead perdido não é aquele que você viu escapar. É o que nem chegou a aparecer no seu radar a tempo — porque demorou pra ser cruzado com o imóvel certo, ou porque você só olhou a planilha depois que ele já tinha esfriado.

A Match Imóveis cruza tudo automaticamente, assim que o lead chega. Sem depender de você estar olhando.

— Equipe Match Imóveis`
    }
  ],
  demanda: [
    {
      assunto: 'Você sabe quantas pessoas procuram imóvel na sua região agora?',
      corpo: `Olá {nome},

Nós sabemos. E enquanto você não consulta, outro corretor da sua região já está de olho nesse número — e agindo em cima dele.

Não é sobre ter sorte de cair num lead bom. É sobre saber, com dado real, onde a demanda está concentrada agora, antes de gastar tempo no lugar errado.

Consulta grátis, sem compromisso.

— Equipe Match Imóveis`
    },
    {
      assunto: 'Tem gente procurando imóvel no seu bairro agora — só não com você',
      corpo: `Olá {nome},

Enquanto você foca na sua carteira de sempre, existe demanda real acontecendo do lado, sem que nenhum corretor da região saiba com precisão onde.

Quem descobre primeiro, chega primeiro.

Veja agora, de graça, quantas pessoas procuram imóvel na sua região neste momento.

— Equipe Match Imóveis`
    },
    {
      assunto: 'O bairro que você não olha pode ser o que mais rende',
      corpo: `Olá {nome},

A maioria dos corretores trabalha só a região que já conhece — e deixa passar demanda real em bairros vizinhos, só por falta de dado.

Sem esse número, é decisão no escuro. Com ele, é decisão informada.

Confira gratuitamente onde a demanda da sua cidade está concentrada agora.

— Equipe Match Imóveis`
    },
    {
      assunto: 'Enquanto você lê isso, alguém decide qual corretor vai ligar',
      corpo: `Olá {nome},

Não é o corretor mais experiente que fecha primeiro — é o que sabia, antes dos outros, onde a demanda estava.

Esse dado existe, atualizado, pra sua região. A pergunta é se você vai olhar antes ou depois de outro corretor já ter agido em cima dele.

— Equipe Match Imóveis`
    },
    {
      assunto: 'Sua região tem mais demanda do que você imagina — ou menos',
      corpo: `Olá {nome},

Os dois cenários custam caro se você não souber qual é o seu: focar energia numa região fraca, ou ignorar uma região forte por achar que não vale a pena.

O único jeito de não errar é ver o número de verdade. E isso é gratuito.

— Equipe Match Imóveis`
    },
    {
      assunto: 'Antes de fechar a agenda de hoje, veja esse número',
      corpo: `Olá {nome},

Leva menos de 1 minuto e pode mudar onde você foca amanhã: quantas pessoas estão buscando imóvel, agora, na sua região.

Sem esse dado, cada decisão de onde investir tempo é um chute. Com ele, deixa de ser.

— Equipe Match Imóveis`
    },
    {
      assunto: 'O corretor que soube primeiro, chegou primeiro',
      corpo: `Olá {nome},

Não existe atalho pra fechar mais — mas existe vantagem em saber, antes dos outros, onde a demanda real está. É isso que separa quem espera o lead aparecer de quem já estava esperando o lead.

Veja gratuitamente a demanda da sua região agora.

— Equipe Match Imóveis`
    },
    {
      assunto: 'Quantos leads passaram pela sua região sem você saber?',
      corpo: `Olá {nome},

Não dá pra medir o que você nunca viu. Mas dá pra parar de perder esse dado a partir de agora: veja, de graça, quantas pessoas procuram imóvel na sua região neste exato momento.

Sem compromisso, sem cadastro obrigatório pra consultar.

— Equipe Match Imóveis`
    }
  ],
  // ── Programa de afiliados (ago/2026) — 10 variações, mesmo eixo de
  // aversão à perda: cada e-mail mostra o que o corretor JÁ ESTÁ perdendo
  // por não ter o link ativo (comissão que "some" a cada indicação sem
  // link), não uma promessa genérica de ganho futuro. CTA próprio
  // (CTA_POR_TIPO.afiliado).
  afiliado: [
    {
      assunto: 'Cada corretor que você não indicou é uma comissão que já era',
      corpo: `Olá {nome},

Você conhece outros corretores. Troca ideia com eles, indica cliente, divide plantão. Só que até agora, essas conversas nunca viraram renda pra você.

Cada um deles que se cadastra na Match Imóveis pelo seu link gera comissão contínua na sua conta — todo mês, não só uma vez. Enquanto você não manda o link, essa renda simplesmente não existe.

— Equipe Match Imóveis`
    },
    {
      assunto: 'Enquanto você pensa se vale a pena, outro afiliado já está ganhando',
      corpo: `Olá {nome},

O programa de afiliados da Match Imóveis já está pagando comissão pra quem indicou primeiro. Cada corretor, imobiliária ou agência que entrou por indicação virou renda contínua pra quem mandou o link — sem vender nada, só apresentando a ferramenta certa.

Você já tem contatos suficientes pra começar hoje. A única coisa que falta é o primeiro link enviado.

— Equipe Match Imóveis`
    },
    {
      assunto: 'Você trabalha de graça toda vez que indica sem esse link',
      corpo: `Olá {nome},

Indicar alguém pra Match Imóveis sem usar seu link pessoal é abrir mão de uma comissão que já poderia ser sua, todo mês, sem nenhum esforço extra.

Não é sobre vender — é sobre não perder o que a indicação já vale sozinha.

— Equipe Match Imóveis`
    },
    {
      assunto: 'A renda que você já poderia estar recebendo (e não está)',
      corpo: `Olá {nome},

Enquanto sua conta fica parada sem link ativo, outros afiliados já estão recebendo comissão de corretores e imobiliárias que eles conhecem — o mesmo tipo de contato que você também tem.

A diferença entre ganhar e não ganhar aqui não é habilidade. É ter mandado o link ou não.

— Equipe Match Imóveis`
    },
    {
      assunto: 'Seu círculo de contatos vale mais do que você imagina — se você usar',
      corpo: `Olá {nome},

Anos de mercado imobiliário te deram uma rede de contatos que a maioria nunca monetizou. Cada corretor, imobiliária ou agência de marketing que você conhece pode virar comissão contínua — mas só se entrar pelo seu link.

Sem o link, essa rede continua só sendo contato. Com ele, vira renda.

— Equipe Match Imóveis`
    },
    {
      assunto: 'O que você perde por não ser afiliado ainda',
      corpo: `Olá {nome},

Não é sobre o que você ganharia — é sobre o que já está deixando na mesa: toda indicação que você faz sem o link pessoal é comissão que simplesmente não existe.

Ativar leva menos de 1 minuto, e sua conta já sai com o link pronto.

— Equipe Match Imóveis`
    },
    {
      assunto: 'Enquanto essa mensagem chega até você, alguém está sendo indicado sem link',
      corpo: `Olá {nome},

Toda vez que um corretor indica outro sem usar o link de afiliado, uma comissão que poderia existir simplesmente desaparece — pra sempre, porque essa indicação não volta.

Não deixa a próxima passar assim. Seu link já está pronto na sua conta.

— Equipe Match Imóveis`
    },
    {
      assunto: 'Você não precisa vender imóvel pra essa renda existir',
      corpo: `Olá {nome},

A maior parte dos corretores nunca considera essa fonte de renda porque acha que precisa vender algo. Não precisa. Precisa só indicar — e parar de indicar de graça o que já poderia gerar comissão.

Cada corretor ou imobiliária que você conhece é uma oportunidade que só existe enquanto você não usa o link.

— Equipe Match Imóveis`
    },
    {
      assunto: 'A comissão que já era sua, só não foi resgatada ainda',
      corpo: `Olá {nome},

Programa de afiliados não é promessa — é comissão de verdade, em dinheiro ou crédito, por cada corretor ou imobiliária que entra pelo seu link. A única forma de não ganhar isso é não ter o link ativo.

Ativar é grátis e leva menos tempo que ler esse e-mail.

— Equipe Match Imóveis`
    },
    {
      assunto: 'Todo mês que passa sem seu link ativo é comissão que não volta',
      corpo: `Olá {nome},

Diferente de outras oportunidades, essa não some por falta de sorte — some por falta de 1 clique. Cada corretor que você poderia ter indicado esse mês, e não indicou pelo link certo, é renda que não vai mais existir.

Ative agora e comece a partir da próxima indicação.

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

Resumindo: a gente cruza cada lead com o imóvel certo da sua carteira automaticamente, e você ainda pode ganhar comissão indicando a plataforma pra outros corretores.

• Leads cruzados sozinhos, 24 horas por dia
• Comissão contínua se você indicar alguém
• Grátis pra testar

Dá uma olhada quando puder.

— Equipe Match Imóveis`
    },
    {
      assunto: 'Reenviando — pode ter passado despercebido',
      corpo: `Olá {nome},

Sei que a caixa de entrada de corretor não para, então vou direto ao ponto: a Match Imóveis ajuda a vender mais rápido cruzando leads automaticamente, e também paga comissão pra quem indica a plataforma pra outros corretores.

• Cruza o lead com o imóvel certo sozinha
• Comissão contínua por indicação
• 1.000 créditos grátis pra testar

— Equipe Match Imóveis`
    },
    {
      assunto: 'Um lembrete rápido sobre a Match Imóveis',
      corpo: `Olá {nome},

Passando de novo porque acho que isso pode te interessar: além de ajudar a fechar mais rápido (cruza lead com imóvel automaticamente), a plataforma também paga comissão pra quem indica outros corretores.

• Funciona mesmo fora do seu horário
• Comissão contínua por indicação
• Teste grátis, sem compromisso

— Equipe Match Imóveis`
    },
    {
      assunto: 'Isso pode estar te custando vendas (e dinheiro parado)',
      corpo: `Olá {nome},

A maioria dos corretores só percebe o lead perdido quando é tarde demais. A Match Imóveis evita isso cruzando automaticamente cada lead com o imóvel certo — e de quebra, você ainda ganha comissão se indicar a plataforma pra outros corretores.

• Sem mensalidade fixa
• Comissão contínua por indicação
• 1.000 créditos grátis pra começar

Dá uma conferida quando puder.

— Equipe Match Imóveis`
    },
    {
      assunto: 'Deixei isso passar? Segue de novo',
      corpo: `Olá {nome},

Talvez esse e-mail tenha se perdido no meio de tantos outros — normal, corretor recebe muito e-mail. Vale a pena dar uma olhada: a plataforma cruza seus leads automaticamente com os imóveis certos, e ainda paga comissão pra quem indica outros corretores ou imobiliárias.

• Recebe e cruza o lead sozinha
• Comissão contínua por indicação
• Testa grátis, com 1.000 créditos

— Equipe Match Imóveis`
    },
    {
      assunto: 'Corretores que usam isso fecham mais rápido (e ainda ganham indicando)',
      corpo: `Olá {nome},

Você já deve ter reparado que quem responde primeiro o lead certo, na maioria das vezes, é quem fecha o negócio. A Match Imóveis te coloca nessa posição automaticamente — e tem mais: você também ganha comissão indicando a plataforma pra outros corretores.

• Cruza o lead com o imóvel certo sozinha
• Comissão contínua por indicação
• Comece agora, grátis

— Equipe Match Imóveis`
    },
    {
      assunto: 'Ainda dá tempo de ver como funciona',
      corpo: `Olá {nome},

Resumo rápido: a Match Imóveis cruza automaticamente cada lead que chega com os imóveis certos da sua carteira — e além de vender mais rápido, você pode ganhar comissão indicando a plataforma pra outros corretores.

• Funciona 24h por dia
• Comissão contínua por indicação
• Grátis pra testar

— Equipe Match Imóveis`
    },
    {
      assunto: 'Sua carteira pode estar rendendo mais que isso',
      corpo: `Olá {nome},

Reforçando o que te mandei antes: a maior parte dos imóveis parados na carteira só não foram cruzados com o lead certo ainda. A Match Imóveis faz isso sozinha — e você também pode ganhar dinheiro indicando o sistema pra outros corretores.

• Cruzamento automático, o tempo todo
• Comissão contínua por indicação
• Teste agora, sem cartão de crédito

— Equipe Match Imóveis`
    },
    {
      assunto: 'De novo aqui — pode valer os 2 minutos',
      corpo: `Olá {nome},

Mais uma chance de você ver isso: a plataforma conecta automaticamente cada lead novo com o imóvel certo da sua carteira, e ainda paga comissão pra quem indica outros corretores ou imobiliárias.

• Sem precisar cruzar manualmente
• Comissão contínua por indicação
• Grátis pra testar, com bônus de boas-vindas

— Equipe Match Imóveis`
    },
    {
      assunto: 'Talvez isso resolva um problema (e ainda te pague por indicar)',
      corpo: `Olá {nome},

Se você já perdeu um lead por demorar a responder, esse e-mail é pra você. A Match Imóveis cruza automaticamente cada lead com os imóveis certos — e de quebra, paga comissão pra quem indica a plataforma pra outros corretores.

• Sem mensalidade fixa
• Comissão contínua por indicação
• Comece grátis, com 1.000 créditos

— Equipe Match Imóveis`
    }
  ],
  // Estágio 2: abriu o e-mail (curiosidade real), mas não criou conta —
  // reforça que já viu, remove fricção (é grátis/rápido), reenvia o link.
  followup2: [
    {
      assunto: 'Vi que você deu uma olhada — faltou só criar a conta',
      corpo: `Olá {nome},

Notei que você abriu o e-mail sobre a Match Imóveis, só não chegou a criar a conta. É rápido, e a conta já serve pros dois lados: vender mais rápido com o cruzamento automático de leads, e ganhar comissão indicando a plataforma pra outros corretores.

• Cadastro leva menos de 2 minutos
• 1.000 créditos grátis pra testar
• Já sai com seu link de indicação pronto

Vale a pena finalizar — os leads da sua região não esperam.

— Equipe Match Imóveis`
    },
    {
      assunto: 'Faltou só um passo pra você começar a usar (e a ganhar)',
      corpo: `Olá {nome},

Você chegou a ver a proposta da Match Imóveis, mas o cadastro ainda não foi feito. Fica só esse detalhe entre você e começar a receber leads cruzados automaticamente — e também ganhar comissão indicando a plataforma.

• Grátis pra criar a conta
• 1.000 créditos de bônus já na entrada
• Link de indicação pronto assim que você entra

Termina o cadastro quando puder.

— Equipe Match Imóveis`
    },
    {
      assunto: 'Ainda dá tempo de finalizar seu cadastro',
      corpo: `Olá {nome},

Vi que você teve interesse na Match Imóveis, mas o cadastro ficou pela metade. O link continua disponível — e a conta já vem com 1.000 créditos grátis, além do seu link de indicação pra ganhar comissão indicando outros corretores.

• Cadastro rápido, sem burocracia
• Sem mensalidade obrigatória
• Comissão contínua por indicação, se quiser usar

Fico à disposição se tiver qualquer dúvida.

— Equipe Match Imóveis`
    },
    {
      assunto: 'Não deixa esse cadastro pela metade',
      corpo: `Olá {nome},

Você já deu uma conferida na Match Imóveis — agora é só finalizar o cadastro. Sua conta já nasce com 1.000 créditos grátis e um link de indicação seu, pra ganhar comissão se quiser indicar outros corretores.

• Sem cartão, sem compromisso
• Leva menos de 2 minutos
• Dois jeitos de ganhar: vendendo e indicando

Enquanto isso, os leads da sua região continuam passando.

— Equipe Match Imóveis`
    },
    {
      assunto: 'O que falta é só 1 clique',
      corpo: `Olá {nome},

Reparei que você já conferiu a Match Imóveis mas ainda não criou sua conta. É rápido, e você já sai com 1.000 créditos de bônus e um link de indicação pronto pra ganhar comissão indicando outros corretores.

• Sem custo pra cadastrar
• Comece a atender lead cruzado automaticamente hoje mesmo
• Comissão contínua por indicação, quando quiser usar

Termina quando puder, o link continua valendo.

— Equipe Match Imóveis`
    },
    {
      assunto: 'Você chegou perto — falta só o cadastro',
      corpo: `Olá {nome},

Vi que você teve interesse na plataforma. Pra começar de verdade só falta criar a conta — grátis, com 1.000 créditos e um link de indicação já pronto pra você ganhar comissão indicando outros corretores.

• Cadastro rápido
• Sem cartão de crédito
• Dois jeitos de ganhar, na mesma conta

Se travou em algum ponto, é só responder esse e-mail.

— Equipe Match Imóveis`
    },
    {
      assunto: 'Ainda com aquele e-mail em aberto?',
      corpo: `Olá {nome},

Notei que você chegou a abrir a mensagem sobre a Match Imóveis. Pra aproveitar de verdade, só falta o cadastro — que é grátis e já vem com seu link de indicação, pra ganhar comissão se quiser indicar outros corretores.

• 1.000 créditos de bônus na entrada
• Sem mensalidade obrigatória
• Vitrine enviada automaticamente pros seus leads

Vale a pena terminar agora.

— Equipe Match Imóveis`
    },
    {
      assunto: 'Seu cadastro na Match Imóveis está esperando',
      corpo: `Olá {nome},

Você já viu do que se trata — agora é só criar a conta pra começar a receber leads cruzados automaticamente, e ganhar comissão se quiser indicar outros corretores pela plataforma.

• Grátis pra cadastrar
• 1.000 créditos já na entrada
• Link de indicação pronto assim que você entra

Fico à disposição se precisar de ajuda com o cadastro.

— Equipe Match Imóveis`
    },
    {
      assunto: 'Poucos minutos separam você de começar a ganhar dos dois jeitos',
      corpo: `Olá {nome},

Você já conferiu a proposta da Match Imóveis. O próximo passo é rápido: criar sua conta, que já vem com 1.000 créditos grátis e um link de indicação seu, pra ganhar comissão indicando outros corretores.

• Sem mensalidade obrigatória
• Leads cruzados automaticamente com sua carteira
• Comissão contínua, se quiser indicar

Termina o cadastro quando tiver um minuto.

— Equipe Match Imóveis`
    },
    {
      assunto: 'Reforçando — o cadastro é rápido, grátis e já vem com seu link de indicação',
      corpo: `Olá {nome},

Sei que a rotina de corretor não para, mas queria reforçar: você já viu a Match Imóveis, e falta só o cadastro. Não tem custo, você já sai com 1.000 créditos de bônus e um link pra ganhar comissão indicando outros corretores.

• Menos de 2 minutos pra cadastrar
• Sem cartão de crédito
• Dois jeitos de ganhar, desde o primeiro dia

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
      assunto: 'Sua conta já pode te render dinheiro, mesmo sem comprar combo',
      corpo: `Olá {nome},

Vi que você já criou sua conta na Match Imóveis, mas ainda não escolheu nenhum combo. Enquanto decide, já dá pra ganhar de outro jeito: seu link de indicação já está ativo, e você ganha comissão toda vez que outro corretor ou imobiliária se cadastrar por ele.

• Link de indicação já pronto na sua conta
• Comissão contínua, sem precisar comprar nada
• Quando quiser, escolha um combo e comece a vender também

Entra na sua conta e dá uma olhada nas duas opções.

— Equipe Match Imóveis`
    },
    {
      assunto: 'Falta escolher um combo — mas já dá pra ganhar indicando',
      corpo: `Olá {nome},

Sua conta na Match Imóveis já existe. Pra vender mais rápido falta escolher um combo, mas isso não impede você de já ganhar comissão indicando a plataforma pra outros corretores — o link já está na sua conta.

• Login com os mesmos dados do cadastro
• Comissão contínua por indicação, disponível agora
• Combos de leads quando você quiser vender também

Entra na plataforma quando puder pra ver as opções.

— Equipe Match Imóveis`
    },
    {
      assunto: 'Sua conta está esperando — e já pode te pagar comissão',
      corpo: `Olá {nome},

Você já tem conta na Match Imóveis. Enquanto não escolhe um combo, use seu link de indicação: toda pessoa que se cadastrar por ele e usar a plataforma gera comissão contínua pra você.

• Acesso com o login que você já criou
• Comissão em dinheiro ou crédito, você escolhe
• Combos de leads disponíveis quando quiser

Dá uma olhada nos combos direto na plataforma.

— Equipe Match Imóveis`
    },
    {
      assunto: 'O que falta pra sua conta começar a valer a pena (tem dois jeitos)',
      corpo: `Olá {nome},

Reparei que você já se cadastrou mas ainda não pegou nenhum combo. Sem o combo, os leads não chegam sozinhos — mas seu link de indicação já funciona, e você ganha comissão contínua sem precisar comprar nada.

• Entre com o login que já tem
• Comissão por indicação, ativa desde já
• Veja os combos quando quiser vender mais rápido também

Vale a pena conferir agora.

— Equipe Match Imóveis`
    },
    {
      assunto: 'Sua carteira ainda está vazia — mas seu link de indicação já rende',
      corpo: `Olá {nome},

Sua conta na Match Imóveis já existe, mas sem um combo escolhido os leads não chegam até você. Enquanto decide, seu link de indicação já está ativo e gera comissão contínua toda vez que alguém se cadastra por ele.

• Faça login com os dados do seu cadastro
• Comissão contínua, sem precisar comprar combo
• Escolha um combo quando fizer sentido pra você

Entra na plataforma e dá uma olhada.

— Equipe Match Imóveis`
    },
    {
      assunto: 'Você está a um passo de vender mais — e já pode ganhar indicando',
      corpo: `Olá {nome},

Sua conta já está pronta. Falta escolher um combo pra receber leads de verdade, mas isso não trava o outro lado: seu link de indicação já funciona, e cada indicação gera comissão contínua pra você.

• Login com o que você já cadastrou
• Comissão por indicação, disponível agora
• Combos de leads quando quiser

Confere as opções quando tiver um tempo.

— Equipe Match Imóveis`
    },
    {
      assunto: 'Ainda não escolheu um combo? Comece pelo link de indicação',
      corpo: `Olá {nome},

Vi que sua conta na Match Imóveis já existe, mas nenhum combo foi escolhido ainda. Enquanto pensa nisso, já dá pra usar seu link de indicação — cada corretor ou imobiliária que se cadastrar por ele gera comissão contínua pra você.

• Entra com o login que já criou
• Comissão em dinheiro ou crédito
• Combos disponíveis quando você quiser vender mais rápido

Dá uma olhada quando puder.

— Equipe Match Imóveis`
    },
    {
      assunto: 'Seus créditos de boas-vindas ainda estão aí (e seu link também)',
      corpo: `Olá {nome},

Você ganhou créditos de boas-vindas ao criar sua conta, mas pra receber leads de verdade é preciso escolher um combo. Enquanto isso, aproveite seu link de indicação — comissão contínua toda vez que alguém se cadastrar por ele.

• Login com os dados do seu cadastro
• Comissão por indicação, sem custo nenhum
• Combos com preços pra cada momento do seu negócio

Entra na conta e confere as opções.

— Equipe Match Imóveis`
    },
    {
      assunto: 'Um lembrete: sua conta já pode gerar renda de dois jeitos',
      corpo: `Olá {nome},

Sua conta já foi criada, mas ainda não tem combo ativo. É o combo que traz leads pra sua carteira — mas seu link de indicação já está funcionando, gerando comissão contínua sem precisar comprar nada.

• Faça login normalmente
• Comissão por indicação, ativa desde já
• Veja os combos quando quiser vender mais rápido

Não deixa a conta parada, vale a pena conferir.

— Equipe Match Imóveis`
    },
    {
      assunto: 'Falta pouco — e você já pode estar ganhando enquanto decide',
      corpo: `Olá {nome},

Reforçando: sua conta na Match Imóveis já está criada. Enquanto decide sobre o combo, seu link de indicação já está ativo — cada corretor ou imobiliária que você indicar gera comissão contínua pra você.

• Entre com o login que já tem
• Comissão em dinheiro ou crédito
• Escolha o combo quando fizer sentido

Se tiver qualquer dúvida, é só responder esse e-mail.

— Equipe Match Imóveis`
    }
  ]
};

function _sorteia(lista) { return lista[Math.floor(Math.random() * lista.length)]; }
// afiliado com peso maior (40%) — pedido explícito do Renato (ago/2026) pra
// focar a reativação da campanha geral no ganhar-indicando, sem tirar
// pagina/demanda de circulação (30% cada).
function _sortearModelo() {
  const r = Math.random();
  const tipo = r < 0.4 ? 'afiliado' : r < 0.7 ? 'pagina' : 'demanda';
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

// Desempenho por modelo/assunto da campanha de aquisição (corretor e
// imobiliária, pagina/demanda/followup1/2/3) — mesmo formato de
// statsEmailEnvios() (services/email.js), pra dar pra juntar as duas listas
// numa só em /admin/emails. Faltava (ago/2026, achado pelo Renato): essa
// campanha nunca passa `tipo` pro enviarEmail() — _enviarDaFilaPrincipal e
// _enviarFollowup chamam sem esse parâmetro, então nunca gravava em
// email_envios (só grava se `tipo` vier preenchido, ver services/email.js) —
// a campanha inteira ficava invisível na tela "Modelos de Email", mesmo
// enviando de verdade e sendo rastreada à parte em campanha_contatos.
async function statsPorModeloEmail() {
  await _garantirColunas();
  const { rows } = await query(`
    SELECT modelo_usado as tipo, titulo_usado as assunto,
      COUNT(*)::int as enviados,
      COUNT(aberto_em)::int as abertos,
      COUNT(clicado_em)::int as clicados,
      MAX(enviado_em) as ultimo_envio
    FROM campanha_contatos
    WHERE status = 'enviado' AND modelo_usado IS NOT NULL
    GROUP BY modelo_usado, titulo_usado
    ORDER BY modelo_usado, enviados DESC
  `);
  return rows.map(r => ({ ...r, variante: null, botao_texto: CTA_POR_TIPO[r.tipo] || null }));
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
  pagina: 'Não perder o próximo lead →',
  demanda: 'Ver a demanda agora →',
  afiliado: 'Ativar meu link agora →',
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

// Pool pro programa de afiliados (ago/2026): quem já abriu o e-mail de
// aquisição, parece corretor, tem celular, ainda não é usuário cadastrado e
// ninguém pegou ainda — mesma base de dados de /admin/campanha/contatos,
// só que aqui é o job automático (server.js) que distribui, não precisa de
// nenhum disparo de WhatsApp oficial ser criado antes (ver
// _rodarDistribuicaoContatosAfiliado). Prioriza quem clicou (interesse
// mais forte) antes de quem só abriu.
async function listarContatosAbertosSemDono() {
  await _garantirColunas();
  const { rows } = await query(`
    SELECT id, nome, email, celular, aberto_em, clicado_em, criado_em
    FROM campanha_contatos
    WHERE aberto_em IS NOT NULL AND parece_corretor = true
      AND celular IS NOT NULL AND celular != ''
      AND (atendido_por IS NULL OR atendido_por = '')
      AND LOWER(email) NOT IN (SELECT LOWER(email) FROM usuarios WHERE email IS NOT NULL AND email != '')
    ORDER BY (clicado_em IS NULL), aberto_em ASC
  `);
  return rows;
}

// Contatos já atribuídos a um afiliado que passaram 24h sem ele clicar em
// "Falar no WhatsApp" (wa_manual_enviado_em) — elegíveis pra reatribuição
// automática (mesmo motivo do rebalanceamento de disparos_contatos: contato
// parado alguém puxa, e afiliado novo que acabou de assinar contrato
// também precisa começar a receber).
async function listarContatosAfiliadoParaReatribuir() {
  await _garantirColunas();
  const { rows } = await query(`
    SELECT id, nome, email, celular, atendido_por, atendido_em
    FROM campanha_contatos
    WHERE atendido_por IS NOT NULL AND atendido_por != ''
      AND wa_manual_enviado_em IS NULL
      AND atendido_em < NOW() - INTERVAL '24 hours'
      AND LOWER(email) NOT IN (SELECT LOWER(email) FROM usuarios WHERE email IS NOT NULL AND email != '')
  `);
  return rows;
}

// Atribuição/reatribuição pro programa de afiliados — diferente de
// marcarAtendido (que não sobrescreve se já tiver dono), aqui sempre
// sobrescreve porque quem chama já decidiu que é pra mudar de dono.
async function atribuirContatoAfiliado(id, codigo, nome, cor) {
  await _garantirColunas();
  await query(
    `UPDATE campanha_contatos SET atendido_por=$1, atendido_por_nome=$2, atendido_por_cor=$3, atendido_em=NOW() WHERE id=$4`,
    [codigo, nome, cor, id]
  );
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
  marcarWhatsappManualEnviado, listarContatosAbertosSemDono,
  listarContatosAfiliadoParaReatribuir, atribuirContatoAfiliado,
  statsPorModeloEmail
};
