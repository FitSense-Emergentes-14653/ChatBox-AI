import './config/env.js';
import express from 'express';
import cors from 'cors';
import { pool } from './data/db.js';
import { cfg } from './config/env.js';

import chatRoutes from './routes/chat.routes.js';
import routineRoutes from './routes/routine.routes.js';

const app = express();

app.use(cors());
app.use(express.json({ limit: '2mb' }));


app.use('/', routineRoutes);  
app.use('/', chatRoutes);     

// --- Swagger UI (abrigamos openapi.json creado en la raíz) ---
import swaggerUi from 'swagger-ui-express';
import fs from 'fs';
import path from 'path';

const openapiPath = path.resolve('./openapi.json');
let openapiSpec = null;
try {
  openapiSpec = JSON.parse(fs.readFileSync(openapiPath, 'utf8'));
  app.use('/openapi.json', (_req, res) => res.json(openapiSpec));
  app.use('/docs', swaggerUi.serve, swaggerUi.setup(openapiSpec));
  console.log('Swagger UI disponible en /docs');
} catch (e) {
  console.warn('No se pudo cargar openapi.json:', e.message);
}

app.get('/health', async (_req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ ok: true, db: 'up' });
  } catch {
    res.status(500).json({ ok: false, db: 'down' });
  }
});

app.use((req, res) => {
  res.status(404).json({ error: 'not_found', path: req.originalUrl });
});

app.use((err, _req, res, _next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'internal_error' });
});

const PORT = process.env.PORT || Number(cfg.PORT) || 3000;
const server = app.listen(PORT, () => {
  console.log(`Chat API en puerto ${PORT}`);
});

async function shutdown(signal) {
  try {
    console.log(`\nRecibí ${signal}, cerrando...`);
    server.close(() => console.log('HTTP server cerrado'));
    await pool.end();
    console.log('Pool MySQL cerrado');
  } catch (e) {
    console.error('Error cerrando:', e);
  } finally {
    process.exit(0);
  }
}

['SIGINT', 'SIGTERM', 'uncaughtException', 'unhandledRejection'].forEach((sig) => {
  if (sig === 'uncaughtException' || sig === 'unhandledRejection') {
    process.on(sig, (err) => {
      console.error(`${sig}:`, err);
      shutdown(sig);
    });
  } else {
    process.on(sig, () => shutdown(sig));
  }
});
