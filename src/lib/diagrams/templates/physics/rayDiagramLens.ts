import type { DiagramTemplateDefinition } from '../../types';
import { makeNode, makePrimitive } from '../../geometry';
import { enumParam } from '../../paramHelpers';
import { buildRayOptics, RAY_OPTICS_BLANKABLE_CONNECTION_KEYS, RAY_OPTICS_BLANKABLE_SLOT_IDS } from './rayOptics';

const OPTICS_TYPES = ['converging-lens', 'diverging-lens'] as const;
type OpticsType = (typeof OPTICS_TYPES)[number];

// 'at-f' is deliberately excluded: a converging lens with the object exactly at F produces an
// image at infinity (rays emerge parallel) — there is no finite image point to draw or grade.
const CONVERGING_CATEGORIES = ['beyond-2f', 'at-2f', 'between-f-and-2f', 'inside-f'] as const;
const DIVERGING_CATEGORIES = ['anywhere'] as const;

const ELEMENT_X = 50;
const AXIS_Y = 50;
const FOCAL_LENGTH = 16;
const OBJECT_HEIGHT = 14;

const OBJECT_DISTANCE_BY_CATEGORY: Record<string, number> = {
  'beyond-2f': FOCAL_LENGTH * 2.5,
  'at-2f': FOCAL_LENGTH * 2,
  'between-f-and-2f': FOCAL_LENGTH * 1.5,
  'inside-f': FOCAL_LENGTH * 0.5,
  anywhere: FOCAL_LENGTH * 1.5,
};

interface RayDiagramLensParams {
  opticsType: OpticsType;
  objectDistanceCategory: string;
}

function lensSymbolPrimitives(converging: boolean) {
  const x = ELEMENT_X;
  const top = 20;
  const bottom = 80;
  const arrow = converging
    ? [
        { x1: x - 3, y1: top + 3, x2: x, y2: top },
        { x1: x + 3, y1: top + 3, x2: x, y2: top },
        { x1: x - 3, y1: bottom - 3, x2: x, y2: bottom },
        { x1: x + 3, y1: bottom - 3, x2: x, y2: bottom },
      ]
    : [
        { x1: x - 3, y1: top, x2: x, y2: top + 3 },
        { x1: x + 3, y1: top, x2: x, y2: top + 3 },
        { x1: x - 3, y1: bottom, x2: x, y2: bottom - 3 },
        { x1: x + 3, y1: bottom, x2: x, y2: bottom - 3 },
      ];
  return [
    makePrimitive({ kind: 'line', x1: 2, y1: AXIS_Y, x2: 98, y2: AXIS_Y, stroke: 'currentColor', strokeWidth: 0.3 }),
    makePrimitive({ kind: 'line', x1: x, y1: top, x2: x, y2: bottom, stroke: 'currentColor', strokeWidth: 0.8 }),
    ...arrow.map((a) => makePrimitive({ kind: 'line', x1: a.x1, y1: a.y1, x2: a.x2, y2: a.y2, stroke: 'currentColor', strokeWidth: 0.8 })),
  ];
}

const rayDiagramLens: DiagramTemplateDefinition<RayDiagramLensParams> = {
  id: 'ray-diagram-lens',
  category: 'ray-optics',
  promptBlurb: `Physics ray diagram for a lens. params.opticsType one of: ${OPTICS_TYPES.join(', ')}. For 'converging-lens', params.objectDistanceCategory one of: ${CONVERGING_CATEGORIES.join(', ')}. For 'diverging-lens', objectDistanceCategory must be 'anywhere'. All object/focal-point/image positions and image properties are computed from the real thin-lens equation, never freehand — the student draws the missing construction ray(s) and/or states the image's nature/orientation/size.`,
  paramDocs: `stringParams: [{key:'opticsType', value: one of ${OPTICS_TYPES.join('|')}}, {key:'objectDistanceCategory', value: category per opticsType above}]`,
  blankablePartIds: [],
  blankableSlotIds: RAY_OPTICS_BLANKABLE_SLOT_IDS,
  blankableConnectionKeys: RAY_OPTICS_BLANKABLE_CONNECTION_KEYS,
  parseParams: (selection) => {
    const opticsType = enumParam(selection, 'opticsType', OPTICS_TYPES);
    if (!opticsType) return null;
    const categories = opticsType === 'converging-lens' ? CONVERGING_CATEGORIES : DIVERGING_CATEGORIES;
    const objectDistanceCategory = enumParam(selection, 'objectDistanceCategory', categories);
    return objectDistanceCategory ? { opticsType, objectDistanceCategory } : null;
  },
  build: (params) => {
    const converging = params.opticsType === 'converging-lens';
    const u = OBJECT_DISTANCE_BY_CATEGORY[params.objectDistanceCategory] ?? FOCAL_LENGTH * 1.5;

    const extraNodes = [
      makeNode({ id: 'f-far', x: ELEMENT_X + FOCAL_LENGTH, y: AXIS_Y + 6, correctLabel: 'F', role: 'label' }),
      makeNode({ id: 'f-near', x: ELEMENT_X - FOCAL_LENGTH, y: AXIS_Y + 6, correctLabel: 'F', role: 'label' }),
      makeNode({ id: '2f-far', x: ELEMENT_X + FOCAL_LENGTH * 2, y: AXIS_Y + 6, correctLabel: '2F', role: 'label' }),
      makeNode({ id: '2f-near', x: ELEMENT_X - FOCAL_LENGTH * 2, y: AXIS_Y + 6, correctLabel: '2F', role: 'label' }),
    ];

    const result = buildRayOptics({
      title: `Ray diagram: ${converging ? 'converging (convex)' : 'diverging (concave)'} lens`,
      elementX: ELEMENT_X,
      axisY: AXIS_Y,
      focalLength: FOCAL_LENGTH,
      converging,
      objectDistance: u,
      objectHeight: OBJECT_HEIGHT,
      sideSign: 1,
      secondRayPivotX: ELEMENT_X,
      extraPrimitives: lensSymbolPrimitives(converging),
      extraNodes,
    });

    return result;
  },
};

export const RAY_DIAGRAM_LENS_TEMPLATES = [rayDiagramLens];
