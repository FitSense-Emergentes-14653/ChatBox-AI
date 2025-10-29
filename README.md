# ChatBox-AI - Setup y Configuración

## Pre-requisitos

- Node.js 16+ 
- MySQL 8.0+
- npm

## Instalación

### 1. Instalar dependencias

```bash
npm install
```

### 2. Configurar base de datos

#### Crear la base de datos

```bash
mysql -u root -p
```

```sql
CREATE DATABASE fitsense_chatbot CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
exit;
```

#### Ejecutar el script de setup

```bash
mysql -u root -p fitsense_chatbot < database/setup.sql
```

O manualmente desde MySQL:

```bash
mysql -u root -p
```

```sql
USE fitsense_chatbot;
SOURCE C:/Users/Juan/Desktop/Ciclo-8/Arquitecturas De Software Emergentes/soft/ChatBox-AI/database/setup.sql;
```

### 3. Configurar variables de entorno

Edita el archivo `.env`:

```properties
PORT=8085
REPLICATE_API_TOKEN=tu_token_aqui
MODEL=openai/gpt-4o-mini

DB_HOST=localhost
DB_USER=root
DB_PASSWORD=tu_password
DB_NAME=fitsense_chatbot
```

**⚠️ IMPORTANTE**: 
- No subas el archivo `.env` al repositorio
- Agrega `.env` a `.gitignore`
- Rota el `REPLICATE_API_TOKEN` si fue expuesto

## Ejecución

### Desarrollo

```bash
npm start
```

El servidor estará disponible en `http://localhost:8085`

### Verificar estado

```bash
curl http://localhost:8085/health
```

Respuesta esperada:
```json
{
  "ok": true,
  "db": "up"
}
```

## Estructura de la Base de Datos

### Tablas creadas

1. **usuarios** - Perfiles de usuarios
2. **rutinas** - Planes de entrenamiento
3. **exercises** - Catálogo de ejercicios
4. **user_exercise_history** - Historial de entrenamientos
5. **conversation_summaries** - Resúmenes de conversaciones

### Relaciones

```
usuarios (1) -----> (N) rutinas
usuarios (1) -----> (N) user_exercise_history
usuarios (1) -----> (N) conversation_summaries
exercises (1) -----> (N) user_exercise_history
```

```
-- Crear tablas mínimas
CREATE TABLE IF NOT EXISTS usuarios (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  nombre VARCHAR(255), edad INT, peso_kg DECIMAL(6,2), altura_m DECIMAL(4,2),
  nivel VARCHAR(50), objetivo VARCHAR(255), entorno VARCHAR(50), frecuencia INT,
  condiciones_json JSON, equipo_json JSON,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS rutinas (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  user_id BIGINT NOT NULL,
  nombre VARCHAR(255), descripcion TEXT, detalles_json JSON,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_user_created (user_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS conversation_summaries (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  user_id BIGINT NOT NULL,
  summary TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_user_created (user_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Usuario de prueba
INSERT INTO usuarios (nombre, edad, peso_kg, altura_m, nivel, objetivo, entorno, frecuencia, condiciones_json, equipo_json)
VALUES ('Test User', 30, 75.5, 1.75, 'intermedio', 'mantener', 'home', 3, '{}', '{}');

-- Rutina de ejemplo
INSERT INTO rutinas (user_id, nombre, detalles_json)
VALUES (1, 'Rutina inicial', JSON_ARRAY(
  JSON_OBJECT('dia','Día 1','ejercicios', JSON_ARRAY(
    JSON_OBJECT('nombre','Sentadillas','reps','3x10'),
    JSON_OBJECT('nombre','Flexiones','reps','3x8')
  ))
));
```


## Endpoints

### Health Check
```bash
GET /health
```

### Chat

```bash
# Iniciar sesión
POST /session/start
{
  "userId": 1,
  "sessionId": "s-1"
}

# Enviar mensaje
POST /chat/send
{
  "userId": 1,
  "sessionId": "s-1",
  "message": "Hola, qué me toca hoy?",
  "forcePlan": false
}

# Finalizar sesión
POST /session/end
{
  "userId": 1,
  "sessionId": "s-1"
}

# Reset sesión
POST /session/reset
{
  "userId": 1,
  "sessionId": "s-1"
}
```

### Rutinas

```bash
# Obtener rutina actual
GET /routine/current?userId=1
```


### Error: "Unauthorized" al conectar desde FitSense

**Causa**: API Key no configurada o incorrecta

**Solución**: 

1. Genera una API Key
2. Configúrala en `.env` de ChatBox-AI
3. Configúrala en `application.properties` de FitSense:

```properties
chatbox.apiKey=${CHATBOX_API_KEY:tu_key_aqui}
```

## Testing

### Test manual con curl

```bash
# 1. Health
curl http://localhost:8085/health

# 2. Start session
curl -X POST http://localhost:8085/session/start \
  -H "Content-Type: application/json" \
  -d '{"userId":1}'

# 3. Send message
curl -X POST http://localhost:8085/chat/send \
  -H "Content-Type: application/json" \
  -d '{"userId":1,"sessionId":"s-1","message":"Hola"}'

# 4. Get routine
curl http://localhost:8085/routine/current?userId=1

# 5. End session
curl -X POST http://localhost:8085/session/end \
  -H "Content-Type: application/json" \
  -d '{"userId":1,"sessionId":"s-1"}'
```

## Integración con FitSense Backend

ChatBox-AI funciona como un microservicio independiente. FitSense Backend se conecta vía HTTP REST.

### Flujo de integración

```
Usuario → FitSense Backend → ChatBox-AI → Replicate/OpenAI
                ↓                   ↓
           MySQL (fitsense)    MySQL (fitsense_chatbot)
```


