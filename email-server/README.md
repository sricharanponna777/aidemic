# email-server

A standalone Express 5 + Nodemailer service that turns SMTP into a JSON API. It is
independent of the Next.js app — its own `package.json`, its own env file, its own
deploy — so nothing here is imported by `src/`.

## Quick start

```bash
cd email-server
bun install
cp .env.example .env      # optional in development, see below
bun run dev               # http://localhost:4000
```

With no `SMTP_HOST` set, the server provisions an [Ethereal](https://ethereal.email)
test inbox on first send: nothing is delivered and every response carries a
`previewUrl` you can open in a browser. Point `SMTP_HOST` at a real provider
(Resend, SES, Postmark, Gmail…) when you want real delivery.

```bash
bun run dev        # watch mode
bun run start      # single run
bun run typecheck  # tsc --noEmit
```

## Authentication

Every `/api/email/*` route requires a key from `API_KEYS` (comma-separated), sent as
either header:

```
x-api-key: your-key
Authorization: Bearer your-key
```

Keys are compared as SHA-256 digests in constant time. If `API_KEYS` is empty the API
runs unauthenticated — allowed in development only; production boot fails without it,
along with `SMTP_HOST` and `MAIL_FROM`.

`GET /health` is deliberately unauthenticated and says nothing about SMTP.

## Endpoints

| Method | Path                       | Purpose                                        |
| ------ | -------------------------- | ---------------------------------------------- |
| GET    | `/health`                  | Liveness probe (no key required)               |
| GET    | `/api/email/verify`        | Open + authenticate an SMTP connection         |
| GET    | `/api/email/templates`     | List templates with their required variables   |
| POST   | `/api/email/preview`       | Render a template without sending it           |
| POST   | `/api/email/send`          | Send one message with a caller-supplied body   |
| POST   | `/api/email/send-template` | Send one message rendered from a template      |
| POST   | `/api/email/bulk`          | Send up to 100 messages of either shape        |

### `POST /api/email/send`

`to`, `cc`, `bcc` accept a string, a `{ name, address }` object, or an array of
either (max 50). `from` falls back to `MAIL_FROM`, `replyTo` to `MAIL_REPLY_TO`.
At least one of `text` / `html` is required; `subject` always is.

```bash
curl -X POST http://localhost:4000/api/email/send \
  -H "x-api-key: dev-key-change-me" -H "content-type: application/json" -d '{
    "to": [{ "name": "Charan", "address": "charan@example.com" }],
    "cc": "tutor@example.com",
    "subject": "Your revision plan for this week",
    "html": "<p>Hello <b>Charan</b> — 3 topics are due.</p>",
    "text": "Hello Charan - 3 topics are due.",
    "attachments": [
      { "filename": "plan.txt", "content": "UmV2aXNpb24gcGxhbg==", "contentType": "text/plain" }
    ],
    "headers": { "X-Campaign": "weekly-plan" },
    "priority": "normal"
  }'
```

```json
{
  "ok": true,
  "messageId": "<91655ec7-…@aidemic.test>",
  "accepted": ["charan@example.com", "tutor@example.com"],
  "rejected": [],
  "response": "250 Accepted …",
  "attempts": 1,
  "previewUrl": "https://ethereal.email/message/…"
}
```

Attachments are base64 in `content` (max 10 per message, capped by `MAX_BODY_SIZE`).
Remote URLs and local file paths are intentionally **not** accepted — an API key
should not be able to make the server read its own disk or fetch arbitrary URLs. Set
`cid` to reference an attachment inline as `<img src="cid:…">`.

### `POST /api/email/send-template`

```bash
curl -X POST http://localhost:4000/api/email/send-template \
  -H "x-api-key: dev-key-change-me" -H "content-type: application/json" -d '{
    "to": "charan@example.com",
    "template": "password-reset",
    "data": {
      "firstName": "Charan", "appName": "AIDemic",
      "resetUrl": "https://aidemic.app/reset?t=abc",
      "expiryMinutes": 30, "supportEmail": "help@aidemic.app"
    }
  }'
```

Missing variables return `400` listing exactly which ones, so a broken send never
goes out half-rendered. `subject` in the body overrides the template's own.

### `POST /api/email/bulk`

Takes `messages` (max 100) of either shape, sent through a pool of
`BULK_CONCURRENCY` connections. Set `continueOnError: false` to stop at the first
failure — remaining messages come back as `skipped`.

Status is `200` when everything sent, `207` on a partial failure, `502` when nothing
sent. Each result carries its own `index`, `status`, `to`, and `messageId` or `error`.

```json
{
  "ok": false, "total": 3, "sent": 2, "failed": 1, "skipped": 0,
  "results": [
    { "index": 0, "status": "sent", "to": ["a@example.com"], "messageId": "<…>" },
    { "index": 1, "status": "sent", "to": ["b@example.com"], "messageId": "<…>" },
    { "index": 2, "status": "failed", "to": ["c@example.com"],
      "error": { "code": "not_found", "message": "Unknown template \"does-not-exist\"." } }
  ]
}
```

## Templates

Templates live in [src/templates](src/templates) — one `.html` body per template plus
`manifest.json` (subject, description, optional layout). Files starting with `_` are
layouts: the body renders first, then lands in the layout's `{{{ content }}}`.

- `{{ name }}` interpolates HTML-escaped, `{{{ name }}}` raw (use for trusted HTML only).
- The subject is interpolated unescaped — it is a plain-text header, not markup.
- Required variables are **derived by scanning** the subject, body and layout, so
  adding a placeholder to an `.html` file is all it takes; `year` is supplied for you.
  It also makes that variable mandatory for every existing caller — a missing one
  is a `400`, not a blank. Check `GET /api/email/templates` after every edit.
- The plain-text alternative is generated from the rendered HTML automatically.

Bundled: `welcome`, `password-reset`, `notification`, `weekly-digest`. To add one,
drop `my-template.html` in the folder and add an entry to `manifest.json` —
`GET /api/email/templates` and validation pick it up on restart.

There are no loops or conditionals, so anything repeated or variant arrives
through a **raw slot** the caller fills: `notification.body`,
`welcome.highlights`, `weekly-digest.childrenHtml`. Those are not escaped, so
only ever pass server-built markup — never user input.

`_layout.html` carries one small `<style>` block for the two things inline CSS
cannot express: a `max-width:600px` breakpoint and `prefers-color-scheme: dark`.
Its `.sm-*` / `.dm-*` class names are also emitted by the digest cards built in
`../supabase/functions/weekly-parent-digest/index.ts`, so renaming one means
editing that file too. Keep the block free of double-brace sequences — it is
substituted like any other template, so a stray placeholder there becomes a
required variable for every template using the layout.

Only `&nbsp;` and `&copy; &mdash; &ndash; &hellip; &lsquo; &rsquo; &ldquo;
&rdquo;` plus numeric references (`&#183;`) are decoded when the plain-text part
is generated. Any other named entity leaks through literally — prefer numeric.

## Configuration

See [.env.example](.env.example) for the full list. The ones worth a second look:

- `API_KEYS` — comma-separated; required in production.
- `SMTP_SECURE` — `true` for implicit TLS (port 465), `false` for STARTTLS (587/25).
- `TRUST_PROXY` — number of reverse proxies ahead of the server. Leave at `0` unless
  you really are behind one; a wrong value lets clients spoof their IP past the limiter.
- `SEND_MAX_RETRIES` — retries for *transient* failures only. SMTP 4xx and socket
  errors are retried with exponential backoff; 5xx is a permanent rejection and fails fast.
- `RATE_LIMIT_WINDOW_MS` / `RATE_LIMIT_MAX` — fixed window per client IP, in-memory.
  A multi-instance deployment needs a shared store to be a true global limit.

## Errors

Every failure uses the same envelope, with the `X-Request-Id` echoed back for tracing:

```json
{
  "error": {
    "code": "bad_request",
    "message": "Request body failed validation.",
    "details": [{ "path": "to", "message": "Invalid email address" }]
  },
  "requestId": "cc5ce89f-…"
}
```

`400` validation · `401` bad key · `404` unknown route/template · `413` body too large ·
`429` rate limited · `502` SMTP refused or unreachable.

## Notes

- Requests are logged as JSON in production, human-readable otherwise. Message bodies
  and recipients are never logged.
- `SIGINT`/`SIGTERM` stop new connections, drain in-flight sends, close the SMTP pool,
  then exit — with a 10s hard cap.
- Excluded from the root `tsconfig.json`, so the Next.js `bun run typecheck` ignores it;
  run this folder's own `bun run typecheck` instead.
