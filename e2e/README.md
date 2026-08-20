# E2E smoke suite

Parallel Playwright smoke tests. The job is one question: **did this deploy break
anything obvious?** It is not a load test, not an accuracy test, and not a
replacement for the Vitest suite.

```bash
bun run test:e2e            # run the suite
bun run test:e2e:ui         # interactive runner
bun run test:e2e:report     # open the last HTML report
```

Pass Playwright arguments after `--`:

```bash
bun run test:e2e -- auth.spec.ts -g "unauthenticated"
```

## Run it from Windows, not WSL

`node_modules/` and the Playwright browsers are installed for **Windows**. Two
things break if you invoke the suite from a WSL shell against `/mnt/c`:

- `bunx playwright test` cannot use the Windows `node_modules/.bin/playwright`
  shim, so it silently downloads a *second* copy of the package and runs that
  CLI against specs importing the local one. Same version, two module instances,
  and Playwright rejects it with `did not expect test.describe() to be called
  here` — whose "two different versions" hint is misleading, since the versions
  match.
- The installed browsers are Windows binaries under
  `%LOCALAPPDATA%\ms-playwright`, which Linux cannot execute.

Use `bun run test:e2e` rather than `bunx playwright test` either way: the script
runs the locally linked binary instead of letting `bunx` resolve a fresh one.
Running from WSL needs its own `bun install`, `playwright install chromium`, and
`playwright install-deps` inside the Linux filesystem — not a shared `/mnt/c`
tree.

## Always set E2E_BASE_URL

With it unset, Playwright starts a local `next start` and tests `localhost:3000`
— which reads `.env.local`, and that currently points at **production Supabase**.
The run will look like it passed against whatever you had in mind while actually
having exercised something else.

```bash
# Git Bash
E2E_BASE_URL=https://aidemic.co.uk bun run test:e2e -- -g "unauthenticated"

# PowerShell
$env:E2E_BASE_URL="https://aidemic.co.uk"; bun run test:e2e -- -g "unauthenticated"
```

## Never point this at production

The suite **creates real accounts and writes real rows**. Every run leaves behind
one `user_profiles` row per worker plus whatever those accounts wrote. Point
`E2E_BASE_URL` at a deployment wired to a disposable Supabase branch.

```bash
E2E_BASE_URL=https://aidemic-git-my-branch.vercel.app bun run test:e2e
```

With `E2E_BASE_URL` unset, Playwright starts `bun run start` on port 3000 and
tests the local production build — still against whatever `.env.local` points
at, so check that first.

## Target setup

**1. Create a Supabase branch.** Branches replay `supabase/migrations/` in
order, and the curriculum seeds (`20260703100000_seed_uk_curriculum.sql` and
friends) are migrations, so a fresh branch comes up with the full
qualification → board → subject → specification tree already populated. That
matters: `subjects.spec.ts` calls `resolveSpecificationId()`, which fails
against an unseeded database.

**2. Point a preview deployment at that branch** — `NEXT_PUBLIC_SUPABASE_URL`,
`NEXT_PUBLIC_SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` from the
branch, not the parent project.

**3. Disable Confirm Email** on the branch, under *Authentication → Sign In /
Providers → Email*. The sign-up form has no way to complete without it: Supabase
returns no session, and the app raises `Account created, but Supabase email
confirmation is still enabled`. The auth fixture surfaces that message directly
rather than timing out, so this failure is self-diagnosing.

**4. Leave `BREVO_API_KEY` unset** on that deployment. Sign-up fires
`/api/email/welcome`, and test accounts use `@example.com` addresses — real
sends would bounce and cost you sender reputation. Unconfigured, `src/lib/email.ts`
skips with a console warning and sign-up still works, which is exactly what you
want here.

**5. Leave `AI_API_KEY` unset too**, unless you are extending the suite to cover
AI (see below). Nothing in the default suite calls an AI route.

## Worker count is a rate-limit budget

`/api/auth` throttles at **20 requests per minute per IP**
([src/lib/ipRateLimit.ts](../src/lib/ipRateLimit.ts)), every sign-up and sign-in
hits it, and all workers share the runner's egress IP. That limiter is
in-memory and per-process, so on serverless it is per-instance — meaning the
effective ceiling is unpredictable and you should stay well under it rather than
tune against it.

The fixture design is what keeps this safe: `workerStorageState` signs up **once
per worker** and every test in that worker reuses the saved storage state. A
conventional sign-in-per-test design would multiply that by the test count and
429 itself. If you add tests, keep them on the shared fixture; if you raise
`workers` in [playwright.config.ts](../playwright.config.ts), you are spending
this budget.

## What is covered

| Spec | Covers |
|---|---|
| `auth.spec.ts` | Landing page, sign-up → onboarding → dashboard, sign out → sign in, `?next=` preservation, the `mode=reset` proxy exemption, bad-credential handling |
| `navigation.spec.ts` | All 15 student routes render (direct load **and** client-side soft navigation), plus a check that the sidebar has not grown a route this spec does not know about |
| `guards.spec.ts` | Teacher, parent, and platform-admin routes redirect a student |
| `subjects.spec.ts` | Add a subject, verify it persists across a reload, verify the duplicate check |

`navigation.spec.ts` is the highest-value file: every one of those routes reads
from Supabase under RLS, and a policy that rejects a read surfaces as a crashed
or empty page rather than a bad HTTP status. `expectPageHealthy()` asserts a
visible `<h1>` and the absence of error-boundary copy for exactly that reason —
Next serves HTTP 200 for a client-side crash, so status alone proves nothing.

## What is deliberately not covered

**The AI routes.** All nine of them (`/api/ai/*`) are excluded on purpose:

- They are slow (10–30s) and non-deterministic — wrong shape for a smoke test.
- They cost real money per call, and are quota-capped per user anyway
  (`generateQuestions` 30/day, `generatePodcast` 5/day — see
  [src/lib/ai/rateLimit.ts](../src/lib/ai/rateLimit.ts)), so a parallel suite
  would exhaust the cap and then only exercise the 429 branch.
- Model accuracy already has a home in `evals/` (`RUN_EVALS=1`).

Stubbing them at the Playwright network layer does **not** work, and it is worth
knowing why before someone tries: `/api/ai/generate-flashcards` creates the deck
row itself and the UI then navigates to `/dashboard/flashcards/<deckId>`. A
faked response returns a deck id that does not exist, so the test would "pass"
into a broken page.

The correct extension is to stub the **provider**, not the route. `AI_BASE_URL`
is fully env-configurable ([src/lib/ai/config.ts](../src/lib/ai/config.ts)), so
pointing it at a small OpenAI-compatible mock lets the route run for real — auth,
quota RPC, validation, and DB writes included — with a canned model response and
zero spend. That mock has to be reachable from the deployment under test, which
is straightforward for a local `bun run start` target and needs public hosting
for a deployed preview.

## Cleanup

Test accounts accumulate on the branch. Since the branch is disposable, deleting
and recreating it is the simplest reset. To clear them in place, delete the auth
users whose email matches `e2e\_%@example.com` — the `user_profiles` row and all
owned data cascade from there.

Local auth state is cached in `e2e/.auth/` (gitignored) and rewritten every run.
