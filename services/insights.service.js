import { pool } from '../data/db.js';
import { getLatestRoutine } from '../repos/routines.repo.js';

function daysBetween(d) {
  if (!d) return null;
  return Math.floor((Date.now() - new Date(d).getTime())/(1000*60*60*24));
}

function getWeek1Days(plan) {
  if (!plan?.weeks?.length) return [];
  const w1 = plan.weeks.find(w => Number(w.week)===1) || plan.weeks[0];
  return Array.isArray(w1?.days) ? w1.days : [];
}

async function countSessionsSince(userId, sinceISO) {
  const [rows] = await pool.query(
    `SELECT COUNT(DISTINCT DATE(used_at)) AS c
       FROM user_exercise_history
      WHERE user_id=? AND used_at >= ?`,
    [userId, sinceISO]
  );
  return rows[0]?.c || 0;
}

async function getRecentHistory(userId, days=14, limit=12) {
  const [rows] = await pool.query(
    `SELECT exercise_name, used_at
       FROM user_exercise_history
      WHERE user_id=? AND used_at >= (NOW() - INTERVAL ? DAY)
   ORDER BY used_at DESC
      LIMIT ?`,
    [userId, days, limit]
  );
  const map = {};
  for (const r of rows) if (!map[r.exercise_name]) map[r.exercise_name] = r.used_at;
  return Object.entries(map)
    .map(([name,last]) => ({ name, last }))
    .sort((a,b)=> new Date(b.last)-new Date(a.last));
}

export async function buildAIContext(userId) {
  const latest = await getLatestRoutine(userId);
  const hasPlan = !!latest?.plan;

  let today = null, routineAgeDays = null, summaryPlanLine = 'N/D';
  let recent = [];

  if (hasPlan) {
    routineAgeDays = daysBetween(latest.created_at);
    const daysArr = getWeek1Days(latest.plan);
    const sinceISO = latest.created_at instanceof Date ? latest.created_at.toISOString() : latest.created_at;
    const sessionsDone = await countSessionsSince(userId, sinceISO);
    const idx = daysArr.length ? (sessionsDone % daysArr.length) : 0;
    today = daysArr[idx] || null;
    summaryPlanLine = daysArr.map(d => d.name).join(', ') || 'N/D';
    recent = await getRecentHistory(userId, 14, 12);
  }

  return {
    hasPlan,
    routineAgeDays,
    planCreatedAt: latest?.created_at || null,
    today,        
    summaryPlanLine,    
    recent                
  };
}
