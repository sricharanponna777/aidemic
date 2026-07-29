import { Router } from 'express';
import { env } from '../env.js';
import { HttpError } from '../errors.js';
import { sendMail, verifyTransport } from '../mailer.js';
import { buildMessage, recipientList } from '../message.js';
import { validateBody } from '../middleware/validate.js';
import { listTemplates, renderTemplate } from '../templates.js';
import { bulkSchema, previewSchema, sendSchema, templateSendSchema } from '../validation.js';
import type { BulkBody } from '../validation.js';

export const emailRouter = Router();

interface BulkResult {
  index: number;
  status: 'sent' | 'failed' | 'skipped';
  to: string[];
  messageId?: string;
  previewUrl?: string;
  error?: { code: string; message: string; details?: unknown };
}

function describeError(error: unknown) {
  if (error instanceof HttpError) {
    return { code: error.code, message: error.message, ...(error.details !== undefined && { details: error.details }) };
  }
  return { code: 'internal_error', message: 'An unexpected error occurred.' };
}

/** Runs the batch over a bounded pool so a large request cannot open 100 SMTP sessions. */
async function runBulk(body: BulkBody): Promise<BulkResult[]> {
  const results: BulkResult[] = [];
  let cursor = 0;
  let halted = false;

  const worker = async () => {
    while (cursor < body.messages.length) {
      const index = cursor;
      cursor += 1;
      const message = body.messages[index];
      if (!message) return;

      const to = recipientList(message.to);
      if (halted) {
        results[index] = { index, status: 'skipped', to };
        continue;
      }

      try {
        const result = await sendMail(buildMessage(message));
        results[index] = {
          index,
          status: 'sent',
          to,
          messageId: result.messageId,
          ...(result.previewUrl && { previewUrl: result.previewUrl }),
        };
      } catch (error) {
        if (!body.continueOnError) halted = true;
        results[index] = { index, status: 'failed', to, error: describeError(error) };
      }
    }
  };

  const workers = Math.min(env.BULK_CONCURRENCY, body.messages.length);
  await Promise.all(Array.from({ length: workers }, worker));
  return results;
}

/** GET /api/email/verify -- confirm the SMTP credentials actually work. */
emailRouter.get('/verify', async (_req, res) => {
  res.json({ ok: true, smtp: await verifyTransport() });
});

/** GET /api/email/templates -- names, subjects and required variables. */
emailRouter.get('/templates', (_req, res) => {
  res.json({ ok: true, templates: listTemplates() });
});

/** POST /api/email/preview -- render a template without sending it. */
emailRouter.post('/preview', validateBody(previewSchema), (req, res) => {
  const { template, data } = req.body;
  res.json({ ok: true, ...renderTemplate(template, data) });
});

/** POST /api/email/send -- one message with a caller-supplied body. */
emailRouter.post('/send', validateBody(sendSchema), async (req, res) => {
  const result = await sendMail(buildMessage(req.body));
  res.json({ ok: true, ...result });
});

/** POST /api/email/send-template -- one message rendered from a named template. */
emailRouter.post('/send-template', validateBody(templateSendSchema), async (req, res) => {
  const result = await sendMail(buildMessage(req.body));
  res.json({ ok: true, template: req.body.template, ...result });
});

/** POST /api/email/bulk -- up to 100 messages of either shape. */
emailRouter.post('/bulk', validateBody(bulkSchema), async (req, res) => {
  const results = await runBulk(req.body as BulkBody);
  const sent = results.filter((result) => result.status === 'sent').length;
  const failed = results.filter((result) => result.status === 'failed').length;
  const skipped = results.filter((result) => result.status === 'skipped').length;

  // 207 keeps a partial failure distinguishable from a clean run without
  // forcing callers to parse the per-message array to find out.
  const status = failed === 0 ? 200 : sent > 0 ? 207 : 502;
  res.status(status).json({ ok: failed === 0, total: results.length, sent, failed, skipped, results });
});
