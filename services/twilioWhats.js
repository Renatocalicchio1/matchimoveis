require('dotenv').config();
const twilio = require('twilio');

const client = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);

async function sendWhatsApp(to, body) {
  const message = await client.messages.create({
    from: process.env.TWILIO_WHATSAPP_FROM,
    to,
    body
  });

  return message.sid;
}

module.exports = { sendWhatsApp };
