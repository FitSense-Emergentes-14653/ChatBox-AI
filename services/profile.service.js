import { getDaySplitsFromFrequency } from './slipts.service.js';

export function normalizeProfile(raw = {}) {
  const p = { ...raw };
  p.age = Number.isFinite(+p.age) ? +p.age : null;
  p.level = (p.level || 'beginner').toLowerCase();
  p.goal  = (p.goal  || 'strength').toLowerCase();
  p.environment = (p.environment || 'home').toLowerCase();
  p.frequency = Math.min(Math.max(+p.frequency || 3, 2), 6);
  p.ageBand = (() => {
    if (!Number.isFinite(p.age)) return 'adult';
    if (p.age >= 75) return 'older75';
    if (p.age >= 60) return 'senior60';
    if (p.age <= 13) return 'child';
    return 'adult';
  })();
  p.conditions = Array.isArray(p.conditions) ? p.conditions.map(s => String(s).toLowerCase()) : [];
  p.availableEquipment = Array.isArray(p.availableEquipment) ? p.availableEquipment.map(s => String(s).toLowerCase()) : null;
  return p;
}

export function validateProfile(p) {
  const errs = [];
  if (!p.level.match(/^(beginner|intermediate|advanced)$/)) errs.push('level inválido');
  if (!p.environment.match(/^(home|gym|outdoor)$/)) errs.push('environment inválido');
  if (p.frequency < 2 || p.frequency > 6) errs.push('frequency fuera de rango (2-6)');
  return errs;
}

export const GOAL_TO_CATEGORY = {
  strength: ['strength', 'powerlifting', 'strongman'],
  hypertrophy: ['strength'],
  fat_loss: ['cardio', 'plyometrics'],
  endurance: ['cardio', 'plyometrics'],
  mobility: ['stretching'],
  rehab: ['stretching'],
  olympic: ['olympic weightlifting'],
  weightlifting: ['olympic weightlifting']
};

export function mapGoalToCategories(goalRaw) {
  const g = String(goalRaw || '').toLowerCase();
  const aliases = {
    fuerza: 'strength', hipertrofia: 'hypertrophy', resistencia: 'endurance',
    movilidad: 'mobility', rehabilitacion: 'rehab', rehabilitación: 'rehab',
    bajar_peso: 'fat_loss', grasa: 'fat_loss', peso: 'fat_loss', olimpico: 'olympic'
  };
  const key = aliases[g] || g;
  return GOAL_TO_CATEGORY[key] || ['strength'];
}

export function allowedEquipmentsByProfile(p) {
  if (p.environment === 'home' && Array.isArray(p.availableEquipment) && p.availableEquipment.length) {
    return p.availableEquipment;
  }
  if (p.ageBand === 'senior60' || p.ageBand === 'older75') {
    return p.environment === 'gym'
      ? ['machine', 'cable', 'smith machine', 'band', 'dumbbell', 'body only']
      : ['body only', 'band', 'dumbbell', 'kettlebell', 'none'];
  }
  return p.environment === 'gym'
    ? ['machine', 'barbell', 'dumbbell', 'kettlebell', 'cable', 'smith machine', 'body only']
    : ['body only', 'band', 'dumbbell', 'kettlebell', 'none'];
}

export function deriveSafetySpec(p) {
  const ageBase = {
    child:   { reps: '10-12', rest: 60,  cues: ['juego/variedad', 'técnica básica', 'evitar cargas máximas'] },
    adult:   { reps: '6-12',  rest: 90,  cues: ['RPE 7-8', 'técnica estricta'] },
    senior60:{ reps: '10-15', rest: 90,  cues: ['RPE 6-7', 'evitar alto impacto', 'control y estabilidad'] },
    older75: { reps: '12-15', rest: 120, cues: ['RPE 5-6', 'nada balístico', 'equilibrio y movilidad'] }
  }[p.ageBand];

  const goalAdj = {
    strength:   { reps: p.level === 'advanced' ? '5-8' : '8-12', rest: p.level === 'advanced' ? 120 : ageBase.rest },
    hypertrophy:{ reps: '8-15', rest: 90 },
    fat_loss:   { reps: '12-20', rest: 60 },
    endurance:  { reps: '12-20', rest: 60 },
    mobility:   { reps: '10-15', rest: 60 },
    rehab:      { reps: '10-15', rest: 90 },
    olympic:    { reps: '3-6',   rest: 120 },
    weightlifting:{ reps: '3-6', rest: 120 }
  }[p.goal] || {};

  const contraindications = [];
  const add = (rx) => contraindications.push(rx);
  if (p.ageBand === 'senior60' || p.ageBand === 'older75') add(/plyo|jump|burpee|box jump|snatch|clean|jerk|sprint|high impact/i);
  if (p.conditions.includes('hypertension')) add(/valsalva|heavy overhead press/i);
  if (p.conditions.includes('pregnancy')) add(/prone crunch|sit-up|hip thrust heavy/i);
  if (p.conditions.includes('knee_pain')) add(/deep squat|jump lunge|box jump/i);
  if (p.conditions.includes('lower_back_pain')) add(/good morning heavy|rounded back deadlift/i);
  if (p.conditions.includes('obesity')) add(/burpee|high impact run/i);
  if (p.conditions.includes('post_surgery')) add(/max effort|olympic lift/i);

  const daySplits = getDaySplitsFromFrequency(p.frequency);


  return { reps: goalAdj.reps || ageBase.reps, rest: goalAdj.rest || ageBase.rest, cues: ageBase.cues, contraindications, daySplits };
}

export function targetsForDay(dayLabel = '') {
  const d = String(dayLabel).toLowerCase();

  if (d.includes('upper')) {
    return [
      'chest',
      'shoulders',
      'lats',
      'back',
      'middle back',
      'upper back',
      'biceps',
      'triceps',
      'forearms'
    ];
  }

  if (d.includes('lower')) {
    return [
      'quadriceps',
      'hamstrings',
      'glutes',
      'calves',
      'adductors',
      'abductors'
    ];
  }

  if (d.includes('core')) {
    return [
      'abdominals',
      'obliques',
      'lower back'
    ];
  }

  // fallback genérico
  return [];
}


export function mapUserRowToProfile(row = {}) {
  const profile = {
    age: row.edad ?? null,
    level: row.nivel ?? 'beginner',
    goal: row.objetivo ?? 'strength',
    environment: row.entorno ?? 'home',
    frequency: row.frecuencia ?? 3,
    weightKg: row.peso_kg ?? null,
    heightM: row.altura_m ?? null,
    conditions: [],
    availableEquipment: null
  };

  try {
    if (row.condiciones_json) {
      const c = typeof row.condiciones_json === 'string'
        ? JSON.parse(row.condiciones_json)
        : row.condiciones_json;
      if (Array.isArray(c)) profile.conditions = c;
    }
  } catch {}

  try {
    if (row.equipo_json) {
      const e = typeof row.equipo_json === 'string'
        ? JSON.parse(row.equipo_json)
        : row.equipo_json;
      if (Array.isArray(e)) profile.availableEquipment = e;
    }
  } catch {}

  return profile;
}