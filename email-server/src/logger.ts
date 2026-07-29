import { env } from './env.js';

type Level = 'debug' | 'info' | 'warn' | 'error';

const ORDER: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };
const MIN_LEVEL = env.isProduction ? ORDER.info : ORDER.debug;

function emit(level: Level, message: string, context?: Record<string, unknown>) {
  if (ORDER[level] < MIN_LEVEL) return;

  const entry = { ts: new Date().toISOString(), level, message, ...context };
  const line = env.isProduction ? JSON.stringify(entry) : format(level, message, context);

  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  else console.log(line);
}

function format(level: Level, message: string, context?: Record<string, unknown>) {
  const suffix =
    context && Object.keys(context).length > 0
      ? ` ${Object.entries(context)
          .map(([key, value]) => `${key}=${typeof value === 'string' ? value : JSON.stringify(value)}`)
          .join(' ')}`
      : '';
  return `[${level.toUpperCase()}] ${message}${suffix}`;
}

export const logger = {
  debug: (message: string, context?: Record<string, unknown>) => emit('debug', message, context),
  info: (message: string, context?: Record<string, unknown>) => emit('info', message, context),
  warn: (message: string, context?: Record<string, unknown>) => emit('warn', message, context),
  error: (message: string, context?: Record<string, unknown>) => emit('error', message, context),
};
