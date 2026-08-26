// Utilitário de consulta (não altera nada): descobre o número de telefone
// real por trás de um phone_number_id da Meta Cloud API — útil quando a
// inbox (/admin/whatsapp-cloud) mostra um ID que não está na lista
// conhecida (services/metaWhatsapp.js NUMEROS_DISPARO).
//
// Como rodar (Render Shell, dentro de /opt/render/project/src/):
//   node resolver-numero-whatsapp.js 955974100939599
//   (sem argumento, usa o ID reportado pelo Renato como padrão)

const axios = require('axios');

const API_VERSION = 'v21.0'; // mesma versão usada em services/metaWhatsapp.js
const ID_PADRAO = '955974100939599';

async function main() {
  const id = process.argv[2] || ID_PADRAO;
  const token = (process.env.META_WA_TOKEN || '').trim();
  if (!token) {
    console.error('[resolver-numero] META_WA_TOKEN não está configurado neste ambiente.');
    process.exit(1);
  }
  console.log('[resolver-numero] consultando phone_number_id:', id);
  try {
    const { data } = await axios.get(`https://graph.facebook.com/${API_VERSION}/${id}`, {
      params: { fields: 'display_phone_number,verified_name,quality_rating,code_verification_status' },
      headers: { Authorization: `Bearer ${token}` }
    });
    console.log('[resolver-numero] Número:', data.display_phone_number || '(não veio)');
    console.log('[resolver-numero] Nome verificado:', data.verified_name || '(não veio)');
    console.log('[resolver-numero] Qualidade:', data.quality_rating || '(não veio)');
    console.log('[resolver-numero] Status de verificação:', data.code_verification_status || '(não veio)');
  } catch (e) {
    const detalhe = e.response ? JSON.stringify(e.response.data, null, 2) : e.message;
    console.error('[resolver-numero] erro ao consultar a Meta:', detalhe);
  }
}

main();
