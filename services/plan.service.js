import { pool } from '../data/db.js';
import { runChatReply } from './ai.service.js';
import {
  normalizeProfile,
  validateProfile,
  mapGoalToCategories,
  deriveSafetySpec
} from './profile.service.js';
import { saveRoutine } from '../repos/routines.repo.js';

/* ---------------------------- JSON extraction ---------------------------- */
function extractJsonBlock(text = '') {
  const m = text.match(/```json\s*([\s\S]*?)```/i);
  if (m) return m[1].trim();
  const t = text.trim();
  if (t.startsWith('{') && /"weeks"\s*:/.test(t)) return t;
  return null;
}

/* ----------------- Fix / Ensure correct days per frequency ---------------- */
function validateFrequencyMatchesPlan(plan, prof) {
  const freq = prof.frequency; // SIEMPRE usar la frecuencia real del usuario

  if (!Array.isArray(plan.weeks) || plan.weeks.length === 0) {
    throw new Error('El plan no contiene semanas.');
  }

  // 1) Normalizar semanas
  plan.weeks.forEach((w, idx) => {
    w.week = idx + 1;
  });

  // 2) Forzar siempre 4 semanas
  const TARGET_WEEKS = 4;
  if (plan.weeks.length < TARGET_WEEKS) {
    const base = plan.weeks.map(w => structuredClone(w));
    let i = 0;
    while (plan.weeks.length < TARGET_WEEKS) {
      const cloned = structuredClone(base[i % base.length]);
      cloned.week = plan.weeks.length + 1;
      plan.weeks.push(cloned);
      i++;
    }
  } else if (plan.weeks.length > TARGET_WEEKS) {
    plan.weeks = plan.weeks.slice(0, TARGET_WEEKS);
  }

  // 3) Armar los días según frecuencia
  for (const w of plan.weeks) {
    if (!Array.isArray(w.days)) {
      throw new Error(`La semana ${w.week} no tiene días definidos.`);
    }

    const baseDays = w.days.map(d => structuredClone(d));

    // Expandir
    while (w.days.length < freq) {
      const clone = structuredClone(baseDays[w.days.length % baseDays.length]);
      clone.name = clone.name.replace(/Día\s+\d+/i, `Día ${w.days.length + 1}`);
      w.days.push(clone);
    }

    // Recortar si sobran
    if (w.days.length > freq) {
      w.days = w.days.slice(0, freq);
    }
  }
}



/* ------------------------ Exercise image injection ------------------------ */
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

/* ------------------------- Calorías por ejercicio ------------------------- */

// Estimar MET según nombre del ejercicio
function estimateMET(exName) {
  const n = exName.toLowerCase();

  if (n.includes('squat') || n.includes('lunge') || n.includes('deadlift'))
    return 5.5;
  if (n.includes('bench') || n.includes('press'))
    return 4.0;
  if (n.includes('row') || n.includes('pull'))
    return 4.5;
  if (n.includes('core') || n.includes('crunch') || n.includes('plank'))
    return 3.3;
  if (n.includes('bike') || n.includes('cardio'))
    return 6.0;

  return 4.0; // Default MET
}

// Fórmula: MET × peso × horas
function calcCalories(met, weightKg, minutes = 8) {
  const hours = minutes / 60;
  return Math.round(met * (weightKg || 70) * hours);
}

// Agregar calorías a cada ejercicio del plan
function addCaloriesToPlan(plan, prof) {
  const weight = prof.weightKg || 70;

  for (const w of plan.weeks) {
    for (const d of w.days) {
      for (const e of d.exercises) {
        const met = estimateMET(e.name);
        const calories = calcCalories(met, weight, 8);
        e.calories_total = calories;
      }
    }
  }

  return plan;
}


/* ------------------------------ Markdown Plan ----------------------------- */
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

/* --------------------------- MAIN PLAN GENERATOR -------------------------- */
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

  /* ------------------ Fetch catalogs from DB (your exercises) --------------- */
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

  /* -------------------------- Format catalogs for AI ------------------------ */
  const compactList = (rows, max = 18) =>
    rows.slice(0, max).map((r, i) =>
      `${i + 1}. ${r.name} — músculo: ${r.primary_muscle} | nivel: ${r.level} | equipo: ${r.equipment} | mecánica: ${r.mechanic ?? 'N/A'} | categoría: ${r.category ?? 'N/A'}`
    ).join('\n');

  const lists = Object.entries(catalogs).map(
    ([label, rows]) => `CATÁLOGO ${label.toUpperCase()}:\n${compactList(rows, 18)}`
  ).join('\n\n');

  /* ------------------------------- AI PROMPT PRO ---------------------------- */
