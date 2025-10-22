import Replicate from 'replicate';

const MODEL = process.env.MODEL || 'openai/gpt-4o-mini';
const replicate = new Replicate({ auth: process.env.REPLICATE_API_TOKEN });

export async function runChatReply({ prompt, system_prompt }) {
  const out = await replicate.run(MODEL, { input: { prompt, system_prompt } });
  return Array.isArray(out) ? out.join('') : String(out || '');
}
