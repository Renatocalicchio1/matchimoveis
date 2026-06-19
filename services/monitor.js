const { query } = require('./db');

const EVOLUTION_URL = process.env.EVOLUTION_URL || 'https://match-evolution-api.onrender.com';
const EVOLUTION_KEY = process.env.EVOLUTION_KEY || 'match2025evolution';
const INSTANCE = 'REN-HUH6';
const NUMERO = '5547992010888';

let _loginFalhos = {};
let _ultimoAlertaLogin = 0;
let _dbOfflineAlertado = false;

async function enviarAlerta(mensagem) {
  try {
    await fetch(`${EVOLUTION_URL}/message/sendText/${INSTANCE}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'apikey': EVOLUTION_KEY },
      body: JSON.stringify({ number: NUMERO, text: `🚨 *ALERTA MatchImóveis*\n\n${mensagem}` })
    });
    console.log('[MONITOR] Alerta enviado:', mensagem);
  } catch(e) {
    console.error('[MONITOR] Erro ao enviar alerta:', e.message);
  }
}

// Registra tentativa de login falha
function registrarLoginFalho(ip) {
  if (!_loginFalhos[ip]) _loginFalhos[ip] = { count: 0, ultimaTentativa: Date.now() };
  _loginFalhos[ip].count++;
  _loginFalhos[ip].ultimaTentativa = Date.now();

  if (_loginFalhos[ip].count >= 5) {
    const agora = Date.now();
    if (agora - _ultimoAlertaLogin > 10 * 60 * 1000) { // alerta no máximo a cada 10 min
      _ultimoAlertaLogin = agora;
      enviarAlerta(`⚠️ Tentativas de login suspeitas!\nIP: ${ip}\nTentativas: ${_loginFalhos[ip].count}\nHorário: ${new Date().toLocaleString('pt-BR', {timeZone:'America/Sao_Paulo'})}`);
    }
  }
}

// Verifica saúde do banco
async function verificarBanco() {
  try {
    await query('SELECT 1');
    if (_dbOfflineAlertado) {
      _dbOfflineAlertado = false;
      enviarAlerta('✅ Banco de dados voltou ao normal!');
    }
  } catch(e) {
    if (!_dbOfflineAlertado) {
      _dbOfflineAlertado = true;
      enviarAlerta(`❌ Banco de dados OFFLINE!\nErro: ${e.message}\nHorário: ${new Date().toLocaleString('pt-BR', {timeZone:'America/Sao_Paulo'})}`);
    }
  }
}

// Limpa IPs antigos a cada hora
function limparLoginsFalhos() {
  const agora = Date.now();
  for (const ip of Object.keys(_loginFalhos)) {
    if (agora - _loginFalhos[ip].ultimaTentativa > 60 * 60 * 1000) {
      delete _loginFalhos[ip];
    }
  }
}

function iniciarMonitor() {
  console.log('[MONITOR] ✅ Monitor de segurança iniciado');
  // Verifica banco a cada 5 minutos
  setInterval(verificarBanco, 5 * 60 * 1000);
  // Limpa IPs antigos a cada hora
  setInterval(limparLoginsFalhos, 60 * 60 * 1000);
  // Alerta de startup
  setTimeout(() => {
    enviarAlerta(`✅ Sistema MatchImóveis iniciado!\nHorário: ${new Date().toLocaleString('pt-BR', {timeZone:'America/Sao_Paulo'})}`);
  }, 30 * 1000);
}

module.exports = { iniciarMonitor, registrarLoginFalho, enviarAlerta };
