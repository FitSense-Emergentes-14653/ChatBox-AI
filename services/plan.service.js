import { pool } from '../data/db.js';
import { runChatReply } from './ai.service.js';
import {
  normalizeProfile,
  validateProfile,
  mapGoalToCategories,
  deriveSafetySpec
} from './profile.service.js';
import { saveRoutine } from '../repos/routines.repo.js';

function extractJsonBlock(text = '') {
  const m = text.match(/```json\s*([\s\S]*?)```/i);
  if (m) return m[1].trim();
  const t = text.trim();
  if (t.startsWith('{') && /"weeks"\s*:/.test(t)) return t;
  return null;
}

function collectExerciseNames(plan) {
  if (!plan?.weeks?.length) return [];
  const names = [];
  for (const w of plan.weeks)
    for (const d of (w.days || w.sessions || []))
      for (const e of (d.exercises || []))
        if (e?.name) names.push(e.name);
  return [...new Set(names)];
}

async function fetchImagesMapByNames(names = []) {
  if (!names.length) return new Map();
  const ph = names.map(() => '?').join(',');
  const [rows] = await pool.query(
    `SELECT name, image_url FROM exercises WHERE name IN (${ph})`,
    names
  );
  return new Map(rows.map(r => [r.name, r.image_url || null]));
}

async function enrichPlanWithImages(planJson) {
  const names = collectExerciseNames(planJson);
  if (!names.length) return planJson;
  const imgMap = await fetchImagesMapByNames(names);

  for (const w of planJson.weeks)
    for (const d of (w.days || w.sessions || []))
      for (const e of (d.exercises || []))
        if (e?.name && e.image_url == null)
          e.image_url = imgMap.get(e.name) ?? null;

  return planJson;
}

function renderPlanMarkdown(plan, { showWeekTitles = true } = {}) {
  if (!plan?.weeks?.length) return 'No pude construir el plan.';
  const lines = [];
  lines.push('# Tu plan mensual');

  if (plan.global_notes) {
    lines.push('\n**Notas generales:** ' + plan.global_notes.trim());
  }
  if (plan.frequency) {
    lines.push(`\n**Frecuencia sugerida:** ${plan.frequency} días/semana`);
  }

  for (const w of plan.weeks) {
    if (showWeekTitles) lines.push(`\n## Semana ${w.week}`);
    const days = w.days || w.sessions || [];
    for (const d of days) {
      lines.push(`\n**${d.name}**`);
      if (d.warmup) lines.push(`• Calentamiento: ${d.warmup}`);
      if (Array.isArray(d.exercises) && d.exercises.length) {
        d.exercises.forEach((e, i) => {
          lines.push(
            `${i + 1}. ${e.name} — ${e.sets} x ${e.reps} ` +
            `(descanso ${e.rest_sec}s${e.notes ? `, ${e.notes}` : ''})`
          );
        });
      }
      if (d.cooldown) lines.push(`• Enfriamiento: ${d.cooldown}`);
    }
  }
  return lines.join('\n');
}


export async function generateMonthlyPlan({
  userId,
  lastPlanDate,
  profile,
  history,
  pinnedFacts,
  system_prompt
}) {
  const prof = normalizeProfile(profile);
  const errs = validateProfile(prof);
  if (errs.length) return { reply: `Perfil inválido: ${errs.join(', ')}` };

  const categories = mapGoalToCategories(prof.goal);
  const spec = deriveSafetySpec(prof);

  const { fetchCatalog } = await import('./catalog.service.js');
  const catalogs = {};
  for (const dayLabel of spec.daySplits) {
    catalogs[dayLabel] = await fetchCatalog({
      p: prof,
      categories,
      dayLabel,
      contraindications: spec.contraindications,
      excludeNames: new Set(),
      limit: 40
    });
  }

  const compactList = (rows, max = 18) =>
    rows.slice(0, max).map((r, i) =>
      `${i + 1}. ${r.name} — ${r.primary_muscle} | ${r.level} | ${r.equipment}`
    ).join('\n');

  const lists = Object.entries(catalogs).map(
    ([label, rows]) => `CATÁLOGO ${label.toUpperCase()}:\n${compactList(rows, 18)}`
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
- Repetir ejercicios entre semanas es válido.
- Adapta volumen e intensidad a edad, nivel, objetivo, entorno y condiciones.
- Semana 4 = deload (~20% menos volumen o -1 serie).
- Incluye calentamiento (5–8 min) y enfriamiento por día.
- Elige SOLO nombres de ejercicios que están en los catálogos.

SALIDA:
Devuelve **SOLO** un bloque \`\`\`json\`\`\` con la forma EXACTA:

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
`.trim();

  const raw = await runChatReply({ prompt: planPrompt, system_prompt });

  let parsedPlan = null;
  let replyText = 'No pude construir el plan.';
  let chosen = [];

  try {
    const jsonText = extractJsonBlock(raw);
    if (jsonText) {
      parsedPlan = JSON.parse(jsonText);

      if (prof?.frequency && !parsedPlan.frequency) {
        parsedPlan.frequency = prof.frequency;
      }

      parsedPlan = await enrichPlanWithImages(parsedPlan);

      await saveRoutine(userId, parsedPlan);

      const daysOrSessions = (w) => (w.days || w.sessions || []);
      chosen = parsedPlan.weeks
        .flatMap(w => daysOrSessions(w).flatMap(d => (d.exercises || []).map(e => e.name)))
        .filter(Boolean);

      replyText = renderPlanMarkdown(parsedPlan, { showWeekTitles: true });
    } else {
      replyText = 'No recibí un JSON válido del generador.';
    }
  } catch (e) {
    console.warn('JSON mensual inválido:', e?.message);
    replyText = 'Ocurrió un problema al construir el plan. Intenta de nuevo.';
  }

  return { reply: replyText, planJson: parsedPlan, chosenExercises: chosen };
}
