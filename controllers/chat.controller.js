import { pushTurn, sessions, recentBlock } from '../utils/historyMem.js';
import { daysBetween } from '../utils/time.js';
import { wantsPlan } from '../utils/intent.js';
import { extractWeekDay } from '../utils/parseWeekday.js';

import { runChatReply } from '../services/ai.service.js';
import { generateMonthlyPlan } from '../services/plan.service.js';
import { runSummaryAndSave } from '../services/summary.service.js';
import { mapUserRowToProfile } from '../services/profile.service.js';

import { getUserById } from '../repos/users.repo.js';
import {
  getLastRoutineDate,
  getLatestRoutine,
  pickPlanDay
} from '../repos/routines.repo.js';
import { getRecentSummaries } from '../repos/summaries.repo.js';

const system_prompt =
  "Eres FitSense, un coach de fitness profesional. Solo debes responder preguntas de tu área. " +
  "Si el usuario pide cambiar o agregar una rutina antes de 30 días desde el último plan, NO generes ejercicios nuevos ni un plan adicional. " +
  "Si ya pasaron ≥30 días, puedes proponer cambios o una rutina nueva, clara y segura. " +
  "NO generes plan ni rutina si el usuario no lo pidió explícitamente. " +
  "NO menciones la regla de 30 días salvo que el usuario pida plan/cambio. " +
  "Responde como coach: saluda solo en el primer turno de la sesión; luego continúa con naturalidad, sin presentarte. " +
  "Ofrece 1–2 consejos concretos. No inventes ni infieras datos personales.";

// ---------- Helpers de fecha seguros ----------
function safeIso(input) {
  if (!input) return null;
  if (input instanceof Date && !isNaN(input)) return input.toISOString();

  if (typeof input === 'string') {
    const candidate = input.includes('T')
      ? input
      : input.replace(' ', 'T') + 'Z';
    const d = new Date(candidate);
    return isNaN(d) ? null : d.toISOString();
  }

  const d = new Date(input);
  return isNaN(d) ? null : d.toISOString();
}

function isoDay(input) {
  const iso = safeIso(input);
  return iso ? iso.slice(0, 10) : 'N/D';
}

function addDaysISO(iso, days) {
  const d = new Date(iso);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

// ---------- Controladores ----------

export async function startSession(req, res) {
  try {
    const { userId, sessionId } = req.body || {};
    if (!userId) return res.status(400).json({ error: 'faltan datos' });

    const user = await getUserById(userId);
    if (!user) return res.status(404).json({ error: 'user_not_found' });

    const sid = sessionId || `s-${userId}`;
    if (!sessions.has(sid)) {
      const seed = [];
      const recents = await getRecentSummaries(userId, 2); // últimos 2

      if (recents.length) {
        const joined = recents
          .map(r => `(${isoDay(r.created_at)}) ${r.summary}`)
          .join('\n---\n');
        seed.push({
          role: 'context',
          text: `RESUMENES_ANTERIORES:\n${joined}`,
        });
      }

      sessions.set(sid, seed);
    }

    return res.json({ ok: true, sessionId: sid });
  } catch (err) {
    console.error('startSession error:', err);
    return res.status(500).json({ ok: false, error: 'internal_error' });
  }
}

export function resetSession(req, res) {
  const { userId, sessionId } = req.body || {};
  const sid = sessionId || (userId ? `s-${userId}` : null);
  if (sid) sessions.delete(sid);
  return res.json({ ok: true });
}

export async function endSession(req, res) {
  try {
    const { userId, sessionId } = req.body || {};
    if (!userId) return res.status(400).json({ error: 'faltan parámetros' });

    const user = await getUserById(userId);
    if (!user) return res.status(404).json({ error: 'user_not_found' });

    const sid = sessionId || `s-${userId}`;
    const history = sessions.get(sid) || [];
    if (history.length === 0) {
      sessions.delete(sid);
      return res.json({ ok: true, saved: false, reason: 'empty_session' });
    }

    await runSummaryAndSave({ userId, history });
    sessions.delete(sid);
    return res.json({ ok: true, saved: true });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'internal_error' });
  }
}

