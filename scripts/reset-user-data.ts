/**
 * Reset one user's account back to a bare profile.
 *
 * Deletes everything the user has generated or accumulated -- attempts, mastery,
 * flashcards, study sessions, planner, podcasts, subject choices, class enrolment
 * -- while keeping their `user_profiles` row and their login. The seeded curriculum
 * tree (curricula -> qualifications -> exam_boards -> subjects -> specifications ->
 * topics -> subtopics -> learning_objectives) and the other shared reference tables
 * are never touched: they are set in stone and are not user data.
 *
 * DRY BY DEFAULT. Without --confirm it counts and prints, and deletes nothing.
 *
 *   bun --env-file=.env.local run scripts/reset-user-data.ts --email a@b.com
 *   bun --env-file=.env.local run scripts/reset-user-data.ts --email a@b.com --confirm
 *   bun --env-file=.env.local run scripts/reset-user-data.ts --user-id <uuid> --confirm
 *
 * Uses the service-role key, so it bypasses RLS. Point it at the right project.
 */

import { createClient } from '@supabase/supabase-js';

const args = process.argv.slice(2);
const flag = (name: string): string | undefined => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};

const CONFIRM = args.includes('--confirm');
const INCLUDE_TEACHER_DATA = args.includes('--include-teacher-data');
const email = flag('email');
const userId = flag('user-id');

if (!email && !userId) {
  console.error('Pass --email <address> or --user-id <uuid>.');
  process.exit(1);
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.');
  process.exit(1);
}

const admin = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });

/**
 * Every table holding data owned by one user, with the column naming them.
 *
 * Only *parents* are listed. Children reach the same fate through ON DELETE
 * CASCADE and listing them separately would double-count: flashcards, tags and
 * tag mappings go with flashcard_decks; study_session_results with study_sessions;
 * study_plan_items and study_plan_progress with academic_terms; mock_test_questions
 * with mock_tests; mock_test_answers with mock_test_attempts.
 *
 * `legacy: true` marks tables defined in queries.sql rather than in
 * supabase/migrations/. A database built only from the migrations will not have
 * them, so a "table not found" there is expected and reported as a skip.
 */
const USER_DATA: Array<{ table: string; column: string; legacy?: boolean; note?: string }> = [
  // Practice, assessment and marking history
  { table: 'exam_practice_attempts', column: 'user_id' },
  { table: 'printed_papers', column: 'user_id', note: 'cascades to printed_paper_pages; the scans themselves are removed below' },
  { table: 'assignment_attempts', column: 'student_id' },
  { table: 'mock_test_attempts', column: 'user_id', note: 'cascades to mock_test_answers' },
  { table: 'mock_tests', column: 'user_id', note: 'only their own; system tests have user_id NULL' },

  // The Learning Spine
  { table: 'mastery_events', column: 'user_id' },
  { table: 'student_subtopic_mastery', column: 'user_id' },
  { table: 'review_queue_items', column: 'user_id' },
  { table: 'topic_confidence', column: 'user_id' },
  { table: 'topic_performance', column: 'user_id' },
  { table: 'student_analytics', column: 'user_id' },

  // Study material the user created
  { table: 'flashcard_decks', column: 'user_id', legacy: true, note: 'cascades to flashcards, tags, mappings' },
  { table: 'study_sessions', column: 'user_id', legacy: true, note: 'cascades to study_session_results' },
  { table: 'user_statistics', column: 'user_id', legacy: true },
  { table: 'generated_podcasts', column: 'user_id' },
  { table: 'generated_videos', column: 'user_id', legacy: true },

  // Planner and goals
  { table: 'academic_terms', column: 'user_id', note: 'cascades to study_plan_items -> study_plan_progress' },
  { table: 'study_goals', column: 'user_id' },

  // Subject choices -- both the current table and the one it superseded
  { table: 'student_subjects', column: 'user_id' },
  { table: 'user_subjects', column: 'user_id', legacy: true },

  // Membership and relationships
  { table: 'class_students', column: 'student_id', note: 'removes them from every class roster' },
  { table: 'parent_links', column: 'student_id', note: 'links where they are the child' },
  { table: 'parent_links', column: 'parent_id', note: 'links where they are the parent' },

  // Usage counters
  { table: 'ai_request_counters', column: 'user_id', note: 'resets their AI daily quota' },
];

