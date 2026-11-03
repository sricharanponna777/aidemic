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

### UK school register and headteacher verification

`schools` holds **every school in the UK** — 30,629 rows seeded from the four official registers by [scripts/seed-uk-schools.ts](scripts/seed-uk-schools.ts) (migrations `20260904000000`, corrected by `20260905000000`):

| Nation | Register | Rows | Headteacher | Domain |
|---|---|---|---|---|
| England | GIAS (DfE), republished daily | 25,512 | 25,481 | 24,465 |
| Wales | GIAS, `EstablishmentTypeGroup = 'Welsh schools'` | 1,569 | 26 | 61 |
| Scotland | Scottish School Roll and Locations | 2,449 | — | 2,445 |
| Northern Ireland | DE NI school-level reference data | 1,098 | — | — |

```bash
bun run seed:schools              # fetch + upsert (cached downloads)
bun run seed:schools -- --dry-run # counts only, nothing written
bun run seed:schools -- --refresh # ignore the download cache
```

Row ids are deterministic UUIDv5 values keyed on `<source>:<reference>`, so re-running is idempotent and a renamed school keeps the id its teachers are attached to. **Do not change the `NAMESPACE` constant.** [scripts/lib/tabular.ts](scripts/lib/tabular.ts) reads the CSV and .xlsx by hand rather than adding a spreadsheet dependency for a script that runs a few times a year; GIAS is Windows-1252, not UTF-8.

Because schools now pre-exist, **the platform admin approves people, not schools** — `approve_school`/`reject_school` and the self-service "register a school" INSERT policy are gone. Five things follow:

- **A headteacher claim is gated on an email-domain match, in one direction only.** `claim_school_admin()` compares the right-hand side of the caller's address against `schools.domains`, accepting the claimant's host being a *subdomain of* a recorded domain (`staff.school.sch.uk` for `school.sch.uk`) but never the reverse. Matching both ways — which `20260904000000` did — meant any holder of a `@glowscotland.org.uk` address matched `stmarys.glowscotland.org.uk`, i.e. every Scottish teacher could claim every Glow-hosted school; `20260905000000` removed that branch and escapes both sides before using them as a `LIKE` pattern. `domains` is normalised at seed time by [src/lib/schools/domain.ts](src/lib/schools/domain.ts), which drops shared hosts (`gmail.com`, `facebook.com`, `glowscotland.org.uk`) and bare public suffixes — `http://sch.uk` in one record would otherwise match every `.sch.uk` address in the country.
- **Only England and Scotland can really use that gate** (96% and 99.8% of rows). The DfE does not maintain Welsh contact data and the Welsh Government's own address list publishes neither emails nor headteachers, and DE NI publishes neither either. Wales (4%) and NI (0%) go through `request_unverified_school_admin()` instead, which records the claim **without** asserting it was verified — it refuses any school that *does* have a domain on record, so it is not a way around the gate.
- **`platform_admin_queue()` returns two kinds of row**: headship claims, and teachers at a school with *no* verified admin, who would otherwise wait forever for an approver who does not exist. Not every claim passed a domain check — the ones from Wales and NI could not be checked at all — so the queue hands the reviewer `domain_matches` and `head_name_matches` per row and lets them decide. `platform_approve_teacher(id, p_as_school_admin)` grants school admin; passing `false` approves an over-claimer as an ordinary teacher. Both are SECURITY DEFINER with an explicit `platform_admins` check, so platform admins need no broad SELECT policy on `teachers`. The queue is ordered by `verification_requested_at`, not `updated_at` — the latter moves on every profile edit, so editing your department used to send you to the back.
- **`guard_teacher_privileged_columns()` is what makes any of this real.** "Users can update their own teacher profile" is `USING (auth.uid() = user_id)` with no column restriction, so before this migration a teacher could PATCH themselves to `is_school_admin = true, verification_status = 'approved'`. RLS cannot express "these columns are read-only to you", so a BEFORE INSERT OR UPDATE trigger guards them and they move only through the SECURITY DEFINER functions above, which set `aidemic.privileged` for the transaction. Same reasoning as `freeze_published_assignments()`. **Any future write to `teachers` touching those five columns has to go through an RPC** — `verification_requested_at` is one of them, because a column the queue is *ordered by* is as much a privilege as the queue membership itself.
- **The unique index on `lower(name)` had to go.** There are 25 schools called "St Mary's Catholic Primary School"; `(source, urn)` keeps the seed idempotent and the browser shows town and postcode to tell them apart. `search_schools()` matches name, town or postcode, ranking exact name prefixes above trigram similarity. It ignores queries **shorter than three characters** — a trigram index cannot serve a shorter pattern, so a two-character query was a sequential scan over 30k rows on every keystroke. [src/app/onboarding/teacher/page.tsx](src/app/onboarding/teacher/page.tsx) mirrors that floor in `MIN_SEARCH_LENGTH`.