export async function sendMessage(req, res) {
  try {
    const { userId, sessionId, message, forcePlan = false } = req.body || {};
    if (!userId || !message) {
      return res.status(400).json({ error: 'faltan parámetros' });
    }

    const sid = sessionId || `s-${userId}`;

    const userRow = await getUserById(userId);
    if (!userRow) return res.status(404).json({ error: 'user_not_found' });
    const profile = mapUserRowToProfile(userRow);

    const lastPlanDate = await getLastRoutineDate(userId);
    const lastISO = safeIso(lastPlanDate);

    pushTurn(sid, 'user', message);
    const history = sessions.get(sid) || [];

    const days = lastISO ? daysBetween(lastISO) : null;
    const canChange = lastPlanDate ? days >= 30 : true;
    const wants = wantsPlan(message, forcePlan);

    const recents = await getRecentSummaries(userId, 2);
    const memoryText = recents.length
      ? `Memoria (últimos 2 resúmenes):\n${recents
          .map(r => `(${isoDay(r.created_at)}) ${r.summary}`)
          .join('\n---\n')}\n\n`
      : '';

    const prevAssistantTurns = history.filter(m => m.role === 'assistant').length;
    const shouldGreet = prevAssistantTurns === 0;
    const greetingRule = shouldGreet
      ? "- Abre con un saludo breve una sola vez.\n"
      : "- NO saludes ni te presentes; enlaza con lo anterior.\n";

    const lastPlanLine = lastISO
      ? `${isoDay(lastISO)} (hace ${days} días)`
      : 'ninguno';

    const pinnedFacts = `
Perfil (desde BD):
- UserID: ${userId}
- Nombre: ${userRow.nombre ?? 'N/D'}
- Edad: ${profile.age ?? 'N/D'}, Peso: ${profile.weightKg ?? 'N/D'}kg, Altura: ${profile.heightM ?? 'N/D'}m
- Nivel: ${profile.level ?? 'N/D'}
- Objetivo: ${profile.goal ?? 'N/D'}
- Entorno: ${profile.environment ?? 'home'}
- Frecuencia: ${profile.frequency ?? '3'} días/semana
- Último plan: ${lastPlanLine}
`.trim();

    const { week: askedWeek, day: askedDay } = extractWeekDay(message);
    if (askedDay) {
      const latest = await getLatestRoutine(userId);

      if (!latest?.plan) {
        const fallback = "No encuentro un plan guardado aún. ¿Quieres generar una nueva rutina?";
        pushTurn(sid, 'assistant', fallback);
        return res.json({ reply: fallback, canChange, generatedPlan: false });
      }

      const freq = profile.frequency || 3;

      // --- Validación estricta ---
      if (askedWeek < 1 || askedWeek > 4) {
        const reply = `Tu plan solo tiene 4 semanas. Dime un número entre 1 y 4.`;
        pushTurn(sid, 'assistant', reply);
        return res.json({ reply, generatedPlan: false, canChange });
      }

      if (askedDay < 1 || askedDay > freq) {
        const reply = `La semana ${askedWeek} tiene **${freq} días**. Dime un día entre **1 y ${freq}**.`;
        pushTurn(sid, 'assistant', reply);
        return res.json({ reply, generatedPlan: false, canChange });
      }

      // --- Obtención correcta del día ---
      const pick = pickPlanDay(latest.plan, askedWeek, askedDay);

      if (pick?.day) {
        const d = pick.day;
        const exList = (d.exercises || [])
          .map((e, i) => `${i + 1}. ${e.name} — ${e.sets} x ${e.reps} (descanso ${e.rest_sec}s)`)
          .join("\n");

        const reply =
          `Tu entrenamiento para Semana ${askedWeek}, Día ${askedDay} es:\n\n` +
          `**${d.name}**\n` +
          (d.warmup ? `Calentamiento: ${d.warmup}\n` : '') +
          exList + "\n" +
          (d.cooldown ? `Enfriamiento: ${d.cooldown}` : '');

        pushTurn(sid, 'assistant', reply);
        return res.json({
          reply,
          canChange,
          generatedPlan: false
        });
      }
    }


    if (wants && lastISO && days < 30) {
      const nextAllowedAt = addDaysISO(lastISO, 30);
      const reply =
        `Aún no corresponde actualizar tu rutina. ` +
        `Puedes pedir una nueva a partir del ${nextAllowedAt}. ` +
        `Mientras tanto, ¿quieres que te recuerde qué toca hoy o prefieres tips para progresar con la actual?`;
      pushTurn(sid, 'assistant', reply);
      return res.json({
        reply,
        canChange: false,
        generatedPlan: false,
        daysSinceLastPlan: days,
        reason: 'too_early',
        nextAllowedAt,
      });
    }

    if (!wants) {
      const prompt = `
${memoryText}
${pinnedFacts}

Contexto reciente:
${recentBlock(history)}

Mensaje del usuario:
${message}

Instrucciones:
${greetingRule}- NO generes plan ni rutina (el usuario no lo pidió o no han pasado 30 días).
- NO menciones la regla de 30 días salvo que el usuario pida plan/cambio.
- Responde como coach: aclara dudas y ofrece 1–2 consejos accionables.
- Si procede, indica que cuando escriba "quiero una rutina" puedes crearla (si ya pasaron 30 días o si aún no tiene plan).
`.trim();

      const reply = await runChatReply({ prompt, system_prompt });
      pushTurn(sid, 'assistant', reply);
      return res.json({
        reply,
        canChange,
        generatedPlan: false,
        daysSinceLastPlan: Number.isFinite(days) ? days : null,
      });
    }

    const result = await generateMonthlyPlan({
      userId,
      lastPlanDate,
      profile,
      history,
      pinnedFacts: `${memoryText}${pinnedFacts}`,
      system_prompt,
    });

    pushTurn(sid, 'assistant', result.reply);
    return res.json({
      reply: result.reply,
      planJson: result.planJson || null,
      chosenExercises: result.chosenExercises || [],
      canChange,
      generatedPlan: !!result.planJson,
      daysSinceLastPlan: Number.isFinite(days) ? days : null,
    });
  } catch (err) {
    console.error('sendMessage error:', err);
    return res.status(500).json({ error: 'internal_error' });
  }
}

// ---------- No matar proceso en dev ----------
process.on('unhandledRejection', (reason, p) => {
  console.error('⚠️ Unhandled Rejection at:', p, 'reason:', reason);
  // No cierres el proceso, solo loguea
});
