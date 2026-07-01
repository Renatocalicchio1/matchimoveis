const { SESClient, SendEmailCommand } = require('@aws-sdk/client-ses');

const ses = new SESClient({
  region: process.env.AWS_REGION || 'us-east-2',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  }
});

const FROM = process.env.AWS_SES_FROM || 'noreply@matchimoveis.online';

async function enviarEmail({ para, assunto, html, texto }) {
  const cmd = new SendEmailCommand({
    Source: `MatchImóveis <${FROM}>`,
    Destination: { ToAddresses: [para] },
    Message: {
      Subject: { Data: assunto, Charset: 'UTF-8' },
      Body: {
        Html: { Data: html, Charset: 'UTF-8' },
        Text: { Data: texto || assunto, Charset: 'UTF-8' }
      }
    }
  });
  const result = await ses.send(cmd);
  console.log('[EMAIL] enviado para:', para, '| MessageId:', result.MessageId);
  return result;
}

module.exports = { enviarEmail };