Seeded rows arrive `status = 'approved'`, so `join_class_by_invite_code()`'s school gate is unchanged.

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

Layout follows the **orbital workspace** mock in [docs/design/orbital-workspace/](docs/design/orbital-workspace/), but **not its monochrome palette** — the user kept the indigo → purple brand (`accent` → `accent-2`, as a gradient on the active nav item, logo and avatar). Gamification has its own violet `xp` token so XP chips and bars never read as ordinary accent controls. The mock's text sizes were also too small; the shell uses 14px nav items and the mono labels, chips, meters and panels in [src/components/ui/telemetry.tsx](src/components/ui/telemetry.tsx) start at 11px. Text on `bg-accent` uses `text-accent-fg`.

## Paper attempts

The loop the product is built around closes on paper: generate → **print → write by hand → photograph → upload** → transcribe → mark → weakness → mastery → review queue. The last five steps of that were already live for typed attempts; the paper arc is `printed_papers`, [src/app/dashboard/ai-questions/paper/[paperId]/page.tsx](src/app/dashboard/ai-questions/paper/[paperId]/page.tsx), and [src/app/api/ai/transcribe-scan/route.ts](src/app/api/ai/transcribe-scan/route.ts). Five things are load-bearing:

- **A printed paper is not an `exam_practice_attempts` row.** Twelve call sites read that table (eleven in `src`, one in `supabase/functions/weekly-parent-digest`) and none filter by status, so a paper sitting unmarked on a desk for three days would land in every dashboard average, the parent digest and the planner as a 0%. The attempt row is still created only when marking completes — for papers, server-side in `mark-answers` rather than by the browser, so the row cannot be lost to a locked phone. `answer_medium` (`typed` | `paper`) is how you tell them apart afterwards; `attempt_mode` still means practice-vs-mock, which is orthogonal.
- **`printed_papers` has RLS on and no policies at all.** `questions_payload` holds the mark scheme, and the paper page must render the question text to print it — so the row necessarily travels to a browser. Every student-facing read goes through [src/lib/papers/studentSafePaper.ts](src/lib/papers/studentSafePaper.ts), which is an **allow-list**: a new answer-bearing field on the generator is excluded by default rather than leaking until someone remembers it. Same decision as `20260718100000_server_authoritative_assignment_marking.sql`.
- **Transcription and marking are separate calls, and the transcriber is never shown the mark scheme.** A model shown the answer transcribes the answer it was shown, and a blank page comes back as a beautiful response. Splitting them is also what makes a scanned mark defensible: the student sees and corrects what was read *before* anything is graded, and `mark-answers` needs no multimodal model — only `transcribe-scan` does (`AI_VISION_MODEL`, falling back to `AI_MODEL`).
- **Transcripts are densified, never sparse.** A vision model asked for twelve answers routinely returns eleven, and marking indexes `answers[i]` positionally — a gap would mark question 2's answer against question 1. [src/lib/papers/transcript.ts](src/lib/papers/transcript.ts) fills gaps with `''`, which marks as zero. `transcript.test.ts` pins it.
- **Papers are open + MCQ only.** Plot and diagram questions are marked by deterministic code against coordinates and node labels, which a photograph cannot produce, so paper mode sends `allowPlot: false, allowDiagram: false` and `coercePaperQuestions` drops any that arrive anyway.

Scans live in the **private** `paper-scans` bucket (`<user_id>/<paper_id>/<page_index>.jpg`), uploaded straight from the browser — a dozen phone photos would not survive a serverless body limit — after being downscaled to 1600px JPEG client-side. Transcription downloads them with the service role and inlines base64 rather than handing a signed URL to the AI provider. Mastery evidence lands as `source: 'homework_scan'` (weight 1.0), including for a scanned mock: the discount is transcription uncertainty, not exam conditions.

A **PDF** is accepted at that upload too — a school photocopier hands out a PDF, not a camera roll — but it never reaches storage as one. [src/lib/papers/pdfPages.ts](src/lib/papers/pdfPages.ts) renders each page to the same 1600px JPEG in the browser, so the bucket's mime allow-list, the `.jpg` path the attach route insists on, and the `data:image/...` part transcription inlines all stay exactly as they were. Two consequences: the file input carries no `capture` attribute, because that opens the camera directly on Android and would put a scanner app's PDF out of reach; and pdf.js decodes JBIG2 and JPEG 2000 through WebAssembly, which the CSP does not allow, so a page using those codecs renders white. `pdfToJpegPages` samples the canvas and reports which pages came back blank rather than letting a blank transcript be marked as zero — supporting those codecs would mean serving `pdfjs-dist/wasm/` and adding `'wasm-unsafe-eval'` to `script-src`.

