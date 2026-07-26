import type { DiagramNode, DiagramPrimitive } from '@/types';
import type { DiagramTemplateDefinition } from '../../types';
import { makeNode, makePrimitive } from '../../geometry';
import { enumParam } from '../../paramHelpers';

const CIRCUIT_IDS = ['series-lamp', 'parallel-lamp'] as const;
type CircuitId = (typeof CIRCUIT_IDS)[number];

interface CircuitParams {
  circuitId: CircuitId;
}

const wire = (x1: number, y1: number, x2: number, y2: number): DiagramPrimitive =>
  makePrimitive({ kind: 'line', x1, y1, x2, y2, stroke: 'currentColor', strokeWidth: 0.8 });

/** Lamp: a crossed circle. */
function lampSymbol(cx: number, cy: number, r = 5): DiagramPrimitive[] {
  const d = r * 0.72;
  return [
    makePrimitive({ kind: 'circle', cx, cy, r, fill: 'none', stroke: 'currentColor', strokeWidth: 0.7 }),
    makePrimitive({ kind: 'line', x1: cx - d, y1: cy - d, x2: cx + d, y2: cy + d, stroke: 'currentColor', strokeWidth: 0.6 }),
    makePrimitive({ kind: 'line', x1: cx - d, y1: cy + d, x2: cx + d, y2: cy - d, stroke: 'currentColor', strokeWidth: 0.6 }),
  ];
}

/** Cell across a vertical wire at (x, cy): a long thin plate (+) and a short thick plate (−). */
function cellSymbolVertical(x: number, cy: number): DiagramPrimitive[] {
  return [
    makePrimitive({ kind: 'line', x1: x - 5, y1: cy - 2, x2: x + 5, y2: cy - 2, stroke: 'currentColor', strokeWidth: 0.6 }), // long plate (+)
    makePrimitive({ kind: 'line', x1: x - 2.5, y1: cy + 2, x2: x + 2.5, y2: cy + 2, stroke: 'currentColor', strokeWidth: 1.6 }), // short thick plate (−)
  ];
}

/** Open switch on a vertical wire at (x, cy): two contacts and a hinged lever. */
function switchSymbolVertical(x: number, cy: number): DiagramPrimitive[] {
  return [
    makePrimitive({ kind: 'circle', cx: x, cy: cy - 4, r: 0.8, fill: 'currentColor', stroke: 'currentColor', strokeWidth: 0.3 }),
    makePrimitive({ kind: 'circle', cx: x, cy: cy + 4, r: 0.8, fill: 'currentColor', stroke: 'currentColor', strokeWidth: 0.3 }),
    makePrimitive({ kind: 'line', x1: x, y1: cy + 4, x2: x + 5, y2: cy - 3, stroke: 'currentColor', strokeWidth: 0.7 }), // lever (open)
  ];
}

/** Resistor: an IEC rectangle across a horizontal wire centred at (cx, cy). */
function resistorSymbolHorizontal(cx: number, cy: number): DiagramPrimitive[] {
  return [makePrimitive({ kind: 'rect', x: cx - 7, y: cy - 2.5, width: 14, height: 5, fill: 'none', stroke: 'currentColor', strokeWidth: 0.6 })];
}

