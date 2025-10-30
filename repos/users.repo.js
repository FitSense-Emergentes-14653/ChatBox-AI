import { pool } from '../data/db.js';

/**
 * Get user by ID from FitSense 'users' table
 * Maps FitSense athlete profile to ChatBox expected format
 */
export async function getUserById(userId) {
  const [rows] = await pool.query(
    `SELECT u.id, 
            a.fullname as nombre, 
            a.age as edad, 
            a.weight as peso_kg, 
            a.height as altura_cm,
            a.activity_level as activity_level_raw, 
            a.goal as objetivo,
            'home' as entorno,
            3 as frecuencia,
            '{}' as condiciones_json,
            JSON_ARRAY() as equipo_json
     FROM users u
     LEFT JOIN athletes a ON u.id = a.user_id
     WHERE u.id = ? LIMIT 1`,
    [userId]
  );
  
  const user = rows[0];
  if (!user) return null;
  
  // Map Spanish activity levels to English
  const activityLevelMap = {
    'principiante': 'beginner',
    'intermedio': 'intermediate',
    'avanzado': 'advanced'
  };
  user.nivel = activityLevelMap[user.activity_level_raw?.toLowerCase()] || 'beginner';
  delete user.activity_level_raw;
  
  // Map Spanish/English goals to ChatBox expected format
  const goalMap = {
    // Spanish
    'perder peso': 'fat_loss',
    'ganar peso': 'weight_gain',
    'aumento de masa muscular': 'hypertrophy',
    'moldear el cuerpo': 'body_shaping',
    'otros': 'other',
    // English
    'strength': 'strength',
    'weight_loss': 'fat_loss',
    'lose_weight': 'fat_loss',
    'weight_gain': 'weight_gain',
    'gain_weight': 'weight_gain',
    'muscle_gain': 'hypertrophy',
    'body_shaping': 'body_shaping',
    'toning': 'body_shaping',
    'other': 'other'
  };
  user.objetivo = goalMap[user.objetivo?.toLowerCase()] || 'strength';
  
  // Convert height from cm to meters for ChatBox compatibility
  if (user.altura_cm) {
    user.altura_m = user.altura_cm / 100;
  }
  
  return user;
}
