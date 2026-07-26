-- Seed: 'diagram_completion' cross-cutting learning objective for the 9 GCSE Science subjects
-- (Biology, Chemistry, Physics x AQA/Edexcel/OCR). Completing unfinished diagrams — labelling
-- missing parts (cells, apparatus, circuits) and drawing missing connections (cycles, food webs,
-- energy-transfer chains) — is a required skill across all three GCSE sciences. Selecting this
-- objective in AI Exam Practice unlocks the interactive 'diagram' question type (server-gated to
-- these subjects), mirroring how 'graph_plotting' unlocks the 'plot' question type. Uses the same
-- subject_id UUIDs as the graph_plotting seed (20260705160000).

INSERT INTO learning_objectives (subject_id, code, objective, applies_to) VALUES
  -- Biology (AQA, Edexcel, OCR)
  ('96ee8a9c-75e6-42e9-8adf-9ea77ddc1c4c', 'diagram_completion', 'Complete unfinished diagrams by labelling the missing parts and drawing the missing connections (e.g. cell structures, apparatus, circuits, the carbon/water cycle, food webs and energy-transfer chains).', ARRAY['exam_practice']),
  ('8255c826-470e-4b74-9d57-a13468f81c4d', 'diagram_completion', 'Complete unfinished diagrams by labelling the missing parts and drawing the missing connections (e.g. cell structures, apparatus, circuits, the carbon/water cycle, food webs and energy-transfer chains).', ARRAY['exam_practice']),
  ('f170610d-4fd2-4442-9b31-4f021deb09f9', 'diagram_completion', 'Complete unfinished diagrams by labelling the missing parts and drawing the missing connections (e.g. cell structures, apparatus, circuits, the carbon/water cycle, food webs and energy-transfer chains).', ARRAY['exam_practice']),
  -- Chemistry (AQA, Edexcel, OCR)
  ('6ad4aded-18c3-42b9-9492-d97ef682b3b8', 'diagram_completion', 'Complete unfinished diagrams by labelling the missing parts and drawing the missing connections (e.g. cell structures, apparatus, circuits, the carbon/water cycle, food webs and energy-transfer chains).', ARRAY['exam_practice']),
  ('0fb0712d-1705-4d61-af9e-bddd221fc031', 'diagram_completion', 'Complete unfinished diagrams by labelling the missing parts and drawing the missing connections (e.g. cell structures, apparatus, circuits, the carbon/water cycle, food webs and energy-transfer chains).', ARRAY['exam_practice']),
  ('e7e31e71-054c-4e45-83b5-eced108f8c97', 'diagram_completion', 'Complete unfinished diagrams by labelling the missing parts and drawing the missing connections (e.g. cell structures, apparatus, circuits, the carbon/water cycle, food webs and energy-transfer chains).', ARRAY['exam_practice']),
  -- Physics (AQA, Edexcel, OCR)
  ('98c8ff30-c814-40dd-a8ac-9888d47c5a8e', 'diagram_completion', 'Complete unfinished diagrams by labelling the missing parts and drawing the missing connections (e.g. cell structures, apparatus, circuits, the carbon/water cycle, food webs and energy-transfer chains).', ARRAY['exam_practice']),
  ('303e474c-9bc5-4dd0-aa08-938d0072d9b4', 'diagram_completion', 'Complete unfinished diagrams by labelling the missing parts and drawing the missing connections (e.g. cell structures, apparatus, circuits, the carbon/water cycle, food webs and energy-transfer chains).', ARRAY['exam_practice']),
  ('574a5b26-b487-430f-9c2e-6f361cb3ce4c', 'diagram_completion', 'Complete unfinished diagrams by labelling the missing parts and drawing the missing connections (e.g. cell structures, apparatus, circuits, the carbon/water cycle, food webs and energy-transfer chains).', ARRAY['exam_practice'])
ON CONFLICT DO NOTHING;
