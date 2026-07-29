import { Router } from 'express';
import { env } from '../env.js';

export const healthRouter = Router();

const startedAt = Date.now();

/** Unauthenticated liveness probe -- deliberately says nothing about SMTP credentials. */
healthRouter.get('/health', (_req, res) => {
  res.json({
    ok: true,
    service: 'email-server',
    environment: env.NODE_ENV,
    uptimeSeconds: Math.round((Date.now() - startedAt) / 1000),
  });
});
