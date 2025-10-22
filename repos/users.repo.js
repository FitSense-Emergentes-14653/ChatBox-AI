import { pool } from '../data/db.js';

export async function getUserById(userId) {
  const [rows] = await pool.query(
    `SELECT id, nombre, edad, peso_kg, altura_m, nivel, objetivo, entorno,
            frecuencia, condiciones_json, equipo_json
     FROM usuarios
     WHERE id = ? LIMIT 1`,
    [userId]
  );
  return rows[0] || null;
}