/**
 * Deliberately untouched.
 *
 * The curriculum tree and the reference tables are shared, seeded data keyed on
 * deterministic UUIDv5 ids -- deleting a row here would break it for every user,
 * not just this one. `questions` and `misconceptions` look user-ish but carry no
 * user column at all: they are a shared question bank and a seeded misconception
 * taxonomy whose stable `code` values prompts and eval fixtures reference.
 */
const NEVER_TOUCH = [
  'curricula', 'qualifications', 'exam_boards', 'subjects', 'specifications',
  'topics', 'subtopics', 'learning_objectives', 'subtopic_prerequisites',
  'questions', 'misconceptions', 'app_config', 'schools',
  'user_profiles', 'platform_admins',
];

const isMissingTable = (error: { code?: string; message?: string } | null) =>
  error?.code === '42P01' || error?.code === 'PGRST205' || /Could not find the table/i.test(error?.message ?? '');

async function resolveUser(): Promise<{ id: string; email: string; role: string | null; name: string | null }> {
  if (userId) {
    const { data, error } = await admin
      .from('user_profiles')
      .select('id, email, role, full_name')
      .eq('id', userId)
      .maybeSingle();
    if (error) throw new Error(`Looking up ${userId}: ${error.message}`);
    if (!data) throw new Error(`No user_profiles row for ${userId}.`);
    return { id: data.id, email: data.email, role: data.role ?? null, name: data.full_name ?? null };
  }

  const { data, error } = await admin
    .from('user_profiles')
    .select('id, email, role, full_name')
    .ilike('email', email!)
    .maybeSingle();
  if (error) throw new Error(`Looking up ${email}: ${error.message}`);
  if (!data) throw new Error(`No user found with email ${email}.`);
  return { id: data.id, email: data.email, role: data.role ?? null, name: data.full_name ?? null };
}

/**
 * A teacher's classes and assignments are not their own history -- their students'
 * work hangs off them. Deleting the `teachers` row cascades into classes ->
 * assignments -> assignment_attempts, destroying data belonging to people who were
 * never the target of this reset. So it is refused unless asked for explicitly.
 */
async function checkTeacherOwnership(id: string): Promise<{ blocked: boolean; classCount: number }> {
  const { data: teacher, error } = await admin.from('teachers').select('id').eq('user_id', id).maybeSingle();
  if (error && !isMissingTable(error)) throw new Error(`Checking teacher record: ${error.message}`);
  if (!teacher) return { blocked: false, classCount: 0 };

  const { count } = await admin
    .from('classes')
    .select('*', { count: 'exact', head: true })
    .eq('teacher_id', teacher.id);

  return { blocked: (count ?? 0) > 0 && !INCLUDE_TEACHER_DATA, classCount: count ?? 0 };
}

