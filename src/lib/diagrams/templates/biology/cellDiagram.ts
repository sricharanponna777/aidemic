import type { DiagramPrimitive } from '@/types';
import type { DiagramTemplateDefinition } from '../../types';
import { makeNode, makePrimitive } from '../../geometry';
import { enumParam } from '../../paramHelpers';

type PartShape =
  | { kind: 'circle'; cx: number; cy: number; r: number }
  | { kind: 'ellipse'; cx: number; cy: number; rx: number; ry: number }
  | { kind: 'rect'; x: number; y: number; width: number; height: number }
  | { kind: 'line'; x1: number; y1: number; x2: number; y2: number };

interface CellPart {
  id: string;
  label: string;
  fill: string;
  shape: PartShape;
  labelX: number;
  labelY: number;
}

interface CellType {
  name: string;
  boundary: DiagramPrimitive[];
  parts: CellPart[];
}

const shapeToPrimitive = (shape: PartShape, fill: string): DiagramPrimitive => {
  switch (shape.kind) {
    case 'circle':
      return makePrimitive({ kind: 'circle', cx: shape.cx, cy: shape.cy, r: shape.r, fill, stroke: 'currentColor', strokeWidth: 0.4 });
    case 'ellipse':
      return makePrimitive({ kind: 'ellipse', cx: shape.cx, cy: shape.cy, rx: shape.rx, ry: shape.ry, fill, stroke: 'currentColor', strokeWidth: 0.4 });
    case 'rect':
      return makePrimitive({ kind: 'rect', x: shape.x, y: shape.y, width: shape.width, height: shape.height, fill, stroke: 'currentColor', strokeWidth: 0.4 });
    case 'line':
      return makePrimitive({ kind: 'line', x1: shape.x1, y1: shape.y1, x2: shape.x2, y2: shape.y2, stroke: 'currentColor', strokeWidth: 1 });
  }
};

const NUCLEUS_FILL = '#a78bfa';
const MITOCHONDRIA_FILL = '#fb923c';
const CHLOROPLAST_FILL = '#4ade80';
const VACUOLE_FILL = '#7dd3fc';
const CYTOPLASM_FILL = '#f1f5f9';
const DNA_FILL = '#fbbf24';

