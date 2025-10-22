import { pool } from '../data/db.js';

export async function saveSummary(userId, summary, turns) {
  await pool.query(
    `INSERT INTO conversation_summaries (user_id, summary, turns)
     VALUES (?, ?, ?)`,
    [userId, summary, turns]
  );
}

export async function getLastSummary(userId) {
  const [rows] = await pool.query(
    `SELECT summary
       FROM conversation_summaries
      WHERE user_id = ?
   ORDER BY created_at DESC
      LIMIT 1`,
    [userId]
  );
  return rows[0]?.summary || null;
}

export async function getRecentSummaries(userId, limit = 2) {
  const [rows] = await pool.query(
    `SELECT summary, created_at
       FROM conversation_summaries
      WHERE user_id = ?
   ORDER BY created_at DESC
      LIMIT ?`,
    [userId, limit]
  );
  return rows; 
}
