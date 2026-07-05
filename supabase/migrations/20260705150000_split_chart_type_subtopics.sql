-- Seed: individual per-chart-type Maths subtopics (pie/bar/line/histogram/frequency polygon/
-- stem-and-leaf/box plot/scatter) for the 6 GCSE Maths Statistics topics, so each chart-plotting
-- skill can be selected and gated on its own rather than bundled with others. Frequency polygon
-- and stem-and-leaf subtopics were already added in
-- 20260705140000_seed_chart_plotting_curriculum.sql; this migration adds the remaining 6 types
-- and replaces subtopics that previously bundled 2+ chart types into a single row.
--
-- Also adds a Mathematics-wide 'chart_construction_accuracy' learning objective covering all
-- 8 chart types, modeled on the existing 'data_analysis' / 'best_fit_judgement' LOs.

-- Remove subtopics that bundle 2+ chart types into one row. Verified beforehand that no
-- learning_objectives rows reference these subtopic ids, so this is a safe delete.
DELETE FROM subtopics WHERE id IN (
  'd35beb4a-dd78-42d2-8d34-c8e7b6b8a67f', -- AQA GCSE Foundation Statistics: "Interpreting and drawing charts and graphs (bar charts, pie charts, pictograms)"
  '5d4f6f75-64d8-4394-ba09-66fc522ab16f', -- Edexcel GCSE Foundation Statistics: "Interpret and construct tables, bar charts, pictograms and line graphs"
  '03d63dc5-8a20-415e-bcf9-7eb31a12cadd', -- OCR GCSE Foundation Statistics: "Interpreting data (pictograms, bar charts, pie charts, line graphs)"
  '4cf99f68-9bb0-44ce-a596-badbc5ef2f34'  -- OCR GCSE Higher Statistics: "Collecting and representing data (histograms, box plots, cumulative frequency)"
);

INSERT INTO subtopics (topic_id, name, order_index) VALUES
  -- AQA GCSE Mathematics Foundation - Statistics
  ('c273d925-762a-41a8-af75-927f14ec7698', 'Pie charts', 8),
  ('c273d925-762a-41a8-af75-927f14ec7698', 'Bar charts', 9),
  ('c273d925-762a-41a8-af75-927f14ec7698', 'Line graphs', 10),
  ('c273d925-762a-41a8-af75-927f14ec7698', 'Histograms (including unequal class widths)', 11),
  ('c273d925-762a-41a8-af75-927f14ec7698', 'Box plots', 12),

  -- AQA GCSE Mathematics Higher - Statistics
  ('62555beb-6820-42a6-9a5e-83d38735ea61', 'Pie charts', 8),
  ('62555beb-6820-42a6-9a5e-83d38735ea61', 'Bar charts', 9),
  ('62555beb-6820-42a6-9a5e-83d38735ea61', 'Line graphs', 10),

  -- Edexcel GCSE Mathematics Foundation - Statistics
  ('00d93e1f-eb4c-4f2a-a983-ff39387ad3ef', 'Bar charts', 8),
  ('00d93e1f-eb4c-4f2a-a983-ff39387ad3ef', 'Line graphs', 9),
  ('00d93e1f-eb4c-4f2a-a983-ff39387ad3ef', 'Histograms (including unequal class widths)', 10),
  ('00d93e1f-eb4c-4f2a-a983-ff39387ad3ef', 'Box plots', 11),
  ('00d93e1f-eb4c-4f2a-a983-ff39387ad3ef', 'Scatter graphs and lines of best fit', 12),

  -- Edexcel GCSE Mathematics Higher - Statistics
  ('a51b2918-d807-40f3-a076-2a5eb81f9d4f', 'Pie charts', 8),
  ('a51b2918-d807-40f3-a076-2a5eb81f9d4f', 'Bar charts', 9),
  ('a51b2918-d807-40f3-a076-2a5eb81f9d4f', 'Line graphs', 10),
  ('a51b2918-d807-40f3-a076-2a5eb81f9d4f', 'Scatter graphs and lines of best fit', 11),

  -- OCR GCSE Mathematics Foundation - Statistics
  ('7566c871-777b-418e-aae7-f051d8575f08', 'Pie charts', 8),
  ('7566c871-777b-418e-aae7-f051d8575f08', 'Bar charts', 9),
  ('7566c871-777b-418e-aae7-f051d8575f08', 'Line graphs', 10),
  ('7566c871-777b-418e-aae7-f051d8575f08', 'Histograms (including unequal class widths)', 11),
  ('7566c871-777b-418e-aae7-f051d8575f08', 'Box plots', 12),
  ('7566c871-777b-418e-aae7-f051d8575f08', 'Scatter graphs and lines of best fit', 13),

  -- OCR GCSE Mathematics Higher - Statistics
  ('1603cb53-cf83-4a73-a76b-6d8fae49bc25', 'Histograms (including unequal class widths)', 7),
  ('1603cb53-cf83-4a73-a76b-6d8fae49bc25', 'Box plots', 8),
  ('1603cb53-cf83-4a73-a76b-6d8fae49bc25', 'Cumulative frequency graphs', 9),
  ('1603cb53-cf83-4a73-a76b-6d8fae49bc25', 'Pie charts', 10),
  ('1603cb53-cf83-4a73-a76b-6d8fae49bc25', 'Bar charts', 11),
  ('1603cb53-cf83-4a73-a76b-6d8fae49bc25', 'Line graphs', 12),
  ('1603cb53-cf83-4a73-a76b-6d8fae49bc25', 'Scatter graphs and lines of best fit', 13);

