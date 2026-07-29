import 'dotenv/config';
import { z } from 'zod';

/** Parses "true"/"1"/"yes" (case-insensitive) as true, anything else as false. */
const booleanish = (fallback: boolean) =>
  z
    .string()
    .optional()
    .transform((value) =>
      value === undefined || value === ''
        ? fallback
        : ['true', '1', 'yes'].includes(value.toLowerCase()),
    );

/** Splits a comma-separated env var into a trimmed, non-empty list. */
const csv = z
  .string()
  .optional()
  .transform((value) =>
    (value ?? '')
      .split(',')
      .map((entry) => entry.trim())
      .filter(Boolean),
  );

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  API_KEYS: csv,
  ALLOWED_ORIGINS: csv,
  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(60_000),
  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(60),
  MAX_BODY_SIZE: z.string().default('25mb'),
  /** Number of reverse proxies in front of the app; 0 means req.ip is the socket address. */
  TRUST_PROXY: z.coerce.number().int().min(0).max(5).default(0),

  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().int().min(1).max(65535).default(587),
  SMTP_SECURE: booleanish(false),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),

  MAIL_FROM: z.string().optional(),
  MAIL_REPLY_TO: z.string().optional(),

  SEND_MAX_RETRIES: z.coerce.number().int().min(0).max(5).default(2),
  BULK_CONCURRENCY: z.coerce.number().int().min(1).max(20).default(5),
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  const details = parsed.error.issues
    .map((issue) => `  - ${issue.path.join('.') || '(root)'}: ${issue.message}`)
    .join('\n');
  throw new Error(`Invalid environment configuration:\n${details}`);
}

const config = parsed.data;
const isProduction = config.NODE_ENV === 'production';

// A misconfigured production deployment is worse than one that refuses to
// start, so the guardrails that only matter in production are enforced here
// rather than left to fail at the first send.
if (isProduction) {
  const missing: string[] = [];
  if (config.API_KEYS.length === 0) missing.push('API_KEYS');
  if (!config.SMTP_HOST) missing.push('SMTP_HOST');
  if (!config.MAIL_FROM) missing.push('MAIL_FROM');
  if (missing.length > 0) {
    throw new Error(`Missing required production environment variables: ${missing.join(', ')}`);
  }
}

export const env = {
  ...config,
  isProduction,
  /** No SMTP host configured outside production: fall back to an Ethereal test inbox. */
  useTestTransport: !config.SMTP_HOST,
  /** Auth is only skippable in development, and only when no keys are configured. */
  authDisabled: config.API_KEYS.length === 0,
} as const;

export type Env = typeof env;
