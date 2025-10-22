import './config/env.js';
import express from 'express';
import cors from 'cors';
import { pool } from './data/db.js';

import chatRoutes from './routes/chat.routes.js';
import routineRoutes from './routes/routine.routes.js';

const app = express();

app.use(cors());
app.use(express.json({ limit: '2mb' }));


app.use('/', routineRoutes);  
app.use('/', chatRoutes);     

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

const PORT = process.env.PORT || 3000;
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