async function main() {
  const user = await resolveUser();

  console.log('');
  console.log(`  Target : ${user.email}`);
  console.log(`  User id: ${user.id}`);
  console.log(`  Role   : ${user.role ?? '(none)'}${user.name ? `   Name: ${user.name}` : ''}`);
  console.log(`  Mode   : ${CONFIRM ? 'DELETE (--confirm given)' : 'DRY RUN -- nothing will be deleted'}`);
  console.log('');

  const teacher = await checkTeacherOwnership(user.id);
  if (teacher.blocked) {
    console.error(`  REFUSING: this user is a teacher who owns ${teacher.classCount} class(es).`);
    console.error('');
    console.error('  Deleting their teacher record cascades into classes -> assignments ->');
    console.error('  assignment_attempts, which would destroy the work of every student in');
    console.error('  those classes. That is not this user\'s history to clear.');
    console.error('');
    console.error('  Reassign or archive the classes first, or pass --include-teacher-data');
    console.error('  if you genuinely intend to delete their students\' submissions too.');
    process.exit(1);
  }
  if (teacher.classCount > 0) {
    console.log(`  WARNING: --include-teacher-data is set and this user owns ${teacher.classCount} class(es).`);
    console.log('  Their students\' assignment attempts will be deleted along with them.');
    console.log('');
  }

  let total = 0;
  const skipped: string[] = [];

  for (const entry of USER_DATA) {
    const label = `${entry.table}.${entry.column}`;

    const { count, error: countError } = await admin
      .from(entry.table)
      .select('*', { count: 'exact', head: true })
      .eq(entry.column, user.id);

    if (countError) {
      if (isMissingTable(countError)) {
        skipped.push(`${entry.table} (not in this database${entry.legacy ? ', legacy table' : ''})`);
        continue;
      }
      throw new Error(`Counting ${label}: ${countError.message}`);
    }

    const rows = count ?? 0;
    total += rows;

    if (rows === 0) continue;

    if (CONFIRM) {
      const { error: deleteError } = await admin.from(entry.table).delete().eq(entry.column, user.id);
      if (deleteError) throw new Error(`Deleting from ${label}: ${deleteError.message}`);
    }

    const suffix = entry.note ? `  -- ${entry.note}` : '';
    console.log(`  ${CONFIRM ? 'deleted' : '  would delete'} ${String(rows).padStart(6)}  ${label}${suffix}`);
  }

  // Storage objects are not reached by any row cascade, so the photographed
  // handwriting has to be removed on its own. Everything under the user's own
  // folder is theirs by construction (the bucket policies enforce the prefix).
  const { data: scanPaperFolders, error: scanListError } = await admin.storage
    .from('paper-scans')
    .list(user.id, { limit: 1000 });

  if (scanListError) {
    skipped.push(`paper-scans storage (${scanListError.message})`);
  } else if ((scanPaperFolders ?? []).length > 0) {
    const paths: string[] = [];
    for (const folder of scanPaperFolders ?? []) {
      const { data: files } = await admin.storage.from('paper-scans').list(`${user.id}/${folder.name}`, { limit: 1000 });
      for (const file of files ?? []) paths.push(`${user.id}/${folder.name}/${file.name}`);
    }

    if (paths.length > 0) {
      if (CONFIRM) {
        const { error: removeError } = await admin.storage.from('paper-scans').remove(paths);
        if (removeError) throw new Error(`Deleting paper scans: ${removeError.message}`);
      }
      console.log(`  ${CONFIRM ? 'deleted' : '  would delete'} ${String(paths.length).padStart(6)}  paper-scans/${user.id}/`);
    }
  }

  if (INCLUDE_TEACHER_DATA) {
    const { error } = CONFIRM
      ? await admin.from('teachers').delete().eq('user_id', user.id)
      : { error: null };
    if (error) throw new Error(`Deleting teacher record: ${error.message}`);
    console.log(`  ${CONFIRM ? 'deleted' : '  would delete'}         teachers.user_id  -- cascades to classes and assignments`);
  }

  console.log('');
  if (skipped.length) {
    console.log('  Skipped (table absent):');
    for (const s of skipped) console.log(`    - ${s}`);
    console.log('');
  }

  console.log(`  ${CONFIRM ? 'Deleted' : 'Would delete'} ${total} row(s).`);
  console.log(`  Kept: user_profiles, auth login, and the seeded curriculum + reference tables`);
  console.log(`        (${NEVER_TOUCH.join(', ')}).`);
  if (!CONFIRM) console.log('');
  if (!CONFIRM) console.log('  Re-run with --confirm to apply.');
  console.log('');
}

main().catch((err) => {
  console.error(`\n  Failed: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});
