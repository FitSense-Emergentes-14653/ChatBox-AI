-- ====================================
-- ChatBox-AI Database Setup
-- Database: fitsense_chatbot
-- ====================================

-- Usar la base de datos
USE fitsense_chatbot;

-- ====================================
-- 1. Tabla: usuarios
-- ====================================
CREATE TABLE IF NOT EXISTS usuarios (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  nombre VARCHAR(255),
  edad INT,
  peso_kg DECIMAL(6,2),
  altura_m DECIMAL(4,2),
  nivel VARCHAR(50),
  objetivo VARCHAR(255),
  entorno VARCHAR(50),
  frecuencia INT,
  condiciones_json JSON,
  equipo_json JSON,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_nombre (nombre)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ====================================
-- 2. Tabla: rutinas
-- ====================================
CREATE TABLE IF NOT EXISTS rutinas (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  user_id BIGINT NOT NULL,
  nombre VARCHAR(255) DEFAULT 'Rutina de ejercicios',
  descripcion TEXT,
  detalles_json JSON,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_user_created (user_id, created_at),
  FOREIGN KEY (user_id) REFERENCES usuarios(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ====================================
-- 3. Tabla: exercises (ejercicios)
-- ====================================
CREATE TABLE IF NOT EXISTS exercises (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  nombre VARCHAR(255) NOT NULL,
  descripcion TEXT,
  grupo_muscular VARCHAR(100),
  nivel VARCHAR(50),
  equipo VARCHAR(100),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_nombre (nombre),
  INDEX idx_grupo (grupo_muscular)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ====================================
-- 4. Tabla: user_exercise_history
-- ====================================
CREATE TABLE IF NOT EXISTS user_exercise_history (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  user_id BIGINT NOT NULL,
  exercise_id BIGINT NOT NULL,
  fecha DATE NOT NULL,
  sets INT,
  reps INT,
  peso_kg DECIMAL(6,2),
  notas TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_user_fecha (user_id, fecha),
  INDEX idx_exercise (exercise_id),
  FOREIGN KEY (user_id) REFERENCES usuarios(id) ON DELETE CASCADE,
  FOREIGN KEY (exercise_id) REFERENCES exercises(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ====================================
-- 5. Tabla: conversation_summaries
-- ====================================
CREATE TABLE IF NOT EXISTS conversation_summaries (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  user_id BIGINT NOT NULL,
  summary TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_user_created (user_id, created_at),
  FOREIGN KEY (user_id) REFERENCES usuarios(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ====================================
-- Datos de prueba
-- ====================================

-- Insertar usuario de prueba (si no existe)
INSERT INTO usuarios (id, nombre, edad, peso_kg, altura_m, nivel, objetivo, entorno, frecuencia, condiciones_json, equipo_json)
VALUES (1, 'Usuario de prueba', 30, 75.5, 1.75, 'intermedio', 'mantener', 'home', 3, '{}', '{}')
ON DUPLICATE KEY UPDATE nombre = nombre;

-- Insertar rutina de prueba
INSERT INTO rutinas (user_id, nombre, descripcion, detalles_json)
VALUES (1, 'Rutina inicial', 'Rutina de ejemplo para pruebas', JSON_ARRAY(
  JSON_OBJECT(
    'dia', 'Día 1',
    'ejercicios', JSON_ARRAY(
      JSON_OBJECT('nombre', 'Sentadillas', 'reps', '3x10', 'descanso', '60s'),
      JSON_OBJECT('nombre', 'Flexiones', 'reps', '3x8', 'descanso', '60s'),
      JSON_OBJECT('nombre', 'Planchas', 'reps', '3x30s', 'descanso', '45s')
    )
  ),
  JSON_OBJECT(
    'dia', 'Día 2',
    'ejercicios', JSON_ARRAY(
      JSON_OBJECT('nombre', 'Zancadas', 'reps', '3x12', 'descanso', '60s'),
      JSON_OBJECT('nombre', 'Fondos', 'reps', '3x10', 'descanso', '60s')
    )
  )
))
ON DUPLICATE KEY UPDATE nombre = nombre;

-- Insertar ejercicios básicos
INSERT INTO exercises (nombre, descripcion, grupo_muscular, nivel, equipo) VALUES
('Sentadillas', 'Ejercicio compuesto para piernas', 'Piernas', 'principiante', 'peso corporal'),
('Flexiones', 'Ejercicio para pecho y tríceps', 'Pecho', 'principiante', 'peso corporal'),
('Planchas', 'Ejercicio isométrico para core', 'Core', 'principiante', 'peso corporal'),
('Zancadas', 'Ejercicio para piernas y glúteos', 'Piernas', 'intermedio', 'peso corporal'),
('Fondos', 'Ejercicio para tríceps', 'Brazos', 'intermedio', 'peso corporal')
ON DUPLICATE KEY UPDATE nombre = nombre;

-- Insertar historial de ejemplo
INSERT INTO user_exercise_history (user_id, exercise_id, fecha, sets, reps, peso_kg, notas)
SELECT 1, id, CURDATE() - INTERVAL 7 DAY, 3, 10, 0, 'Primera sesión'
FROM exercises
WHERE nombre = 'Sentadillas'
LIMIT 1
ON DUPLICATE KEY UPDATE notas = notas;

-- Insertar resumen de conversación de prueba
INSERT INTO conversation_summaries (user_id, summary)
VALUES (1, 'Resumen de prueba: Usuario activo con 3 sesiones en el último mes. Objetivo: mantenimiento.')
ON DUPLICATE KEY UPDATE summary = summary;

-- ====================================
-- Verificación
-- ====================================
SELECT 'Setup completado exitosamente!' as status;
SELECT COUNT(*) as total_usuarios FROM usuarios;
SELECT COUNT(*) as total_rutinas FROM rutinas;
SELECT COUNT(*) as total_ejercicios FROM exercises;
SELECT COUNT(*) as total_historial FROM user_exercise_history;
SELECT COUNT(*) as total_summaries FROM conversation_summaries;
