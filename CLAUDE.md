# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
bun run dev        # Start dev server at http://localhost:3000
bun run build      # Production build
bun run start      # Start production server
bun run lint       # ESLint 9 with Next.js config
bun run typecheck  # tsc --noEmit
bun run test       # Vitest, tests colocated as src/**/*.test.ts
```

The package manager is **Bun** (not npm/yarn). Always use `bun` for installing packages.

Tests run on **Vitest** ([vitest.config.ts](vitest.config.ts)), colocated beside the module under test. `evals/` holds model-accuracy gates that only run with `RUN_EVALS=1`.

## Architecture

AIDemic is an AI-powered study platform built on **Next.js 16 App Router** with TypeScript, Supabase (Postgres + Auth), and an OpenAI-compatible API abstraction.

### Route Protection

Middleware in [src/proxy.ts](src/proxy.ts) guards `/dashboard/*` routes using `supabase.auth.getUser()`. Unauthenticated requests redirect to `/login`; authenticated users visiting `/login` redirect to `/dashboard`. Role gating for `/dashboard/teacher/*`, `/dashboard/admin/*`, and `/dashboard/parent/*` is also enforced here (defense-in-depth only — RLS is the real backstop).

The matcher is deliberately **wider than the routes it authenticates**, because the same middleware sets the Content-Security-Policy (see below). `requiresAuthCheck()` gates the Supabase client and its `getClaims()` round trip to the original prefixes, so widening the matcher did not put a database call on every request.

### Content-Security-Policy

Built per request in [src/lib/csp.ts](src/lib/csp.ts) and set by the middleware, not by `next.config.ts` — a nonce cannot be a static header. There are **two policies**, and the split is load-bearing:

- **`/dashboard/*`** gets `'nonce-…' 'strict-dynamic'` and no `'unsafe-inline'`. Next can only stamp a nonce onto its inline bootstrap scripts on pages it renders **per request**, which is why [src/app/dashboard/layout.tsx](src/app/dashboard/layout.tsx) is a thin server wrapper carrying `export const dynamic = 'force-dynamic'` around the client shell in `DashboardShell.tsx`. Remove that flag and every dashboard page is prerendered, its script tags lose the nonce, and the browser blanks the app.
- **Everything else** keeps `'unsafe-inline'`. Public pages are statically prerendered, so their script tags cannot carry a nonce; sending one would block every script. They hold no session and no user data.

Neither policy allows `'unsafe-eval'` in production — nothing in the client bundle calls `eval()` or `new Function()`. `style-src` keeps `'unsafe-inline'` in both: React writes element style props as inline style attributes and KaTeX injects its own, and `style-src-attr` has no nonce mechanism at all.

### Roles

`user_profiles.role` is `student | teacher | parent`. Parents are a read-only projection of a linked student. Linking is **parent-initiated** (migration `20260801000000`): a parent enters the student's email or username via `request_parent_link()` — from onboarding or [src/app/dashboard/parent/layout.tsx](src/app/dashboard/parent/layout.tsx) — which inserts a `pending` row with `link_source='parent'`; the student then accepts or declines it on [src/app/dashboard/family/page.tsx](src/app/dashboard/family/page.tsx) via `accept_parent_link_request()` / `decline_parent_link_request()`.

A second, teacher-initiated variant remains: a teacher generates an invite code (`link_source='teacher'`) that the parent redeems with `redeem_parent_invite_code()`. The difference is who can undo it — a student can revoke `'student'` and `'parent'` links directly (migration `20260801020000`), but a `'teacher'` link only supports `request_parent_link_revocation()`, which needs teacher approval.

The `parent_links` table and the `is_parent_of_student()` SECURITY DEFINER helper (migration `20260720100000`) drive every cross-role SELECT policy — parents never get a write policy on any table.

### Supabase Clients

Two separate clients exist for different rendering contexts:
- [src/lib/supabase-client.ts](src/lib/supabase-client.ts) — browser client (use in Client Components and hooks)
- [src/lib/supabase-server.ts](src/lib/supabase-server.ts) — server client with cookie handling (use in Server Components, Route Handlers, and middleware)

All tables have Row-Level Security policies that enforce per-user data isolation automatically.

### Curriculum and qualifications

The curriculum tree is `curricula(country) → qualifications → exam_boards → subjects → specifications(tier) → topics → subtopics → learning_objectives`. Two curricula are seeded: **UK** (GCSE, A-Level × AQA/Edexcel/OCR) and **India**, which carries both the school qualifications (CBSE Class 10/12, ICSE, ISC, IB Diploma) and sixteen competitive entrance exams:

| Group | Qualifications (board) |
|---|---|
| National engineering / medical | JEE Main (NTA), JEE Advanced (IIT), NEET UG (NTA) |
| State CETs | TS EAMCET (TSCHE), AP EAPCET (APSCHE), MHT CET (MAHACET), KEAM (CEE), WBJEE (WBJEEB), COMEDK UGET (COMEDK) |
| National / private university | CUET UG (NTA), BITSAT (BITS), VITEEE (VIT), SRMJEEE (SRM) |
| Non-engineering | CLAT (NLU), NDA (UPSC), IPMAT (IIM) |

Entrance exams sit alongside the school qualifications rather than replacing them, since a Class 12 student typically studies for both. `nta` is shared by JEE Main, NEET UG and CUET UG — safe because `resolveSubjectId` scopes the board lookup by `qualifications.name`.

Three things follow from the non-engineering exams in particular. Their papers are not school subjects, so [subjects.ts](src/lib/ai/subjects.ts) carries slugs like `legal reasoning`, `verbal ability` and `general knowledge` purely for them. `COMEDK UGET` is the one `dbName` that does not `collapse()` onto its own slug (`comedk`), so its alias in [validation.ts](src/lib/ai/validation.ts) is load-bearing rather than a convenience — assignment marking feeds `qualifications.name` straight through `normalizeExamType`. And CUET is the only entrance exam whose syllabus is **Class 12 only**, which is why its topic lists are authored separately instead of reusing the shared `NCERT_*_TOPICS` constants.

[src/lib/ai/qualifications.ts](src/lib/ai/qualifications.ts) is the registry every other module reads. Each entry carries an `id` (the slug stored in `exam_practice_attempts.exam_type`), a `dbName` (the exact `qualifications.name`), its country, boards, grade scale, and tier scheme. Three things follow from it:

- **`id` ↔ `dbName` is a load-bearing round-trip.** `mapStudentSubjectRow` turns a `qualifications.name` into a slug; `getExamTypeLabel` turns it back into the name, which `resolveSpecificationId` uses as a **database lookup key**. If they ever disagree, every specification silently fails to resolve. `qualifications.test.ts` pins this.
- **`ExamType` and `ExamBoard` are derived from the registry**, not hand-written unions. Adding a qualification means adding a registry entry, not editing types across the codebase.
- **`tier` generalises the Foundation/Higher split**: CBSE Class 10 Mathematics uses Standard/Basic, IB uses HL/SL. `requiresTierSelection` and `getSpecTier` read the scheme rather than testing for `'gcse'`. No entrance exam is tiered — the EAMCET Engineering / Agriculture & Medical streams differ by which subjects a student takes (Mathematics vs Biology), not by parallel routes through one subject.

Grade boundaries live in [src/lib/ai/gradeScales.ts](src/lib/ai/gradeScales.ts) — one table per scale (GCSE 9-1 with tier variants, A-Level A*-E, CBSE A1-E, ICSE/ISC 1-9, IB 1-7), plus the `edexcel -2 / ocr -1` board adjustment that applies to UK boards only. `averagePredictedGrade` deliberately always uses the **untiered** ladder; switching it to the tier ladder would move existing predicted grades.

The entrance exams report a percentile or an all-India rank rather than a grade, so their "grade" is an **outcome band**. Eleven scales cover the sixteen exams:

- **Percentile ladders** — `jee-main`, `state-cet` (the four state CETs share it), `cuet`. `state-cet` is deliberately percentile rather than rank: those pools run from ~80k (COMEDK) to ~500k (MHT CET), so one rank ladder would mean four different things.
- **Rank ladders** — `jee-advanced`, `eamcet`, `private-univ-entrance` (VITEEE + SRMJEEE), `clat`, `ipmat`.
- **Score ladders**, where the band is literally that percentage of the marks available — `neet-ug` (/720), `bitsat` (/390), `nda` (/900).

The boundaries map percentage scored on a practice set onto the band that percentage of the real paper has historically produced, so they are indicative only: real cut-offs move with the cohort every year, and most of these papers carry negative marking that a practice set does not. Each `boundaryNote` says so, and `gradeScales.test.ts` pins that wording.

Because those bands are neither 1-9 numerics nor A*-E letters, [src/lib/gradeTone.ts](src/lib/gradeTone.ts) colours **every non-UK scale** from the grade's position on its own ladder (bottom third red, middle amber, top green). GCSE and A-Level keep their hand-written branches: GCSE's boundary falls after index 3 of 10 and A-Level's after index 2 of 7, and no single fraction reproduces both. `gradeTone.test.ts` pins the UK colours against exactly that regression.

India's curriculum data is authored in [scripts/data/india-curriculum.ts](scripts/data/india-curriculum.ts) and is the single source for both `specifications.json` and the SQL seeds, so the two cannot drift:

```bash
bun run scripts/generate-india-curriculum.ts            # regenerate JSON + SQL
bun run scripts/generate-india-curriculum.ts --apply    # also upsert into the DB
bun --env-file=.env.local run scripts/seed-curriculum-subtopics.ts --country india
```

Row ids are deterministic UUIDv5 values keyed on each row's path in the tree, so regenerating is idempotent. **Do not change the `NAMESPACE` constant** — every seeded id depends on it. The subtopic generator is resumable (it skips topics that already have subtopics) and rewrites its migration from the full set each run.

Note that `getMajorTopicsForQualification` in [src/lib/ai/majorTopics.ts](src/lib/ai/majorTopics.ts) holds **UK-only** static topic lists and returns `[]` for other qualifications; `getQualificationTopicError` treats an empty list as "no opinion" rather than "nothing allowed". Non-UK topics are validated against the seeded `topics` table and the AI relevance gate instead.

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

## Assignment answer keys

[src/lib/assignments/studentSafeSpecs.ts](src/lib/assignments/studentSafeSpecs.ts) projects `PlotSpec` and `DiagramSpec` down to what a student may see, and [src/app/api/assignments/[assignmentId]/route.ts](src/app/api/assignments/[assignmentId]/route.ts) applies it to every question of an **in-progress** attempt. A completed attempt still gets the full spec, because review has to show the right answer.

Both spec types interleave the question with its answer key, so stripping `correctOption`/`markScheme`/`modelAnswer` at the question level was never enough — `correctLabel`, `correctValues`, `slot.correctOption` and the endpoints of connections the student must draw were all readable in the network tab. Four consequences worth knowing:

- **The word bank is shuffled with a seed of `${assignmentId}:${index}`.** `labelBank` is built as "every blank node's correct label, in node order, then distractors", so its ordering alone gave away the mapping. The seed keeps the order stable across refreshes.
- **Templated diagrams are resolved server-side** and `diagramTemplate` is withheld while in progress — the client re-resolves from template code bundled in the browser, which would regenerate the answers it had just been denied.
- **Plot inputs may not derive axes or defaults from `correct*` fields.** They read the stored `yAxisMax`/`yAxisStep` instead, which `normalizeBar`/`normalizeLine` compute from exactly those values, so the axis is identical without reading the answer. `PlotScatterData` gained `xAxisStep`/`yAxisStep` for this reason: its y-axis step is chosen so every correct point lands on a snappable minor gridline, and re-deriving it from blanked coordinates would put the answer out of reach.
- **`frequencyPolygon` has nothing to strip.** Its correct points are `((classStart+classEnd)/2, frequency)` — all given data. Histogram density is likewise recomputed from `frequency / (classEnd - classStart)` in the component.

## Rate limiting

Two separate limiters, both able to run without Redis but meaningfully weaker that way:

- [src/lib/ipRateLimit.ts](src/lib/ipRateLimit.ts) — unauthenticated endpoints (`/api/auth`, `/api/auth/reset-password`). Backed by Upstash when configured so the window is shared across serverless instances; falls back to a per-process map on an outage rather than locking everyone out. **`getClientIp` counts back from the right of `X-Forwarded-For`** by `RATE_LIMIT_TRUSTED_PROXY_HOPS` (default 1): that header is a list each proxy appends to, so reading the leftmost entry let anyone reset their own limit by forging one. `checkIpRateLimit` is **async** — await it.
- [src/lib/ai/rateLimit.ts](src/lib/ai/rateLimit.ts) — per-user daily caps per AI route, via the `increment_ai_usage()` RPC. When the RPC itself errors it now **fails closed in production** and open in dev; `AI_RATE_LIMIT_FAIL_CLOSED` overrides both. Failing open there turns a database hiccup into an uncapped provider bill.

## Environment Variables

Copy `.env.local.example` to `.env.local`. Required variables:

```
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY  # server-only; bypasses RLS; needed for assignment marking
AI_API_KEY                 # OpenAI/OpenRouter/local LLM. Legacy OPENAI_API_KEY still works
```

See `.env.local.example` for the full list including OpenRouter and local LLM options.

Optional, for transactional email (see below): `BREVO_API_KEY`, `BREVO_SMTP_FROM`, `APP_NAME`, `APP_URL`, `SUPPORT_EMAIL`. If any is unset, emails are skipped with a console warning and signup still works.

Optional, `ROLE_CACHE_SECRET`: signs the short-lived cookie [src/proxy.ts](src/proxy.ts) uses to skip the `user_profiles` role-check query on most dashboard navigations (defense-in-depth only -- RLS is the real backstop). Unset just disables the cache; every request re-queries as before.

### Transactional email (Brevo API)

Emails are sent through the Brevo HTTP API (`https://api.brevo.com/v3/smtp/email`) with `fetch` — there is no SMTP client or Nodemailer dependency. Two consumers:

- The Next app, via [src/lib/email.ts](src/lib/email.ts) and [src/lib/email-mailer.ts](src/lib/email-mailer.ts). Server-only (no `NEXT_PUBLIC_` prefix); returns ok: false and skips rather than throwing when unconfigured, so a missing email can never break a user flow.
- The weekly digest Edge Function, over **public HTTPS** to [src/app/api/email/bulk/route.ts](src/app/api/email/bulk/route.ts). That route **fails closed**: with `BULK_EMAIL_SECRET` unset it answers 503 and sends nothing, in every environment including dev. It also caps a batch at 100 messages, rejects a body over 1 MB, and validates every message before sending any of them. `sendBulkEmail` sends with a concurrency of 5 rather than strictly in sequence.

**Password reset does not use Supabase's mailer.** [src/app/api/auth/reset-password/route.ts](src/app/api/auth/reset-password/route.ts) calls `auth.admin.generateLink({ type: 'recovery' })`, which mints the token *without* sending anything, then sends the `password-reset` template through Brevo. The link it builds is `${APP_URL}/auth/confirm?token_hash=…&type=recovery&next=/login?mode=reset`, redeemed server-side by [src/app/auth/confirm/route.ts](src/app/auth/confirm/route.ts) via `verifyOtp`. Consequences worth knowing:

- **`APP_URL` is what the user clicks.** The old flow used `window.location.origin`, which put a localhost URL in real inboxes. Nothing in the journey touches the `*.supabase.co` host, so no Redirect URL allowlist entry is needed.
- **`verifyOtp` writes the recovery session to the SSR cookies**, which the browser client reads (`@supabase/ssr` sets them non-httpOnly) — that is how `/login?mode=reset` can call `updateUser({ password })`. [src/proxy.ts](src/proxy.ts) exempts `mode=reset` from the authenticated-user bounce off `/login` for the same reason.
- **`generateLink` is an admin call**, so it bypasses Supabase's own rate limit on `/auth/v1/recover`; the route re-imposes per-IP and per-address limits itself. It returns `ok` for unknown addresses so it can't be used to enumerate accounts.
- `PASSWORD_RESET_EXPIRY_MINUTES` in [src/lib/email.ts](src/lib/email.ts) is only the copy in the email — the real lifetime is the project's Auth email OTP expiry.

Templates live in [src/emails/templates/](src/emails/templates/) — one `.html` body each plus `manifest.json`, all sharing `_layout.html`. Three things to know before editing:

- **Adding a placeholder makes it a hard requirement for every caller** — a missing variable throws an error. [src/lib/email.test.ts](src/lib/email.test.ts) pins `welcome`'s required set.
- The template engine has no loops or conditionals, so repeated/variant content arrives through a **raw slot** the caller fills: `notification.body`, `welcome.highlights`, `weekly-digest.childrenHtml`. Never interpolate user input into one.
- Template variables use `{{name}}` for escaped output and `{{{name}}}` for raw HTML (never user input).

## Database

The migrations in `supabase/migrations/` are the **single source of truth** for the schema — apply changes through the Supabase SQL editor or Supabase MCP tools. [queries.sql](queries.sql) is a **legacy reference for the original student-learning tables only**; it predates the teacher/class/school, parent-link, podcast, and profile role/name columns and is **not runnable against a live database** (its destructive `DROP TABLE` block has been removed for that reason). To stand up a fresh database, apply the migrations in order.

### Weekly parent digest (Edge Function + pg_cron)

[supabase/functions/weekly-parent-digest/index.ts](supabase/functions/weekly-parent-digest/index.ts) emails each parent a weekly summary of their linked children (streak, assignments completed, weak topics, latest predicted grades). It is triggered by `trigger_weekly_parent_digest()`, a `pg_cron` job scheduled in migration `20260720100000` for Mondays at 08:00 UTC via `pg_net`. Delivery goes through the app's [src/app/api/email/bulk/route.ts](src/app/api/email/bulk/route.ts) endpoint — one `POST /api/email/bulk` per 100 parents. One-time setup after applying that migration:

```bash
supabase functions deploy weekly-parent-digest --no-verify-jwt
supabase secrets set \
  APP_URL=https://yourdomain.com \
  BULK_EMAIL_SECRET=some-random-string \
  APP_NAME=AIDemic SUPPORT_EMAIL=support@yourdomain.com \
  CRON_SECRET=some-random-string
```

Then, in the Supabase SQL editor:

```sql
insert into app_config (key, value) values
  ('weekly_digest_function_url', 'https://<project-ref>.functions.supabase.co/weekly-parent-digest'),
  ('weekly_digest_cron_secret', 'some-random-string') -- must match CRON_SECRET above
on conflict (key) do update set value = excluded.value;
```

One deployment constraint:

- **The main app must be reachable over public HTTPS from Supabase's edge network** — there is no VPC peering, so `localhost` and private addresses cannot work.

`pg_net` discards the response body, so `supabase functions logs weekly-parent-digest` (a single `[weekly-digest] {...}` JSON line per run) is the only place failures surface. The function returns 500 when nothing sent and 207 on a partial failure, which lands in `net._http_response.status_code`.

### Parent-link notification (Resend + Edge Function + pg_net trigger)

[supabase/functions/parent-link-notification/index.ts](supabase/functions/parent-link-notification/index.ts) emails the relevant party when a parent_links row becomes `'active'`. It is triggered by `notify_parent_link_activated()`, an `AFTER UPDATE` trigger on `parent_links` added in migration `20260722000000`, fired the instant any operation flips a link's status to `'active'` (via `pg_net`, no cron involved). The recipient depends on `link_source`: for `'teacher'`-initiated links, emails the student (unchanged behavior); for `'parent'`-initiated links (as of migration `20260801010000`), emails the parent instead. One-time setup after applying that migration:

```bash
supabase functions deploy parent-link-notification --no-verify-jwt
supabase secrets set PARENT_LINK_NOTIFICATION_SECRET=some-random-string \
  RESEND_API_KEY=re_xxx RESEND_FROM_EMAIL="AIDemic <digest@yourdomain.com>"
```

This is the **only remaining Resend consumer** — the weekly digest now goes through email-server, so `RESEND_API_KEY` / `RESEND_FROM_EMAIL` are set here rather than reused from that section. `RESEND_FROM_EMAIL` must be a domain verified in Resend; until then it falls back to Resend's shared `onboarding@resend.dev` sender. Then, in the Supabase SQL editor:

```sql
insert into app_config (key, value) values
  ('parent_link_notification_function_url', 'https://<project-ref>.functions.supabase.co/parent-link-notification'),
  ('parent_link_notification_secret', 'some-random-string') -- must match PARENT_LINK_NOTIFICATION_SECRET above
on conflict (key) do update set value = excluded.value;
```

### Parent-link request notification (Resend + Edge Function + pg_net trigger)

[supabase/functions/parent-link-requested/index.ts](supabase/functions/parent-link-requested/index.ts) emails a student as soon as a parent submits a link request. It is triggered by `notify_parent_link_requested()`, an `AFTER INSERT` trigger on `parent_links` added in migration `20260801010000`, fired the instant `request_parent_link()` inserts a pending row with `link_source='parent'` (via `pg_net`, no cron involved). One-time setup after applying that migration:

```bash
supabase functions deploy parent-link-requested --no-verify-jwt
supabase secrets set PARENT_LINK_REQUESTED_SECRET=some-random-string
```

Reuses `RESEND_API_KEY` / `RESEND_FROM_EMAIL` already configured for `parent-link-notification` above. Then, in the Supabase SQL editor:

```sql
insert into app_config (key, value) values
  ('parent_link_requested_function_url', 'https://<project-ref>.functions.supabase.co/parent-link-requested'),
  ('parent_link_requested_secret', 'some-random-string') -- must match PARENT_LINK_REQUESTED_SECRET above
on conflict (key) do update set value = excluded.value;
```

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