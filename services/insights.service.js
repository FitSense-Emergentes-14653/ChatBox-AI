import { getLatestRoutine } from '../repos/routines.repo.js';

function daysBetween(d) {
  if (!d) return null;
  return Math.floor((Date.now() - new Date(d).getTime()) / (1000 * 60 * 60 * 24));
}

function getWeek1Days(plan) {
  if (!plan?.weeks?.length) return [];
  const w1 = plan.weeks.find(w => Number(w.week) === 1) || plan.weeks[0];
  return Array.isArray(w1?.days) ? w1.days : [];
}

export async function buildAIContext(userId, { frequencyFallback = 3 } = {}) {
  const latest = await getLatestRoutine(userId);
  const hasPlan = !!latest?.plan;

  let today = null;
  let routineAgeDays = null;
  let summaryPlanLine = 'N/D';
  let planCreatedAt = latest?.created_at || null;

  if (hasPlan) {
    const plan = latest.plan;
    routineAgeDays = daysBetween(planCreatedAt);

    const daysArr = getWeek1Days(plan);
    summaryPlanLine = daysArr.map(d => d.name).join(', ') || 'N/D';

    // Estimación de "día sugerido" sin historial
    const freq = plan?.frequency || frequencyFallback;
    const sinceISO = planCreatedAt instanceof Date
      ? planCreatedAt.toISOString()
      : planCreatedAt;

    const d = Math.max(0, daysBetween(sinceISO));
    const perSessionDays = Math.max(1, Math.floor(7 / Math.max(1, freq)));
    const sessionsDone = Math.floor(d / perSessionDays);
    const idx = daysArr.length ? (sessionsDone % daysArr.length) : 0;

    today = daysArr[idx] || null;
  }

  return {
    hasPlan,
    routineAgeDays,
    planCreatedAt,
    today,                
    summaryPlanLine,      
    recent: []            
  };
}
