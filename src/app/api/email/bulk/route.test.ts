import { POST } from './route';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { NextRequest } from 'next/server';

const saved: Record<string, string | undefined> = {};

beforeEach(() => {
  saved.BULK_EMAIL_SECRET = process.env.BULK_EMAIL_SECRET;
  saved.BREVO_API_KEY = process.env.BREVO_API_KEY;
  saved.BREVO_SMTP_FROM = process.env.BREVO_SMTP_FROM;
  saved.SUPPORT_EMAIL = process.env.SUPPORT_EMAIL;
  saved.APP_NAME = process.env.APP_NAME;
  saved.APP_URL = process.env.APP_URL;

  process.env.BREVO_API_KEY = 'test-key';
  process.env.BREVO_SMTP_FROM = 'test@example.com';
  process.env.SUPPORT_EMAIL = 'support@example.com';
  process.env.APP_NAME = 'TestApp';
  process.env.APP_URL = 'https://test.example.com';
  process.env.BULK_EMAIL_SECRET = 'test-secret';
});

afterEach(() => {
  for (const name of Object.keys(saved)) {
    if (saved[name] === undefined) delete process.env[name];
    else process.env[name] = saved[name];
  }
  vi.restoreAllMocks();
});

describe('POST /api/email/bulk', () => {
  it('rejects requests without valid API key', async () => {
    const request = new Request('http://localhost:3000/api/email/bulk', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': 'wrong-key' },
      body: JSON.stringify({ messages: [] }),
    });

    const response = await POST(request as unknown as NextRequest);
    expect(response.status).toBe(401);
  });

  it('refuses to send at all when BULK_EMAIL_SECRET is unset, in every environment', async () => {
    // This used to skip the auth check entirely and send, which meant a deploy that
    // forgot one env var silently exposed an unauthenticated "send mail as us" endpoint.
    delete process.env.BULK_EMAIL_SECRET;
    const sendSpy = vi.spyOn(globalThis, 'fetch');

    const request = new Request('http://localhost:3000/api/email/bulk', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: [] }),
    });

    const response = await POST(request as unknown as NextRequest);
    expect(response.status).toBe(503);
    expect(sendSpy).not.toHaveBeenCalled();
  });

  it('rejects a batch larger than the 100-message cap', async () => {
    const sendSpy = vi.spyOn(globalThis, 'fetch');
    const messages = Array.from({ length: 101 }, (_, i) => ({
      to: `user${i}@example.com`,
      template: 'welcome',
      data: {},
    }));

    const request = new Request('http://localhost:3000/api/email/bulk', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': 'test-secret' },
      body: JSON.stringify({ messages }),
    });

    const response = await POST(request as unknown as NextRequest);
    expect(response.status).toBe(400);
    expect(sendSpy).not.toHaveBeenCalled();
  });

  it('rejects a malformed recipient before sending anything', async () => {
    const sendSpy = vi.spyOn(globalThis, 'fetch');
    const request = new Request('http://localhost:3000/api/email/bulk', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': 'test-secret' },
      body: JSON.stringify({
        messages: [{ to: 'not-an-email', template: 'welcome', data: {} }],
      }),
    });

    const response = await POST(request as unknown as NextRequest);
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: expect.stringContaining('messages[0].to') });
    expect(sendSpy).not.toHaveBeenCalled();
  });

  it('rejects a nested object in template data', async () => {
    const request = new Request('http://localhost:3000/api/email/bulk', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': 'test-secret' },
      body: JSON.stringify({
        messages: [{ to: 'user@example.com', template: 'welcome', data: { nested: { a: 1 } } }],
      }),
    });

    expect((await POST(request as unknown as NextRequest)).status).toBe(400);
  });

  it('returns proper bulk email response format', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ messageId: 'test' }), { status: 200 })
    );

    const request = new Request('http://localhost:3000/api/email/bulk', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': 'test-secret',
      },
      body: JSON.stringify({
        messages: [
          {
            to: 'user@example.com',
            template: 'welcome',
            data: {
              appName: 'TestApp',
              supportEmail: 'support@example.com',
              firstName: 'Test',
              intro: 'Welcome',
              actionLabel: 'Go',
              actionUrl: 'https://test.example.com',
              highlights: '<div></div>',
            },
          },
        ],
      }),
    });

    const response = await POST(request as unknown as NextRequest);
    const data = await response.json();

    expect(data).toHaveProperty('ok');
    expect(data).toHaveProperty('total');
    expect(data).toHaveProperty('sent');
    expect(data).toHaveProperty('failed');
    expect(data).toHaveProperty('results');
    expect(Array.isArray(data.results)).toBe(true);
  });
});
