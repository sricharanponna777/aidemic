// Shared TypeScript interfaces reflecting database schema

export interface UserProfile {
  id: string; // same as auth.users.id
  email: string;
  full_name?: string;
  username?: string;
  first_name?: string;
  last_name?: string;
  bio?: string;
  avatar_url?: string;
  preferred_study_time?: string;
  daily_study_goal_minutes?: number;
  country?: 'uk' | 'india' | 'us' | 'international';
  theme?: 'light' | 'dark';
  notifications_enabled?: boolean;
  role?: 'student' | 'teacher' | 'parent';
  welcome_email_sent_at?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface ParentLink {
  id: string;
  student_id: string;
  parent_id: string | null;
  invite_code: string | null;
  status: 'pending' | 'active' | 'revoked';
  link_source: 'student' | 'teacher' | 'parent';
  created_by: string | null;
  revocation_requested_at: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface Teacher {
  id: string;
  user_id: string;
  school_name?: string;
  department?: string;
  qualification_level?: string;
  school_id?: string;
  is_school_admin?: boolean;
  verification_status: 'pending' | 'approved' | 'rejected';
  created_at?: string;
  updated_at?: string;
}

export interface School {
  id: string;
  name: string;
  status: 'pending' | 'approved' | 'rejected';
  created_by?: string;
  created_at?: string;
  updated_at?: string;
}

export interface Class {
  id: string;
  teacher_id: string;
  name: string;
  description?: string;
  specification_id?: string;
  academic_year?: string;
  invite_code: string;
  status: 'active' | 'archived';
  created_at?: string;
  updated_at?: string;
}

export interface ClassStudent {
  id: string;
  class_id: string;
  student_id: string;
  joined_at?: string;
  status: 'active' | 'inactive';
}

export type AssignmentType = 'mock' | 'practice' | 'flashcard';

export interface Assignment {
  id: string;
  class_id: string;
  teacher_id: string;
  title: string;
  description?: string;
  topic_id?: string;
  subtopic_id?: string;
  learning_objective_id?: string;
  assignment_type: AssignmentType;
  due_date?: string;
  questions_payload?: unknown[];
  source_material?: string;
  created_at?: string;
}

export interface AssignmentAttempt {
  id: string;
  assignment_id: string;
  student_id: string;
  started_at?: string;
  completed_at?: string;
  answers_payload?: unknown[];
  score?: number;
  percentage?: number;
  predicted_grade?: string;
  ai_feedback?: unknown;
  status: 'not_started' | 'in_progress' | 'completed';
}

export interface GeneratedPodcast {
  id: string;
  user_id: string;
  subject: string;
  topic: string;
  subtopic?: string;
  length: 'short' | 'medium' | 'long';
  voice: string;
  script_content: string;
  audio_url: string;
  character_count: number;
  created_at: string;
}

export interface FlashcardDeck {
  id: string;
  user_id: string;
  name: string;
  description?: string;
  // subject field removed; include keywords in the deck name
  difficulty_level?: string;
  card_count: number;
  is_public?: boolean;
  ai_generated?: boolean;
  // exam fields removed; users should encode relevant info in the deck name
  ai_prompt?: string;
  created_at?: string;
  updated_at?: string;
}

export interface Flashcard {
  id: string;
  deck_id: string;
  front: string;
  back: string;
  ai_generated?: boolean;
  /** Curriculum subtopic. Set at AI generation time; null for manual cards. */
  subtopic_id?: string | null;
  difficulty_rating?: number;
  times_studied?: number;
  times_correct?: number;
  last_studied_at?: string;
  ease_factor?: number;
  interval_days?: number;
  next_review_date?: string;
  repetition_count?: number;
  consecutive_correct?: number;
  created_at?: string;
  updated_at?: string;
}

export interface FlashcardTag {
  id: string;
  deck_id: string;
  name: string;
  color?: string;
  created_at?: string;
}

export interface FlashcardTagMapping {
  flashcard_id: string;
  tag_id: string;
  created_at?: string;
}

export interface StudySession {
  id: string;
  user_id: string;
  deck_id: string;
  started_at?: string;
  ended_at?: string;
  duration_minutes?: number;
  cards_studied?: number;
  cards_correct?: number;
  score_percentage?: number;
  difficulty_level?: string;
  ai_recommendations?: string;
  created_at?: string;
}

export interface ExamPracticeAttempt {
  id: string;
  user_id: string;
  subject: string;
  exam_board: string;
  exam_type: 'gcse' | 'a-level' | string;
  topic: string;
  total_marks_awarded: number;
  total_available_marks: number;
  percentage: number;
  predicted_grade: string;
  weakness_tags: string[];
  weakness_analysis: string[];
  questions_payload?: unknown[];
  answers_payload?: string[];
  marking_report?: unknown;
  created_at?: string;
}

// Interactive chart-plotting question types (shared between generate-questions,
// mark-answers, and the ai-questions client page)

export type PlotChartType =
  | 'pie'
  | 'bar'
  | 'line'
  | 'scatter'
  | 'histogram'
  | 'frequencyPolygon'
  | 'stemLeaf'
  | 'boxPlot';

export interface PlotCategoryValue {
  label: string;
  value: number;
}

export interface PlotPieData {
  categories: PlotCategoryValue[];
  correctAngles: number[]; // parallel to categories, degrees, sums to 360
}

export interface PlotBarData {
  categories: string[];
  correctValues: number[]; // parallel to categories
  yAxisLabel: string;
  yAxisMax: number;
  yAxisStep: number;
}

export interface PlotLineData {
  xLabel: string;
  yLabel: string;
  points: { x: number; y: number }[];
  correctYValues: number[]; // parallel to points
  yAxisMax: number;
  yAxisStep: number;
  requiresBestFit: boolean; // true for GCSE Science practical graphs (plot points, then fit a line/curve)
  fitShape: 'line' | 'curve' | 'none'; // 'none' when requiresBestFit is false
  fitDescription: string;
}

export interface PlotScatterData {
  xLabel: string;
  yLabel: string;
  givenPoints: { x: number; y: number }[];
  fitShape: 'line' | 'curve' | 'none';
  fitDescription: string;
  connectPoints: boolean; // true for cumulative frequency graphs
  xAxisMax: number;
  yAxisMax: number;
  // Axis intervals are derived from the point coordinates at generation time so every
  // correct point lands on a minor gridline (see deriveAxisFromValues). They are stored
  // rather than re-derived in the browser because the student-facing spec blanks the y
  // coordinates -- without the stored step, drag-snapping could not reach the answer.
  // Optional: specs generated before this field existed fall back to re-deriving.
  xAxisStep?: number;
  yAxisStep?: number;
}

export interface PlotHistogramBar {
  classStart: number;
  classEnd: number;
  frequency: number;
  correctFrequencyDensity: number; // frequency / (classEnd - classStart)
}

export interface PlotHistogramData {
  bars: PlotHistogramBar[];
  xLabel: string;
  yLabel: string;
}

export interface PlotFrequencyPolygonData {
  classStart: number[];
  classEnd: number[];
  frequency: number[]; // parallel arrays; correct point = ((start+end)/2, frequency)
  xLabel: string;
  yLabel: string;
}

export interface PlotStemLeafData {
  stemUnit: number;
  leafUnit: number;
  rawValues: number[];
  correctRows: { stem: number; leaves: number[] }[]; // leaves sorted ascending
  key: string; // e.g. "5 | 2 means 52"
}

export interface PlotBoxPlotData {
  axisLabel: string;
  axisMin: number;
  axisMax: number;
  correctValues: {
    min: number;
    lowerQuartile: number;
    median: number;
    upperQuartile: number;
    max: number;
  };
  rawDataOrDescription: string;
}

export interface PlotSpec {
  chartType: PlotChartType;
  pie: PlotPieData | null;
  bar: PlotBarData | null;
  line: PlotLineData | null;
  scatter: PlotScatterData | null;
  histogram: PlotHistogramData | null;
  frequencyPolygon: PlotFrequencyPolygonData | null;
  stemLeaf: PlotStemLeafData | null;
  boxPlot: PlotBoxPlotData | null;
}

export interface PlotSubmission {
  chartType: PlotChartType;
  pieAngles?: number[];
  barValues?: number[];
  barAxisChoice?: { max: number; step: number };
  lineYValues?: number[];
  lineFitShape?: 'line' | 'curve' | 'none';
  lineYAxisChoice?: { max: number; step: number };
  lineXAxisChoice?: { max: number; step: number };
  scatterPoints?: { x: number; y: number }[];
  scatterFitShape?: 'line' | 'curve' | 'none';
  histogramHeights?: number[];
  frequencyPolygonPoints?: { x: number; y: number }[];
  stemLeafRows?: { stem: number; leaves: number[] }[];
  boxPlotValues?: {
    min: number;
    lowerQuartile: number;
    median: number;
    upperQuartile: number;
    max: number;
  };
}

// Interactive "complete the unfinished diagram" question types (shared between
// generate-questions, mark-answers, and the ai-questions client page). Structural
// diagrams are node+arrow graphs (cycles, food webs, energy chains); pictorial
// diagrams add an AI-drawn base image built from a whitelist of safe SVG primitives.
// All coordinates live in a normalized 0..100 space (both x and y).

export type DiagramKind = 'structural' | 'pictorial' | 'template';

export type DiagramPrimitiveKind =
  | 'path'
  | 'line'
  | 'circle'
  | 'ellipse'
  | 'rect'
  | 'polygon'
  | 'polyline'
  | 'text';

// A single validated drawing element. Only the fields relevant to `kind` are used;
// the rest carry safe defaults. No raw SVG markup is ever accepted — we render our
// own React elements from these validated numeric/string props.
export interface DiagramPrimitive {
  kind: DiagramPrimitiveKind;
  d: string; // path only: validated against a path-grammar whitelist
  points: number[]; // polygon/polyline only: [x1, y1, x2, y2, ...]
  cx: number;
  cy: number;
  r: number;
  rx: number;
  ry: number;
  x: number;
  y: number;
  width: number;
  height: number;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  text: string; // text only
  fontSize: number;
  stroke: string; // validated: #hex or named-palette
  fill: string; // validated: #hex, named-palette, or 'none'
  strokeWidth: number;
}

export type DiagramNodeRole = 'label' | 'anchor';

export interface DiagramNode {
  id: string;
  x: number; // box centre / callout anchor, 0..100
  y: number;
  correctLabel: string;
  acceptableLabels: string[]; // additional answers marked correct (synonyms / alternative spellings,
                              // e.g. "plasma membrane" for "Cell membrane"); [] when none. Matching is
                              // case/punctuation-insensitive, so only genuine alternatives belong here.
  given: boolean; // given=false → blank the student must fill
  role: DiagramNodeRole; // 'anchor' = unlabelled connection endpoint (e.g. a ray-diagram kink
                         // point); never label-editable and never a blank-label gradeable feature.
}

export interface DiagramConnection {
  from: string; // node id
  to: string; // node id
  directed: boolean;
  label: string; // optional edge label ('' when none)
  given: boolean; // given=false → student must draw this connection
  style: 'solid' | 'dashed'; // 'dashed' for e.g. virtual-image ray construction lines
}

// A single symbol-placement slot: the student picks one option from a small fixed palette
// (see DIAGRAM_SYMBOL_PALETTES) instead of typing a free-text label. Used for dot-and-cross
// electron placement, image-property choices (real/virtual etc.), and similar discrete-choice
// diagram completions that a label/word-bank box can't express.
export interface DiagramSlot {
  id: string;
  x: number;
  y: number;
  paletteId: string; // key into DIAGRAM_SYMBOL_PALETTES
  correctOption: string; // must be one of that palette's option ids
  given: boolean; // given=false → blank the student must fill
  description: string; // '' when unused; human text for marking feedback only, not grading
  group: string; // '' = graded on its own; slots sharing a non-empty group are graded as an
                 // order-independent SET (only the multiset of symbols matters, not which slot got
                 // which) — e.g. the dot and cross of a bonding pair are interchangeable.
}

export interface DiagramSpec {
  kind: DiagramKind;
  title: string;
  primitives: DiagramPrimitive[]; // [] for structural diagrams
  nodes: DiagramNode[];
  connections: DiagramConnection[];
  slots: DiagramSlot[]; // [] when unused
  labelBank: string[]; // labels for blank nodes (correct labels + optional distractors)
}

export interface DiagramSubmission {
  labels: { nodeId: string; label: string }[]; // student's placed labels for blank nodes
  connections: { from: string; to: string }[]; // student-drawn connections
  slots: { slotId: string; optionId: string }[]; // student's placed symbols for blank slots
}

// A generic key/value parameter bag the AI uses to select and configure a hand-authored
// diagram template (see src/lib/diagrams/) instead of freehand-emitting DiagramSpec geometry.
// Deliberately NOT a per-template named-field shape: OpenAI structured-output strict mode
// forbids oneOf/conditional schemas, so one flat KV-bag is shared by every template and each
// template's own parseParams() interprets it — adding a new template never touches this shared
// schema or type.
export interface DiagramTemplateParamKV<T> {
  key: string;
  value: T;
}

export interface DiagramTemplateListParam {
  key: string;
  values: string[];
}

export interface DiagramTemplateSelection {
  templateId: string; // '' when not using a template (freehand diagramSpec is used instead)
  stringParams: DiagramTemplateParamKV<string>[];
  numberParams: DiagramTemplateParamKV<number>[];
  listParams: DiagramTemplateListParam[]; // e.g. blankPartIds, blankSlotIds
}

// ── Printed papers ──────────────────────────────────────────────────────────
// A paper the student prints, writes on by hand, photographs and uploads.
// PaperQuestion is the server-side row shape (it carries the answer key);
// StudentSafePaperQuestion is the only projection that may reach a browser.
// See src/lib/papers/studentSafePaper.ts.

export interface PaperQuestion {
  questionType: 'open' | 'mcq';
  question: string;
  marks: number;
  commandWord: string;
  isCalculation: boolean;
  options: string[];
  correctOption: '' | 'A' | 'B' | 'C' | 'D';
  markScheme: string[];
  modelAnswer: string;
  skillsAssessed: string[];
  sourceTitle: string;
  sourceUrl: string;
}

export interface StudentSafePaperQuestion {
  questionType: 'open' | 'mcq';
  question: string;
  marks: number;
  commandWord: string;
  isCalculation: boolean;
  options: string[];
  sourceTitle: string;
  sourceUrl: string;
}

export type PrintedPaperStatus = 'printed' | 'uploaded' | 'transcribed' | 'marked';

export interface PaperTranscriptEntry {
  questionIndex: number;
  text: string;
  /** 0-1. Below LOW_CONFIDENCE the review UI flags the entry for checking. */
  confidence: number;
}

export interface PrintedPaperPage {
  id: string;
  pageIndex: number;
  /** Short-lived signed URL: the `paper-scans` bucket is private. */
  signedUrl: string;
}

export interface StudentSafePaper {
  id: string;
  paperCode: string;
  subject: string;
  examBoard: string;
  examType: string;
  topic: string;
  specification: string;
  sourceMaterial: string;
  status: PrintedPaperStatus;
  attemptId: string | null;
  createdAt: string;
  questions: StudentSafePaperQuestion[];
  transcript: PaperTranscriptEntry[] | null;
  pages: PrintedPaperPage[];
}

export interface PaperSummary {
  id: string;
  paperCode: string;
  subject: string;
  topic: string;
  examBoard: string;
  examType: string;
  status: PrintedPaperStatus;
  questionCount: number;
  totalMarks: number;
  pageCount: number;
  createdAt: string;
}
