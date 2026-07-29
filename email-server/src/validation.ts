import { z } from 'zod';

/** Rejects CR/LF so nothing that lands in a header can smuggle another one in. */
const singleLine = (max: number) =>
  z
    .string()
    .min(1)
    .max(max)
    .refine((value) => !/[\r\n]/.test(value), 'Line breaks are not allowed here.');

const emailAddress = z.union([
  z.email(),
  z.object({
    name: singleLine(200),
    address: z.email(),
  }),
]);

const recipients = z.union([emailAddress, z.array(emailAddress).min(1).max(50)]);

const attachment = z.object({
  filename: singleLine(255),
  /** Base64-encoded bytes. Remote URLs and local paths are deliberately unsupported. */
  content: z.string().min(1).max(20_000_000),
  contentType: singleLine(150).optional(),
  /** Content-ID for inline images referenced as <img src="cid:..."> in the HTML. */
  cid: singleLine(200).optional(),
});

const headers = z
  .record(
    z.string().regex(/^[A-Za-z0-9-]+$/, 'Header names may only contain letters, digits and hyphens.'),
    singleLine(1000),
  )
  .refine((value) => Object.keys(value).length <= 20, 'At most 20 custom headers are allowed.');

/** Fields shared by every outbound message, whatever produces its body. */
const envelope = {
  from: emailAddress.optional(),
  to: recipients,
  cc: recipients.optional(),
  bcc: recipients.optional(),
  replyTo: emailAddress.optional(),
  attachments: z.array(attachment).max(10).optional(),
  headers: headers.optional(),
  priority: z.enum(['high', 'normal', 'low']).optional(),
};

export const sendSchema = z
  .object({
    ...envelope,
    subject: singleLine(300),
    text: z.string().max(1_000_000).optional(),
    html: z.string().max(2_000_000).optional(),
  })
  .refine((body) => Boolean(body.text ?? body.html), {
    message: 'Provide `text`, `html`, or both.',
    path: ['text'],
  });

export const templateSendSchema = z.object({
  ...envelope,
  template: z
    .string()
    .regex(/^[a-z0-9][a-z0-9-]*$/, 'Template names are lowercase slugs, e.g. "password-reset".'),
  data: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).default({}),
  /** Overrides the template's own subject when present. */
  subject: singleLine(300).optional(),
});

export const previewSchema = templateSendSchema.pick({ template: true, data: true });

export const bulkSchema = z.object({
  // Template first: a message carrying `template` is a template message even if
  // it also sets fields the raw shape would accept.
  messages: z.array(z.union([templateSendSchema, sendSchema])).min(1).max(100),
  /** Keep sending after a message fails (default) or stop at the first failure. */
  continueOnError: z.boolean().default(true),
});

export type SendBody = z.infer<typeof sendSchema>;
export type TemplateSendBody = z.infer<typeof templateSendSchema>;
export type BulkBody = z.infer<typeof bulkSchema>;
export type BulkMessage = BulkBody['messages'][number];
export type EmailAddress = z.infer<typeof emailAddress>;
