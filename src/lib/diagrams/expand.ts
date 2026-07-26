import type { DiagramSpec, DiagramTemplateSelection } from '@/types';
import { getDiagramTemplate } from './registry';

const listParam = (selection: DiagramTemplateSelection, key: string): Set<string> =>
  new Set(selection.listParams.find((p) => p.key === key)?.values ?? []);

/** The template trust boundary: takes an AI (or replayed client-submitted) DiagramTemplateSelection
 * and deterministically expands it into a concrete DiagramSpec, or null if the selection doesn't
 * resolve to anything answerable. The AI is never trusted with raw geometry here — only a
 * templateId plus a validated parameter bag; every coordinate/symbol in the result comes from the
 * template's own `build()`, not from AI input. Mirrors normalizeDiagramSpec's "return null ->
 * caller downgrades to 'open'" convention. */
export function expandDiagramTemplate(selection: DiagramTemplateSelection): DiagramSpec | null {
  if (!selection || typeof selection.templateId !== 'string' || !selection.templateId) return null;
  const template = getDiagramTemplate(selection.templateId);
  if (!template) return null;

  const params = template.parseParams(selection);
  if (!params) return null;

  const result = template.build(params);

  const blankPartIdsRequested = listParam(selection, 'blankPartIds');
  const blankSlotIdsRequested = listParam(selection, 'blankSlotIds');
  const blankConnectionIdsRequested = listParam(selection, 'blankConnectionIds');

  const matchedPartIds = template.blankablePartIds.filter((id) => blankPartIdsRequested.has(id));
  const matchedSlotIds = template.blankableSlotIds.filter((id) => blankSlotIdsRequested.has(id));
  const matchedConnectionKeys = template.blankableConnectionKeys.filter((key) => blankConnectionIdsRequested.has(key));

  // The AI can request specific ids, but per-instance generated ids (e.g. one slot per electron)
  // are effectively unguessable — it will often invent plausible-but-wrong ids. Rather than fail
  // closed into a useless downgraded-to-'open' question whenever that happens, treat "none of the
  // requested ids for this kind matched anything real" as "blank everything of that kind" — a
  // full "complete the whole diagram" question is itself a perfectly normal exam-question shape,
  // and a partial match (some ids DID resolve) is still respected as the AI's specific choice.
  const finalPartIds = new Set(matchedPartIds.length > 0 ? matchedPartIds : template.blankablePartIds);
  const finalSlotIds = new Set(matchedSlotIds.length > 0 ? matchedSlotIds : template.blankableSlotIds);
  const finalConnectionKeys = new Set(matchedConnectionKeys.length > 0 ? matchedConnectionKeys : template.blankableConnectionKeys);

  const nodes = result.nodes.map((node) => (finalPartIds.has(node.id) ? { ...node, given: false } : node));
  const slots = result.slots.map((slot) => (finalSlotIds.has(slot.id) ? { ...slot, given: false } : slot));
  const connections = result.connections.map((connection) => {
    const key = `${connection.from}->${connection.to}`;
    return finalConnectionKeys.has(key) ? { ...connection, given: false } : connection;
  });

  const hasBlank = nodes.some((n) => !n.given) || slots.some((s) => !s.given) || connections.some((c) => !c.given);
  if (!hasBlank) return null;

  // Every blank label node's correct answer must be offered in the word bank (mirrors
  // normalizeDiagramSpec's freehand convention) — templates build with everything given=true and
  // don't know ahead of time which nodes end up blank, so the bank is assembled here instead.
  const bank: string[] = [];
  const seenBank = new Set<string>();
  const pushBank = (label: string) => {
    const key = label.toLowerCase();
    if (!label || seenBank.has(key) || bank.length >= 24) return;
    seenBank.add(key);
    bank.push(label);
  };
  nodes.filter((n) => !n.given && n.role === 'label').forEach((n) => pushBank(n.correctLabel));
  result.labelBank.forEach(pushBank);

  return {
    kind: 'template',
    title: result.title,
    primitives: result.primitives,
    nodes,
    connections,
    slots,
    labelBank: bank,
  };
}
