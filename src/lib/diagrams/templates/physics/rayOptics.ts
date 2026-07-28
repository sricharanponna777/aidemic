import type { DiagramNode, DiagramPrimitive } from '@/types';
import { makeConnection, makeNode, makeSlot } from '../../geometry';
import type { DiagramTemplateBuildResult } from '../../types';

/** Shared ray-construction geometry for lenses and mirrors. Both use the same signed thin-lens/
 * mirror equation (1/v = 1/f - 1/u); only the decorative symbol and which side a real image forms
 * on differ (lens: opposite side from the object; mirror: same side, reflected back). Positions are
 * always computed from this formula, never authored/guessed — this is what keeps the ray diagram
 * optically correct regardless of which scenario the AI selects.
 *
 * Two construction rays are used, both verified algebraically to pass exactly through the computed
 * image point: (1) a ray parallel to the axis that bends at the element and continues to the image
 * ("kink-parallel"), and (2) a ray through the lens's optical centre / the mirror's centre of
 * curvature, which by similar-triangles also lands exactly on the image ("kink-center"). Each ray is
 * two independently gradeable connection segments (object/kink and kink/image).
 */
export interface RayOpticsScenario {
  title: string;
  elementX: number;
  axisY: number;
  focalLength: number; // positive magnitude
  converging: boolean; // true => real f (converging lens / concave mirror); false => virtual f (diverging lens / convex mirror)
  objectDistance: number; // u, positive, distance of the object from the element
  objectHeight: number; // ho, positive
  sideSign: 1 | -1; // +1: lens (real image forms on the opposite side from the object). -1: mirror (real image forms on the same side).
  secondRayPivotX: number; // x the "through-the-middle" construction ray bends through
  extraPrimitives: DiagramPrimitive[]; // decorative axis line + lens/mirror symbol, already positioned
  extraNodes?: DiagramNode[]; // e.g. F/2F reference-point labels, given by the caller
}

const MIN_IMAGE_HEIGHT = 4;
const MAX_IMAGE_HEIGHT = 30;

export function buildRayOptics(scenario: RayOpticsScenario): DiagramTemplateBuildResult {
  const { title, elementX, axisY, focalLength, converging, objectDistance: u, objectHeight: ho, sideSign, secondRayPivotX, extraPrimitives, extraNodes } = scenario;

  const f = converging ? focalLength : -focalLength;
  const v = (f * u) / (u - f);
  const real = v > 0;
  const magnitudeRatio = Math.abs(v / u);
  const hi = Math.min(MAX_IMAGE_HEIGHT, Math.max(MIN_IMAGE_HEIGHT, ho * magnitudeRatio));

  const objectX = elementX - u;
  const imageX = elementX + sideSign * v;
  const objectTipY = axisY - ho;
  const imageTipY = real ? axisY + hi : axisY - hi; // real => inverted (opposite side of axis); virtual => upright

  const nodes: DiagramNode[] = [
    makeNode({ id: 'object-base', x: objectX, y: axisY, correctLabel: 'Object', role: 'anchor' }),
    makeNode({ id: 'object-tip', x: objectX, y: objectTipY, correctLabel: 'Object', role: 'anchor' }),
    makeNode({ id: 'image-base', x: imageX, y: axisY, correctLabel: 'Image', role: 'anchor' }),
    makeNode({ id: 'image-tip', x: imageX, y: imageTipY, correctLabel: 'Image', role: 'anchor' }),
    makeNode({ id: 'kink-parallel', x: elementX, y: objectTipY, correctLabel: '', role: 'anchor' }),
    makeNode({ id: 'kink-center', x: secondRayPivotX, y: axisY, correctLabel: '', role: 'anchor' }),
    ...(extraNodes ?? []),
  ];

  const connections = [
    makeConnection({ from: 'object-base', to: 'object-tip', directed: true }),
    makeConnection({ from: 'image-base', to: 'image-tip', directed: true, style: real ? 'solid' : 'dashed' }),
    makeConnection({ from: 'object-tip', to: 'kink-parallel', directed: false }),
    makeConnection({ from: 'kink-parallel', to: 'image-tip', directed: true, style: real ? 'solid' : 'dashed' }),
    makeConnection({ from: 'object-tip', to: 'kink-center', directed: false }),
    makeConnection({ from: 'kink-center', to: 'image-tip', directed: true, style: real ? 'solid' : 'dashed' }),
  ];

  const slots = [
    makeSlot({ id: 'image-nature-slot', x: imageX, y: imageTipY + (imageTipY > axisY ? 10 : -10), paletteId: 'image-nature', correctOption: real ? 'real' : 'virtual', description: 'Nature of the image' }),
    makeSlot({
      id: 'image-orientation-slot',
      x: imageX + 8,
      y: imageTipY + (imageTipY > axisY ? 10 : -10),
      paletteId: 'image-orientation',
      correctOption: real ? 'inverted' : 'upright',
      description: 'Orientation of the image',
    }),
    makeSlot({
      id: 'image-size-slot',
      x: imageX - 8,
      y: imageTipY + (imageTipY > axisY ? 10 : -10),
      paletteId: 'image-size',
      correctOption: magnitudeRatio > 1.1 ? 'magnified' : magnitudeRatio < 0.9 ? 'diminished' : 'same-size',
      description: 'Size of the image relative to the object',
    }),
  ];

  return { title, primitives: extraPrimitives, nodes, connections, slots, labelBank: [] };
}

export const RAY_OPTICS_BLANKABLE_SLOT_IDS = ['image-nature-slot', 'image-orientation-slot', 'image-size-slot'];
export const RAY_OPTICS_BLANKABLE_CONNECTION_KEYS = [
  'object-tip->kink-parallel',
  'kink-parallel->image-tip',
  'object-tip->kink-center',
  'kink-center->image-tip',
  'image-base->image-tip',
];
