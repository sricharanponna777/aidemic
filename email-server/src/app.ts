import cors from 'cors';
import express from 'express';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import { env } from './env.js';
import { requireApiKey } from './middleware/auth.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import { requestContext } from './middleware/requestContext.js';
import { emailRouter } from './routes/email.js';
import { healthRouter } from './routes/health.js';

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  if (env.TRUST_PROXY > 0) app.set('trust proxy', env.TRUST_PROXY);

  app.use(helmet());
  app.use(
    cors(
      env.ALLOWED_ORIGINS.length > 0
        ? {
            origin: env.ALLOWED_ORIGINS,
            allowedHeaders: ['Content-Type', 'Authorization', 'x-api-key', 'x-request-id'],
          }
        : // Server-to-server by default: no browser origin is allowed to send
          // credentialed requests to an API that holds SMTP credentials.
          { origin: false },
    ),
  );
  app.use(requestContext);

  // Health sits ahead of the limiter and the API key so probes stay cheap.
  app.use(healthRouter);

  app.use(
    rateLimit({
      windowMs: env.RATE_LIMIT_WINDOW_MS,
      limit: env.RATE_LIMIT_MAX,
      standardHeaders: 'draft-7',
      legacyHeaders: false,
      handler: (_req, res) => {
        res.status(429).json({
          error: { code: 'rate_limited', message: 'Too many requests. Retry after the window resets.' },
          requestId: res.locals.requestId,
        });
      },
    }),
  );

  app.use(express.json({ limit: env.MAX_BODY_SIZE }));
  app.use('/api/email', requireApiKey, emailRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
