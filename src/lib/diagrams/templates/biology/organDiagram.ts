import type { DiagramNode, DiagramPrimitive } from '@/types';
import type { DiagramTemplateDefinition } from '../../types';
import { makeNode, makePrimitive } from '../../geometry';
import { enumParam } from '../../paramHelpers';

const ORGAN_IDS = ['heart', 'digestive'] as const;
type OrganId = (typeof ORGAN_IDS)[number];

interface OrganParams {
  organId: OrganId;
}

const line = (x1: number, y1: number, x2: number, y2: number, w = 0.6) =>
  makePrimitive({ kind: 'line', x1, y1, x2, y2, stroke: 'currentColor', strokeWidth: w });
const chamber = (x: number, y: number, width: number, height: number, fill: string) =>
  makePrimitive({ kind: 'rect', x, y, width, height, fill, stroke: 'currentColor', strokeWidth: 0.6 });

const DEOXY = '#bfdbfe'; // right side of the heart (deoxygenated blood)
const OXY = '#fecaca'; // left side of the heart (oxygenated blood)

// --- Heart (schematic four-chamber) ------------------------------------------------------------

function heart(): { primitives: DiagramPrimitive[]; nodes: DiagramNode[] } {
  const primitives: DiagramPrimitive[] = [
    // chambers
    chamber(33, 34, 16, 13, DEOXY), // right atrium
    chamber(51, 34, 16, 13, OXY), // left atrium
    chamber(31, 49, 18, 31, DEOXY), // right ventricle
    chamber(51, 49, 20, 31, OXY), // left ventricle (thicker wall)
    line(49.4, 49, 49.4, 80, 1.4), // thick septum / left-ventricle wall
    // vena cava into the right atrium
    line(38, 16, 38, 34, 1),
    makePrimitive({ kind: 'rect', x: 36.5, y: 16, width: 3, height: 18, fill: DEOXY, stroke: 'none', strokeWidth: 0 }),
    // aorta arch leaving the left ventricle
    makePrimitive({ kind: 'polyline', points: [56, 49, 56, 22, 61, 16, 68, 19], stroke: 'currentColor', strokeWidth: 1, fill: 'none' }),
    // atrioventricular valves (small V marks)
    makePrimitive({ kind: 'polyline', points: [37, 47, 41, 50, 45, 47], stroke: 'currentColor', strokeWidth: 0.4, fill: 'none' }),
    makePrimitive({ kind: 'polyline', points: [55, 47, 59, 50, 63, 47], stroke: 'currentColor', strokeWidth: 0.4, fill: 'none' }),
  ];
  const nodes = [
    makeNode({ id: 'right-atrium', x: 16, y: 34, correctLabel: 'Right atrium' }),
    makeNode({ id: 'left-atrium', x: 84, y: 34, correctLabel: 'Left atrium' }),
    makeNode({ id: 'right-ventricle', x: 15, y: 64, correctLabel: 'Right ventricle' }),
    makeNode({ id: 'left-ventricle', x: 86, y: 64, correctLabel: 'Left ventricle' }),
    makeNode({ id: 'vena-cava', x: 30, y: 10, correctLabel: 'Vena cava', acceptableLabels: ['venae cavae', 'superior vena cava'] }),
    makeNode({ id: 'aorta', x: 74, y: 10, correctLabel: 'Aorta' }),
  ];
  return { primitives, nodes };
}

// --- Digestive system --------------------------------------------------------------------------

function digestive(): { primitives: DiagramPrimitive[]; nodes: DiagramNode[] } {
  const primitives: DiagramPrimitive[] = [
    // mouth
    makePrimitive({ kind: 'ellipse', cx: 50, cy: 12, rx: 6, ry: 3, fill: '#fecaca', stroke: 'currentColor', strokeWidth: 0.5 }),
    // oesophagus
    line(48, 15, 48, 32, 0.8),
    line(52, 15, 52, 32, 0.8),
    // stomach
    makePrimitive({ kind: 'ellipse', cx: 40, cy: 40, rx: 12, ry: 8, fill: '#fed7aa', stroke: 'currentColor', strokeWidth: 0.6 }),
    // large intestine (frame around the small intestine)
    makePrimitive({ kind: 'polyline', points: [30, 52, 30, 82, 70, 82, 70, 46], stroke: '#a16207', strokeWidth: 2, fill: 'none' }),
    // small intestine (coiled)
    makePrimitive({
      kind: 'polyline',
      points: [42, 50, 56, 54, 42, 58, 56, 62, 42, 66, 56, 70, 44, 74],
      stroke: '#f59e0b',
      strokeWidth: 1.4,
      fill: 'none',
    }),
    // rectum
    line(70, 82, 70, 90, 0.8),
  ];
  const nodes = [
    makeNode({ id: 'mouth', x: 68, y: 12, correctLabel: 'Mouth' }),
    makeNode({ id: 'oesophagus', x: 74, y: 26, correctLabel: 'Oesophagus', acceptableLabels: ['esophagus', 'gullet'] }),
    makeNode({ id: 'stomach', x: 18, y: 40, correctLabel: 'Stomach' }),
    makeNode({ id: 'small-intestine', x: 84, y: 60, correctLabel: 'Small intestine', acceptableLabels: ['small bowel'] }),
    makeNode({ id: 'large-intestine', x: 16, y: 74, correctLabel: 'Large intestine', acceptableLabels: ['colon', 'large bowel'] }),
    makeNode({ id: 'rectum', x: 84, y: 88, correctLabel: 'Rectum' }),
  ];
  return { primitives, nodes };
}

const ALL_ORGAN_PART_IDS = [
  'right-atrium',
  'left-atrium',
  'right-ventricle',
  'left-ventricle',
  'vena-cava',
  'aorta',
  'mouth',
  'oesophagus',
  'stomach',
  'small-intestine',
  'large-intestine',
  'rectum',
];

const organDiagram: DiagramTemplateDefinition<OrganParams> = {
  id: 'organ-diagram',
  category: 'organ',
  promptBlurb: `Human organ diagram. params.organId one of: ${ORGAN_IDS.join(', ')}. 'heart' draws a schematic four-chamber heart with the main vessels; 'digestive' draws the digestive tract from mouth to rectum. The student types the labels for the blanked parts.`,
  paramDocs: `stringParams: [{key:'organId', value: one of ${ORGAN_IDS.join('|')}}]`,
  blankablePartIds: ALL_ORGAN_PART_IDS,
  blankableSlotIds: [],
  blankableConnectionKeys: [],
  parseParams: (selection) => {
    const organId = enumParam(selection, 'organId', ORGAN_IDS);
    return organId ? { organId } : null;
  },
  build: (params) => {
    const { primitives, nodes } = params.organId === 'digestive' ? digestive() : heart();
    const title = params.organId === 'digestive' ? 'The digestive system' : 'The human heart';
    return { title, primitives, nodes, connections: [], slots: [], labelBank: [] };
  },
};

export const ORGAN_DIAGRAM_TEMPLATES = [organDiagram];
