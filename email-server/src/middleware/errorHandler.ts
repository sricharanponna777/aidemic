import type { ErrorRequestHandler, RequestHandler } from 'express';
import { HttpError } from '../errors.js';
import { logger } from '../logger.js';

export const notFoundHandler: RequestHandler = (req) => {
  throw HttpError.notFound(`No route matches ${req.method} ${req.originalUrl}.`);
};

/** Normalizes body-parser and unexpected failures into the same error envelope. */
function toHttpError(error: unknown): HttpError {
  if (error instanceof HttpError) return error;

  const { type, status } = error as { type?: string; status?: number };
  if (type === 'entity.too.large' || status === 413) return HttpError.payloadTooLarge();
  if (error instanceof SyntaxError && status === 400) return HttpError.badRequest('Request body is not valid JSON.');

  return new HttpError(500, 'internal_error', 'An unexpected error occurred.');
}

export const errorHandler: ErrorRequestHandler = (error, req, res, _next) => {
  const httpError = toHttpError(error);
  const requestId = res.locals.requestId as string | undefined;

  const log = httpError.status >= 500 ? logger.error : logger.warn;
  log(httpError.message, {
    requestId,
    status: httpError.status,
    method: req.method,
    path: req.path,
    // Unmapped failures lose their detail in the response, so keep it in the log.
    ...(httpError.code === 'internal_error' && {
      cause: error instanceof Error ? error.stack : String(error),
    }),
  });

  res.status(httpError.status).json({
    error: {
      code: httpError.code,
      message: httpError.message,
      ...(httpError.details !== undefined && { details: httpError.details }),
    },
    requestId,
  });
};
