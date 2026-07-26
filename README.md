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
A read-only projection of a linked child: progress, subjects, activity, assignments, and a weekly email digest. Parents never get a write policy on any table.

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
| Email | Resend (Edge Functions + `pg_cron`/`pg_net`) |
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
`user_profiles.role` is `student | teacher | parent`. Parents are a read-only projection of a linked student: a student generates an invite code on the Family page, a parent redeems it via the `redeem_parent_invite_code()` RPC. The `parent_links` table and the `is_parent_of_student()` SECURITY DEFINER helper drive every cross-role SELECT policy.

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

### Weekly parent digest (Resend + Edge Function + pg_cron)
[`supabase/functions/weekly-parent-digest`](supabase/functions/weekly-parent-digest) emails each parent a weekly summary of their linked children. Triggered by `trigger_weekly_parent_digest()` via a `pg_cron` job (Mondays 08:00 UTC) using `pg_net`. One-time setup:

```bash
supabase functions deploy weekly-parent-digest --no-verify-jwt
supabase secrets set RESEND_API_KEY=re_xxx RESEND_FROM_EMAIL="AIDemic <digest@yourdomain.com>" CRON_SECRET=some-random-string
```

Then in the SQL editor, set `weekly_digest_function_url` and `weekly_digest_cron_secret` in `app_config`. See [CLAUDE.md](CLAUDE.md) for the exact SQL.

### Parent-link notification (Resend + Edge Function + pg_net trigger)
[`supabase/functions/parent-link-notification`](supabase/functions/parent-link-notification) emails a student when a parent redeems their invite code, via an `AFTER UPDATE` trigger on `parent_links`. Setup and `app_config` keys are documented in [CLAUDE.md](CLAUDE.md).

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
  functions/           # Resend edge functions
```

## Testing

```bash
bun run test
```

Pure logic is unit-tested with Vitest: SM-2 scheduling, grade averaging, validation, cloze parsing, the revision planner, and leech detection.