const CELL_LIBRARY: Record<string, CellType> = {
  animal: {
    name: 'Animal cell',
    boundary: [makePrimitive({ kind: 'circle', cx: 50, cy: 50, r: 34, fill: CYTOPLASM_FILL, stroke: 'currentColor', strokeWidth: 0.6 })],
    parts: [
      { id: 'membrane', label: 'Cell membrane', fill: 'none', shape: { kind: 'circle', cx: 50, cy: 50, r: 34 }, labelX: 84, labelY: 20 },
      { id: 'nucleus', label: 'Nucleus', fill: NUCLEUS_FILL, shape: { kind: 'circle', cx: 44, cy: 46, r: 12 }, labelX: 20, labelY: 30 },
      { id: 'cytoplasm', label: 'Cytoplasm', fill: 'none', shape: { kind: 'circle', cx: 62, cy: 60, r: 4 }, labelX: 84, labelY: 74 },
      { id: 'mitochondria', label: 'Mitochondria', fill: MITOCHONDRIA_FILL, shape: { kind: 'ellipse', cx: 62, cy: 40, rx: 6, ry: 3.5 }, labelX: 84, labelY: 40 },
      { id: 'ribosomes', label: 'Ribosomes', fill: '#0f172a', shape: { kind: 'circle', cx: 58, cy: 66, r: 1 }, labelX: 20, labelY: 74 },
    ],
  },
  plant: {
    name: 'Plant cell',
    boundary: [
      makePrimitive({ kind: 'rect', x: 14, y: 14, width: 72, height: 72, fill: 'none', stroke: 'currentColor', strokeWidth: 0.8 }),
      makePrimitive({ kind: 'rect', x: 18, y: 18, width: 64, height: 64, fill: CYTOPLASM_FILL, stroke: 'currentColor', strokeWidth: 0.5 }),
    ],
    parts: [
      { id: 'wall', label: 'Cell wall', fill: 'none', shape: { kind: 'rect', x: 14, y: 14, width: 72, height: 6 }, labelX: 50, labelY: 8 },
      { id: 'membrane', label: 'Cell membrane', fill: 'none', shape: { kind: 'rect', x: 18, y: 18, width: 64, height: 3 }, labelX: 88, labelY: 20 },
      { id: 'vacuole', label: 'Vacuole', fill: VACUOLE_FILL, shape: { kind: 'rect', x: 34, y: 34, width: 34, height: 34 }, labelX: 50, labelY: 50 },
      { id: 'nucleus', label: 'Nucleus', fill: NUCLEUS_FILL, shape: { kind: 'circle', cx: 26, cy: 74, r: 8 }, labelX: 12, labelY: 88 },
      { id: 'chloroplast', label: 'Chloroplast', fill: CHLOROPLAST_FILL, shape: { kind: 'ellipse', cx: 74, cy: 28, rx: 6, ry: 3.5 }, labelX: 90, labelY: 28 },
      { id: 'mitochondria', label: 'Mitochondria', fill: MITOCHONDRIA_FILL, shape: { kind: 'ellipse', cx: 74, cy: 74, rx: 5, ry: 3 }, labelX: 90, labelY: 74 },
    ],
  },
  bacterium: {
    name: 'Bacterium (prokaryotic cell)',
    boundary: [
      makePrimitive({ kind: 'ellipse', cx: 50, cy: 50, rx: 38, ry: 20, fill: 'none', stroke: 'currentColor', strokeWidth: 0.8 }),
      makePrimitive({ kind: 'ellipse', cx: 50, cy: 50, rx: 34, ry: 17, fill: CYTOPLASM_FILL, stroke: 'currentColor', strokeWidth: 0.4 }),
    ],
    parts: [
      { id: 'wall', label: 'Cell wall', fill: 'none', shape: { kind: 'ellipse', cx: 50, cy: 50, rx: 38, ry: 20 }, labelX: 50, labelY: 12 },
      { id: 'membrane', label: 'Cell membrane', fill: 'none', shape: { kind: 'ellipse', cx: 50, cy: 50, rx: 34, ry: 17 }, labelX: 50, labelY: 88 },
      { id: 'dna', label: 'Genetic material (chromosomal DNA)', fill: DNA_FILL, shape: { kind: 'circle', cx: 44, cy: 50, r: 8 }, labelX: 20, labelY: 60 },
      { id: 'plasmid', label: 'Plasmid', fill: '#f472b6', shape: { kind: 'circle', cx: 64, cy: 42, r: 3 }, labelX: 84, labelY: 30 },
      { id: 'flagellum', label: 'Flagellum', fill: 'none', shape: { kind: 'line', x1: 88, y1: 50, x2: 98, y2: 50 }, labelX: 98, labelY: 60 },
    ],
  },
  sperm: {
    name: 'Sperm cell',
    boundary: [],
    parts: [
      { id: 'acrosome', label: 'Acrosome (head tip)', fill: '#fca5a5', shape: { kind: 'ellipse', cx: 22, cy: 50, rx: 6, ry: 8 }, labelX: 12, labelY: 24 },
      { id: 'nucleus', label: 'Nucleus', fill: NUCLEUS_FILL, shape: { kind: 'ellipse', cx: 32, cy: 50, rx: 8, ry: 9 }, labelX: 32, labelY: 24 },
      { id: 'midpiece', label: 'Midpiece (mitochondria)', fill: MITOCHONDRIA_FILL, shape: { kind: 'ellipse', cx: 46, cy: 50, rx: 6, ry: 4 }, labelX: 46, labelY: 76 },
      { id: 'tail', label: 'Tail (flagellum)', fill: 'none', shape: { kind: 'line', x1: 52, y1: 50, x2: 92, y2: 50 }, labelX: 80, labelY: 24 },
    ],
  },
  egg: {
    name: 'Egg cell (ovum)',
    boundary: [
      makePrimitive({ kind: 'circle', cx: 50, cy: 50, r: 36, fill: 'none', stroke: 'currentColor', strokeWidth: 0.5 }),
      makePrimitive({ kind: 'circle', cx: 50, cy: 50, r: 30, fill: CYTOPLASM_FILL, stroke: 'currentColor', strokeWidth: 0.6 }),
    ],
    parts: [
      { id: 'coat', label: 'Zona pellucida (jelly coat)', fill: 'none', shape: { kind: 'circle', cx: 50, cy: 50, r: 36 }, labelX: 88, labelY: 16 },
      { id: 'membrane', label: 'Cell membrane', fill: 'none', shape: { kind: 'circle', cx: 50, cy: 50, r: 30 }, labelX: 88, labelY: 84 },
      { id: 'nucleus', label: 'Nucleus', fill: NUCLEUS_FILL, shape: { kind: 'circle', cx: 44, cy: 46, r: 11 }, labelX: 18, labelY: 26 },
      { id: 'cytoplasm', label: 'Cytoplasm (with food store)', fill: 'none', shape: { kind: 'circle', cx: 62, cy: 60, r: 4 }, labelX: 20, labelY: 76 },
    ],
  },
  root_hair: {
    name: 'Root hair cell',
    boundary: [makePrimitive({ kind: 'rect', x: 24, y: 30, width: 44, height: 44, fill: CYTOPLASM_FILL, stroke: 'currentColor', strokeWidth: 0.6 })],
    parts: [
      { id: 'hair', label: 'Root hair', fill: 'none', shape: { kind: 'line', x1: 24, y1: 30, x2: 6, y2: 8 }, labelX: 8, labelY: 20 },
      { id: 'wall', label: 'Cell wall', fill: 'none', shape: { kind: 'rect', x: 24, y: 30, width: 44, height: 6 }, labelX: 50, labelY: 24 },
      { id: 'nucleus', label: 'Nucleus', fill: NUCLEUS_FILL, shape: { kind: 'circle', cx: 40, cy: 48, r: 8 }, labelX: 84, labelY: 40 },
      { id: 'vacuole', label: 'Vacuole', fill: VACUOLE_FILL, shape: { kind: 'rect', x: 34, y: 58, width: 24, height: 12 }, labelX: 84, labelY: 68 },
      { id: 'cytoplasm', label: 'Cytoplasm', fill: 'none', shape: { kind: 'circle', cx: 58, cy: 42, r: 3 }, labelX: 84, labelY: 84 },
    ],
  },
  palisade: {
    name: 'Palisade mesophyll cell',
    boundary: [makePrimitive({ kind: 'rect', x: 32, y: 8, width: 36, height: 84, fill: CYTOPLASM_FILL, stroke: 'currentColor', strokeWidth: 0.6 })],
    parts: [
      { id: 'wall', label: 'Cell wall', fill: 'none', shape: { kind: 'rect', x: 32, y: 8, width: 5, height: 84 }, labelX: 12, labelY: 50 },
      { id: 'chloroplast', label: 'Chloroplast', fill: CHLOROPLAST_FILL, shape: { kind: 'ellipse', cx: 46, cy: 22, rx: 6, ry: 4 }, labelX: 84, labelY: 16 },
      { id: 'chloroplast2', label: 'Chloroplast', fill: CHLOROPLAST_FILL, shape: { kind: 'ellipse', cx: 54, cy: 40, rx: 6, ry: 4 }, labelX: 84, labelY: 36 },
      { id: 'nucleus', label: 'Nucleus', fill: NUCLEUS_FILL, shape: { kind: 'circle', cx: 46, cy: 62, r: 7 }, labelX: 84, labelY: 62 },
      { id: 'vacuole', label: 'Vacuole', fill: VACUOLE_FILL, shape: { kind: 'rect', x: 38, y: 72, width: 20, height: 16 }, labelX: 84, labelY: 84 },
    ],
  },
  ciliated_epithelial: {
    name: 'Ciliated epithelial cell',
    boundary: [makePrimitive({ kind: 'rect', x: 16, y: 24, width: 68, height: 52, fill: CYTOPLASM_FILL, stroke: 'currentColor', strokeWidth: 0.6 })],
    parts: [
      { id: 'cilia1', label: 'Cilia', fill: 'none', shape: { kind: 'line', x1: 28, y1: 24, x2: 24, y2: 8 }, labelX: 24, labelY: 4 },
      { id: 'cilia2', label: 'Cilia', fill: 'none', shape: { kind: 'line', x1: 40, y1: 24, x2: 36, y2: 8 }, labelX: 40, labelY: 4 },
      { id: 'cilia3', label: 'Cilia', fill: 'none', shape: { kind: 'line', x1: 52, y1: 24, x2: 48, y2: 8 }, labelX: 56, labelY: 4 },
      { id: 'membrane', label: 'Cell membrane', fill: 'none', shape: { kind: 'rect', x: 16, y: 24, width: 68, height: 4 }, labelX: 92, labelY: 24 },
      { id: 'nucleus', label: 'Nucleus', fill: NUCLEUS_FILL, shape: { kind: 'circle', cx: 44, cy: 58, r: 10 }, labelX: 14, labelY: 66 },
      { id: 'mitochondria', label: 'Mitochondria', fill: MITOCHONDRIA_FILL, shape: { kind: 'ellipse', cx: 68, cy: 46, rx: 6, ry: 3.5 }, labelX: 92, labelY: 46 },
    ],
  },
};

