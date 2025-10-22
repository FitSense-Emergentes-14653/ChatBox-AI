export const sessions = new Map(); 
const MAX_TURNS = 8;

export function pushTurn(sessionId, role, text) {
  const arr = sessions.get(sessionId) || [];
  arr.push({ role, text });
  while (arr.length > MAX_TURNS) arr.shift();
  sessions.set(sessionId, arr);
}

export function recentBlock(arr = []) {
  return arr
    .filter(m => m.role === 'user' || m.role === 'assistant')
    .map(m => `${m.role.toUpperCase()}: ${m.text}`)
    .join('\n') || '(sin contexto)';
}
