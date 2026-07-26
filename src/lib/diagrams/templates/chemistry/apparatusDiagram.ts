import type { DiagramNode, DiagramPrimitive } from '@/types';
import type { DiagramTemplateDefinition } from '../../types';
import { makeNode, makePrimitive } from '../../geometry';
import { enumParam } from '../../paramHelpers';

const APPARATUS_IDS = ['filtration', 'distillation'] as const;
type ApparatusId = (typeof APPARATUS_IDS)[number];

interface ApparatusParams {
  apparatusId: ApparatusId;
}

const stroke = (extra: Partial<DiagramPrimitive> & { kind: DiagramPrimitive['kind'] }) =>
  makePrimitive({ stroke: 'currentColor', strokeWidth: 0.7, fill: 'none', ...extra });

const LIQUID = '#bae6fd';

// --- Filtration --------------------------------------------------------------------------------

function filtration(): { primitives: DiagramPrimitive[]; nodes: DiagramNode[] } {
  const primitives: DiagramPrimitive[] = [
    // funnel (wide rim tapering to a stem)
    stroke({ kind: 'polygon', points: [38, 30, 62, 30, 52, 47, 52, 55, 48, 55, 48, 47] }),
    // filter paper (cone inside the funnel)
    stroke({ kind: 'polyline', points: [40, 31.5, 50, 45, 60, 31.5], strokeWidth: 0.5 }),
    // residue collected on the paper
    makePrimitive({ kind: 'ellipse', cx: 50, cy: 41, rx: 3.5, ry: 1.8, fill: '#d6c8a8', stroke: 'currentColor', strokeWidth: 0.3 }),
    // filtrate dripping from the stem
    stroke({ kind: 'line', x1: 50, y1: 55, x2: 50, y2: 60, strokeWidth: 0.4 }),
    // beaker (open-topped) catching the filtrate
    stroke({ kind: 'line', x1: 40, y1: 60, x2: 40, y2: 82 }),
    stroke({ kind: 'line', x1: 40, y1: 82, x2: 62, y2: 82 }),
    stroke({ kind: 'line', x1: 62, y1: 82, x2: 62, y2: 60 }),
    // filtrate liquid
    makePrimitive({ kind: 'rect', x: 40.5, y: 74, width: 21, height: 7.5, fill: LIQUID, stroke: 'none', strokeWidth: 0 }),
  ];
  const nodes = [
    makeNode({ id: 'funnel', x: 80, y: 31, correctLabel: 'Filter funnel', acceptableLabels: ['funnel'] }),
    makeNode({ id: 'paper', x: 80, y: 44, correctLabel: 'Filter paper', acceptableLabels: ['filter'] }),
    makeNode({ id: 'residue', x: 20, y: 40, correctLabel: 'Residue', acceptableLabels: ['sediment', 'solid'] }),
    makeNode({ id: 'beaker', x: 20, y: 70, correctLabel: 'Beaker' }),
    makeNode({ id: 'filtrate', x: 80, y: 76, correctLabel: 'Filtrate', acceptableLabels: ['filtered liquid'] }),
  ];
  return { primitives, nodes };
}

// --- Simple distillation -----------------------------------------------------------------------

