import { pool } from '../data/db.js';

export async function getRecentUsedNames(userId, days = 7) {
  const [rows] = await pool.query(
    `SELECT DISTINCT exercise_name
     FROM user_exercise_history
     WHERE user_id = ? AND used_at >= (NOW() - INTERVAL ? DAY)`,
    [userId, days]
  );
  return new Set(rows.map(r => r.exercise_name));
}

export async function saveChosenExercises(userId, names) {
  if (!Array.isArray(names) || names.length === 0) return;
  const values = names.map(n => [userId, n]);
  await pool.query(
    `INSERT INTO user_exercise_history (user_id, exercise_name)
     VALUES ${values.map(() => '(?, ?)').join(', ')}`,
    values.flat()
  );
}
