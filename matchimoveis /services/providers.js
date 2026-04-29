function extractPortalFromUrl(url) {
  const value = String(url || '').toLowerCase();
  if (value.includes('loft.com.br')) return 'loft';
  if (value.includes('imovelweb.com.br')) return 'imovelweb';
  if (value.includes('quintoandar.com.br')) return 'quintoandar';
  return 'desconhecido';
}

function inferIdFromUrl(url) {
  const value = String(url || '').trim();
  if (!value) return '';

  if (value.includes('loft.com.br')) {
    const match = value.match(/\/([a-z0-9]+)(?:\?|$)/i);
    return match ? match[1] : '';
  }

  const match = value.match(/-(\d+)\.html/i);
  return match ? match[1] : '';
}

function createOriginFromRow(row) {
  const portal = extractPortalFromUrl(row.listingUrl);
  const inferredId = inferIdFromUrl(row.listingUrl);

  return {
    source: row.listingUrl ? 'url' : row.listingId ? 'id' : 'none',
    portal,
    listingId: row.listingId || inferredId || '',
    listingUrl: row.listingUrl || '',
    needsBaseUrl: !row.listingUrl && !!row.listingId,
    status: !row.listingUrl && !row.listingId ? 'ignorado' : 'pronto_para_extracao'
  };
}

module.exports = {
  extractPortalFromUrl,
  inferIdFromUrl,
  createOriginFromRow
};
