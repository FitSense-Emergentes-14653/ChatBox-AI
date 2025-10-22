import { runChatReply } from './ai.service.js';
import { saveSummary } from '../repos/summaries.repo.js';

export async function runSummaryAndSave({ userId, history }) {
  const transcript = history
    .filter(m => m.role === 'user' || m.role === 'assistant')
    .map(m => `${m.role.toUpperCase()}: ${m.text}`)
    .join('\n');

  const prompt = `
Eres un asistente que resume una conversación para un coach de fitness.
Devuelve SIEMPRE este formato exacto (texto plano, SIN markdown):

RESUMEN:
- (5 a 8 oraciones cortas con: objetivos, estado, barreras, recomendaciones, tono)

APODO:
- (si el usuario dijo cómo prefiere ser llamado, escribe solo el apodo; si no, escribe "ninguno")

NOTAS:
- (1–2 frases útiles para recordar en la próxima sesión, sin PII)
  
CONVERSACIÓN:
${transcript}
`.trim();

  const raw = await runChatReply({ prompt });
  const summary = raw.trim(); 

  await saveSummary(userId, summary, history.length);
  return { summary };
}