## Assignment draft → publish

An assignment is created as a **draft** (migration `20260903030000`): `assignments.status` defaults to `'draft'`, and the student and parent SELECT policies both require `status = 'published'`, so a draft is visible to its teacher and nobody else. The teacher reviews and edits it on [classes/[classId]/assignments/[assignmentId]/page.tsx](src/app/dashboard/teacher/classes/[classId]/assignments/[assignmentId]/page.tsx), then publishes. Three things follow:

- **Publishing is one-way and freezes the row.** `freeze_published_assignments()` is a `BEFORE UPDATE` trigger that raises on *any* update to a row whose `OLD.status` is `'published'` — edits and un-publishing alike. Students may already have answered, and their marks live in `assignment_attempts.ai_feedback` against the mark scheme as it was; editing afterwards would leave the two disagreeing forever. Nothing in the app updated `assignments` before this, so the blanket rule costs nothing — but any future write to that table has to happen while the row is still a draft.
- **It's a trigger, not an RLS `WITH CHECK`.** `WITH CHECK` only sees the NEW row, so it cannot distinguish an edit of a published assignment from the draft → published transition that must stay allowed.
- **`verifyQuestions` gates publishing**, not saving. A draft may be saved half-finished; publishing requires every question to have text, positive whole marks, an MCQ correct option pointing at a non-blank option, and — for `open` questions only — at least one mark scheme point. Plot and diagram questions are marked against their spec, so they carry no written scheme.

The backfill matters: the column was added with `DEFAULT 'published'` and only then flipped to `'draft'`, so rows that predate the migration — all of them live with students — stayed visible.

## Assignment answer keys

[src/lib/assignments/studentSafeSpecs.ts](src/lib/assignments/studentSafeSpecs.ts) projects `PlotSpec` and `DiagramSpec` down to what a student may see, and [src/app/api/assignments/[assignmentId]/route.ts](src/app/api/assignments/[assignmentId]/route.ts) applies it to every question of an **in-progress** attempt. A completed attempt still gets the full spec, because review has to show the right answer.

Both spec types interleave the question with its answer key, so stripping `correctOption`/`markScheme`/`modelAnswer` at the question level was never enough — `correctLabel`, `correctValues`, `slot.correctOption` and the endpoints of connections the student must draw were all readable in the network tab. Four consequences worth knowing:

- **The word bank is shuffled with a seed of `${assignmentId}:${index}`.** `labelBank` is built as "every blank node's correct label, in node order, then distractors", so its ordering alone gave away the mapping. The seed keeps the order stable across refreshes.
- **Templated diagrams are resolved server-side** and `diagramTemplate` is withheld while in progress — the client re-resolves from template code bundled in the browser, which would regenerate the answers it had just been denied.
- **Plot inputs may not derive axes or defaults from `correct*` fields.** They read the stored `yAxisMax`/`yAxisStep` instead, which `normalizeBar`/`normalizeLine` compute from exactly those values, so the axis is identical without reading the answer. `PlotScatterData` gained `xAxisStep`/`yAxisStep` for this reason: its y-axis step is chosen so every correct point lands on a snappable minor gridline, and re-deriving it from blanked coordinates would put the answer out of reach.
- **`frequencyPolygon` has nothing to strip.** Its correct points are `((classStart+classEnd)/2, frequency)` — all given data. Histogram density is likewise recomputed from `frequency / (classEnd - classStart)` in the component.

## Gamification (XP, streaks, leagues, badges)

Migration `20261103000000`. **XP is server-authoritative**: every table has RLS on and no client write policy, and the only write path is `award_xp()`, executable by `service_role` alone and called through [src/lib/gamification/award.ts](src/lib/gamification/award.ts) from the four routes that compute a score themselves — `mark-answers`, `blurt-review`, `flashcards/review`, `review-queue/answer`. Each echoes the result back as `xp` so the UI can show what was earned. Never pass a score taken from the request body. Five things are load-bearing:

- **It does not hang off `mastery_events`.** That log only gets a row once a question resolves onto a subtopic, and it is written in `after()` behind a classifier call. Self-practice on an unresolved topic would silently earn nothing, and the response could never say how much was earned.
- **`award_key` is the idempotency guard**: `paper:<id>`, `assignment:<id>`, `review:<item>`, `flashcard:<card>:<utc-day>`. Self-practice and blurts have no row to key on when they are marked, so they are bounded by the AI daily rate limit and the **3000 XP daily cap** instead. Self-ratings earn nothing.
- **Days and weeks are UTC**, for streaks, the cap and leagues alike. This streak is *not* the one the dashboard computes from `study_sessions` with `calculateStudyStreak`; the two can disagree until the UI moves onto `my_gamification()`.
- **Levels are not stored.** [src/lib/gamification/levels.ts](src/lib/gamification/levels.ts) derives level and rank title from `total_xp` (level L at `50·L·(L−1)` XP), so changing the curve needs no migration.
- **Two privacy rules, by design.** `class_leaderboard()` shows **real names**, but only to active members of that class and its teacher. Weekly leagues mix schools, so `my_league()` shows **usernames only** (a `Cadet-XXXX` callsign when there is none), and only `role = 'student'` accounts are ever placed — no adult is ranked alongside minors.

