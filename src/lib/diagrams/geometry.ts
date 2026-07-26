import type { DiagramConnection, DiagramNode, DiagramPrimitive, DiagramPrimitiveKind, DiagramSlot } from '@/types';

/** Shared coordinate helpers for template `build()` functions. All diagram coordinates live in
 * the same normalized 0..100 space as the freehand diagram system (see DiagramCanvas). */

export const clampCoord = (value: number): number => Math.min(100, Math.max(0, Math.round(value * 100) / 100));

export interface Point {
  x: number;
  y: number;
}

const toRad = (deg: number) => (deg * Math.PI) / 180;

/** Point at `angleDeg` (0 = +x axis, clockwise, matching SVG's y-down convention) around a
 * circle centred at (cx, cy) with radius r. */
export const pointOnCircle = (cx: number, cy: number, r: number, angleDeg: number): Point => ({
  x: clampCoord(cx + r * Math.cos(toRad(angleDeg))),
  y: clampCoord(cy + r * Math.sin(toRad(angleDeg))),
});

/** `count` angles evenly spaced around a circle, starting at `startAngle` and covering
 * `coverageDeg` (360 = a full ring, e.g. an electron shell's evenly-spaced slots). */
export const evenlySpacedAngles = (count: number, startAngle = -90, coverageDeg = 360): number[] => {
  if (count <= 0) return [];
  const step = coverageDeg / (coverageDeg >= 360 ? count : Math.max(1, count - 1));
  return Array.from({ length: count }, (_, i) => startAngle + i * step);
};

export const midpoint = (a: Point, b: Point): Point => ({
  x: clampCoord((a.x + b.x) / 2),
  y: clampCoord((a.y + b.y) / 2),
});

export const unitVector = (from: Point, to: Point): Point => {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const len = Math.hypot(dx, dy) || 1;
  return { x: dx / len, y: dy / len };
};

export const perpendicular = (v: Point): Point => ({ x: -v.y, y: v.x });

export const addScaled = (p: Point, v: Point, scale: number): Point => ({
  x: clampCoord(p.x + v.x * scale),
  y: clampCoord(p.y + v.y * scale),
});

/** Factory helpers: every DiagramPrimitive/Node/Connection/Slot field is required by the strict
 * type (mirroring the AI-authoring JSON schema's strict:true convention), so template code builds
 * these via factories with sensible defaults rather than repeating every field at each call site. */

const PRIMITIVE_DEFAULTS: DiagramPrimitive = {
  kind: 'circle',
  d: '',
  points: [],
  cx: 0,
  cy: 0,
  r: 0,
  rx: 0,
  ry: 0,
  x: 0,
  y: 0,
  width: 0,
  height: 0,
  x1: 0,
  y1: 0,
  x2: 0,
  y2: 0,
  text: '',
  fontSize: 4,
  stroke: 'currentColor',
  fill: 'none',
  strokeWidth: 1,
};

export const makePrimitive = (overrides: Partial<DiagramPrimitive> & { kind: DiagramPrimitiveKind }): DiagramPrimitive => ({
  ...PRIMITIVE_DEFAULTS,
  ...overrides,
});

export const makeNode = (overrides: Partial<DiagramNode> & { id: string; x: number; y: number; correctLabel: string }): DiagramNode => ({
  given: true,
  role: 'label',
  acceptableLabels: [],
  ...overrides,
});

export const makeSlot = (overrides: Partial<DiagramSlot> & { id: string; x: number; y: number; paletteId: string; correctOption: string }): DiagramSlot => ({
  given: true,
  description: '',
  group: '',
  ...overrides,
});

export const makeConnection = (overrides: Partial<DiagramConnection> & { from: string; to: string }): DiagramConnection => ({
  directed: false,
  label: '',
  given: true,
  style: 'solid',
  ...overrides,
});
