# AIDemic

An AI-powered revision platform for UK GCSE and A-Level students, built on Next.js 16. Set your exact qualifications, generate specification-aware notes, flashcards, and podcasts, drill with spaced repetition, practise exam-style questions with AI marking, and track predicted grades — with linked teacher and parent views.

The package manager is **Bun**.

## Features

### For students — the revision loop
- **Subjects & exam dates** — save your exact qualification (country → exam board → subject → specification/tier) plus an exam date and target grade per subject.
- **Learn** — AI-generated, specification-aware **notes** and multi-voice **podcasts**; a study chat for follow-up questions.
- **Flashcards** — AI-generated decks with tags, rich text, Markdown, KaTeX math, and Anki-style **cloze deletions** (`{{c1::…}}`) that are masked during review.
- **Recall (spaced repetition)** — an Anki-grade SM-2 scheduler with learning steps, lapse handling, and overdue-interval credit. Full **keyboard control** (Space to flip, 1–4 to grade).
- **Daily Review** — one mixed queue interleaving due flashcards with quick questions targeting your recurring weak spots.
- **Revision Planner** — auto-generates a timetable weighted toward your weakest topics and nearest exams, with per-subject exam **countdowns**.
- **Smart Practice** — AI exam-style questions (open, MCQ, plot, and diagram-completion), server-authoritative AI **marking**, predicted grades, and a timed **mock exam** mode.
- **Blurting (free recall)** — brain-dump everything you know on a topic; the AI scores your coverage and lists what you missed and any misconceptions.
- **Exam Coach** — mark-scheme-flavoured analysis of your recurring patterns and next steps.
- **Leech detection** — automatically flags cards you repeatedly get wrong so you can fix those first.
- **Dashboard** — retention, streaks, configurable daily goal, activity charts, predicted grades per subject, and weak-spot tracking.

### For teachers
Classes and rosters, assignments with AI-assisted marking and manual override, per-class and per-student reports, AI insights, a question bank, and school administration (with school verification).

### For parents
A read-only projection of a linked child: progress, subjects, activity, assignments, and a weekly email digest. Linking is parent-initiated and takes the child's consent — the parent sends a request, the child accepts it. Parents never get a write policy on any table.

