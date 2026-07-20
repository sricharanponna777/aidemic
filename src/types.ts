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
  created_at?: string;
  updated_at?: string;
}

export interface ParentLink {
  id: string;
  student_id: string;
  parent_id: string | null;
  invite_code: string;
  status: 'pending' | 'active' | 'revoked';
  link_source: 'student' | 'teacher';
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

export interface StudySessionResult {
  id: string;
  user_id: string;
  session_id: string;
  flashcard_id: string;
  was_correct: boolean;
  time_to_answer_seconds?: number;
  confidence_level?: number;
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

export interface UserStatistics {
  id: string;
  user_id: string;
  total_study_minutes?: number;
  total_sessions?: number;
  total_cards_studied?: number;
  average_score?: number;
  current_streak_days?: number;
  longest_streak_days?: number;
  last_study_date?: string;
  created_at?: string;
  updated_at?: string;
}

export interface StudyGoal {
  id: string;
  user_id: string;
  deck_id: string;
  goal_type: string;
  target_value: number;
  current_progress?: number;
  deadline?: string;
  is_completed?: boolean;
  created_at?: string;
  completed_at?: string;
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
