import { runChatReply } from './ai.service.js';
import { normalizeProfile, validateProfile, mapGoalToCategories, deriveSafetySpec } from './profile.service.js';
import { getRecentUsedNames, saveChosenExercises } from '../repos/history.repo.js';
import { saveRoutine } from '../repos/routines.repo.js';

function compactList(rows, max = 18) {
  return rows.slice(0, max).map((r, i) =>
    `${i + 1}. ${r.name} — ${r.primary_muscle} | ${r.level} | ${r.equipment}`
  ).join('\n');
}

function extractJsonBlock(text = '') {
  const m = text.match(/```json\s*([\s\S]*?)```/i);
  if (m) return m[1].trim();
  const t = text.trim();
  if (t.startsWith('{') && /"weeks"\s*:/.test(t)) return t;
  return null;
}

export async function generateMonthlyPlan({ userId, lastPlanDate, profile, history, pinnedFacts, system_prompt }) {
  const prof = normalizeProfile(profile);
  const errs = validateProfile(prof);
  if (errs.length) return { reply: `Perfil inválido: ${errs.join(', ')}` };

  const categories = mapGoalToCategories(prof.goal);
  const spec = deriveSafetySpec(prof);
  const excludeNames = await getRecentUsedNames(userId, 7);

  const { fetchCatalog } = await import('./catalog.service.js');
  const catalogs = {};
  for (const dayLabel of spec.daySplits) {
    catalogs[dayLabel] = await fetchCatalog({
      p: prof,
      categories,
      dayLabel,
      contraindications: spec.contraindications,
      excludeNames,
      limit: 40
    });
  }
  const lists = Object.entries(catalogs).map(([label, rows]) =>
    `CATÁLOGO ${label.toUpperCase()}:\n${compactList(rows, 18)}`
  ).join('\n\n');

  const planPrompt = `
${pinnedFacts}
Contexto reciente:
${history.map(m => `${m.role.toUpperCase()}: ${m.text}`).join('\n') || '(sin contexto)'}

Perfil normalizado:
${JSON.stringify(prof, null, 2)}

Especificación de seguridad/volumen:
${JSON.stringify({ reps: spec.reps, rest_sec: spec.rest, cues: spec.cues, daySplits: spec.daySplits }, null, 2)}

Catálogos (EXCLUSIVAMENTE desde la BASE DE DATOS):
${lists}

Tarea:
- Genera un PLAN MENSUAL (4 semanas) con ${prof.frequency} días/semana siguiendo "daySplits".
- Puedes repetir ejercicios entre semanas.
- Adapta volumen e intensidad a edad, nivel, objetivo, entorno y condiciones.
- Semana 4 = deload (~20% menos volumen o -1 serie).
- Incluye calentamiento (5–8 min) y enfriamiento por día.
- Elige SOLO ejercicios listados en los catálogos.

Salida (dos partes):
1) Un bloque \`\`\`json\`\`\` EXACTO:
{
  "weeks": [
    { "week": 1, "days": [
      { "name": "Día X - <Label>", "warmup": "…", "exercises": [
        { "name": "NombreExactoDeLaLista", "sets": 3, "reps": "${spec.reps}", "rest_sec": ${spec.rest}, "notes": "opcional" }
      ], "cooldown": "…" }
    ]},
    { "week": 2, "days": [ ... ]},
    { "week": 3, "days": [ ... ]},
    { "week": 4, "days": [ ... ]}
  ],
  "global_notes": "indicaciones de seguridad, técnica y progresión"
}

2) Después del JSON, una versión breve y legible del plan para el usuario.
`.trim();

  const raw = await runChatReply({ prompt: planPrompt, system_prompt });


  let chosen = [];
  let parsedPlan = null;
  try {
    const jsonText = extractJsonBlock(raw);
    if (jsonText) {
      parsedPlan = JSON.parse(jsonText);
      if (parsedPlan?.weeks?.length) {
        const daysOrSessions = (w) => (w.days || w.sessions || []);
        chosen = parsedPlan.weeks.flatMap(w => daysOrSessions(w).flatMap(d => (d.exercises || []).map(e => e.name))).filter(Boolean);
        if (chosen.length) await saveChosenExercises(userId, [...new Set(chosen)]);

        await saveRoutine(userId, parsedPlan);
      }
    }
  } catch (e) {
    console.warn('JSON mensual inválido:', e?.message);
  }

  return { reply: raw, planJson: parsedPlan, chosenExercises: chosen };
}
