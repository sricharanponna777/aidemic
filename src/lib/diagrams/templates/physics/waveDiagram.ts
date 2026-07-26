import type { DiagramNode, DiagramPrimitive } from '@/types';
import type { DiagramTemplateDefinition } from '../../types';
import { makeNode, makePrimitive } from '../../geometry';
import { enumParam } from '../../paramHelpers';

const WAVE_TYPES = ['transverse', 'em-spectrum'] as const;
type WaveType = (typeof WAVE_TYPES)[number];

interface WaveParams {
  waveType: WaveType;
}

// --- Transverse wave (label crest / trough / amplitude / wavelength) ---------------------------

const AXIS_Y = 50;
const AMP = 16;
const PERIOD = 36;
const WAVE_X0 = 12;
const WAVE_X1 = 88;

function transverseWave(): { primitives: DiagramPrimitive[]; nodes: DiagramNode[] } {
  const points: number[] = [];
  for (let x = WAVE_X0; x <= WAVE_X1 + 0.01; x += 1.5) {
    const y = AXIS_Y - AMP * Math.sin((2 * Math.PI * (x - WAVE_X0)) / PERIOD);
    points.push(Math.round(x * 100) / 100, Math.round(y * 100) / 100);
  }
  const crest1X = WAVE_X0 + PERIOD / 4; // 21
  const crest2X = crest1X + PERIOD; // 57
  const troughX = WAVE_X0 + (3 * PERIOD) / 4; // 39
  const crestY = AXIS_Y - AMP; // 34

  const primitives = [
    makePrimitive({ kind: 'line', x1: 6, y1: AXIS_Y, x2: 94, y2: AXIS_Y, stroke: 'currentColor', strokeWidth: 0.3 }), // equilibrium line
    makePrimitive({ kind: 'polyline', points, stroke: '#6366f1', strokeWidth: 1.1 }),
    // wavelength marker: crest-to-crest, drawn above the wave with end ticks
    makePrimitive({ kind: 'line', x1: crest1X, y1: 28, x2: crest2X, y2: 28, stroke: 'currentColor', strokeWidth: 0.5 }),
    makePrimitive({ kind: 'line', x1: crest1X, y1: 25, x2: crest1X, y2: 31, stroke: 'currentColor', strokeWidth: 0.5 }),
    makePrimitive({ kind: 'line', x1: crest2X, y1: 25, x2: crest2X, y2: 31, stroke: 'currentColor', strokeWidth: 0.5 }),
    // amplitude marker: axis-to-crest at the second crest
    makePrimitive({ kind: 'line', x1: crest2X, y1: AXIS_Y, x2: crest2X, y2: crestY, stroke: 'currentColor', strokeWidth: 0.5 }),
  ];

  const nodes = [
    makeNode({ id: 'crest', x: crest1X, y: 41, correctLabel: 'Crest', acceptableLabels: ['peak', 'top'] }),
    makeNode({ id: 'trough', x: troughX, y: 59, correctLabel: 'Trough', acceptableLabels: ['dip', 'bottom'] }),
    makeNode({ id: 'amplitude', x: crest2X + 13, y: 42, correctLabel: 'Amplitude' }),
    makeNode({ id: 'wavelength', x: (crest1X + crest2X) / 2, y: 21, correctLabel: 'Wavelength', acceptableLabels: ['λ'] }),
  ];
  return { primitives, nodes };
}

// --- Electromagnetic spectrum (label the regions in order) -------------------------------------

interface EmRegion {
  id: string;
  label: string;
  accept: string[];
  fill: string;
}

const EM_REGIONS: EmRegion[] = [
  { id: 'em-radio', label: 'Radio waves', accept: ['radio'], fill: '#94a3b8' },
  { id: 'em-microwave', label: 'Microwaves', accept: ['microwave'], fill: '#64748b' },
  { id: 'em-infrared', label: 'Infrared', accept: ['ir', 'infra-red', 'infrared radiation'], fill: '#ef4444' },
  { id: 'em-visible', label: 'Visible light', accept: ['visible', 'light'], fill: '#22c55e' },
  { id: 'em-uv', label: 'Ultraviolet', accept: ['uv', 'ultra-violet'], fill: '#8b5cf6' },
  { id: 'em-xray', label: 'X-rays', accept: ['x-ray', 'xray', 'xrays'], fill: '#3b82f6' },
  { id: 'em-gamma', label: 'Gamma rays', accept: ['gamma', 'gamma ray'], fill: '#a855f7' },
];

function emSpectrum(): { primitives: DiagramPrimitive[]; nodes: DiagramNode[] } {
  const x0 = 6;
  const x1 = 94;
  const bandW = (x1 - x0) / EM_REGIONS.length;
  const bandTop = 42;
  const bandH = 14;

  const primitives: DiagramPrimitive[] = [];
  const nodes: DiagramNode[] = [];
  EM_REGIONS.forEach((region, i) => {
    const x = x0 + i * bandW;
    primitives.push(makePrimitive({ kind: 'rect', x, y: bandTop, width: bandW, height: bandH, fill: region.fill, stroke: 'currentColor', strokeWidth: 0.4 }));
    nodes.push(makeNode({ id: region.id, x: x + bandW / 2, y: bandTop + bandH + 12, correctLabel: region.label, acceptableLabels: region.accept }));
  });
  // increasing frequency / decreasing wavelength arrow above the bands
  primitives.push(
    makePrimitive({ kind: 'line', x1: x0, y1: 30, x2: x1, y2: 30, stroke: 'currentColor', strokeWidth: 0.5 }),
    makePrimitive({ kind: 'text', x: (x0 + x1) / 2, y: 24, text: 'Increasing frequency →', fontSize: 4, fill: 'currentColor' })
  );
  return { primitives, nodes };
}

const ALL_WAVE_PART_IDS = ['crest', 'trough', 'amplitude', 'wavelength', ...EM_REGIONS.map((r) => r.id)];

const waveDiagram: DiagramTemplateDefinition<WaveParams> = {
  id: 'wave-diagram',
  category: 'wave',
  promptBlurb: `Wave diagram. params.waveType one of: ${WAVE_TYPES.join(', ')}. 'transverse' draws a labelled transverse wave (crest, trough, amplitude, wavelength markers); 'em-spectrum' draws the electromagnetic spectrum bands in order. The student types the labels for the blanked parts.`,
  paramDocs: `stringParams: [{key:'waveType', value: one of ${WAVE_TYPES.join('|')}}]`,
  blankablePartIds: ALL_WAVE_PART_IDS,
  blankableSlotIds: [],
  blankableConnectionKeys: [],
  parseParams: (selection) => {
    const waveType = enumParam(selection, 'waveType', WAVE_TYPES);
    return waveType ? { waveType } : null;
  },
  build: (params) => {
    const { primitives, nodes } = params.waveType === 'em-spectrum' ? emSpectrum() : transverseWave();
    const title = params.waveType === 'em-spectrum' ? 'The electromagnetic spectrum' : 'Transverse wave';
    return { title, primitives, nodes, connections: [], slots: [], labelBank: [] };
  },
};

export const WAVE_DIAGRAM_TEMPLATES = [waveDiagram];
