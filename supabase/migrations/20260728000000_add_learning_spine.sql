-- ============================================================================
-- The Learning Spine: make mastery addressable per curriculum node.
--
-- Today the app has two content spines that never meet:
--
--   A. The normalised curriculum tree (20260702190000) -- stable IDs, but
--      almost no per-student data hangs off it.
--   B. exam_practice_attempts -- where all measured performance actually lands,
--      with `subject`/`topic` as free TEXT and weaknesses as LLM-authored
--      TEXT[] strings.
--
-- Because B never resolves to A's identifiers, mastery cannot be aggregated.
-- Two students who make the identical error get two different weakness strings
-- ("Struggles with rearranging formulae" vs "Rearranging equations before
-- substituting"), so a class heatmap, a prerequisite recommendation, an
-- intervention model and a grade forecast are all impossible to compute.
-- src/lib/weaknesses.ts currently substitutes for a taxonomy with string
-- normalisation, which works for one student's dashboard and nothing beyond it.
--
-- See docs/PRODUCT_STRATEGY.md for the design argument.
--
-- ---------------------------------------------------------------------------
-- WHY SUBTOPIC AND NOT LEARNING OBJECTIVE
--
-- The obvious grain is learning_objectives -- the bottom of the spec tree. It
-- is the wrong one here, because that table is not actually the bottom of the
-- tree in this database:
--
--   subtopics             5,524 rows, every one reachable from a topic
--   learning_objectives     442 rows, ALL of them with subtopic_id IS NULL
--
-- 20260704090000 re-scoped learning_objectives to `subject_id` + `applies_to`,
-- turning it into a subject-wide list of cross-cutting SKILLS (plot a graph,
-- complete a diagram) rather than spec points. It is a second, orthogonal axis
-- -- the "how" -- and it is not reachable from the topic names that attempts
-- record.
--
-- So the spine anchors on `subtopic_id` (the "what"), with a nullable
-- `learning_objective_id` alongside it (the "how") for the cases where a skill
-- is also implicated. If the LO layer is ever seeded properly beneath
-- subtopics, the grain can be refined downward by replaying mastery_events --
-- which the derived-table design below makes cheap.
-- ---------------------------------------------------------------------------
--
-- TWO DELIBERATE DECISIONS:
--
-- 1. student_subtopic_mastery is DERIVED, not authoritative. It is fully
--    rebuildable by replaying mastery_events through masteryFromEvents() in
--    src/lib/mastery.ts. The memory model lives in TypeScript rather than a
--    plpgsql trigger so there is exactly one implementation of it, unit-tested
--    in src/lib/mastery.test.ts. When the model changes -- and it will -- we
--    re-derive rather than migrate.
--
-- 2. There are NO client INSERT/UPDATE policies on either mastery_events or
--    student_subtopic_mastery. Mastery drives predicted grades, the planner and
--    (in time) XP, so a student who could insert their own evidence could forge
--    all three. Writes go through the service role from server code only,
--    matching the server-authoritative marking decision in 20260718100000.
-- ============================================================================

-- ============================================================================
-- STEP 1: Misconception taxonomy
--
-- Curated and versioned, NOT model-generated at runtime. The LLM's job becomes
-- classifying an error into this closed set (cheap, small model, evaluable,
-- aggregatable) instead of inventing a novel label every time (expensive,
-- drifty, impossible to group).
--
-- Seeded from published exam-board examiner reports, then grown offline by
-- clustering mastery_events.raw_weakness_text that failed to classify.
-- ============================================================================
CREATE TABLE IF NOT EXISTS misconceptions (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subtopic_id           uuid REFERENCES subtopics(id) ON DELETE CASCADE,
  -- Optional second axis: the cross-cutting skill this error implicates.
  learning_objective_id uuid REFERENCES learning_objectives(id) ON DELETE SET NULL,
  -- Stable human-readable key, e.g. 'chem.moles.mr_vs_ar_confusion'. Prompts and
  -- eval fixtures reference this, so it must survive a taxonomy rebuild.
  code                  text NOT NULL UNIQUE,
  label                 text NOT NULL,
  -- Written for the student, at reading age. Shown when the error is detected.
  student_explanation   text NOT NULL,
  -- Written for the teacher. Shown in the class heatmap.
  teacher_note          text,
  -- What actually fixes it -- drives the remediation mission the planner emits.
  remediation_strategy  text,
  category              text NOT NULL CHECK (category IN (
                          'procedural', 'conceptual', 'exam-technique',
                          'notation', 'recall'
                        )),
  -- 1..3; weights the planner's priority score.
  severity              int NOT NULL DEFAULT 2 CHECK (severity BETWEEN 1 AND 3),
  source                text NOT NULL DEFAULT 'manual' CHECK (source IN (
                          'manual', 'examiner_report', 'clustered'
                        )),
  created_at            timestamptz NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_misconceptions_subtopic_id
  ON misconceptions(subtopic_id);

-- ============================================================================
-- STEP 2: Prerequisite edges
--
-- Seeded by an LLM pass per specification (one-off, human-reviewed), then
-- corrected empirically: if students who fail B overwhelmingly also fail A but
-- not conversely, that is an evidenced edge. Auto-generated prerequisite graphs
-- are roughly 80% right; the empirical correction loop is what makes the
-- remaining 20% safe to show a student.
-- ============================================================================
CREATE TABLE IF NOT EXISTS subtopic_prerequisites (
  subtopic_id              uuid NOT NULL REFERENCES subtopics(id) ON DELETE CASCADE,
  prerequisite_subtopic_id uuid NOT NULL REFERENCES subtopics(id) ON DELETE CASCADE,
  -- 1.0 = hard blocker (no moles without balancing equations); 0.3 = merely helpful.
  strength                 numeric NOT NULL DEFAULT 1.0 CHECK (strength > 0 AND strength <= 1),
  source                   text NOT NULL DEFAULT 'manual' CHECK (source IN (
                             'manual', 'llm', 'inferred'
                           )),
  created_at               timestamptz NOT NULL DEFAULT NOW(),
  PRIMARY KEY (subtopic_id, prerequisite_subtopic_id),
  CHECK (subtopic_id <> prerequisite_subtopic_id)
);

CREATE INDEX IF NOT EXISTS idx_subtopic_prerequisites_prerequisite
  ON subtopic_prerequisites(prerequisite_subtopic_id);

-- ============================================================================
-- STEP 3: Evidence log
--
-- Append-only. Every signal about what a student knows lands here from any
-- surface -- exam practice, assignments, flashcards, blurting, cloze, the
-- tutor, homework scans, essays, self-ratings. Never updated, never deleted
-- except by user cascade.
-- ============================================================================
CREATE TABLE IF NOT EXISTS mastery_events (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  subtopic_id           uuid NOT NULL REFERENCES subtopics(id) ON DELETE CASCADE,
  learning_objective_id uuid REFERENCES learning_objectives(id) ON DELETE SET NULL,
  source                text NOT NULL CHECK (source IN (
                          'exam_practice', 'assignment', 'mock', 'flashcard',
                          'blurt', 'cloze', 'tutor', 'homework_scan', 'essay',
                          'self_rating'
                        )),
  -- The attempt/session row this came from. Intentionally not a FK: sources
  -- live in several tables and an event must outlive a deleted attempt.
  source_id             uuid,
  marks_awarded         numeric,
  marks_available       numeric,
  -- Normalised 0..1. Self-ratings map red/amber/green -> 0 / 0.5 / 1.
  outcome               numeric NOT NULL CHECK (outcome BETWEEN 0 AND 1),
  -- How far this evidence should move the belief. A timed mock is worth far
  -- more than a self-rating; kept separate from `outcome` so soft and hard
  -- signals can share one table without the soft ones drowning the hard ones.
  -- See EVIDENCE_WEIGHTS in src/lib/mastery.ts.
  weight                numeric NOT NULL DEFAULT 1.0 CHECK (weight > 0 AND weight <= 5),
  misconception_id      uuid REFERENCES misconceptions(id) ON DELETE SET NULL,
  -- Retained when classification finds no match. This is the input to the
  -- offline clustering job that grows the taxonomy, so nothing is ever lost
  -- by a classification miss.
  raw_weakness_text     text,
  difficulty            text CHECK (difficulty IS NULL OR difficulty IN (
                          'easy', 'medium', 'hard', 'exam', 'challenge'
                        )),
  -- Feeds the exam stamina/timing model (docs/PRODUCT_STRATEGY.md §6.3).
  response_seconds      int CHECK (response_seconds IS NULL OR response_seconds >= 0),
  created_at            timestamptz NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_mastery_events_user_subtopic_created
  ON mastery_events(user_id, subtopic_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_mastery_events_user_created
  ON mastery_events(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_mastery_events_misconception
  ON mastery_events(misconception_id) WHERE misconception_id IS NOT NULL;
-- Partial index for the taxonomy-growth clustering job.
CREATE INDEX IF NOT EXISTS idx_mastery_events_unclassified
  ON mastery_events(created_at DESC)
  WHERE misconception_id IS NULL AND raw_weakness_text IS NOT NULL;

-- ============================================================================
-- STEP 4: Derived belief state
--
-- One row per (student, subtopic). Every read surface -- knowledge graph,
-- planner, adaptive difficulty, class heatmap, grade forecast -- reads this
-- table rather than computing its own analytics over raw attempts.
--
-- `strength` is the consolidated belief at `last_seen_at` and DECAYS from
-- there; callers must project it forward with retrievabilityAt() rather than
-- reading the column directly. `confidence` is deliberately separate so the UI
-- can render "no evidence yet" as grey rather than as weak -- a student who
-- opens the graph on day one must not see a wall of red.
-- ============================================================================
CREATE TABLE IF NOT EXISTS student_subtopic_mastery (
  user_id        uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  subtopic_id    uuid NOT NULL REFERENCES subtopics(id) ON DELETE CASCADE,
  -- 0..1 belief at last_seen_at, before decay.
  strength       numeric NOT NULL DEFAULT 0 CHECK (strength BETWEEN 0 AND 1),
  -- Days until retrievability decays to the target retention (0.9).
  stability      numeric NOT NULL DEFAULT 0 CHECK (stability >= 0),
  -- 0..1 how much evidence backs the estimate. Not the same as strength.
  confidence     numeric NOT NULL DEFAULT 0 CHECK (confidence BETWEEN 0 AND 1),
  self_rating    text CHECK (self_rating IS NULL OR self_rating IN ('red', 'amber', 'green')),
  evidence_count int NOT NULL DEFAULT 0 CHECK (evidence_count >= 0),
  last_seen_at   timestamptz,
  due_at         timestamptz,
  updated_at     timestamptz NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, subtopic_id)
);

-- Planner: "what is due for this student, soonest first".
CREATE INDEX IF NOT EXISTS idx_student_subtopic_mastery_due
  ON student_subtopic_mastery(user_id, due_at);
-- Knowledge graph / weakest-topics: "what is this student worst at".
CREATE INDEX IF NOT EXISTS idx_student_subtopic_mastery_strength
  ON student_subtopic_mastery(user_id, strength);
-- Class heatmap: aggregate one subtopic across a roster.
CREATE INDEX IF NOT EXISTS idx_student_subtopic_mastery_subtopic
  ON student_subtopic_mastery(subtopic_id);

-- ============================================================================
-- STEP 5: Row Level Security
-- ============================================================================

-- Taxonomy and prerequisite edges are global reference data: readable by
-- anyone, writable only via migrations/service role -- same treatment as the
-- curriculum tables in 20260702190000.
ALTER TABLE misconceptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE subtopic_prerequisites ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Misconceptions are readable by everyone" ON misconceptions;
CREATE POLICY "Misconceptions are readable by everyone"
  ON misconceptions FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "Prerequisites are readable by everyone" ON subtopic_prerequisites;
CREATE POLICY "Prerequisites are readable by everyone"
  ON subtopic_prerequisites FOR SELECT
  USING (true);

-- Per-student tables. SELECT only, for all four audiences; no write policy for
-- anyone (see decision 2 in the header).
ALTER TABLE mastery_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE student_subtopic_mastery ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own mastery events" ON mastery_events;
CREATE POLICY "Users can view their own mastery events"
  ON mastery_events FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Parents can view linked students mastery events" ON mastery_events;
CREATE POLICY "Parents can view linked students mastery events"
  ON mastery_events FOR SELECT
  USING (is_parent_of_student(user_id));

DROP POLICY IF EXISTS "Teachers can view their students mastery events" ON mastery_events;
CREATE POLICY "Teachers can view their students mastery events"
  ON mastery_events FOR SELECT
  USING (is_teacher_of_student(user_id));

DROP POLICY IF EXISTS "School admins can view their students mastery events" ON mastery_events;
CREATE POLICY "School admins can view their students mastery events"
  ON mastery_events FOR SELECT
  USING (is_school_admin_of_student(user_id));

DROP POLICY IF EXISTS "Users can view their own mastery" ON student_subtopic_mastery;
CREATE POLICY "Users can view their own mastery"
  ON student_subtopic_mastery FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Parents can view linked students mastery" ON student_subtopic_mastery;
CREATE POLICY "Parents can view linked students mastery"
  ON student_subtopic_mastery FOR SELECT
  USING (is_parent_of_student(user_id));

DROP POLICY IF EXISTS "Teachers can view their students mastery" ON student_subtopic_mastery;
CREATE POLICY "Teachers can view their students mastery"
  ON student_subtopic_mastery FOR SELECT
  USING (is_teacher_of_student(user_id));

DROP POLICY IF EXISTS "School admins can view their students mastery" ON student_subtopic_mastery;
CREATE POLICY "School admins can view their students mastery"
  ON student_subtopic_mastery FOR SELECT
  USING (is_school_admin_of_student(user_id));
