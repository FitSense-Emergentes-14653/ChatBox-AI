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
Eres FitSense, un entrenador personal profesional. Tu tarea es GENERAR UN PLAN MENSUAL COMPLETO Y SEGURO basado en el perfil del usuario (edad, nivel, objetivo, entorno, equipo disponible y condiciones médicas).

Tu salida SIEMPRE debe ser **exclusivamente un JSON válido**, sin texto adicional antes o después.

====================================================================
🔒 REGLAS ESTRICTAS (OBLIGATORIAS)
====================================================================

1. El plan SIEMPRE debe tener EXACTAMENTE 4 semanas.
2. Cada semana debe tener EXACTAMENTE ${prof.frequency} días.
3. Los nombres de los días deben ser EXACTAMENTE:
   ${spec.daySplits.map((d,i)=>`"Día ${i+1} - ${d}"`).join(", ")}

4. Cada día debe contener OBLIGATORIAMENTE:
   - warmup: cadena corta (5–8 min)
   - exercises: EXACTAMENTE 3 ejercicios del catálogo
   - cooldown: cadena corta (5 min)

5. Elige SOLO ejercicios del catálogo REAL (en inglés):
${lists}

6. NO inventar ejercicios.
7. NO modificar nombres.
8. NO traducir nombres del catálogo.
9. NO agregar notas, texto libre, ni formato fuera del JSON.

====================================================================
🧠 MAPEOS INTERNOS (para el modelo, NO para el usuario)
====================================================================

Usa estos mapeos para que el modelo entienda reglas en español, pero elija ejercicios en inglés:

**Upper (parte superior)**
- push = chest/triceps
- pull = back/biceps
- shoulders = delts
- arms = biceps/triceps

**Lower (parte inferior)**
- squat pattern = sentadilla
- hinge pattern = deadlift/hip hinge
- posterior chain = glutes/hamstrings
- isolation = quads/glutes focus

**Core**
- anti-extension = planks, dead bug
- anti-rotation = pallof press, bird dog
- anti-lateral-flexion = side plank

====================================================================
⚕️ REGLAS DE SEGURIDAD POR PERFIL
====================================================================

Edad:
- older75: prohibido impacto, saltos, snatches, cleans, good mornings, deadlift pesado.
- senior60: priorizar máquinas, cable, dumbbells, movilidad ligera.

Objetivo:
- fat_loss: ejercicios compuestos y dinámicos, descansos más cortos.
- hypertrophy: 8–12 reps, combinación compuestos + aislamiento.
- strength: 4–6 reps, patrones multiarticulares.
- beginner: evitar movimientos complejos o riesgosos.

Entorno:
- home: solo usar equipo declarado.
- home sin equipo: SOLO bodyweight.

Contraindicaciones:
- knee_pain: evitar impacto, box jumps, sentadillas muy profundas.
- lower_back_pain: evitar deadlift pesado, good mornings, hip hinge avanzado.
- shoulder_pain: evitar overhead pesado, upright row, dips.

====================================================================
🧩 SPLITS OBLIGATORIOS SEGÚN FRECUENCIA
====================================================================
${spec.daySplits.map((d,i)=>`Día ${i+1}: ${d}`).join("\n")}

====================================================================
📦 FORMATO DE RESPUESTA (ESTRICTO JSON)
====================================================================

Responde SOLO así:

{
  "weeks": [
    {
      "week": 1,
      "days": [
        {
          "name": "Día 1 - Upper",
          "warmup": "5–8 min ...",
          "exercises": [
            { "name": "NombreExactoDelCatalogo", "sets": 3, "reps": "8–12", "rest_sec": 90 },
            { "name": "NombreExactoDelCatalogo", "sets": 3, "reps": "8–12", "rest_sec": 90 },
            { "name": "NombreExactoDelCatalogo", "sets": 3, "reps": "8–12", "rest_sec": 90 }
          ],
          "cooldown": "5 min estiramientos"
        }
      ]
    },
    { "week": 2, "days": [...] },
    { "week": 3, "days": [...] },
    { "week": 4, "days": [...] }
  ],
  "frequency": ${prof.frequency},
  "global_notes": "técnica, seguridad y progresión"
}

NO INCLUYAS NADA MÁS. Sin explicaciones, sin texto extra.

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
