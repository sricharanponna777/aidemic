/** An error with an HTTP status the error handler can surface verbatim. */
export class HttpError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
    this.code = code;
    this.details = details;
  }

  static badRequest(message: string, details?: unknown) {
    return new HttpError(400, 'bad_request', message, details);
  }

  static unauthorized(message = 'Missing or invalid API key.') {
    return new HttpError(401, 'unauthorized', message);
  }

  static notFound(message: string) {
    return new HttpError(404, 'not_found', message);
  }

  static payloadTooLarge(message = 'Request body is too large.') {
    return new HttpError(413, 'payload_too_large', message);
  }

  static badGateway(message: string, details?: unknown) {
    return new HttpError(502, 'smtp_error', message, details);
  }
}
