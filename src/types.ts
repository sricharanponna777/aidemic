// Shared TypeScript interfaces reflecting database schema

export interface UserProfile {
  id: string; // same as auth.users.id
  email: string;
  full_name?: string;
  bio?: string;
  avatar_url?: string;
  preferred_study_time?: string;
  daily_study_goal_minutes?: number;
  theme?: 'light' | 'dark';
  notifications_enabled?: boolean;
  created_at?: string;
  updated_at?: string;
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
