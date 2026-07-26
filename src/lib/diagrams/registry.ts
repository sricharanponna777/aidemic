import type { DiagramTemplateDefinition } from './types';
import { ATOMIC_STRUCTURE_TEMPLATES } from './templates/bonding/atomicStructure';
import { DOT_AND_CROSS_TEMPLATES } from './templates/bonding/dotAndCross';
import { CELL_DIAGRAM_TEMPLATES } from './templates/biology/cellDiagram';
import { ORGAN_DIAGRAM_TEMPLATES } from './templates/biology/organDiagram';
import { APPARATUS_DIAGRAM_TEMPLATES } from './templates/chemistry/apparatusDiagram';
import { RAY_DIAGRAM_LENS_TEMPLATES } from './templates/physics/rayDiagramLens';
import { RAY_DIAGRAM_MIRROR_TEMPLATES } from './templates/physics/rayDiagramMirror';
import { CIRCUIT_DIAGRAM_TEMPLATES } from './templates/physics/circuitDiagram';
import { WAVE_DIAGRAM_TEMPLATES } from './templates/physics/waveDiagram';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const ALL_TEMPLATES: DiagramTemplateDefinition<any>[] = [
  ...DOT_AND_CROSS_TEMPLATES,
  ...ATOMIC_STRUCTURE_TEMPLATES,
  ...CELL_DIAGRAM_TEMPLATES,
  ...ORGAN_DIAGRAM_TEMPLATES,
  ...APPARATUS_DIAGRAM_TEMPLATES,
  ...RAY_DIAGRAM_LENS_TEMPLATES,
  ...RAY_DIAGRAM_MIRROR_TEMPLATES,
  ...CIRCUIT_DIAGRAM_TEMPLATES,
  ...WAVE_DIAGRAM_TEMPLATES,
];

const DIAGRAM_TEMPLATE_REGISTRY = new Map(ALL_TEMPLATES.map((template) => [template.id, template]));

export const getDiagramTemplate = (templateId: string) => DIAGRAM_TEMPLATE_REGISTRY.get(templateId) ?? null;

export const listDiagramTemplateIds = (): string[] => [...DIAGRAM_TEMPLATE_REGISTRY.keys()];

export const listDiagramTemplateMetadata = () =>
  ALL_TEMPLATES.map((template) => ({ id: template.id, category: template.category, promptBlurb: template.promptBlurb, paramDocs: template.paramDocs }));
