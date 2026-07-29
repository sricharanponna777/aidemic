import { createApp } from './app.js';
import { env } from './env.js';
import { logger } from './logger.js';
import { closeTransporter } from './mailer.js';

const server = createApp().listen(env.PORT, () => {
  logger.info(`email-server listening on http://localhost:${env.PORT}`, {
    environment: env.NODE_ENV,
    transport: env.useTestTransport ? 'ethereal (test)' : `${env.SMTP_HOST}:${env.SMTP_PORT}`,
  });

  if (env.authDisabled) {
    logger.warn('API_KEYS is empty -- every endpoint is unauthenticated. Development only.');
  }
});

let shuttingDown = false;

async function shutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info(`Received ${signal}, shutting down.`);

  // Stop accepting connections first, then let in-flight sends finish before
  // tearing down the pooled SMTP connections.
  server.close(async (error) => {
    if (error) logger.error('Error while closing the HTTP server.', { message: error.message });
    await closeTransporter();
    process.exit(error ? 1 : 0);
  });

  setTimeout(() => {
    logger.error('Shutdown timed out after 10s; forcing exit.');
    process.exit(1);
  }, 10_000).unref();
}

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled promise rejection', { reason: reason instanceof Error ? reason.stack : String(reason) });
});