INSERT INTO learning_objectives (subject_id, code, objective, applies_to) VALUES
  ('a1b9f027-2c63-4865-9980-5d5c2a2387f0', 'chart_construction_accuracy', 'Construct and plot pie charts, bar charts, line graphs, histograms (including unequal class widths), frequency polygons, stem-and-leaf diagrams, box plots, and scatter graphs accurately, using correct scales, correctly labelled axes, and a line or curve of best fit where the data requires it.', ARRAY['notes', 'exam_practice']),
  ('f9427dc7-3774-40af-9a0a-e813b0984dce', 'chart_construction_accuracy', 'Construct and plot pie charts, bar charts, line graphs, histograms (including unequal class widths), frequency polygons, stem-and-leaf diagrams, box plots, and scatter graphs accurately, using correct scales, correctly labelled axes, and a line or curve of best fit where the data requires it.', ARRAY['notes', 'exam_practice']),
  ('2b3edc1e-92e4-4d72-97f7-10709c073177', 'chart_construction_accuracy', 'Construct and plot pie charts, bar charts, line graphs, histograms (including unequal class widths), frequency polygons, stem-and-leaf diagrams, box plots, and scatter graphs accurately, using correct scales, correctly labelled axes, and a line or curve of best fit where the data requires it.', ARRAY['notes', 'exam_practice']),
  ('9f5be3f9-5b8c-4e46-bbd5-1df2478c3825', 'chart_construction_accuracy', 'Construct and plot pie charts, bar charts, line graphs, histograms (including unequal class widths), frequency polygons, stem-and-leaf diagrams, box plots, and scatter graphs accurately, using correct scales, correctly labelled axes, and a line or curve of best fit where the data requires it.', ARRAY['notes', 'exam_practice']),
  ('37ca2048-92bb-4971-b431-112d81cb79ee', 'chart_construction_accuracy', 'Construct and plot pie charts, bar charts, line graphs, histograms (including unequal class widths), frequency polygons, stem-and-leaf diagrams, box plots, and scatter graphs accurately, using correct scales, correctly labelled axes, and a line or curve of best fit where the data requires it.', ARRAY['notes', 'exam_practice']),
  ('9671ad2e-fd49-4309-8621-a2e3c87e6126', 'chart_construction_accuracy', 'Construct and plot pie charts, bar charts, line graphs, histograms (including unequal class widths), frequency polygons, stem-and-leaf diagrams, box plots, and scatter graphs accurately, using correct scales, correctly labelled axes, and a line or curve of best fit where the data requires it.', ARRAY['notes', 'exam_practice'])
ON CONFLICT DO NOTHING;