Leagues are Duolingo-style: on their first XP of a UTC week, a student joins a cohort of up to 30 at their tier. `close_finished_league_weeks()` settles finished weeks, scaling `promote_count`/`demote_count` from a full 30 down to the actual cohort size so a three-person cohort is not all relegated. It runs from pg_cron at Monday 00:00 UTC, and lazily from `award_xp()` *before* that function takes its user row lock, so the close never waits behind an award that is waiting on it. Badge criteria live in the `badges` table; `badge_progress()` is shared by awarding and the `my_badges()` progress bars so the two cannot disagree.

**Naming (migration `20261103010000`).** Every name must be readable by a Year 10 with little general knowledge, and its rank must be obvious. Leagues and level titles are therefore two ladders that **never share a word**:

- **League tiers are a size ladder**: Rock → Asteroid → Moon → Planet → Giant Planet → Star → Giant Star → Star Cluster → Galaxy → Universe. Names live in `league_tiers`; [src/lib/gamification/leagues.ts](src/lib/gamification/leagues.ts) mirrors them only to add a one-line `blurb`, and `leagues.test.ts` pins the mirror to the migration.
- **Level titles are a skill ladder**: Novice (L1) → Beginner (5) → Practitioner (10) → Specialist (15) → Expert (20) → Master (25) → Grandmaster (30) → Legend (40) → Apex (50), in `RANK_TITLES` with a `blurb` each.
- **Badge names state what earned them** ("5 Blurts", "7-Day Streak"). Badge **ids are unchanged** from the original names (`void-blurter`, `jovian-ascent`): `user_badges` references them without `ON UPDATE CASCADE`, and ids are never shown.
- Section headings may be space-themed ("Mission rank", "Mission report"); numbers, buttons and badge names are plain English.

**UI.** The rank panel (sidebar), league chip (top bar), [Progress page](src/app/dashboard/progress/page.tsx) and `ClassLeaderboard` (student and teacher class pages) read through SWR hooks in [src/hooks/useGamification.ts](src/hooks/useGamification.ts), all keyed under `'gamification'`. A page that gets an `xp` object back from a marking route passes it to `announceXp()` ([src/lib/gamification/client.ts](src/lib/gamification/client.ts)); the shell then shows `XpToast` and revalidates every `'gamification'` key. Nothing adds XP client-side. [rules.ts](src/lib/gamification/rules.ts) mirrors `award_xp()`'s rates for the "How XP works" panel only, and `rules.test.ts` pins it to the SQL.

**Top bar.** The bell reads `my_notifications()` (migration `20261103020000`), a SECURITY DEFINER feed **derived** from existing rows (badges earned, settled league weeks, pending parent link requests). There is no notifications table, and the RPC returns facts only — the wording lives in [src/lib/notifications.ts](src/lib/notifications.ts). "Seen" is per device in `localStorage`. Search is [CommandPalette](src/components/CommandPalette.tsx) (Ctrl/⌘+K) over the role's own nav items. It is mounted **once**, and each top bar holds only a `SearchButton`, because the shell renders a desktop and a mobile bar and two palettes would cancel each other's Ctrl+K. The Review nav item's "N due" comes from [useDueFlashcards](src/hooks/useDueFlashcards.ts), a head count that matches `isCardDue()` because `next_review_date` is a timestamptz.

**`cachedAiFetch` never stores `xp`.** `mark-answers` and `blurt-review` are cached client-side to save tokens, but a cached award replayed would announce XP that was never paid, so the field is stripped before writing. A cache hit returns the marks and earns nothing.

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

Optional, for Sentry: `NEXT_PUBLIC_SENTRY_DSN` (unset = Sentry is a no-op) and, at build time only, `SENTRY_ORG` / `SENTRY_PROJECT` / `SENTRY_AUTH_TOKEN` for source-map upload. Init lives in [src/instrumentation.ts](src/instrumentation.ts) (server + proxy) and [src/instrumentation-client.ts](src/instrumentation-client.ts) (browser, with Replay on error only). Events go through the same-origin `/monitoring` tunnel, so the CSP needs no Sentry host — don't put that route behind `requiresAuthCheck()`. SDK v11 replaced `sendDefaultPii` with `dataCollection`, whose defaults collect everything; it is deliberately unset.

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