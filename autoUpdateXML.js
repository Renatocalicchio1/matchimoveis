const fs = require('fs');
const { execSync } = require('child_process');

const INTERVALO_HORAS = 12;
const INTERVALO_MS = INTERVALO_HORAS * 60 * 60 * 1000;

function rodarAtualizacao() {
  console.log('[autoUpdateXML] Iniciando:', new Date().toLocaleString('pt-BR'));
  try {
    const users = JSON.parse(fs.readFileSync('users.json', 'utf8'));
    const comXml = users.filter(u => u.xmlUrl);
    if (comXml.length === 0) {
      console.log('[autoUpdateXML] Nenhum usuario com XML.');
      return;
    }
    comXml.forEach(user => {
      try {
        console.log('[autoUpdateXML] Atualizando:', user.nome, '|', user.xmlUrl);
        execSync(`node importXMLCompleto.js "${user.xmlUrl}" "${user.id}"`, { stdio: 'inherit' });
        const usersAtual = JSON.parse(fs.readFileSync('users.json', 'utf8'));
        const idx = usersAtual.findIndex(u => u.id === user.id);
        if (idx >= 0) {
          const imoveis = JSON.parse(fs.readFileSync('imoveis.json', 'utf8'));
          const ativos = imoveis.filter(i => String(i.userId || i.usuarioId || '') === String(user.id) && i.status === 'ativo');
          usersAtual[idx].xmlAtualizadoEm = new Date().toISOString();
          usersAtual[idx].xmlTotal = ativos.length;
          fs.writeFileSync('users.json', JSON.stringify(usersAtual, null, 2));
        }
        console.log('[autoUpdateXML] Concluido:', user.nome);
      } catch(e) {
        console.error('[autoUpdateXML] Erro:', user.nome, e.message);
      }
    });
  } catch(e) {
    console.error('[autoUpdateXML] Erro geral:', e.message);
  }
}

rodarAtualizacao();
setInterval(rodarAtualizacao, INTERVALO_MS);
console.log('[autoUpdateXML] Servico iniciado. Proxima atualizacao em', INTERVALO_HORAS, 'horas.');
