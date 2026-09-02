import type { SupabaseClient } from '@supabase/supabase-js';
import type { PrintedPaperStatus } from '@/types';

export interface PaperRow {
  id: string;
  user_id: string;
  paper_code: string;
  subject: string;
  exam_board: string;
  exam_type: string;
  topic: string;
  specification: string | null;
  source_material: string | null;
  questions_payload: unknown;
  transcript_payload: unknown;
  status: PrintedPaperStatus;
  attempt_id: string | null;
  created_at: string;
  printed_paper_pages: { id: string; page_index: number; storage_path: string }[] | null;
}

const PAPER_SELECT =
  'id, user_id, paper_code, subject, exam_board, exam_type, topic, specification, source_material, ' +
  'questions_payload, transcript_payload, status, attempt_id, created_at, ' +
  'printed_paper_pages(id, page_index, storage_path)';

/**
 * Load a paper, or null if it does not exist *or* belongs to someone else.
 *
 * printed_papers has RLS enabled with no policies, so every read runs through
 * the service role and ownership is entirely this function's job. Collapsing
 * "missing" and "not yours" into one null is deliberate: whether another
 * student's paper exists is not the caller's business.
 */
export async function loadOwnedPaper(
  admin: SupabaseClient,
  paperId: string,
  userId: string
): Promise<PaperRow | null> {
  if (!paperId) return null;

  const { data, error } = await admin
    .from('printed_papers')
    .select(PAPER_SELECT)
    .eq('id', paperId)
    .maybeSingle();

  if (error || !data) return null;
  const paper = data as unknown as PaperRow;
  return paper.user_id === userId ? paper : null;
}
