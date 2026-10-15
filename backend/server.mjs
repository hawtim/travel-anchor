import express from 'express';
import { CopilotClient } from '@github/copilot-sdk';

const PORT = Number(process.env.PORT || 10000);
const MODEL = process.env.COPILOT_MODEL || 'gpt-5.6-luna';
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || 'https://hawtim.github.io,http://localhost:8000,http://127.0.0.1:8000')
  .split(',')
  .map((x) => x.trim())
  .filter(Boolean);

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '256kb' }));

app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin && (ALLOWED_ORIGINS.includes('*') || ALLOWED_ORIGINS.includes(origin))) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

let client;
let clientStartPromise;

async function getClient() {
  if (!process.env.COPILOT_GITHUB_TOKEN && !process.env.GH_TOKEN && !process.env.GITHUB_TOKEN) {
    throw new Error('Copilot authentication is not configured. Set COPILOT_GITHUB_TOKEN.');
  }
  if (!client) {
    client = new CopilotClient({
      useLoggedInUser: false,
      mode: 'empty',
      logLevel: process.env.COPILOT_LOG_LEVEL || 'warning'
    });
    clientStartPromise = client.start();
  }
  await clientStartPromise;
  return client;
}

const SYSTEM_PROMPT = `You are Travel Anchor, an AI assistant for independent travellers.
You answer using ONLY the structured network context supplied by the application.
Your main jobs are:
1. explain when a destination has the highest traveller density;
2. identify relevant overlapping travellers and explain compatibility;
3. explain trade-offs and uncertainty without inventing facts;
4. encourage independent travel decisions rather than implying the platform guarantees safety.

Rules:
- Never invent travellers, dates, counts, matches, identity claims, or safety claims.
- If the context is insufficient, say exactly what is missing.
- Compatibility is personal, not a global rating of a person.
- Do not call someone safe, unsafe, good, bad, suspicious, or trustworthy based on profile data.
- Prefer concise Chinese when the user writes Chinese; otherwise answer in the user's language.
- When useful, give one clear recommendation and the reason.
- Distinguish Confirmed, Flexible, and Interested travellers.
- Treat social account links as user-provided context, not identity verification unless the context explicitly says verified.
`;

function safeContext(value) {
  const json = JSON.stringify(value ?? {});
  if (json.length > 120_000) throw new Error('Structured context is too large.');
  return json;
}

app.get('/health', (_req, res) => {
  res.json({
    ok: true,
    service: 'travel-anchor-api',
    model: MODEL,
    copilotConfigured: Boolean(process.env.COPILOT_GITHUB_TOKEN || process.env.GH_TOKEN || process.env.GITHUB_TOKEN)
  });
});

app.post('/chat', async (req, res) => {
  try {
    const question = String(req.body?.question || '').trim();
    if (!question) return res.status(400).json({ error: 'question is required' });
    if (question.length > 5000) return res.status(400).json({ error: 'question is too long' });

    const context = safeContext(req.body?.context || {});
    const copilot = await getClient();
    const session = await copilot.createSession({
      model: MODEL,
      streaming: false,
      infiniteSessions: { enabled: false },
      availableTools: [],
      systemMessage: {
        mode: 'replace',
        content: SYSTEM_PROMPT
      }
    });

    try {
      const response = await session.sendAndWait({
        prompt: `User question:\n${question}\n\nStructured Travel Anchor context (source of truth):\n${context}`
      }, 90_000);

      const answer = response?.data?.content?.trim();
      if (!answer) throw new Error('Copilot returned an empty response.');
      res.json({ answer, model: MODEL });
    } finally {
      await session.disconnect().catch(() => {});
    }
  } catch (error) {
    console.error('[chat]', error);
    res.status(500).json({
      error: 'AI request failed',
      detail: process.env.NODE_ENV === 'production' ? undefined : String(error?.message || error)
    });
  }
});

app.use((_req, res) => res.status(404).json({ error: 'not found' }));

const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`Travel Anchor API listening on 0.0.0.0:${PORT} using ${MODEL}`);
});

async function shutdown() {
  server.close();
  if (client) await client.stop().catch(() => {});
  process.exit(0);
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
