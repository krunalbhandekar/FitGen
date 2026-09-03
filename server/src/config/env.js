import dotenv from 'dotenv';

dotenv.config();

/**
 * Reads an environment variable, failing fast when a required one is missing.
 * Fail-fast beats a server that boots and then 500s on the first request.
 */
const read = (key, { required = false, fallback = undefined } = {}) => {
  const value = process.env[key] ?? fallback;
  if (required && (value === undefined || value === '')) {
    throw new Error(
      `Missing required environment variable: ${key}. See server/.env.example`,
    );
  }
  return value;
};

const parseList = (value) =>
  (value ?? '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);

export const env = {
  nodeEnv: read('NODE_ENV', { fallback: 'development' }),
  port: Number(read('PORT', { fallback: 5000 })),

  mongoUri: read('MONGO_URI', { required: true }),

  jwtSecret: read('JWT_SECRET', { required: true }),
  jwtExpiresIn: read('JWT_EXPIRES_IN', { fallback: '7d' }),

  googleClientId: read('GOOGLE_CLIENT_ID', { required: true }),

  // Comma-separated list of allowed browser origins (Vercel URL + localhost).
  clientOrigins: parseList(
    read('CLIENT_ORIGINS', { fallback: 'http://localhost:5173' }),
  ),

  // AI generation (Phase 3). Optional: without a key the plan generators fall
  // back to their deterministic builders rather than failing.
  groqApiKey: read('GROQ_API_KEY', { fallback: '' }),
  // Groq retired the Llama 3.x models the report named; see groqClient.js.
  groqModel: read('GROQ_MODEL', { fallback: 'openai/gpt-oss-120b' }),
};

export const isProd = env.nodeEnv === 'production';