function seriesLamp(): { primitives: DiagramPrimitive[]; nodes: DiagramNode[] } {
  const L = 18;
  const R = 82;
  const T = 24;
  const B = 76;
  const midY = (T + B) / 2;

  const primitives: DiagramPrimitive[] = [
    // top rail with a gap for the lamp
    wire(L, T, 44, T),
    wire(56, T, R, T),
    // right rail with a gap for the switch
    wire(R, T, R, midY - 4),
    wire(R, midY + 4, R, B),
    // bottom rail with a gap for the resistor
    wire(R, B, 57, B),
    wire(43, B, L, B),
    // left rail with a gap for the cell
    wire(L, T, L, midY - 2),
    wire(L, midY + 2, L, B),
    ...lampSymbol(50, T),
    ...cellSymbolVertical(L, midY),
    ...switchSymbolVertical(R, midY),
    ...resistorSymbolHorizontal(50, B),
  ];

  const nodes = [
    makeNode({ id: 'cell', x: 8, y: midY, correctLabel: 'Cell', acceptableLabels: ['battery'] }),
    makeNode({ id: 'lamp', x: 50, y: 13, correctLabel: 'Lamp', acceptableLabels: ['bulb', 'light', 'filament lamp'] }),
    makeNode({ id: 'switch', x: 92, y: midY, correctLabel: 'Switch', acceptableLabels: ['open switch'] }),
    makeNode({ id: 'resistor', x: 50, y: 88, correctLabel: 'Resistor', acceptableLabels: ['fixed resistor'] }),
  ];
  return { primitives, nodes };
}

function parallelLamp(): { primitives: DiagramPrimitive[]; nodes: DiagramNode[] } {
  const L = 16;
  const R = 84;
  const T = 30;
  const B = 70;
  const midY = (T + B) / 2;
  const branchA = 46;
  const branchB = 66;

  const primitives: DiagramPrimitive[] = [
    // top and bottom rails
    wire(L, T, R, T),
    wire(L, B, R, B),
    // left rail with the cell
    wire(L, T, L, midY - 2),
    wire(L, midY + 2, L, B),
    ...cellSymbolVertical(L, midY),
    // switch on the top rail (drawn on the left segment as a vertical-style break) -> keep simple: on right rail
    wire(R, T, R, B),
    // two parallel branches each with a lamp
    wire(branchA, T, branchA, midY - 5),
    wire(branchA, midY + 5, branchA, B),
    ...lampSymbol(branchA, midY),
    wire(branchB, T, branchB, midY - 5),
    wire(branchB, midY + 5, branchB, B),
    ...lampSymbol(branchB, midY),
  ];

  const nodes = [
    makeNode({ id: 'cell', x: 7, y: midY, correctLabel: 'Cell', acceptableLabels: ['battery'] }),
    makeNode({ id: 'lampA', x: branchA, y: 84, correctLabel: 'Lamp', acceptableLabels: ['bulb', 'light', 'filament lamp'] }),
    makeNode({ id: 'lampB', x: branchB, y: 84, correctLabel: 'Lamp', acceptableLabels: ['bulb', 'light', 'filament lamp'] }),
  ];
  return { primitives, nodes };
}

const ALL_CIRCUIT_PART_IDS = ['cell', 'lamp', 'switch', 'resistor', 'lampA', 'lampB'];

const circuitDiagram: DiagramTemplateDefinition<CircuitParams> = {
  id: 'circuit-diagram',
  category: 'circuit',
  promptBlurb: `Electric circuit diagram. params.circuitId one of: ${CIRCUIT_IDS.join(', ')}. 'series-lamp' is a single loop with a cell, lamp, switch and resistor; 'parallel-lamp' has two lamps on parallel branches. Standard circuit symbols are drawn; the student types the name of each blanked component.`,
  paramDocs: `stringParams: [{key:'circuitId', value: one of ${CIRCUIT_IDS.join('|')}}]`,
  blankablePartIds: ALL_CIRCUIT_PART_IDS,
  blankableSlotIds: [],
  blankableConnectionKeys: [],
  parseParams: (selection) => {
    const circuitId = enumParam(selection, 'circuitId', CIRCUIT_IDS);
    return circuitId ? { circuitId } : null;
  },
  build: (params) => {
    const { primitives, nodes } = params.circuitId === 'parallel-lamp' ? parallelLamp() : seriesLamp();
    const title = params.circuitId === 'parallel-lamp' ? 'Parallel circuit' : 'Series circuit';
    return { title, primitives, nodes, connections: [], slots: [], labelBank: [] };
  },
};

export const CIRCUIT_DIAGRAM_TEMPLATES = [circuitDiagram];
