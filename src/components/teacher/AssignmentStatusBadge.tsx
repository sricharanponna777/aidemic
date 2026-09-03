/** Draft assignments are invisible to students until published, so every teacher
 *  list that mixes the two has to say which is which. */
export function AssignmentStatusBadge({ status }: { status: 'draft' | 'published' }) {
  if (status !== 'draft') return null;
  return (
    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-700 dark:bg-amber-500/15 dark:text-amber-300">
      Draft
    </span>
  );
}
