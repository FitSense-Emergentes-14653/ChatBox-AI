import { pool } from '../data/db.js';

export async function findCandidatesByFilters({ level, categories, equipments, primaryLike = [], limit = 100 }) {
  const catsPH = categories.map(() => '?').join(',');
  const equipPH = equipments.map(() => '?').join(',');
  const muscClause = primaryLike.length
    ? `AND (${primaryLike.map(() => `LOWER(primary_muscle) LIKE ?`).join(' OR ')})`
    : '';

  const params = [
    String(level).toLowerCase(),
    ...categories.map(c => String(c).toLowerCase()),
    ...equipments.map(e => String(e).toLowerCase()),
    ...primaryLike.map(m => `%${String(m).toLowerCase()}%`),
    limit
  ];

  const [rows] = await pool.query(
    `
    SELECT name, level, equipment, primary_muscle, secondary_muscle, category, image_url
    FROM exercises
    WHERE LOWER(level) = ?
      AND LOWER(category) IN (${catsPH})
      AND LOWER(equipment) IN (${equipPH})
      ${muscClause}
    ORDER BY name ASC
    LIMIT ?
    `,
    params
  );
  return rows;
}
