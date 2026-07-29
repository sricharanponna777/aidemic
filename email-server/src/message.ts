import type { SendMailOptions } from 'nodemailer';
import { env } from './env.js';
import { HttpError } from './errors.js';
import { renderTemplate } from './templates.js';
import type { BulkMessage, EmailAddress, SendBody, TemplateSendBody } from './validation.js';

export const isTemplateMessage = (message: BulkMessage): message is TemplateSendBody =>
  'template' in message;

/** Flattens the string-or-object, one-or-many recipient shape for logging and responses. */
export function recipientList(value: EmailAddress | EmailAddress[] | undefined): string[] {
  if (!value) return [];
  const entries = Array.isArray(value) ? value : [value];
  return entries.map((entry) => (typeof entry === 'string' ? entry : entry.address));
}

function sender(body: BulkMessage) {
  const from = body.from ?? env.MAIL_FROM;
  if (!from) {
    throw HttpError.badRequest('No sender available: set MAIL_FROM in the environment or pass `from`.');
  }
  return from;
}

/** Turns a validated request body into the options Nodemailer expects. */
export function buildMessage(body: BulkMessage): SendMailOptions {
  const content = isTemplateMessage(body)
    ? renderTemplate(body.template, body.data, body.subject)
    : { subject: body.subject, html: (body as SendBody).html, text: (body as SendBody).text };

  return {
    from: sender(body),
    to: body.to,
    ...(body.cc && { cc: body.cc }),
    ...(body.bcc && { bcc: body.bcc }),
    ...((body.replyTo ?? env.MAIL_REPLY_TO) && { replyTo: body.replyTo ?? env.MAIL_REPLY_TO }),
    ...(body.headers && { headers: body.headers }),
    ...(body.priority && { priority: body.priority }),
    subject: content.subject,
    ...(content.text && { text: content.text }),
    ...(content.html && { html: content.html }),
    ...(body.attachments && {
      attachments: body.attachments.map((attachment) => ({
        filename: attachment.filename,
        content: attachment.content,
        encoding: 'base64',
        ...(attachment.contentType && { contentType: attachment.contentType }),
        ...(attachment.cid && { cid: attachment.cid }),
      })),
    }),
  };
}
