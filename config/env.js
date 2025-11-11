import 'dotenv/config';

const required = ['DB_HOST','DB_USER','DB_PASSWORD','DB_NAME','REPLICATE_API_TOKEN'];
for (const k of required) {
  if (!process.env[k]) console.warn(`[warn] Falta ${k} en .env`);
}

export const cfg = {
  PORT: process.env.PORT ?? '8085',
  MODEL: process.env.MODEL ?? 'openai/gpt-4o-mini',
  DB: {
    host: process.env.DB_HOST ?? 'localhost',
    user: process.env.DB_USER ?? 'root',
    password: process.env.DB_PASSWORD ?? '',
    name: process.env.DB_NAME ?? 'fitsense',
  },
  REPLICATE_API_TOKEN: process.env.REPLICATE_API_TOKEN ?? ''
};
