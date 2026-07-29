import type { RequestHandler } from 'express';
import type { ZodType } from 'zod';
import { HttpError } from '../errors.js';

/** Replaces `req.body` with the parsed value, so handlers only see valid input. */
export function validateBody(schema: ZodType): RequestHandler {
  return (req, _res, next) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      throw HttpError.badRequest(
        'Request body failed validation.',
        result.error.issues.map((issue) => ({
          path: issue.path.join('.') || '(root)',
          message: issue.message,
        })),
      );
    }
    req.body = result.data;
    next();
  };
}