const CELL_TYPE_IDS = Object.keys(CELL_LIBRARY);
const ALL_PART_LABELS = Array.from(new Set(Object.values(CELL_LIBRARY).flatMap((cell) => cell.parts.map((part) => part.label))));

// Exam-accepted alternatives per part label, so a student who types a valid synonym or the singular
// form is still marked correct (matching is already case/punctuation-insensitive — see markDiagramAnswer).
const CELL_LABEL_SYNONYMS: Record<string, string[]> = {
  'Cell membrane': ['plasma membrane', 'cell surface membrane', 'membrane'],
  Cytoplasm: ['cytosol'],
  'Cytoplasm (with food store)': ['cytoplasm', 'cytosol', 'food store'],
  Mitochondria: ['mitochondrion'],
  'Midpiece (mitochondria)': ['midpiece', 'mitochondria', 'mitochondrion'],
  Chloroplast: ['chloroplasts'],
  'Cell wall': ['wall'],
  Ribosomes: ['ribosome'],
  Vacuole: ['permanent vacuole', 'sap vacuole'],
  'Genetic material (chromosomal DNA)': ['dna', 'chromosomal dna', 'genetic material', 'nucleoid'],
  Plasmid: ['plasmids', 'plasmid dna'],
  Flagellum: ['flagella'],
  'Tail (flagellum)': ['tail', 'flagellum'],
  'Acrosome (head tip)': ['acrosome'],
  'Zona pellucida (jelly coat)': ['zona pellucida', 'jelly coat'],
  Cilia: ['cilium'],
};

