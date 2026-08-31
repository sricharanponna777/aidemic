# Data Retention and Deletion

> **DRAFT — not legally reviewed, and largely NOT IMPLEMENTED.** See [README.md](README.md).

This describes the retention schedule and deletion workflow AIDemic **should**
operate. Almost none of it exists in code today. It is written as a specification
to build against, not as a description of current behaviour.

## Current state, stated plainly

- Nothing expires. Every row written since launch is still present.
- There is no self-serve account deletion, and no export.
- There is no automated job that enforces any of the periods below.

Publishing a retention policy that claims otherwise would be a false statement to
users and to schools. Build the mechanism first, or publish only what is true.

## Proposed retention schedule

| Category | Retain for | Rationale |
|---|---|---|
| Account and profile (`user_profiles`, `auth.users`) | Life of the account + 30 days | Grace period for accidental deletion |
| Learning content — notes, flashcards, decks | Life of the account | It is the user's own work |
| Attempts and marks (`assignment_attempts`, `exam_practice_attempts`, `mock_test_*`) | Life of account, or per the school's own schedule where the school is controller | Progress tracking depends on history |
| Mastery and analytics (`student_subtopic_mastery`, `mastery_events`, `topic_performance`, `student_analytics`) | Life of the account | Spaced repetition needs the full history |
| Blurts and free-text answers | Life of the account | Same as above; note these are sent to the AI provider at generation time |
| Parent links (`parent_links`) | Until revoked, then 90 days | Audit trail for who could see what |
| Class membership (`class_students`) | Academic year + 1 year | Teachers need last year's cohort |
| AI usage counters (`ai_request_counters`) | 90 days | Rate limiting and cost control only |
| Rate-limit keys (Redis) | Window length — minutes | Transient by construction |
| Email delivery logs (Brevo/Resend) | Per processor default | Held by the processor |
| Application logs | 30 days | Debugging and incident response |
| Generated podcasts/videos | Life of the account, or until deleted | Storage cost |

**Inactive accounts:** delete after **[24?] months** of no sign-in, after two
warning emails at 30 days and 7 days before.

## Deletion workflow (to build)

### What the user does

Settings → *Delete my account* → confirm by typing the account email → account
enters a 30-day grace period, immediately signed out and inaccessible → after 30
days, hard deletion runs. A sign-in during the grace period cancels it.

### What must actually be deleted

`auth.users` deletion cascades to `user_profiles` and onward to most learning
tables, but **cascade is not a deletion policy** — each of these needs checking:

- Rows keyed on `user_id` **without** `ON DELETE CASCADE` — audit every table
  before relying on this.
- **Storage objects** — avatars, generated podcast/video files. These are not rows
  and will not cascade.
- **`parent_links` in both directions** — as the student and as the parent.
- **Teacher-owned data.** Deleting a teacher must not delete their students' work.
  Classes and assignments need reassignment or archival, which is a product
  decision, not a technical one. *This is the hardest case and is unresolved.*
- **`class_students`** — removal from every class, and notification to teachers if
  the class is mid-assignment.
- **`platform_admins`, `teachers`, `schools`** memberships.
- **Backups.** Supabase point-in-time recovery holds deleted rows until the backup
  window rolls off. Say so in the policy — claiming instant total erasure would be
  untrue — and state the window: **[N] days**.
- **The AI provider.** Content already sent is subject to *their* retention, not
  ours. We cannot recall it. This must be disclosed, not glossed.

### What is kept after deletion, and why

- Aggregate, non-identifying statistics that cannot be traced to a person.
- The minimum record needed to show a deletion request was honoured (request date
  and a hashed identifier), which is itself a compliance obligation.
- Anything we are independently required to retain by law.

### Export (UK GDPR Art. 20)

The same settings page should offer a machine-readable export — JSON of profile,
notes, flashcards, attempts, and mastery history — delivered as a download or a
signed, expiring link. Not built.

## Owner

**[NAME]** owns this schedule and reviews it every **[12] months** or on any
material change to what is collected.
