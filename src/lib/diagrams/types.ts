import type { DiagramConnection, DiagramNode, DiagramPrimitive, DiagramSlot, DiagramTemplateSelection } from '@/types';

export type DiagramTemplateCategory =
  | 'bonding'
  | 'atomic-structure'
  | 'cell'
  | 'organ'
  | 'apparatus'
  | 'ray-optics'
  | 'circuit'
  | 'wave';

export interface DiagramTemplateBuildResult {
  title: string;
  primitives: DiagramPrimitive[];
  nodes: DiagramNode[];
  connections: DiagramConnection[];
  slots: DiagramSlot[];
  labelBank: string[];
}

/** A hand-authored diagram template: the AI selects `id` and a validated parameter bag
 * (DiagramTemplateSelection) instead of freehand-emitting geometry. `parseParams` whitelists
 * and coerces every parameter; `build` is a pure, deterministic function from those params to
 * concrete diagram geometry — this is what guarantees exam-accurate artwork regardless of the
 * AI's spatial reasoning. */
export interface DiagramTemplateDefinition<TParams> {
  id: string;
  category: DiagramTemplateCategory;
  promptBlurb: string; // one-line description injected into the AI prompt's template catalog
  paramDocs: string; // human-readable parameter whitelist, kept next to parseParams so they can't drift
  blankablePartIds: string[]; // node ids that may be blanked (given=false) via listParams['blankPartIds']
  blankableSlotIds: string[]; // slot ids that may be blanked via listParams['blankSlotIds']
  blankableConnectionKeys: string[]; // `${from}->${to}` keys that may be blanked via listParams['blankConnectionIds']
  parseParams(selection: DiagramTemplateSelection): TParams | null;
  /** Must return every node/connection/slot as given=true (fully worked example) — expandDiagramTemplate
   * flips the AI-selected subset to given=false via blankable*Ids, so build() never needs to know
   * which parts are being asked of the student. */
  build(params: TParams): DiagramTemplateBuildResult;
}
