-- Seed: 'graph_plotting' cross-cutting learning objective for the 9 GCSE Science subjects
-- (Biology, Chemistry, Physics x AQA/Edexcel/OCR). Plotting graphs from practical/experimental
-- results (choosing sensible scales, plotting points accurately, drawing a line or curve of best
-- fit) is a required practical skill across all three GCSE sciences, distinct from the existing
-- 'best_fit_judgement' LO (Biology only, narrowly about line-vs-curve judgement) and
-- 'data_analysis' (reading/calculating from graphs already given, not constructing them).

INSERT INTO learning_objectives (subject_id, code, objective, applies_to) VALUES
  -- Biology (AQA, Edexcel, OCR)
  ('96ee8a9c-75e6-42e9-8adf-9ea77ddc1c4c', 'graph_plotting', 'Practise plotting graphs from practical or experimental results, choosing sensible scales, plotting points accurately, and drawing a line or curve of best fit.', ARRAY['notes', 'exam_practice']),
  ('8255c826-470e-4b74-9d57-a13468f81c4d', 'graph_plotting', 'Practise plotting graphs from practical or experimental results, choosing sensible scales, plotting points accurately, and drawing a line or curve of best fit.', ARRAY['notes', 'exam_practice']),
  ('f170610d-4fd2-4442-9b31-4f021deb09f9', 'graph_plotting', 'Practise plotting graphs from practical or experimental results, choosing sensible scales, plotting points accurately, and drawing a line or curve of best fit.', ARRAY['notes', 'exam_practice']),
  -- Chemistry (AQA, Edexcel, OCR)
  ('6ad4aded-18c3-42b9-9492-d97ef682b3b8', 'graph_plotting', 'Practise plotting graphs from practical or experimental results, choosing sensible scales, plotting points accurately, and drawing a line or curve of best fit.', ARRAY['notes', 'exam_practice']),
  ('0fb0712d-1705-4d61-af9e-bddd221fc031', 'graph_plotting', 'Practise plotting graphs from practical or experimental results, choosing sensible scales, plotting points accurately, and drawing a line or curve of best fit.', ARRAY['notes', 'exam_practice']),
  ('e7e31e71-054c-4e45-83b5-eced108f8c97', 'graph_plotting', 'Practise plotting graphs from practical or experimental results, choosing sensible scales, plotting points accurately, and drawing a line or curve of best fit.', ARRAY['notes', 'exam_practice']),
  -- Physics (AQA, Edexcel, OCR)
  ('98c8ff30-c814-40dd-a8ac-9888d47c5a8e', 'graph_plotting', 'Practise plotting graphs from practical or experimental results, choosing sensible scales, plotting points accurately, and drawing a line or curve of best fit.', ARRAY['notes', 'exam_practice']),
  ('303e474c-9bc5-4dd0-aa08-938d0072d9b4', 'graph_plotting', 'Practise plotting graphs from practical or experimental results, choosing sensible scales, plotting points accurately, and drawing a line or curve of best fit.', ARRAY['notes', 'exam_practice']),
  ('574a5b26-b487-430f-9c2e-6f361cb3ce4c', 'graph_plotting', 'Practise plotting graphs from practical or experimental results, choosing sensible scales, plotting points accurately, and drawing a line or curve of best fit.', ARRAY['notes', 'exam_practice'])
ON CONFLICT DO NOTHING;
