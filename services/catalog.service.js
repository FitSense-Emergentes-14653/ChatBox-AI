import { allowedEquipmentsByProfile, targetsForDay } from './profile.service.js';
import { findCandidatesByFilters } from '../repos/exercises.repo.js';

function safeHas(container, name) {
  if (!container) return false;
  if (container instanceof Set) return container.has(name);
  if (Array.isArray(container)) return container.includes(name);
  return false;
}

export function rankExercisesForProfile(p, dayLabel, categories, rows) {
  const targets = new Set((targetsForDay(dayLabel) || []).map(t => String(t).toLowerCase()));
  const allowedEquip = new Set((allowedEquipmentsByProfile(p) || []).map(e => String(e).toLowerCase()));
  const catSet = new Set((categories || []).map(c => String(c).toLowerCase()));
  const order = { beginner: 0, intermediate: 1, advanced: 2 };

  return (rows || [])
    .map(r => {
      let score = 0;
      const dist = Math.abs((order[p.level] ?? 1) - (order[String(r.level).toLowerCase()] ?? 1));
      score += dist === 0 ? 5 : dist === 1 ? 2 : 0;
      if (allowedEquip.has(String(r.equipment).toLowerCase())) score += 4;

      const prim = String(r.primary_muscle || '').toLowerCase();
      for (const t of targets) { if (prim.includes(t)) { score += 3; break; } }

      if (catSet.has(String(r.category).toLowerCase())) score += 3;

      if (p.ageBand === 'senior60' || p.ageBand === 'older75') {
        if (/heavy|max effort|1rm/i.test(r.name)) score -= 4;
        score += 5;
      }
      return { ...r, __score: score };
    })
    .sort((a, b) => b.__score - a.__score || String(a.name).localeCompare(String(b.name)));
}

export async function fetchCatalog({
  p,
  categories = [],
  dayLabel,
  contraindications = [],
  excludeNames = new Set(),
  limit = 40
}) {
  const excluded = excludeNames instanceof Set
    ? excludeNames
    : (Array.isArray(excludeNames) ? new Set(excludeNames) : new Set());

  const ci = Array.isArray(contraindications) ? contraindications : [];

  const equipments = allowedEquipmentsByProfile(p) || ['body only', 'dumbbell', 'band', 'machine'];
  const primaries = targetsForDay(dayLabel) || [];

  let rows = await findCandidatesByFilters({
    level: p.level,
    categories,
    equipments,
    primaryLike: primaries,
    limit: limit * 5
  });

  if (!rows || rows.length === 0) {
    console.warn(`Catálogo vacío para ${dayLabel}. Usando fallback sin primaryLike.`);
    rows = await findCandidatesByFilters({
      level: p.level,
      categories,
      equipments,
      primaryLike: [],   
      limit: limit * 5
    });
  }

  const safe = (rows || []).filter(r => {
    if (safeHas(excluded, r.name)) return false;
    for (const rx of ci) {
      try { if (rx?.test && rx.test(r.name)) return false; } catch {}
    }
    return true;
  });

  const ranked = rankExercisesForProfile(p, dayLabel, categories, safe);
  return ranked.slice(0, limit);
}

