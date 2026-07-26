import type { DiagramTemplateDefinition } from '../../types';
import { makeNode, makePrimitive } from '../../geometry';
import { enumParam } from '../../paramHelpers';
import { buildRayOptics, RAY_OPTICS_BLANKABLE_CONNECTION_KEYS, RAY_OPTICS_BLANKABLE_SLOT_IDS } from './rayOptics';

const OPTICS_TYPES = ['plane-mirror', 'concave-mirror', 'convex-mirror'] as const;
type OpticsType = (typeof OPTICS_TYPES)[number];

// 'at-f' is excluded for concave mirrors for the same reason as the converging lens: the image
// forms at infinity, with no finite point to draw or grade.
const CONCAVE_CATEGORIES = ['beyond-2f', 'at-2f', 'between-f-and-2f', 'inside-f'] as const;
const OTHER_CATEGORIES = ['anywhere'] as const;

const ELEMENT_X = 50;
const AXIS_Y = 50;
const CURVED_FOCAL_LENGTH = 12;
const PLANE_MIRROR_FOCAL_LENGTH = 100000; // f -> infinity trick: makes the shared thin-mirror
// equation degenerate to v ≈ -u (virtual, upright, same-size, same distance behind the mirror) —
// the exact behaviour of a plane mirror — without a separate formula/branch.
const OBJECT_HEIGHT = 14;

const OBJECT_DISTANCE_BY_CATEGORY: Record<string, number> = {
  'beyond-2f': CURVED_FOCAL_LENGTH * 2.5,
  'at-2f': CURVED_FOCAL_LENGTH * 2,
  'between-f-and-2f': CURVED_FOCAL_LENGTH * 1.5,
  'inside-f': CURVED_FOCAL_LENGTH * 0.5,
  anywhere: CURVED_FOCAL_LENGTH * 1.5,
};

interface RayDiagramMirrorParams {
  opticsType: OpticsType;
  objectDistanceCategory: string;
}

function mirrorSymbolPrimitives() {
  const x = ELEMENT_X;
  const primitives = [
    makePrimitive({ kind: 'line', x1: 2, y1: AXIS_Y, x2: 98, y2: AXIS_Y, stroke: 'currentColor', strokeWidth: 0.3 }),
    makePrimitive({ kind: 'line', x1: x, y1: 18, x2: x, y2: 82, stroke: 'currentColor', strokeWidth: 0.8 }),
  ];
  for (let y = 22; y <= 78; y += 10) {
    primitives.push(makePrimitive({ kind: 'line', x1: x, y1: y, x2: x + 4, y2: y + 4, stroke: 'currentColor', strokeWidth: 0.5 }));
  }
  return primitives;
}

const rayDiagramMirror: DiagramTemplateDefinition<RayDiagramMirrorParams> = {
  id: 'ray-diagram-mirror',
  category: 'ray-optics',
  promptBlurb: `Physics ray diagram for a mirror. params.opticsType one of: ${OPTICS_TYPES.join(', ')}. For 'concave-mirror', params.objectDistanceCategory one of: ${CONCAVE_CATEGORIES.join(', ')}. For 'plane-mirror'/'convex-mirror', objectDistanceCategory must be 'anywhere'. Object/image positions and properties are computed from the real mirror equation, never freehand — the student draws the missing construction ray(s) and/or states the image's nature/orientation/size.`,
  paramDocs: `stringParams: [{key:'opticsType', value: one of ${OPTICS_TYPES.join('|')}}, {key:'objectDistanceCategory', value: category per opticsType above}]`,
  blankablePartIds: [],
  blankableSlotIds: RAY_OPTICS_BLANKABLE_SLOT_IDS,
  blankableConnectionKeys: RAY_OPTICS_BLANKABLE_CONNECTION_KEYS,
  parseParams: (selection) => {
    const opticsType = enumParam(selection, 'opticsType', OPTICS_TYPES);
    if (!opticsType) return null;
    const categories = opticsType === 'concave-mirror' ? CONCAVE_CATEGORIES : OTHER_CATEGORIES;
    const objectDistanceCategory = enumParam(selection, 'objectDistanceCategory', categories);
    return objectDistanceCategory ? { opticsType, objectDistanceCategory } : null;
  },
  build: (params) => {
    const isPlane = params.opticsType === 'plane-mirror';
    const converging = params.opticsType === 'concave-mirror';
    const focalLength = isPlane ? PLANE_MIRROR_FOCAL_LENGTH : CURVED_FOCAL_LENGTH;
    const u = OBJECT_DISTANCE_BY_CATEGORY[params.objectDistanceCategory] ?? CURVED_FOCAL_LENGTH * 1.5;
    const secondRayPivotX = isPlane ? ELEMENT_X : ELEMENT_X - 2 * CURVED_FOCAL_LENGTH;

    const extraNodes = isPlane
      ? []
      : [
          makeNode({ id: 'f-near', x: ELEMENT_X - CURVED_FOCAL_LENGTH, y: AXIS_Y + 6, correctLabel: 'F', role: 'label' }),
          makeNode({ id: '2f-near', x: ELEMENT_X - CURVED_FOCAL_LENGTH * 2, y: AXIS_Y + 6, correctLabel: '2F', role: 'label' }),
        ];

    const label = isPlane ? 'plane mirror' : converging ? 'concave mirror' : 'convex mirror';

    return buildRayOptics({
      title: `Ray diagram: ${label}`,
      elementX: ELEMENT_X,
      axisY: AXIS_Y,
      focalLength,
      converging: isPlane ? true : converging,
      objectDistance: u,
      objectHeight: OBJECT_HEIGHT,
      sideSign: -1,
      secondRayPivotX,
      extraPrimitives: mirrorSymbolPrimitives(),
      extraNodes,
    });
  },
};

export const RAY_DIAGRAM_MIRROR_TEMPLATES = [rayDiagramMirror];
