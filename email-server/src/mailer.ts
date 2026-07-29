import nodemailer, { type SendMailOptions, type SentMessageInfo, type Transporter } from 'nodemailer';
import { env } from './env.js';
import { HttpError } from './errors.js';
import { logger } from './logger.js';

export interface SendResult {
  messageId: string;
  accepted: string[];
  rejected: string[];
  response: string;
  attempts: number;
  /** Ethereal only: a browser link to the message that was captured instead of delivered. */
  previewUrl?: string;
}

let transporterPromise: Promise<Transporter> | null = null;

async function createTransporter(): Promise<Transporter> {
  if (env.useTestTransport) {
    // No SMTP host configured (development only -- production boot already
    // failed without one). Ethereal captures mail instead of delivering it.
    const account = await nodemailer.createTestAccount();
    logger.warn('SMTP_HOST is unset; using an Ethereal test inbox. No mail will be delivered.', {
      user: account.user,
    });
    return nodemailer.createTransport({
      host: account.smtp.host,
      port: account.smtp.port,
      secure: account.smtp.secure,
      auth: { user: account.user, pass: account.pass },
    });
  }

  return nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_SECURE,
    auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASS } : undefined,
    // Pooling keeps bulk sends on a handful of connections instead of one per message.
    pool: true,
    maxConnections: 5,
    maxMessages: 100,
  });
}

export function getTransporter(): Promise<Transporter> {
  transporterPromise ??= createTransporter();
  return transporterPromise;
}

export async function closeTransporter() {
  if (!transporterPromise) return;
  const transporter = await transporterPromise;
  transporter.close();
  transporterPromise = null;
}

/** Opens a connection and authenticates without sending anything. */
export async function verifyTransport() {
  const transporter = await getTransporter();
  try {
    await transporter.verify();
  } catch (error) {
    throw HttpError.badGateway('SMTP verification failed.', describe(error));
  }
  return {
    host: env.useTestTransport ? 'smtp.ethereal.email' : (env.SMTP_HOST as string),
    port: env.useTestTransport ? 587 : env.SMTP_PORT,
    secure: env.useTestTransport ? false : env.SMTP_SECURE,
    testTransport: env.useTestTransport,
  };
}

/**
 * SMTP 4xx and socket-level failures are worth retrying; 5xx is a permanent
 * rejection (bad address, blocked content) that a retry only repeats.
 */
function isTransient(error: unknown): boolean {
  const { responseCode, code } = error as { responseCode?: number; code?: string };
  if (typeof responseCode === 'number') return responseCode >= 400 && responseCode < 500;
  return ['ECONNRESET', 'ETIMEDOUT', 'ESOCKET', 'ECONNECTION', 'EDNS', 'EAI_AGAIN'].includes(code ?? '');
}

function describe(error: unknown) {
  const { message, responseCode, code, command } = error as {
    message?: string;
    responseCode?: number;
    code?: string;
    command?: string;
  };
  return {
    message: message ?? 'Unknown SMTP error.',
    ...(responseCode !== undefined && { responseCode }),
    ...(code !== undefined && { code }),
    ...(command !== undefined && { command }),
  };
}

function addresses(list: SentMessageInfo['accepted']): string[] {
  return (list ?? []).map((entry: string | { address: string }) =>
    typeof entry === 'string' ? entry : entry.address,
  );
}

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Sends one message, retrying transient failures with exponential backoff. */
export async function sendMail(message: SendMailOptions): Promise<SendResult> {
  const transporter = await getTransporter();
  let lastError: unknown;

  for (let attempt = 1; attempt <= env.SEND_MAX_RETRIES + 1; attempt += 1) {
    try {
      const info: SentMessageInfo = await transporter.sendMail(message);
      const previewUrl = nodemailer.getTestMessageUrl(info);
      return {
        messageId: info.messageId,
        accepted: addresses(info.accepted),
        rejected: addresses(info.rejected),
        response: info.response ?? '',
        attempts: attempt,
        ...(previewUrl ? { previewUrl } : {}),
      };
    } catch (error) {
      lastError = error;
      const retryable = isTransient(error) && attempt <= env.SEND_MAX_RETRIES;
      logger.warn('Send attempt failed', { attempt, retryable, ...describe(error) });
      if (!retryable) break;
      await delay(250 * 2 ** (attempt - 1));
    }
  }

  throw HttpError.badGateway('The message could not be sent.', describe(lastError));
}
