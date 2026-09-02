import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { createAdminClient } from '@/lib/supabase-admin';
import { toStudentSafePaperQuestions } from '@/lib/papers/studentSafePaper';
import { coerceTranscript } from '@/lib/papers/transcript';
import { loadOwnedPaper } from '@/lib/papers/loadPaper';
import { PAPER_SCANS_BUCKET, SIGNED_URL_TTL_SECONDS } from '@/lib/papers/constants';
import type { PaperQuestion, PrintedPaperPage, StudentSafePaper } from '@/types';

/**
 * Read or delete one printed paper.
 *
 * The response is the ONLY paper shape allowed to reach a browser: questions
 * pass through `toStudentSafePaperQuestions`, which drops the mark scheme,
 * model answer and correct option that `questions_payload` stores alongside
 * them. A student printing a paper must not be able to read its answers out of
 * the network tab.
 */
export async function GET(request: Request, { params }: { params: Promise<{ paperId: string }> }) {
  const { paperId } = await params;

  try {
    const supabase = await createClient();
    const { data: authData, error: authError } = await supabase.auth.getUser();
    if (authError || !authData.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const admin = createAdminClient();
    const paper = await loadOwnedPaper(admin, paperId, authData.user.id);
    if (!paper) return NextResponse.json({ error: 'Paper not found.' }, { status: 404 });

    const pageRows = [...(paper.printed_paper_pages ?? [])].sort((a, b) => a.page_index - b.page_index);
    const pages: PrintedPaperPage[] = [];

    if (pageRows.length > 0) {
      const { data: signed } = await admin.storage
        .from(PAPER_SCANS_BUCKET)
        .createSignedUrls(pageRows.map((page) => page.storage_path), SIGNED_URL_TTL_SECONDS);

      pageRows.forEach((page, index) => {
        pages.push({
          id: page.id,
          pageIndex: page.page_index,
          signedUrl: signed?.[index]?.signedUrl ?? '',
        });
      });
    }

    const safe: StudentSafePaper = {
      id: paper.id,
      paperCode: paper.paper_code,
      subject: paper.subject,
      examBoard: paper.exam_board,
      examType: paper.exam_type,
      topic: paper.topic,
      specification: paper.specification ?? '',
      sourceMaterial: paper.source_material ?? '',
      status: paper.status,
      attemptId: paper.attempt_id,
      createdAt: paper.created_at,
      questions: toStudentSafePaperQuestions((paper.questions_payload ?? []) as PaperQuestion[]),
      transcript: paper.transcript_payload ? coerceTranscript(paper.transcript_payload) : null,
      pages,
    };

    return NextResponse.json({ paper: safe });
  } catch (err) {
    console.error('[papers] read failed', err);
    return NextResponse.json({ error: 'Could not load the paper.' }, { status: 500 });
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ paperId: string }> }) {
  const { paperId } = await params;

  try {
    const supabase = await createClient();
    const { data: authData, error: authError } = await supabase.auth.getUser();
    if (authError || !authData.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const admin = createAdminClient();
    const paper = await loadOwnedPaper(admin, paperId, authData.user.id);
    if (!paper) return NextResponse.json({ error: 'Paper not found.' }, { status: 404 });

    // The row cascade reaches printed_paper_pages but not Storage, so the
    // uploaded images have to go first -- otherwise they are orphaned in a
    // private bucket with nothing left pointing at them.
    const paths = (paper.printed_paper_pages ?? []).map((page) => page.storage_path);
    if (paths.length > 0) {
      const { error: removeError } = await admin.storage.from(PAPER_SCANS_BUCKET).remove(paths);
      if (removeError) console.error('[papers] scan cleanup failed', removeError);
    }

    const { error } = await admin.from('printed_papers').delete().eq('id', paperId);
    if (error) {
      console.error('[papers] delete failed', error);
      return NextResponse.json({ error: 'Could not delete the paper.' }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[papers] delete failed', err);
    return NextResponse.json({ error: 'Could not delete the paper.' }, { status: 500 });
  }
}
