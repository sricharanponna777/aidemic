import type { DiagramTemplateDefinition } from '../../types';
import { evenlySpacedAngles, makePrimitive, makeSlot, pointOnCircle } from '../../geometry';
import { enumParam } from '../../paramHelpers';

interface Element {
  symbol: string;
  name: string;
  shells: number[]; // electron count per shell, innermost first
}

// First 20 elements — the standard GCSE electronic-structure/shell-diagram range.
const ELEMENT_LIBRARY: Record<string, Element> = {
  h: { symbol: 'H', name: 'Hydrogen', shells: [1] },
  he: { symbol: 'He', name: 'Helium', shells: [2] },
  li: { symbol: 'Li', name: 'Lithium', shells: [2, 1] },
  be: { symbol: 'Be', name: 'Beryllium', shells: [2, 2] },
  b: { symbol: 'B', name: 'Boron', shells: [2, 3] },
  c: { symbol: 'C', name: 'Carbon', shells: [2, 4] },
  n: { symbol: 'N', name: 'Nitrogen', shells: [2, 5] },
  o: { symbol: 'O', name: 'Oxygen', shells: [2, 6] },
  f: { symbol: 'F', name: 'Fluorine', shells: [2, 7] },
  ne: { symbol: 'Ne', name: 'Neon', shells: [2, 8] },
  na: { symbol: 'Na', name: 'Sodium', shells: [2, 8, 1] },
  mg: { symbol: 'Mg', name: 'Magnesium', shells: [2, 8, 2] },
  al: { symbol: 'Al', name: 'Aluminium', shells: [2, 8, 3] },
  si: { symbol: 'Si', name: 'Silicon', shells: [2, 8, 4] },
  p: { symbol: 'P', name: 'Phosphorus', shells: [2, 8, 5] },
  s: { symbol: 'S', name: 'Sulfur', shells: [2, 8, 6] },
  cl: { symbol: 'Cl', name: 'Chlorine', shells: [2, 8, 7] },
  ar: { symbol: 'Ar', name: 'Argon', shells: [2, 8, 8] },
  k: { symbol: 'K', name: 'Potassium', shells: [2, 8, 8, 1] },
  ca: { symbol: 'Ca', name: 'Calcium', shells: [2, 8, 8, 2] },
};

const ELEMENT_IDS = Object.keys(ELEMENT_LIBRARY);
const SHELL_RADIUS_STEP = 8.5;
const NUCLEUS_R = 5; // radius kept clear at the centre for the element symbol
const SYMBOL_FONT_SIZE = 7;

interface AtomicStructureParams {
  elementId: string;
}

const atomicStructure: DiagramTemplateDefinition<AtomicStructureParams> = {
  id: 'atomic-structure',
  category: 'atomic-structure',
  promptBlurb: `Electron shell (atomic structure) diagram. params.elementId one of: ${ELEMENT_IDS.join(', ')}. Renders the nucleus symbol and concentric shell rings; the student places an electron dot into each blanked shell slot.`,
  paramDocs: `stringParams: [{key:'elementId', value: one of ${ELEMENT_IDS.join('|')}}]`,
  blankablePartIds: [],
  blankableSlotIds: [],
  blankableConnectionKeys: [],
  parseParams: (selection) => {
    const elementId = enumParam(selection, 'elementId', ELEMENT_IDS);
    return elementId ? { elementId } : null;
  },
  build: (params) => {
    const element = ELEMENT_LIBRARY[params.elementId];
    const cx = 50;
    const cy = 50;

    // The element symbol is drawn straight at the centre of the atom (exam convention) rather than
    // as a label node, which would render as a box over the nucleus.
    const primitives = [makePrimitive({ kind: 'text', x: cx, y: cy, text: element.symbol, fontSize: SYMBOL_FONT_SIZE, fill: 'currentColor' })];
    const slots = element.shells.flatMap((count, shellIndex) => {
      const radius = NUCLEUS_R + SHELL_RADIUS_STEP * (shellIndex + 1);
      primitives.push(makePrimitive({ kind: 'circle', cx, cy, r: radius, stroke: 'currentColor', fill: 'none', strokeWidth: 0.5 }));
      const angles = evenlySpacedAngles(count, -90, 360);
      return angles.map((angle, i) => {
        const pos = pointOnCircle(cx, cy, radius, angle);
        return makeSlot({
          id: `shell${shellIndex}-e${i}`,
          x: pos.x,
          y: pos.y,
          paletteId: 'electron',
          correctOption: 'electron',
          description: `Electron in shell ${shellIndex + 1} of ${element.name}`,
        });
      });
    });

    return { title: `Electron shell diagram: ${element.name} (${element.symbol})`, primitives, nodes: [], connections: [], slots, labelBank: [] };
  },
};

atomicStructure.blankableSlotIds = Object.values(ELEMENT_LIBRARY).flatMap((element) =>
  element.shells.flatMap((count, shellIndex) => Array.from({ length: count }, (_, i) => `shell${shellIndex}-e${i}`))
);

export const ATOMIC_STRUCTURE_TEMPLATES = [atomicStructure];
