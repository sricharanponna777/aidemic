import { createHash, timingSafeEqual } from 'node:crypto';
import type { RequestHandler } from 'express';
import { env } from '../env.js';
import { HttpError } from '../errors.js';

/** Compare fixed-length digests so neither key length nor prefix leaks via timing. */
const digest = (value: string) => createHash('sha256').update(value).digest();
const allowed = env.API_KEYS.map(digest);

function fromAuthorizationHeader(header: string | undefined) {
  const match = header?.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim();
}

export const requireApiKey: RequestHandler = (req, _res, next) => {
  if (env.authDisabled) return next();

  const provided = req.get('x-api-key')?.trim() ?? fromAuthorizationHeader(req.get('authorization'));
  if (!provided) throw HttpError.unauthorized();

  const candidate = digest(provided);
  if (!allowed.some((key) => timingSafeEqual(key, candidate))) throw HttpError.unauthorized();

  next();
};
