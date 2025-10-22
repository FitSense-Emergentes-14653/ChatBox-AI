import { pool } from '../data/db.js';


export async function getLastRoutineDate(userId) {
  const [rows] = await pool.query(
    `SELECT created_at
       FROM rutinas
      WHERE user_id = ?
   ORDER BY created_at DESC
      LIMIT 1`,
    [userId]
  );
  const r = rows[0];
  return r ? r.created_at : null;
}

export async function getLatestRoutine(userId) {
  const [rows] = await pool.query(
    `SELECT id, user_id, plan_json, created_at
       FROM rutinas
      WHERE user_id = ?
   ORDER BY created_at DESC
      LIMIT 1`,
    [userId]
  );

  const r = rows[0];
  if (!r) return null;

  let plan = r.plan_json;
  if (typeof plan === 'string') {
    try {
      plan = JSON.parse(plan);
    } catch {
      plan = null;
    }
  }

  return plan
    ? { id: r.id, user_id: r.user_id, plan, created_at: r.created_at }
    : null;
}

export async function saveRoutine(userId, planJson) {
  const [r] = await pool.query(
    `INSERT INTO rutinas (user_id, plan_json)
     VALUES (?, ?)`,
    [userId, JSON.stringify(planJson)]
  );
  return r.insertId;
}

export function pickPlanDay(plan, weekNum = 1, dayNum = 1) {
  if (!plan?.weeks?.length) return null;

  const wIdx = Math.max(0, Math.min(plan.weeks.length - 1, (Number(weekNum) || 1) - 1));
  const week = plan.weeks[wIdx];
  if (!week?.days?.length) return null;

  const dIdx = Math.max(0, Math.min(week.days.length - 1, (Number(dayNum) || 1) - 1));
  const day = week.days[dIdx];

  return { weekIdx: wIdx, dayIdx: dIdx, day, week };
}
