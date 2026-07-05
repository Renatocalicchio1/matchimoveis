const { SESClient, VerifyEmailIdentityCommand } = require('@aws-sdk/client-ses');

const ses = new SESClient({
  region: process.env.AWS_REGION || 'us-east-2',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  }
});

const emails = [
  'jackchangg@yandex.com','vendaswilsonimoveis@hotmail.com','anagaidos2024@gmail.com',
  'claudia@firstimoveis.com.br','alvaro.gutierrezimoveis@hotmail.com','financeiro@jcbrokers.com.br',
  'moreirasilvacorretor@gmail.com','isaac.i.imoveis@gmail.com','rcrdteddy@gmail.com',
  'flaviosuacasanoguaruja@gmail.com','jrsnimoveis@gmail.com','Imoveis.camargocunha@gmail.com',
  'sallesnegociosimobiliarios@gmail.com','marcosbuchhorn@gmail.com','renato@rankim.com.br',
  'leopoldovivo2022@gmail.com','alexanset@gmail.com','cristovao.youinc@gmail.com',
  'fluowai@gmail.com','flaviodecar@gmail.com','angelis.dimensao@gmail.com',
  'klebertavolaro@gmail.com','haickalanzarin@gmail.com','rodrigoferreira@rfqimoveis.com.br',
  'explorer.shoji@gmail.com','corretoravalsoares@gmail.com','mcdaservicos@gmail.com',
  'alexandrefspaz@gmail.com','mautavinho@gmail.com','financeiro@bahaoimoveis.com.br',
  'tonybarrosadm3@gmail.com'
];

async function run(){
  for(const email of emails){
    try {
      await ses.send(new VerifyEmailIdentityCommand({ EmailAddress: email }));
      console.log('✅ Verificação enviada:', email);
    } catch(e){ console.error('❌ Erro:', email, e.message); }
    await new Promise(r=>setTimeout(r,200));
  }
}
run();
