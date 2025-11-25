import { pool } from '../data/db.js';
export async function getUserById(userId) {
  const [rows] = await pool.query(
    `SELECT 
        u.id,
        a.fullname AS nombre,
        a.age AS edad,
        a.weight AS peso_kg,
        a.height AS altura_cm,
        a.activity_level AS nivel_raw,
        a.goal AS objetivo_raw,
        a.environment AS entorno_raw,
        a.frecuency AS frecuencia_raw,
        a.equipment AS equipo_json,
        a.gender AS sexo_raw,
        '[]' AS condiciones_json
     FROM users u
     LEFT JOIN athletes a ON u.id = a.user_id
     WHERE u.id = ? LIMIT 1`,
    [userId]
  );

  const user = rows[0];
  if (!user) return null;

  const levelMap = {
    'principiante': 'beginner',
    'intermedio': 'intermediate',
    'avanzado': 'advanced',
    'beginner': 'beginner',
    'intermediate': 'intermediate',
    'advanced': 'advanced'
  };
  user.nivel = levelMap[user.nivel_raw?.toLowerCase()] || 'beginner';
  delete user.nivel_raw;


  const goalMap = {
    'perder peso': 'fat_loss',
    'ganar peso': 'weight_gain',
    'aumento de masa muscular': 'hypertrophy',
    'moldear el cuerpo': 'body_shaping',
    'otros': 'other',

    'fat_loss': 'fat_loss',
    'weight_gain': 'weight_gain',
    'hypertrophy': 'hypertrophy',
    'body_shaping': 'body_shaping',
    'other': 'other'
  };
  user.objetivo = goalMap[user.objetivo_raw?.toLowerCase()] || 'strength';
  delete user.objetivo_raw;

  const envMap = {
    'gimnasio': 'gym',
    'casa': 'home',
    'gym': 'gym',
    'home': 'home'
  };
  user.entorno = envMap[user.entorno_raw?.toLowerCase()] || 'home';
  delete user.entorno_raw;


  const genderMap = {
    'masculino': 'male',
    'femenino': 'female',
    'male': 'male',
    'female': 'female'
  };
  user.sexo = genderMap[user.sexo_raw?.toLowerCase()] || 'other';
  delete user.sexo_raw;

  user.frecuencia = Number(user.frecuencia_raw) || 3;
  delete user.frecuencia_raw;

  if (user.altura_cm) {
    user.altura_m = user.altura_cm / 100;
    delete user.altura_cm;
  }

  if (typeof user.equipo_json === 'string') {
    try {
      user.equipo_json = JSON.parse(user.equipo_json);
    } catch {
      user.equipo_json = [];
    }
  }

  return user;
}
