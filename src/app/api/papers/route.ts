import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { createAdminClient } from '@/lib/supabase-admin';
import { coercePaperQuestions } from '@/lib/papers/paperQuestions';
import { generatePaperCode } from '@/lib/papers/paperCode';
import { totalPaperMarks } from '@/lib/papers/studentSafePaper';
import { txt } from '@/lib/ai/text';
import type { PaperQuestion, PaperSummary, PrintedPaperStatus } from '@/types';

/**
 * Create and list printed papers.
 *
 * Every read and write here goes through the service-role client: printed_papers
 * has RLS on and no policies at all, because questions_payload carries the
 * answer key (see the migration's SECURITY note). Ownership is therefore checked
 * in code, against the session user, on every path.
 */

const MAX_SOURCE_MATERIAL = 12000;

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: authData, error: authError } = await supabase.auth.getUser();
    if (authError || !authData.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = (await request.json()) as Record<string, unknown>;
    const questions = coercePaperQuestions(body.questions);
    if (questions.length === 0) {
      return NextResponse.json({ error: 'A paper needs at least one written or multiple-choice question.' }, { status: 400 });
    }

    const subject = typeof body.subject === 'string' ? txt(body.subject, 120) : '';
    if (!subject) return NextResponse.json({ error: 'subject is required.' }, { status: 400 });

    const row = {
      user_id: authData.user.id,
      paper_code: generatePaperCode(),
      subject,
      exam_board: typeof body.examBoard === 'string' ? txt(body.examBoard, 60) : '',
      exam_type: typeof body.examType === 'string' ? txt(body.examType, 60) : '',
      topic: typeof body.topic === 'string' ? txt(body.topic, 300) || 'General revision' : 'General revision',
      specification: typeof body.specification === 'string' ? txt(body.specification, 300) : null,
      source_material: typeof body.sourceMaterial === 'string' ? txt(body.sourceMaterial, MAX_SOURCE_MATERIAL) || null : null,
      questions_payload: questions,
      status: 'printed' as PrintedPaperStatus,
    };

    const admin = createAdminClient();
    let inserted = await admin.from('printed_papers').insert(row).select('id, paper_code').maybeSingle();

    // 23505 is a unique violation, which here can only be the paper code.
    if (inserted.error?.code === '23505') {
      inserted = await admin
        .from('printed_papers')
        .insert({ ...row, paper_code: generatePaperCode() })
        .select('id, paper_code')
        .maybeSingle();
    }

    if (inserted.error || !inserted.data) {
      console.error('[papers] create failed', inserted.error);
      return NextResponse.json({ error: 'Could not create the paper.' }, { status: 500 });
    }

    return NextResponse.json({ paperId: inserted.data.id, paperCode: inserted.data.paper_code });
  } catch (err) {
    console.error('[papers] create failed', err);
    return NextResponse.json({ error: 'Could not create the paper.' }, { status: 500 });
  }
}

/** Papers that have not been marked yet -- the "waiting for you" tray. */
export async function GET() {
  try {
    const supabase = await createClient();
    const { data: authData, error: authError } = await supabase.auth.getUser();
    if (authError || !authData.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const admin = createAdminClient();
    const { data, error } = await admin
      .from('printed_papers')
      .select('id, paper_code, subject, topic, exam_board, exam_type, status, questions_payload, created_at, printed_paper_pages(id)')
      .eq('user_id', authData.user.id)
      .neq('status', 'marked')
      .order('created_at', { ascending: false })
      .limit(20);

    if (error) {
      console.error('[papers] list failed', error);
      return NextResponse.json({ error: 'Could not load your papers.' }, { status: 500 });
    }

    const papers: PaperSummary[] = (data ?? []).map((paper) => {
      const questions = (paper.questions_payload ?? []) as PaperQuestion[];
      return {
        id: paper.id as string,
        paperCode: paper.paper_code as string,
        subject: paper.subject as string,
        topic: paper.topic as string,
        examBoard: paper.exam_board as string,
        examType: paper.exam_type as string,
        status: paper.status as PrintedPaperStatus,
        questionCount: questions.length,
        totalMarks: totalPaperMarks(questions),
        pageCount: Array.isArray(paper.printed_paper_pages) ? paper.printed_paper_pages.length : 0,
        createdAt: paper.created_at as string,
      };
    });

    return NextResponse.json({ papers });
  } catch (err) {
    console.error('[papers] list failed', err);
    return NextResponse.json({ error: 'Could not load your papers.' }, { status: 500 });
  }
}
