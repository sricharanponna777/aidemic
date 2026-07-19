# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
bun run dev      # Start dev server at http://localhost:3000
bun run build    # Production build
bun run start    # Start production server
bun run lint     # ESLint 9 with Next.js config
```

The package manager is **Bun** (not npm/yarn). Always use `bun` for installing packages.

There is no test suite configured.

## Architecture

AIDemic is an AI-powered study platform built on **Next.js 16 App Router** with TypeScript, Supabase (Postgres + Auth), and an OpenAI-compatible API abstraction.

### Route Protection

Middleware in [src/proxy.ts](src/proxy.ts) guards `/dashboard/*` routes using `supabase.auth.getUser()`. Unauthenticated requests redirect to `/login`; authenticated users visiting `/login` redirect to `/dashboard`. Role gating for `/dashboard/teacher/*`, `/dashboard/admin/*`, and `/dashboard/parent/*` is also enforced here (defense-in-depth only — RLS is the real backstop).

### Roles

`user_profiles.role` is `student | teacher | parent`. Parents are a read-only projection of a linked student: a student generates an invite code on [src/app/dashboard/family/page.tsx](src/app/dashboard/family/page.tsx), a parent redeems it via the `redeem_parent_invite_code()` RPC (onboarding or [src/app/dashboard/parent/page.tsx](src/app/dashboard/parent/page.tsx)). The `parent_links` table and the `is_parent_of_student()` SECURITY DEFINER helper (migration `20260720100000`) drive every cross-role SELECT policy — parents never get a write policy on any table.

### Supabase Clients

Two separate clients exist for different rendering contexts:
- [src/lib/supabase-client.ts](src/lib/supabase-client.ts) — browser client (use in Client Components and hooks)
- [src/lib/supabase-server.ts](src/lib/supabase-server.ts) — server client with cookie handling (use in Server Components, Route Handlers, and middleware)

All tables have Row-Level Security policies that enforce per-user data isolation automatically.

### AI Integration

[src/lib/ai/config.ts](src/lib/ai/config.ts) centralizes the OpenAI-compatible client. It supports OpenAI, OpenRouter, and local LLMs via environment variables — no provider is hardcoded. All API routes under `src/app/api/ai/` follow the same pattern: validate input → call the AI config → extract JSON from the response via [src/lib/ai/json.ts](src/lib/ai/json.ts) → return structured data.

### Spaced Repetition

[src/lib/spacedRepetition.ts](src/lib/spacedRepetition.ts) implements the SM-2 algorithm. `updateSpacedRepetition()` computes the next review interval and ease factor. The dashboard aggregates retention rates, streaks, and goal progress using helpers from this file.

### Shared Types

All TypeScript interfaces are in [src/types.ts](src/types.ts). Add new shared types here rather than co-locating them with components.

### Rich Content

- **Math:** KaTeX via [src/components/MathContent.tsx](src/components/MathContent.tsx); LLM output normalization in [src/lib/ai/math.ts](src/lib/ai/math.ts)
- **Markdown:** [src/components/MarkdownContent.tsx](src/components/MarkdownContent.tsx)
- **Rich text editing:** Tiptap 3 (primary) in [src/components/RichTextEditor.tsx](src/components/RichTextEditor.tsx)

### Styling

Tailwind CSS 4 with PostCSS. Dark/light theme is stored in `localStorage` under the key `aidemic-theme` and managed by [src/hooks/useTheme.ts](src/hooks/useTheme.ts). Icons come from Lucide React.

## Environment Variables

Copy `.env.local.example` to `.env.local`. Required variables:

```
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY  # server-only; bypasses RLS; needed for assignment marking
OPENAI_API_KEY          # or equivalent for OpenRouter/local LLM
```

See `.env.local.example` for the full list including OpenRouter and local LLM options.

## Database

The core student schema lives in [queries.sql](queries.sql). **It contains destructive `DROP TABLE` statements** — always back up data before re-running it. It does not include the teacher/class/school/podcast tables — for those, the migrations in `supabase/migrations/` are the source of truth. Apply schema changes through the Supabase SQL editor or Supabase MCP tools.

### Weekly parent digest (Resend + Edge Function + pg_cron)

[supabase/functions/weekly-parent-digest/index.ts](supabase/functions/weekly-parent-digest/index.ts) emails each parent a weekly summary of their linked children (streak, assignments completed, weak topics, latest predicted grades). It is triggered by `trigger_weekly_parent_digest()`, a `pg_cron` job scheduled in migration `20260720100000` for Mondays at 08:00 UTC via `pg_net`. One-time setup after applying that migration:

```bash
supabase functions deploy weekly-parent-digest --no-verify-jwt
supabase secrets set RESEND_API_KEY=re_xxx RESEND_FROM_EMAIL="AIDemic <digest@yourdomain.com>" CRON_SECRET=some-random-string
```

Then, in the Supabase SQL editor:

```sql
insert into app_config (key, value) values
  ('weekly_digest_function_url', 'https://<project-ref>.functions.supabase.co/weekly-parent-digest'),
  ('weekly_digest_cron_secret', 'some-random-string') -- must match CRON_SECRET above
on conflict (key) do update set value = excluded.value;
```

`RESEND_FROM_EMAIL` must be a domain verified in Resend; until then it falls back to Resend's shared `onboarding@resend.dev` sender.

## Guidelines for changes

Behavioral guidelines to reduce common LLM coding mistakes. Merge with project-specific instructions as needed.

**Tradeoff:** These guidelines bias toward caution over speed. For trivial tasks, use judgment.

## 1. Think Before Coding

**Don't assume. Don't hide confusion. Surface tradeoffs.**

Before implementing:
- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them - don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

## 2. Simplicity First

**Minimum code that solves the problem. Nothing speculative.**

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

## 3. Surgical Changes

**Touch only what you must. Clean up only your own mess.**

When editing existing code:
- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it - don't delete it.

When your changes create orphans:
- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.

The test: Every changed line should trace directly to the user's request.

## 4. Goal-Driven Execution

**Define success criteria. Loop until verified.**

Transform tasks into verifiable goals:
- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"
- "Refactor X" → "Ensure tests pass before and after"

For multi-step tasks, state a brief plan:
```
1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]
```

Strong success criteria let you loop independently. Weak criteria ("make it work") require constant clarification.

---

**These guidelines are working if:** fewer unnecessary changes in diffs, fewer rewrites due to overcomplication, and clarifying questions come before implementation rather than after mistakes.