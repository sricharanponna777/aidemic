-- Seed: GCSE Combined Science for AQA, Edexcel and OCR.
--
-- Combined Science is worth two GCSEs and is examined as three science papers, so it is
-- modelled as three subjects per board -- 'Combined Science (Biology)' and friends --
-- rather than one. That shape is what src/lib/curriculum/resolve.ts already assumes: its
-- specification lookup matches `subjects.name` with a wrapping %like%, so a past attempt
-- row saying subject 'chemistry' still finds 'Combined Science (Chemistry)'. Folding all
-- three sciences into a single subject would break that, and would also collide two
-- 'Required practical skills' topics inside one specification.
--
-- Topic headings are the same per-science lists the separate sciences already use (see
-- 20260703110000_seed_topics.sql, where AQA and OCR Biology are byte-identical): Combined
-- Science trims the detail under each heading rather than dropping headings. The one real
-- difference is Space physics, which is separate-Physics only and is absent below.
--
-- AQA Combined Science: Synergy is deliberately NOT seeded here. Its content is organised
-- into eight cross-science sections (4.1 Building blocks ... 4.8 Guiding Spaceship Earth),
-- not into Biology/Chemistry/Physics, so the three-subject shape would misrepresent it.
--
-- Idempotent: every insert conflicts on the uniqueness added in 20260817000000.
-- Subtopics are not seeded here -- run
--   bun --env-file=.env.local run scripts/seed-curriculum-subtopics.ts --country uk

-- ---------------------------------------------------------------- subjects (9 rows)
INSERT INTO subjects (exam_board_id, name)
SELECT eb.id, sci.subject_name
FROM exam_boards eb
JOIN qualifications q ON q.id = eb.qualification_id
JOIN curricula c ON c.id = q.curriculum_id
CROSS JOIN (VALUES
  ('Combined Science (Biology)'),
  ('Combined Science (Chemistry)'),
  ('Combined Science (Physics)')
) AS sci(subject_name)
WHERE c.country = 'uk'
  AND q.name = 'GCSE'
  AND eb.name IN ('AQA', 'Edexcel', 'OCR')
ON CONFLICT (exam_board_id, name) DO NOTHING;

-- ------------------------------------------------- specifications (24 rows: route x science x tier)
WITH routes(board, route_name) AS (VALUES
  ('AQA',     'AQA GCSE Combined Science: Trilogy'),
  ('Edexcel', 'Edexcel GCSE Combined Science'),
  ('OCR',     'OCR GCSE Combined Science A: Gateway Science'),
  ('OCR',     'OCR GCSE Combined Science B: Twenty First Century Science')
)
INSERT INTO specifications (subject_id, name, tier)
SELECT sub.id, r.route_name || ' (' || sci.science || ')', t.tier
FROM routes r
JOIN exam_boards eb ON eb.name = r.board
JOIN qualifications q ON q.id = eb.qualification_id AND q.name = 'GCSE'
JOIN curricula c ON c.id = q.curriculum_id AND c.country = 'uk'
CROSS JOIN (VALUES ('Biology'), ('Chemistry'), ('Physics')) AS sci(science)
CROSS JOIN (VALUES ('Foundation'), ('Higher')) AS t(tier)
JOIN subjects sub ON sub.exam_board_id = eb.id
                 AND sub.name = 'Combined Science (' || sci.science || ')'
ON CONFLICT (subject_id, name, tier) DO NOTHING;

-- ---------------------------------------------------------------- topics (208 rows)
WITH topic_defs(science, topic_name, order_index) AS (VALUES
  ('Biology', 'Cell biology', 0),
  ('Biology', 'Organisation', 1),
  ('Biology', 'Infection and response', 2),
  ('Biology', 'Bioenergetics', 3),
  ('Biology', 'Homeostasis and response', 4),
  ('Biology', 'Inheritance, variation and evolution', 5),
  ('Biology', 'Ecology', 6),
  ('Biology', 'Required practical skills', 7),
  ('Chemistry', 'Atomic structure and the periodic table', 0),
  ('Chemistry', 'Bonding, structure and properties of matter', 1),
  ('Chemistry', 'Quantitative chemistry', 2),
  ('Chemistry', 'Chemical changes', 3),
  ('Chemistry', 'Energy changes', 4),
  ('Chemistry', 'Rate and extent of chemical change', 5),
  ('Chemistry', 'Organic chemistry', 6),
  ('Chemistry', 'Chemical analysis', 7),
  ('Chemistry', 'Chemistry of the atmosphere', 8),
  ('Chemistry', 'Using resources', 9),
  ('Physics', 'Energy', 0),
  ('Physics', 'Electricity', 1),
  ('Physics', 'Particle model of matter', 2),
  ('Physics', 'Atomic structure and radiation', 3),
  ('Physics', 'Forces', 4),
  ('Physics', 'Waves', 5),
  ('Physics', 'Magnetism and electromagnetism', 6),
  ('Physics', 'Required practical skills', 7)
)
INSERT INTO topics (specification_id, name, order_index)
SELECT sp.id, td.topic_name, td.order_index
FROM specifications sp
JOIN subjects sub ON sub.id = sp.subject_id
JOIN exam_boards eb ON eb.id = sub.exam_board_id
JOIN qualifications q ON q.id = eb.qualification_id AND q.name = 'GCSE'
JOIN curricula c ON c.id = q.curriculum_id AND c.country = 'uk'
JOIN topic_defs td ON sub.name = 'Combined Science (' || td.science || ')'
ON CONFLICT (specification_id, name) DO NOTHING;
