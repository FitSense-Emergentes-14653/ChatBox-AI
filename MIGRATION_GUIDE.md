# ChatBox-AI Migration to FitSense Database

## 🎯 Objetivo
Unificar ChatBox-AI para usar la misma base de datos `fitsense` que usa el backend principal.

## 📋 Cambios Realizados

### 1. **Mapeo de Tablas**

| ChatBox-AI (Anterior) | FitSense (Actual) | Estado |
|----------------------|-------------------|--------|
| `usuarios` | `users` + `athletes` | ✅ Mapeado |
| `rutinas` | `rutinas` | ✅ Ya existe |
| `user_exercise_history` | `user_exercise_history` | ✅ Se creará si no existe |
| N/A | `conversation_summaries` | ✅ Nueva tabla |

### 2. **Archivos Modificados**

#### `repos/users.repo.js`
- Cambiado de tabla `usuarios` a `users` + `athletes`
- Realiza JOIN para obtener datos del perfil del atleta
- Convierte `altura_cm` a `altura_m` para compatibilidad

#### `repos/summaries.repo.js`
- Actualizado para usar columna `summary_text` en lugar de `summary`
- Agregado `session_id` para tracking

#### `.env`
- **IMPORTANTE**: `DB_NAME=fitsense` (ya no usa `fitsense_chatbot`)

### 3. **Nueva Tabla: `conversation_summaries`**
```sql
CREATE TABLE conversation_summaries (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  user_id BIGINT NOT NULL,
  session_id VARCHAR(100),
  summary_text TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
```

## 🚀 Pasos de Instalación

### Opción A: MySQL Workbench (Recomendado)
1. Abre **MySQL Workbench**
2. Conecta a tu servidor local
3. Abre el archivo: `ChatBox-AI/database/fitsense-chatbox-migration.sql`
4. Ejecuta el script completo (⚡ lightning icon o Ctrl+Shift+Enter)
5. Verifica que se crearon las tablas:
   ```sql
   USE fitsense;
   SHOW TABLES LIKE 'conversation%';
   SHOW TABLES LIKE 'user_exercise%';
   ```

### Opción B: Línea de Comandos
```bash
# Encuentra la ruta de mysql.exe (usualmente en C:\Program Files\MySQL\MySQL Server 8.0\bin\)
"C:\Program Files\MySQL\MySQL Server 8.0\bin\mysql.exe" -u root -p fitsense < "c:\Users\Juan\Desktop\Ciclo-8\Arquitecturas De Software Emergentes\soft\ChatBox-AI\database\fitsense-chatbox-migration.sql"
```

### Opción C: PowerShell
```powershell
cd "C:\Users\Juan\Desktop\Ciclo-8\Arquitecturas De Software Emergentes\soft\ChatBox-AI\database"
& "C:\Program Files\MySQL\MySQL Server 8.0\bin\mysql.exe" -u root -p"Cali,128" fitsense -e "SOURCE fitsense-chatbox-migration.sql"
```

## ✅ Verificación

### 1. Verifica que las tablas existen
```sql
USE fitsense;
SELECT COUNT(*) as users_count FROM users;
SELECT COUNT(*) as athletes_count FROM athletes;
SELECT COUNT(*) as rutinas_count FROM rutinas;
SHOW TABLES LIKE 'conversation_summaries';
SHOW TABLES LIKE 'user_exercise_history';
```

### 2. Reinicia ChatBox-AI
```bash
cd "C:\Users\Juan\Desktop\Ciclo-8\Arquitecturas De Software Emergentes\soft\ChatBox-AI"
npm start
```

### 3. Prueba el endpoint
```bash
curl -v -X POST http://localhost:8085/session/start \
  -H "Content-Type: application/json" \
  -d '{"userId":1}'
```

**Respuesta esperada:**
```json
{
  "ok": true,
  "sessionId": "fs-1"
}
```

### 4. Prueba desde FitSense
```bash
curl -X POST "http://localhost:8080/api/v1/chatbot/users/1/sessions" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json"
```

**Respuesta esperada:**
```json
{
  "sessionId": "fs-1",
  "active": true
}
```

## 🔧 Troubleshooting

### Error: "user_not_found"
**Causa**: No existe un usuario con ese ID en la tabla `users`

**Solución**: Verifica que el usuario existe:
```sql
SELECT u.id, u.full_name, a.age, a.weight, a.height, a.goal 
FROM users u 
LEFT JOIN athletes a ON u.id = a.user_id 
WHERE u.id = 1;
```

Si no existe, créalo desde el backend FitSense o inserta uno de prueba.

### Error: "Unknown database 'fitsense_chatbot'"
**Causa**: El `.env` no se actualizó correctamente

**Solución**: Verifica que `.env` tiene:
```
DB_NAME=fitsense
```

Luego reinicia `npm start`

### Error: Column 'plan_json' doesn't exist
**Causa**: La migración no se ejecutó completamente

**Solución**: Ejecuta manualmente:
```sql
USE fitsense;
ALTER TABLE rutinas ADD COLUMN plan_json JSON NULL;
```

## 📊 Estructura Final de Datos

### Flujo de Datos User → Athlete → Chatbot

```
users (FitSense)
  ├─ id (PK)
  ├─ email
  └─ full_name
       ↓ (1:1)
athletes (FitSense)
  ├─ user_id (FK → users.id)
  ├─ age, weight, height
  ├─ goal (strength, weight_loss, etc.)
  └─ activity_level
       ↓ (used by)
ChatBox-AI
  ├─ Obtiene perfil via JOIN
  ├─ Genera rutinas → rutinas.plan_json
  └─ Guarda conversaciones → conversation_summaries
```

## 🎉 Beneficios de la Unificación

✅ **Una sola base de datos** - Más fácil de mantener  
✅ **Datos sincronizados** - Los cambios en FitSense se reflejan en ChatBox  
✅ **Foreign Keys** - Integridad referencial garantizada  
✅ **Menos configuración** - No necesitas dos bases de datos separadas  
✅ **Backup simplificado** - Solo necesitas respaldar `fitsense`

---

**Próximos pasos**: Una vez que confirmes que la migración funciona, puedes eliminar la base de datos `fitsense_chatbot` antigua si existía.
