import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';

import { env, isProd } from './config/env.js';
import routes from './routes/index.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';

/**
 * Turns a configured origin into a matcher. A leading `*.` wildcard is
 * supported so one entry can cover every Vercel preview deployment
 * (e.g. `https://*.vercel.app`).
 */
const toMatcher = (pattern) => {
  if (!pattern.includes('*')) return (origin) => origin === pattern;
  const regex = new RegExp(
    `^${pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '[^.]+')}$`,
  );
  return (origin) => regex.test(origin);
};

const buildApp = () => {
  const app = express();

  // Render terminates TLS at its proxy; needed for correct client IPs (rate limit).
  app.set('trust proxy', 1);
  app.disable('x-powered-by');

  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));

  const matchers = env.clientOrigins.map(toMatcher);
  app.use(
    cors({
      origin(origin, callback) {
        // Server-to-server calls and health checks send no Origin header.
        if (!origin) return callback(null, true);
        if (matchers.some((match) => match(origin))) return callback(null, true);
        return callback(new Error(`Origin not allowed by CORS: ${origin}`));
      },
      methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization'],
      maxAge: 86400,
    }),
  );

  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true }));
  app.use(morgan(isProd ? 'combined' : 'dev'));

  app.get('/', (_req, res) => {
    res.json({
      name: 'FitGen API',
      version: '1.0.0',
      docs: '/api/health',
    });
  });

  app.use('/api', routes);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
};

export default buildApp;