const planPrompt = `
${pinnedFacts}

Eres FitSense, un entrenador personal profesional. Genera un PLAN MENSUAL COMPLETO basado SOLO en los ejercicios del catálogo (BD real).

OBJETIVO:
Crear un plan 100% seguro, adaptable y profesional según:
- edad
- nivel
- objetivo
- equipo disponible
- entorno
- condiciones médicas y contraindicaciones

REGLAS ESTRICTAS:
1. El plan SIEMPRE debe tener EXACTAMENTE 4 semanas.
2. Cada semana debe tener EXACTAMENTE ${prof.frequency} días.
3. Cada semana DEBE tener EXACTAMENTE ${prof.frequency} días.
4. Usa esta lista de SPLITS según frecuencia (OBLIGATORIO):
   ${spec.daySplits.map((d,i)=>`Día ${i+1}: ${d}`).join("\n   ")}
5. SOLO usar ejercicios del CATÁLOGO. NO inventar nombres.
6. Cada día debe contener:
   - warmup (5–8 min)
   - exercises[] (3 ejercicios validos)
   - cooldown (5 min)

REGLAS DE SELECCIÓN POR PERFIL:

Edad:
- older75:
  evitar impacto, plyometrics, cargas pesadas, barras pesadas, cleans, snatches, good mornings.
- senior60:
  favorecer máquinas, cables, dumbbell, movilidad y cargas ligeras.

Meta:
- fatloss: +compuestos, +movimiento, descansos cortos.
- hypertrophy: 8–12 reps, compuestos + aislamiento.
- strength: 4–6 reps, ejercicios multiarticulares.
- beginner: evitar ejercicios complejos o de riesgo.

Entorno:
- home: solo equipo disponible.
- home sin equipo: SOLO bodyweight.

Contraindicaciones:
- Dolor lumbar: evitar deadlifts pesados, hip hinge avanzado, good mornings.
- Dolor de rodilla: evitar impacto, jumping, deep squats avanzados.
- Dolor de hombro: evitar overhead pesado, upright rows, dips.

Mapeo muscular obligatorio:

Upper:
- pecho, espalda, hombros, tríceps, bíceps

Lower:
- quadriceps, hamstrings, glutes, calves

Core/Mob:
- abdominals, obliques, estabilidad

Patrones mínimos por día:
Upper:
- 1 empuje
- 1 tracción
- 1 hombro
- 1 brazo

Lower:
- 1 squat
- 1 hip hinge
- 1 posterior chain
- 1 aislado (piernas)

Core:
- 1 anti-extensión
- 1 anti-rotación
- 1 anti-lateral-flexión

CATÁLOGOS (BD real, ejercicios válidos):
${lists}

Los días de cada semana deben ser EXACTAMENTE los siguientes nombres (OBLIGATORIO):  
${spec.daySplits.map((d,i)=>`"Día ${i+1} - ${d}"`).join(", ")}

FORMATO OBLIGATORIO (JSON):
{
  "weeks": [
    {
      "week": 1,
      "days": [
        {
          "name": "Día 1 - Upper",
          "warmup": "…",
          "exercises": [
            { "name": "NombreExactoDelCatalogo", "sets": 3, "reps": "8-12", "rest_sec": 90, calories_total: 50 },
          ],
          "cooldown": "…"
        }
      ]
    },
    { "week": 2, "days": [ … ] },
    { "week": 3, "days": [ … ] },
    { "week": 4, "days": [ … ] }
  ],
  "frequency": ${prof.frequency},
  "global_notes": "técnica, seguridad y progresión"
}
`.trim();

  /* ------------------------------- RUN THE AI ------------------------------- */
  const raw = await runChatReply({ prompt: planPrompt, system_prompt });

  let parsedPlan = null;
  let replyText = 'No pude construir el plan.';
  let chosen = [];

  try {
    const jsonText = extractJsonBlock(raw);
    if (jsonText) {
      parsedPlan = JSON.parse(jsonText);

      parsedPlan.frequency = prof.frequency;


      validateFrequencyMatchesPlan(parsedPlan, prof);

      parsedPlan = await enrichPlanWithImages(parsedPlan);
      parsedPlan = addCaloriesToPlan(parsedPlan, prof);


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
