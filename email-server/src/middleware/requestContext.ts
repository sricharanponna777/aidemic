import { randomUUID } from 'node:crypto';
import type { RequestHandler } from 'express';
import { logger } from '../logger.js';

/** Tags every request with an id, echoes it back, and logs the outcome. */
export const requestContext: RequestHandler = (req, res, next) => {
  const requestId = req.get('x-request-id') ?? randomUUID();
  res.locals.requestId = requestId;
  res.setHeader('X-Request-Id', requestId);

  const startedAt = process.hrtime.bigint();
  res.on('finish', () => {
    logger.info('request', {
      requestId,
      method: req.method,
      path: req.originalUrl,
      status: res.statusCode,
      durationMs: Number((process.hrtime.bigint() - startedAt) / 1_000_000n),
    });
  });

  next();
};
