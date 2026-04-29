const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, '..', 'events.json');

function readEvents() {
  if (!fs.existsSync(file)) return [];
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return [];
  }
}

function saveEvents(events) {
  fs.writeFileSync(file, JSON.stringify(events, null, 2));
}

function logEvent(event = {}) {
  const events = readEvents();

  const item = {
    id: Date.now() + '-' + Math.random().toString(36).slice(2, 8),
    createdAt: new Date().toISOString(),
    type: event.type || 'unknown',
    leadId: event.leadId ?? null,
    clientName: event.clientName ?? null,
    corretorId: event.corretorId ?? null,
    propertyId: event.propertyId ?? null,
    matchId: event.matchId ?? null,
    source: event.source ?? null,
    status: event.status ?? null,
    meta: event.meta || {}
  };

  events.push(item);
  saveEvents(events);
  return item;
}

module.exports = { readEvents, logEvent };
