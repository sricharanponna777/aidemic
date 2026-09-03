/**
 * The qualification chain a class is taught against, as display parts:
 * qualification -> exam board -> subject -> tier.
 *
 * The specification's own name is deliberately left out: on UK specs it is just
 * board + qualification + subject again ("AQA GCSE Mathematics"), so showing it
 * repeats the three parts either side of it.
 *
 * Every level is nullable because PostgREST returns null for an embed the row
 * does not have -- a class with no `specification_id`, or a spec whose subject
 * was never seeded -- so a partial chain renders as the parts that do exist
 * rather than as gaps or stray separators.
 */
export type SpecificationChain = {
  tier: string | null;
  subjects: {
    name: string;
    exam_boards: { name: string; qualifications: { name: string } | null } | null;
  } | null;
} | null;

export function specChainParts(spec: SpecificationChain): string[] {
  const subject = spec?.subjects;
  const board = subject?.exam_boards;
  const parts: string[] = [];
  if (board?.qualifications) parts.push(board.qualifications.name);
  if (board) parts.push(board.name);
  if (subject) parts.push(subject.name);
  if (spec?.tier) parts.push(spec.tier);
  return parts;
}
