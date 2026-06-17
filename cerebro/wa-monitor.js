'use strict';
const https = require('https');

const EVOLUTION_URL = process.env.EVOLUTION_URL || 'https://match-evolution-api.onrender.com';
const API_KEY = process.env.EVOLUTION_KEY || 'match2025evolution';
const HOST = EVOLUTION_URL.replace('https://','').replace('http://','');

function evReq(method, path, body, cb) {
  const bodyStr = body ? JSON.stringify(body) : '';
  const options = {
    hostname: HOST,
    path: path,
    method: method,
    headers: {
      'apikey': API_KEY,
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(bodyStr)
    },
    timeout: 10000
  };
  const req = https.request(options, function(res) {
    let data = '';
    res.on('data', function(c){ data += c; });
    res.on('end', function(){
      try { cb(null, res.statusCode, JSON.parse(data)); }
      catch(e) { cb(null, res.statusCode, data); }
    });
  });
  req.on('error', function(e){ cb(e); });
  req.on('timeout', function(){ req.destroy(); cb(new Error('timeout')); });
  if (bodyStr) req.write(bodyStr);
  req.end();
}

// Verificar status de uma instância
function checkStatus(instancia, cb) {
  evReq('GET', '/instance/connectionState/' + instancia, null, function(err, status, data) {
    if (err) return cb(err);
    const state = (data && data.instance && data.instance.state) || 'unknown';
    cb(null, state);
  });
}

// Tentar conectar instância (sem QR — usa sessão salva)
function tentarConectar(instancia, cb) {
  evReq('GET', '/instance/connect/' + instancia, null, function(err, status, data) {
    if (err) return cb(err);
    cb(null, status, data);
  });
}

// Enviar mensagem de alerta para o admin
function alertarAdmin(mensagem) {
  const body = JSON.stringify({
    number: '5547991888555',
    text: '🤖 MatchImóveis Alert\n' + mensagem
  });
  const options = {
    hostname: HOST,
    path: '/message/sendText/match-renhuh6',
    method: 'POST',
    headers: {
      'apikey': API_KEY,
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(body)
    }
  };
  const req = https.request(options, function(){});
  req.on('error', function(){});
  req.write(body);
  req.end();
}

// Instâncias para monitorar
const INSTANCIAS = [
  { nome: 'match-renhuh6', usuario: 'REN-HUH6' },
  { nome: 'match-janmgf9', usuario: 'JAN-MGF9' },
  { nome: 'match-maueham', usuario: 'MAU-EHAM' },
];

const _tentativas = {};

async function monitorar() {
  console.log('[WA-MONITOR] verificando instâncias...');
  
  for (const inst of INSTANCIAS) {
    checkStatus(inst.nome, function(err, state) {
      if (err) {
        console.error('[WA-MONITOR] erro ao checar', inst.nome, err.message);
        return;
      }
      
      console.log('[WA-MONITOR]', inst.nome, '→', state);
      
      if (state === 'open') {
        // Conectado — resetar tentativas
        _tentativas[inst.nome] = 0;
        return;
      }
      
      // Desconectado — tentar reconectar
      _tentativas[inst.nome] = (_tentativas[inst.nome] || 0) + 1;
      console.log('[WA-MONITOR] tentando reconectar', inst.nome, '(tentativa', _tentativas[inst.nome], ')');
      
      tentarConectar(inst.nome, function(err2, status, data) {
        if (err2 || status !== 200) {
          console.log('[WA-MONITOR] reconexão falhou para', inst.nome);
          // Após 3 tentativas falhas, notifica admin
          if (_tentativas[inst.nome] >= 3) {
            const msg = '⚠️ Instância ' + inst.nome + ' (' + inst.usuario + ') está desconectada há ' + _tentativas[inst.nome] + ' verificações.\n\nAcesse: matchimoveis.ia.br/app/perfil para reconectar.';
            console.log('[WA-MONITOR] alertando admin:', msg);
            alertarAdmin(msg);
            _tentativas[inst.nome] = 0; // Reset para não spam
          }
        } else {
          console.log('[WA-MONITOR] reconexão iniciada para', inst.nome, data);
        }
      });
    });
  }
}

module.exports = { monitorar, checkStatus, tentarConectar };
