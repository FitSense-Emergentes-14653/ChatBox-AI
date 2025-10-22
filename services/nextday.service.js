import { getLatestRoutine } from '../repos/routines.repo.js';
import { pool } from '../data/db.js'; 

function daysBetween(d) {
  if (!d) return 0;
  return Math.floor((Date.now() - new Date(d).getTime()) / (1000*60*60*24));
}

function getWeek1Days(plan) {
  if (!plan?.weeks?.length) return [];
  const w1 = plan.weeks.find(w => Number(w.week) === 1) || plan.weeks[0];
  return Array.isArray(w1?.days) ? w1.days : [];
}

async function countSessionsSince(userId, sinceISO) {
  const [rows] = await pool.query(
    `SELECT COUNT(DISTINCT DATE(used_at)) AS c
       FROM user_exercise_history
      WHERE user_id = ? AND used_at >= ?`,
    [userId, sinceISO]
  );
  return rows[0]?.c || 0;
}


function estimateSessionsDone(sinceDate, frequency = 3) {
  const d = Math.max(0, daysBetween(sinceDate));
  const step = Math.max(1, Math.floor(7 / Math.max(1, frequency))); 
  return Math.floor(d / step);
}

export async function getWhatIsNext(userId, { useHistory = true, frequencyFallback = 3 } = {}) {
  const latest = await getLatestRoutine(userId);
  if (!latest) return { hasPlan: false };

  const daysArr = getWeek1Days(latest.plan);
  if (!daysArr.length) return { hasPlan: true, nextDay: null, planCreatedAt: latest.created_at };

  let sessionsDone = 0;
  const sinceISO = latest.created_at instanceof Date ? latest.created_at.toISOString() : latest.created_at;

  if (useHistory) {
    sessionsDone = await countSessionsSince(userId, sinceISO); 
  } else {
    const freq = latest.plan?.frequency || frequencyFallback;
    sessionsDone = estimateSessionsDone(sinceISO, freq);      
  }

  const idx = sessionsDone % daysArr.length;
  const nextDay = daysArr[idx] || null;

  return {
    hasPlan: true,
    planCreatedAt: latest.created_at,
    sessionsDone,
    totalDays: daysArr.length,
    nextIndex: idx,
    nextDay,               
    plan: latest.plan      
  };
}
