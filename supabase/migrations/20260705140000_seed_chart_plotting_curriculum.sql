-- Seed: Frequency Polygon / Stem-and-Leaf subtopics for GCSE Maths Statistics (missing from
-- every spec), and a 'best_fit_judgement' cross-cutting learning objective (judging line vs
-- curve of best fit on a scatter graph) for Biology and Mathematics, modeled on the existing
-- 'data_analysis' learning objective (20260704093000_seed_data_analysis_learning_objective.sql).

INSERT INTO subtopics (topic_id, name, order_index) VALUES
  -- AQA GCSE Mathematics Foundation - Statistics
  ('c273d925-762a-41a8-af75-927f14ec7698', 'Frequency polygons', 6),
  ('c273d925-762a-41a8-af75-927f14ec7698', 'Stem-and-leaf diagrams', 7),
  -- AQA GCSE Mathematics Higher - Statistics
  ('62555beb-6820-42a6-9a5e-83d38735ea61', 'Frequency polygons', 6),
  ('62555beb-6820-42a6-9a5e-83d38735ea61', 'Stem-and-leaf diagrams', 7),
  -- Edexcel GCSE Mathematics Foundation - Statistics
  ('00d93e1f-eb4c-4f2a-a983-ff39387ad3ef', 'Frequency polygons', 6),
  ('00d93e1f-eb4c-4f2a-a983-ff39387ad3ef', 'Stem-and-leaf diagrams', 7),
  -- Edexcel GCSE Mathematics Higher - Statistics
  ('a51b2918-d807-40f3-a076-2a5eb81f9d4f', 'Frequency polygons', 6),
  ('a51b2918-d807-40f3-a076-2a5eb81f9d4f', 'Stem-and-leaf diagrams', 7),
  -- OCR GCSE Mathematics Foundation - Statistics
  ('7566c871-777b-418e-aae7-f051d8575f08', 'Frequency polygons', 6),
  ('7566c871-777b-418e-aae7-f051d8575f08', 'Stem-and-leaf diagrams', 7),
  -- OCR GCSE Mathematics Higher - Statistics
  ('1603cb53-cf83-4a73-a76b-6d8fae49bc25', 'Frequency polygons', 5),
  ('1603cb53-cf83-4a73-a76b-6d8fae49bc25', 'Stem-and-leaf diagrams', 6);

INSERT INTO learning_objectives (subject_id, code, objective, applies_to) VALUES
  -- Biology (AQA, Edexcel, OCR; GCSE + A-Level)
  ('97e712aa-0fb7-44cc-b774-26b7a39c74f3', 'best_fit_judgement', 'Practise judging whether a scatter graph needs a straight line or a curve of best fit, and drawing it accurately through the plotted points.', ARRAY['notes', 'exam_practice']),
  ('96ee8a9c-75e6-42e9-8adf-9ea77ddc1c4c', 'best_fit_judgement', 'Practise judging whether a scatter graph needs a straight line or a curve of best fit, and drawing it accurately through the plotted points.', ARRAY['notes', 'exam_practice']),
  ('1f8f77f9-308e-4da0-ac62-1f0ad994f409', 'best_fit_judgement', 'Practise judging whether a scatter graph needs a straight line or a curve of best fit, and drawing it accurately through the plotted points.', ARRAY['notes', 'exam_practice']),
  ('8255c826-470e-4b74-9d57-a13468f81c4d', 'best_fit_judgement', 'Practise judging whether a scatter graph needs a straight line or a curve of best fit, and drawing it accurately through the plotted points.', ARRAY['notes', 'exam_practice']),
  ('9c88ff48-a2b7-40ac-9b53-8321d24bf43d', 'best_fit_judgement', 'Practise judging whether a scatter graph needs a straight line or a curve of best fit, and drawing it accurately through the plotted points.', ARRAY['notes', 'exam_practice']),
  ('f170610d-4fd2-4442-9b31-4f021deb09f9', 'best_fit_judgement', 'Practise judging whether a scatter graph needs a straight line or a curve of best fit, and drawing it accurately through the plotted points.', ARRAY['notes', 'exam_practice']),
  -- Mathematics (AQA, Edexcel, OCR; GCSE + A-Level)
  ('a1b9f027-2c63-4865-9980-5d5c2a2387f0', 'best_fit_judgement', 'Practise judging whether a scatter graph needs a straight line or a curve of best fit, and drawing it accurately through the plotted points.', ARRAY['notes', 'exam_practice']),
  ('f9427dc7-3774-40af-9a0a-e813b0984dce', 'best_fit_judgement', 'Practise judging whether a scatter graph needs a straight line or a curve of best fit, and drawing it accurately through the plotted points.', ARRAY['notes', 'exam_practice']),
  ('2b3edc1e-92e4-4d72-97f7-10709c073177', 'best_fit_judgement', 'Practise judging whether a scatter graph needs a straight line or a curve of best fit, and drawing it accurately through the plotted points.', ARRAY['notes', 'exam_practice']),
  ('9f5be3f9-5b8c-4e46-bbd5-1df2478c3825', 'best_fit_judgement', 'Practise judging whether a scatter graph needs a straight line or a curve of best fit, and drawing it accurately through the plotted points.', ARRAY['notes', 'exam_practice']),
  ('37ca2048-92bb-4971-b431-112d81cb79ee', 'best_fit_judgement', 'Practise judging whether a scatter graph needs a straight line or a curve of best fit, and drawing it accurately through the plotted points.', ARRAY['notes', 'exam_practice']),
  ('9671ad2e-fd49-4309-8621-a2e3c87e6126', 'best_fit_judgement', 'Practise judging whether a scatter graph needs a straight line or a curve of best fit, and drawing it accurately through the plotted points.', ARRAY['notes', 'exam_practice'])
ON CONFLICT DO NOTHING;