function distillation(): { primitives: DiagramPrimitive[]; nodes: DiagramNode[] } {
  const flaskCx = 24;
  const flaskCy = 62;
  const primitives: DiagramPrimitive[] = [
    // round-bottomed flask + neck
    stroke({ kind: 'circle', cx: flaskCx, cy: flaskCy, r: 10 }),
    makePrimitive({ kind: 'ellipse', cx: flaskCx, cy: flaskCy + 3, rx: 8.5, ry: 6, fill: LIQUID, stroke: 'none', strokeWidth: 0 }),
    stroke({ kind: 'line', x1: flaskCx - 3, y1: 53, x2: flaskCx - 3, y2: 38 }),
    stroke({ kind: 'line', x1: flaskCx + 3, y1: 53, x2: flaskCx + 3, y2: 38 }),
    // thermometer in the neck
    stroke({ kind: 'line', x1: flaskCx, y1: 40, x2: flaskCx, y2: 22, strokeWidth: 0.5 }),
    makePrimitive({ kind: 'circle', cx: flaskCx, cy: 40, r: 1.2, fill: 'currentColor', stroke: 'currentColor', strokeWidth: 0.3 }),
    // heat source under the flask
    stroke({ kind: 'polyline', points: [20, 80, 24, 74, 28, 80], strokeWidth: 0.6 }),
    // condenser: a sloping double tube (outer water jacket + inner delivery tube)
    stroke({ kind: 'line', x1: 30, y1: 36, x2: 66, y2: 60 }),
    stroke({ kind: 'line', x1: 27, y1: 40, x2: 63, y2: 64 }),
    stroke({ kind: 'line', x1: 30, y1: 36, x2: 27, y2: 40, strokeWidth: 0.4 }),
    stroke({ kind: 'line', x1: 66, y1: 60, x2: 63, y2: 64, strokeWidth: 0.4 }),
    // receiving beaker for the distillate
    stroke({ kind: 'line', x1: 66, y1: 66, x2: 66, y2: 84 }),
    stroke({ kind: 'line', x1: 66, y1: 84, x2: 82, y2: 84 }),
    stroke({ kind: 'line', x1: 82, y1: 84, x2: 82, y2: 66 }),
    makePrimitive({ kind: 'rect', x: 66.5, y: 78, width: 15, height: 5.5, fill: LIQUID, stroke: 'none', strokeWidth: 0 }),
  ];
  const nodes = [
    makeNode({ id: 'thermometer', x: 40, y: 20, correctLabel: 'Thermometer' }),
    makeNode({ id: 'flask', x: 8, y: 50, correctLabel: 'Round-bottomed flask', acceptableLabels: ['flask', 'distillation flask'] }),
    makeNode({ id: 'heat', x: 24, y: 92, correctLabel: 'Heat', acceptableLabels: ['bunsen burner', 'bunsen', 'heat source'] }),
    makeNode({ id: 'condenser', x: 52, y: 40, correctLabel: 'Condenser', acceptableLabels: ["liebig condenser"] }),
    makeNode({ id: 'distillate', x: 88, y: 72, correctLabel: 'Distillate', acceptableLabels: ['condensate', 'pure liquid'] }),
  ];
  return { primitives, nodes };
}

const ALL_APPARATUS_PART_IDS = ['funnel', 'paper', 'residue', 'beaker', 'filtrate', 'thermometer', 'flask', 'heat', 'condenser', 'distillate'];

const apparatusDiagram: DiagramTemplateDefinition<ApparatusParams> = {
  id: 'apparatus-diagram',
  category: 'apparatus',
  promptBlurb: `Chemistry apparatus set-up. params.apparatusId one of: ${APPARATUS_IDS.join(', ')}. 'filtration' draws a funnel + filter paper over a beaker; 'distillation' draws a heated flask, thermometer, condenser and receiving beaker. The student types the labels for the blanked parts of the apparatus.`,
  paramDocs: `stringParams: [{key:'apparatusId', value: one of ${APPARATUS_IDS.join('|')}}]`,
  blankablePartIds: ALL_APPARATUS_PART_IDS,
  blankableSlotIds: [],
  blankableConnectionKeys: [],
  parseParams: (selection) => {
    const apparatusId = enumParam(selection, 'apparatusId', APPARATUS_IDS);
    return apparatusId ? { apparatusId } : null;
  },
  build: (params) => {
    const { primitives, nodes } = params.apparatusId === 'distillation' ? distillation() : filtration();
    const title = params.apparatusId === 'distillation' ? 'Simple distillation' : 'Filtration';
    return { title, primitives, nodes, connections: [], slots: [], labelBank: [] };
  },
};

export const APPARATUS_DIAGRAM_TEMPLATES = [apparatusDiagram];