### Throughout
- Dark/light theme driven by a semantic **design-token** system (see [Design system](#design-system)).
- Installable **PWA** with app icon and manifest.
- Rich content: KaTeX math, Markdown, Tiptap rich-text editing.

## Tech Stack

| Layer | Technology |
| --- | --- |
| Framework | Next.js 16 App Router, React 19 |
| Language | TypeScript 5 |
| Styling | Tailwind CSS 4 (semantic design tokens) |
| Auth & DB | Supabase (Postgres + Auth), Row-Level Security on every table |
| AI | OpenAI-compatible API (OpenAI, OpenRouter, or a local server) |
| TTS | OpenAI-compatible speech endpoint (podcasts) |
| Email | Brevo API (app templates); Resend (Edge Function notifications via `pg_cron`/`pg_net`) |
| Rich text | Tiptap 3 |
| Math | KaTeX |
| Icons | Lucide React |
| Tests | Vitest |

## Quick Start

### 1. Install dependencies

```bash
bun install
```

### 2. Set up Supabase

The migrations in [`supabase/migrations/`](supabase/migrations) are the **single source of truth** for the schema. Apply them in order to a fresh Supabase project (via the Supabase CLI or the SQL editor).

> `queries.sql` in the repo root is a **legacy reference for the original student-learning tables only**. It predates the teacher/class/school, parent-link, podcast, curriculum, and planner tables and is **not runnable** against a live database. Use the migrations instead.

In **Authentication → Sign In / Providers → Email**, disable *Confirm Email* so signups create a session immediately.

### 3. Configure environment variables

```bash
cp .env.local.example .env.local
```

Then fill in the values (see [Environment variables](#environment-variables)).

### 4. Run

```bash
bun run dev      # http://localhost:3000
```

## Scripts

```bash
bun run dev        # Dev server
bun run build      # Production build
bun run start      # Start production server
bun run lint       # ESLint 9 (Next.js config)
bun run typecheck  # tsc --noEmit
bun run test       # Vitest
```

## Environment variables

| Variable | Required | Description |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes | Supabase anon/public key |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Server-only. Bypasses RLS; required for server-authoritative assignment marking |
| `AI_API_KEY` | Yes* | AI API key (required for hosted endpoints like OpenAI/OpenRouter) |
| `AI_BASE_URL` | No | AI API base URL. Defaults to `https://api.openai.com/v1` |
| `AI_MODEL` | No | Model name. Defaults to `gpt-4.1-mini` |
| `OPENROUTER_SITE_URL` | No | Optional OpenRouter attribution URL |
| `OPENROUTER_APP_NAME` | No | Optional OpenRouter app name |
| `TTS_BASE_URL` | No | Text-to-speech base URL (podcast generation) |
| `TTS_MODEL` | No | TTS model name |
| `TTS_VOICE` / `TTS_VOICE_SECONDARY` | No | Voices for the two podcast speakers |
| `TTS_API_KEY` | No | TTS API key |
| `AI_RATE_LIMIT_FAIL_CLOSED` | No | If `true`, reject AI calls when the rate-limit RPC errors (default fails open) |
| `BREVO_API_KEY` | No | Brevo API key. Unset disables transactional email (sends are skipped, never fatal) |
| `BREVO_SMTP_FROM` | No | Sender, as `Name <address@domain>` |
| `APP_NAME` | No | Branding in every email template. Defaults to `AIDemic` |
| `APP_URL` | No† | Absolute base URL for email CTAs. Server-only, so no `NEXT_PUBLIC_` prefix |
| `SUPPORT_EMAIL` | No† | Contact address in the shared email layout |
| `BULK_EMAIL_SECRET` | No | Shared secret for `/api/email/bulk`. Unset leaves the endpoint open (dev only) |

† Required *for email specifically* — with either unset, email is treated as unconfigured and skipped. The rest of the app is unaffected.

Legacy `OPENAI_BASE_URL`, `OPENAI_MODEL`, and `OPENAI_API_KEY` names are still accepted as fallbacks.

### AI provider examples

**OpenAI**
```bash
AI_BASE_URL=https://api.openai.com/v1
AI_MODEL=gpt-4.1-mini
AI_API_KEY=your-openai-key
```

**OpenRouter**
```bash
AI_BASE_URL=https://openrouter.ai/api/v1
AI_MODEL=openai/gpt-4o-mini
AI_API_KEY=your-openrouter-key
```

**Local OpenAI-compatible server** (vLLM, TGI, LocalAI, …)
```bash
AI_BASE_URL=http://localhost:8000/v1
AI_MODEL=your-model-name
AI_API_KEY=
```

## Architecture

Next.js 16 App Router with TypeScript, Supabase, and an OpenAI-compatible API abstraction.

### Route protection
Middleware in [`src/proxy.ts`](src/proxy.ts) guards `/dashboard/*` using `supabase.auth.getUser()`. Unauthenticated requests go to `/login`; role gating for `/dashboard/teacher/*`, `/dashboard/admin/*`, and `/dashboard/parent/*` is enforced here as defense-in-depth. **RLS is the real backstop.**

### Roles
`user_profiles.role` is `student | teacher | parent`. Parents are a read-only projection of a linked student, and the link is **parent-initiated**: a parent enters the student's email address or username (`request_parent_link()`), the student accepts or declines it on the Family page (`accept_parent_link_request()` / `decline_parent_link_request()`), and nothing is shared until they accept. Teachers can also create a link for a student on their roster with an invite code the parent redeems (`redeem_parent_invite_code()`); only a teacher can remove that variant. The `parent_links` table and the `is_parent_of_student()` SECURITY DEFINER helper drive every cross-role SELECT policy.

### Supabase clients
- [`src/lib/supabase-client.ts`](src/lib/supabase-client.ts) — browser client (Client Components/hooks)
- [`src/lib/supabase-server.ts`](src/lib/supabase-server.ts) — server client with cookies (Server Components, Route Handlers, middleware)

### AI integration
[`src/lib/ai/config.ts`](src/lib/ai/config.ts) centralizes the OpenAI-compatible client. Every route under `src/app/api/ai/*` follows the same shape: **auth (`getUser` → 401) → per-user daily rate limit (`checkAiRateLimit` → 429) → model call → JSON extraction → structured response.** Per-route daily caps live in [`src/lib/ai/rateLimit.ts`](src/lib/ai/rateLimit.ts).

### Spaced repetition
[`src/lib/spacedRepetition.ts`](src/lib/spacedRepetition.ts) implements SM-2 with Anki-style learning steps, lapse/relearning, and overdue credit. Related pure logic: [`revisionPlanner.ts`](src/lib/revisionPlanner.ts) (timetable weighting), [`cloze.ts`](src/lib/cloze.ts) (cloze parsing/masking), [`leeches.ts`](src/lib/leeches.ts) (leech detection) — all unit-tested with Vitest.

### Shared types
All shared TypeScript interfaces live in [`src/types.ts`](src/types.ts).

## Design system

Every colour, radius, shadow, and type step resolves through semantic design tokens defined in [`src/app/globals.css`](src/app/globals.css) and exposed to Tailwind via `@theme inline`. Components use utilities like `bg-surface`, `border-subtle`, `text-content-muted`, `shadow-card`, `rounded-card`, and `text-title` rather than raw palette values — so the whole look retunes from one place and dark mode needs no per-component `dark:` variant. Shared primitives live in [`src/components/ui/`](src/components/ui).

## Database

Apply the migrations in [`supabase/migrations/`](supabase/migrations) in order. Row-Level Security is enabled on every table. Key groups:

- **Learning:** `flashcard_decks`, `flashcards`, `flashcard_tags`, `study_sessions`, `study_goals`, `generated_podcasts`
- **Practice:** `exam_practice_attempts` (with `attempt_mode` of `practice | mock | blurt`)
- **Curriculum:** `curricula`, `qualifications`, `exam_boards`, `subjects`, `specifications`, `topics`, `subtopics`, `learning_objectives`, `student_subjects`
- **Planner:** `academic_terms`, `study_plan_items`, `topic_confidence`
- **Teacher/school:** `teachers`, `classes`, `class_students`, `assignments`, `assignment_attempts`, `schools`, `platform_admins`
- **Parent:** `parent_links`
- **Infra:** `ai_request_counters` (rate limiting), `app_config`

### Transactional email

Two independent senders, on purpose:

- **The Next app → Brevo API** ([`src/lib/email.ts`](src/lib/email.ts), [`src/lib/email-mailer.ts`](src/lib/email-mailer.ts)). Templates live in [`src/emails/templates/`](src/emails/templates) — one `.html` body each plus `manifest.json`, all sharing `_layout.html`. `{{name}}` escapes, `{{{name}}}` does not (never put user input in a raw slot). A missing variable throws rather than sending a half-rendered email. Server-only: if the config is unset, sends are skipped with a warning, so a missing email can never break signup.
- **Edge Functions → Resend**, for the two `pg_net`-triggered parent-link notifications below.

### Weekly parent digest (Edge Function + pg_cron → the app's bulk endpoint)
[`supabase/functions/weekly-parent-digest`](supabase/functions/weekly-parent-digest) emails each parent a weekly summary of their linked children. Triggered by `trigger_weekly_parent_digest()` via a `pg_cron` job (Mondays 08:00 UTC) using `pg_net`. It does not send mail itself — it posts batches of 100 to the app's [`/api/email/bulk`](src/app/api/email/bulk/route.ts), so **the app must be reachable over public HTTPS from Supabase's edge network** (no VPC peering; `localhost` cannot work). One-time setup:

```bash
supabase functions deploy weekly-parent-digest --no-verify-jwt
supabase secrets set APP_URL=https://yourdomain.com BULK_EMAIL_SECRET=some-random-string \
  APP_NAME=AIDemic SUPPORT_EMAIL=support@yourdomain.com CRON_SECRET=some-random-string
```

Then in the SQL editor, set `weekly_digest_function_url` and `weekly_digest_cron_secret` in `app_config`. See [CLAUDE.md](CLAUDE.md) for the exact SQL. `pg_net` discards the response body, so `supabase functions logs weekly-parent-digest` is the only place failures surface.

### Parent-link notifications (Resend + Edge Functions + pg_net triggers)
Two functions, both fired by triggers on `parent_links` — no cron involved:

- [`parent-link-requested`](supabase/functions/parent-link-requested) — emails the **student** on `AFTER INSERT` of a pending parent-initiated request, so they know to accept or decline.
- [`parent-link-notification`](supabase/functions/parent-link-notification) — emails on `AFTER UPDATE` when a link becomes `active`. Recipient follows `link_source`: the **parent** whose request was accepted, or the **student** whose teacher-issued code was redeemed.

These are the only Resend consumers. Setup, secrets, and `app_config` keys are documented in [CLAUDE.md](CLAUDE.md).

## Project structure

```text
src/
  app/
    api/ai/            # generate-notes, generate-flashcards, generate-questions,
                       # mark-answers, study-chat, generate-podcast,
                       # generate-class-summary, exam-coach, blurt-review
    dashboard/         # student, teacher/, parent/, admin/ surfaces
      planner/  blurt/  daily-review/  study-sessions/  ai-questions/  …
    login/  onboarding/  manifest.ts  icon.svg
  components/
    ui/                # button, card, badge, field, feedback, charts (design system)
    diagram/  plot/    # interactive answer inputs
  hooks/
  lib/
    ai/                # config, rateLimit, json, validation, subject/curriculum config
    spacedRepetition.ts  revisionPlanner.ts  cloze.ts  leeches.ts  studyGoals.ts
  proxy.ts             # route-protection middleware
  types.ts
supabase/
  migrations/          # single source of truth for the schema
  functions/           # weekly digest + parent-link notification edge functions
```

## Testing

```bash
bun run test
```

Pure logic is unit-tested with Vitest: SM-2 scheduling, grade averaging, validation, cloze parsing, the revision planner, and leech detection.
