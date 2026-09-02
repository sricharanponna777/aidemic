import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { createAdminClient } from '@/lib/supabase-admin';
import { loadOwnedPaper } from '@/lib/papers/loadPaper';
import { MAX_PAPER_PAGES, PAPER_SCANS_BUCKET } from '@/lib/papers/constants';

/**
 * Register or remove one uploaded page of a printed paper.
 *
 * The image itself never passes through here -- the browser uploads it straight
 * to the private `paper-scans` bucket, because a dozen phone photographs would
 * not survive a serverless request body limit. This route records the resulting
 * object path, which is what makes the page visible to transcription.
 *
 * The client therefore controls the path, so it is validated against the
 * expected `<user_id>/<paper_id>/…` prefix here rather than trusted. The bucket
 * policies stop a student writing outside their own folder; this stops them
 * attaching one of their own objects from an unrelated paper.
 */
export async function POST(request: Request, { params }: { params: Promise<{ paperId: string }> }) {
  const { paperId } = await params;

  try {
    const supabase = await createClient();
    const { data: authData, error: authError } = await supabase.auth.getUser();
    if (authError || !authData.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = (await request.json()) as { storagePath?: unknown; pageIndex?: unknown };
    const storagePath = typeof body.storagePath === 'string' ? body.storagePath.trim() : '';
    const rawIndex = typeof body.pageIndex === 'number' ? body.pageIndex : Number(body.pageIndex);
    const pageIndex = Number.isFinite(rawIndex) ? Math.trunc(rawIndex) : -1;

    if (pageIndex < 0 || pageIndex >= MAX_PAPER_PAGES) {
      return NextResponse.json({ error: `A paper can hold at most ${MAX_PAPER_PAGES} pages.` }, { status: 400 });
    }
    if (storagePath !== `${authData.user.id}/${paperId}/${pageIndex}.jpg`) {
      return NextResponse.json({ error: 'Invalid storage path.' }, { status: 400 });
    }

    const admin = createAdminClient();
    const paper = await loadOwnedPaper(admin, paperId, authData.user.id);
    if (!paper) return NextResponse.json({ error: 'Paper not found.' }, { status: 404 });
    if (paper.status === 'marked') {
      return NextResponse.json({ error: 'This paper has already been marked.' }, { status: 409 });
    }

    // Re-photographing a page overwrites it, so key on (paper, index).
    const { error: upsertError } = await admin
      .from('printed_paper_pages')
      .upsert({ paper_id: paperId, page_index: pageIndex, storage_path: storagePath }, { onConflict: 'paper_id,page_index' });

    if (upsertError) {
      console.error('[papers] page register failed', upsertError);
      return NextResponse.json({ error: 'Could not attach the page.' }, { status: 500 });
    }

    // A new page invalidates any transcript taken before it existed.
    const { error: statusError } = await admin
      .from('printed_papers')
      .update({ status: 'uploaded', transcript_payload: null, updated_at: new Date().toISOString() })
      .eq('id', paperId);

    if (statusError) console.error('[papers] status update failed', statusError);

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[papers] page register failed', err);
    return NextResponse.json({ error: 'Could not attach the page.' }, { status: 500 });
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ paperId: string }> }) {
  const { paperId } = await params;

  try {
    const supabase = await createClient();
    const { data: authData, error: authError } = await supabase.auth.getUser();
    if (authError || !authData.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const pageId = new URL(request.url).searchParams.get('pageId') ?? '';
    if (!pageId) return NextResponse.json({ error: 'pageId is required.' }, { status: 400 });

    const admin = createAdminClient();
    const paper = await loadOwnedPaper(admin, paperId, authData.user.id);
    if (!paper) return NextResponse.json({ error: 'Paper not found.' }, { status: 404 });

    const page = (paper.printed_paper_pages ?? []).find((item) => item.id === pageId);
    if (!page) return NextResponse.json({ error: 'Page not found.' }, { status: 404 });

    const { error: removeError } = await admin.storage.from(PAPER_SCANS_BUCKET).remove([page.storage_path]);
    if (removeError) console.error('[papers] scan cleanup failed', removeError);

    const { error } = await admin.from('printed_paper_pages').delete().eq('id', pageId);
    if (error) {
      console.error('[papers] page delete failed', error);
      return NextResponse.json({ error: 'Could not remove the page.' }, { status: 500 });
    }

    const remaining = (paper.printed_paper_pages ?? []).length - 1;
    await admin
      .from('printed_papers')
      .update({
        status: remaining > 0 ? 'uploaded' : 'printed',
        transcript_payload: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', paperId);

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[papers] page delete failed', err);
    return NextResponse.json({ error: 'Could not remove the page.' }, { status: 500 });
  }
}