interface CellDiagramParams {
  cellType: string;
}

const cellDiagram: DiagramTemplateDefinition<CellDiagramParams> = {
  id: 'cell-diagram',
  category: 'cell',
  promptBlurb: `Labelled cell diagram. params.cellType one of: ${CELL_TYPE_IDS.join(', ')}. Renders an exam-accurate schematic with callout labels on each visible organelle/part; the student types the labels for the blanked parts (synonyms accepted).`,
  paramDocs: `stringParams: [{key:'cellType', value: one of ${CELL_TYPE_IDS.join('|')}}]`,
  blankablePartIds: [],
  blankableSlotIds: [],
  blankableConnectionKeys: [],
  parseParams: (selection) => {
    const cellType = enumParam(selection, 'cellType', CELL_TYPE_IDS);
    return cellType ? { cellType } : null;
  },
  build: (params) => {
    const cell = CELL_LIBRARY[params.cellType];
    const primitives = [...cell.boundary, ...cell.parts.map((part) => shapeToPrimitive(part.shape, part.fill))];
    const nodes = cell.parts.map((part) =>
      makeNode({ id: part.id, x: part.labelX, y: part.labelY, correctLabel: part.label, role: 'label', acceptableLabels: CELL_LABEL_SYNONYMS[part.label] ?? [] })
    );
    const ownLabels = new Set(cell.parts.map((part) => part.label));
    const distractors = ALL_PART_LABELS.filter((label) => !ownLabels.has(label)).slice(0, 3);
    return { title: cell.name, primitives, nodes, connections: [], slots: [], labelBank: distractors };
  },
};

cellDiagram.blankablePartIds = Object.values(CELL_LIBRARY).flatMap((cell) => cell.parts.map((part) => part.id));

export const CELL_DIAGRAM_TEMPLATES = [cellDiagram];
