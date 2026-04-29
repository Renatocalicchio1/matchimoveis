require('dotenv').config();
const twilio = require('twilio');

const client = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);

async function send() {
  try {
    const message = await client.messages.create({
      from: process.env.TWILIO_WHATSAPP_FROM,
      to: process.env.TEST_CORRETOR_WHATSAPP,
      body: "🚀 Teste Rankim - Lead com match pronto!"
    });

    console.log("ENVIADO:", message.sid);
  } catch (err) {
    console.error("ERRO:", err.message);
  }
}

send();
