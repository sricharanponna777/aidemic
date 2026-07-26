'use client';

import { useMemo, useState } from 'react';
import type { DiagramSpec, DiagramSubmission, DiagramTemplateSelection } from '@/types';
import { DiagramAnswerInput } from '@/components/diagram/DiagramAnswerInput';
import { expandDiagramTemplate } from '@/lib/diagrams/expand';
import { listDiagramTemplateMetadata } from '@/lib/diagrams/registry';
import { getDiagramPalette } from '@/lib/diagrams/paletteRegistry';
import { markDiagramAnswer } from '@/lib/diagramMarking';
import { useTheme } from '@/hooks/useTheme';

/** A representative parameter bag per template. Empty blank* lists make expandDiagramTemplate blank
 * every gradeable feature (its documented fallback), which is exactly what we want for a gallery:
 * the densest version of each diagram, exercising every interaction. Add an entry here when a new
 * template is registered. */
const sel = (stringParams: [string, string][]): DiagramTemplateSelection => ({
  templateId: '',
  stringParams: stringParams.map(([key, value]) => ({ key, value })),
  numberParams: [],
  listParams: [],
});

const SAMPLE_SELECTIONS: Record<string, DiagramTemplateSelection> = {
  'cell-diagram': sel([['cellType', 'animal']]),
  'bonding-ionic': sel([['compoundId', 'nacl']]),
  'bonding-covalent': sel([['moleculeId', 'h2o']]),
  'atomic-structure': sel([['elementId', 'na']]),
  'ray-diagram-lens': sel([['opticsType', 'converging-lens'], ['objectDistanceCategory', 'beyond-2f']]),
  'ray-diagram-mirror': sel([['opticsType', 'concave-mirror'], ['objectDistanceCategory', 'between-f-and-2f']]),
  // Phase 5 templates:
  'wave-diagram': sel([['waveType', 'transverse']]),
  'circuit-diagram': sel([['circuitId', 'series-lamp']]),
  'apparatus-diagram': sel([['apparatusId', 'filtration']]),
  'organ-diagram': sel([['organId', 'heart']]),
};

const wrongOptionFor = (paletteId: string, correctOption: string): string => {
  const options = getDiagramPalette(paletteId)?.options ?? [];
  return options.find((o) => o.id !== correctOption)?.id ?? correctOption;
};

/** Build a deliberately partially-correct submission from a blanked spec so the review overlay shows
 * a realistic mix of correct (emerald) and wrong (amber) states: first feature of each kind wrong,
 * one connection left missing, the rest correct. */
const demoSubmission = (spec: DiagramSpec): DiagramSubmission => {
  const blankNodes = spec.nodes.filter((n) => !n.given && n.role === 'label');
  const missing = spec.connections.filter((c) => !c.given);
  const blankSlots = spec.slots.filter((s) => !s.given);

  // Symbols: place a VALID but "swapped" arrangement inside each interchangeable group (rotate the
  // group's correct options) — this must still read as fully correct, exercising order-independent
  // grading. Ungrouped slots keep the first one deliberately wrong to show the incorrect state.
  const byGroup = new Map<string, typeof blankSlots>();
  for (const s of blankSlots) {
    const key = s.group || `solo:${s.id}`;
    const arr = byGroup.get(key);
    if (arr) arr.push(s);
    else byGroup.set(key, [s]);
  }
  const slots: DiagramSubmission['slots'] = [];
  let soloIndex = 0;
  for (const [key, group] of byGroup) {
    if (key.startsWith('solo:')) {
      const s = group[0];
      slots.push({ slotId: s.id, optionId: soloIndex++ === 0 ? wrongOptionFor(s.paletteId, s.correctOption) : s.correctOption });
      continue;
    }
    const opts = group.map((s) => s.correctOption);
    const rotated = opts.length > 1 ? [...opts.slice(1), opts[0]] : opts;
    group.forEach((s, i) => slots.push({ slotId: s.id, optionId: rotated[i] }));
  }

  return {
    labels: blankNodes.map((n, i) => ({ nodeId: n.id, label: i === 0 ? 'Not quite right' : n.correctLabel })),
    connections: missing.slice(0, Math.max(0, missing.length - 1)).map((c) => ({ from: c.from, to: c.to })),
    slots,
  };
};

/** Simulate a spec stored before slot grouping existed, to prove the component recovers the grouping
 * by re-resolving from the template. */
const stripGroups = (spec: DiagramSpec): DiagramSpec => ({ ...spec, slots: spec.slots.map((s) => ({ ...s, group: '' })) });

const featureCount = (spec: DiagramSpec): number =>
  spec.nodes.filter((n) => !n.given && n.role === 'label').length +
  spec.connections.filter((c) => !c.given).length +
  spec.slots.filter((s) => !s.given).length;

function AnswerCard({ spec, template }: { spec: DiagramSpec; template: DiagramTemplateSelection }) {
  const [value, setValue] = useState('');
  return <DiagramAnswerInput diagramSpec={spec} diagramTemplate={template} value={value} onChange={setValue} mode="answer" />;
}

function ReviewCard({ spec, template }: { spec: DiagramSpec; template: DiagramTemplateSelection }) {
  const submission = useMemo(() => demoSubmission(spec), [spec]);
  const result = useMemo(() => markDiagramAnswer(spec, submission, featureCount(spec) || 1), [spec, submission]);
  // Feed the component a group-less ("legacy") spec plus the template: it must re-resolve and still
  // grade the swapped-but-valid symbols as correct, matching the mark shown below.
  const legacySpec = useMemo(() => stripGroups(spec), [spec]);
  return (
    <div className="space-y-2">
      <DiagramAnswerInput diagramSpec={legacySpec} diagramTemplate={template} value="" onChange={() => {}} mode="review" studentSubmission={submission} />
      <p className="text-xs text-content-subtle">
        Auto-mark: <span className="font-semibold text-content-muted">{result.marksAwarded}/{result.maxMarks}</span> · {result.band}
      </p>
    </div>
  );
}

function TemplateSection({ id, category, blurb }: { id: string; category: string; blurb: string }) {
  const template = useMemo(() => {
    const selection = SAMPLE_SELECTIONS[id];
    return selection ? { ...selection, templateId: id } : null;
  }, [id]);
  const spec = useMemo(() => (template ? expandDiagramTemplate(template) : null), [template]);

  return (
    <section className="rounded-2xl border border-subtle bg-surface p-5 shadow-sm dark:border-white/10 dark:bg-surface/[0.03]">
      <div className="mb-4 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2 className="text-base font-semibold text-content dark:text-white">{id}</h2>
        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-content-muted dark:bg-surface/10">
          {category}
        </span>
      </div>
      <p className="mb-4 max-w-3xl text-xs leading-relaxed text-content-subtle">{blurb}</p>
      {spec && template ? (
        <div className="grid gap-6 lg:grid-cols-2">
          <div>
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-content-subtle">Answer mode</p>
            <AnswerCard spec={spec} template={template} />
          </div>
          <div>
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-content-subtle">Review mode</p>
            <ReviewCard spec={spec} template={template} />
          </div>
        </div>
      ) : (
      <p className="text-sm text-amber-600 dark:text-amber-400">No sample selection configured (or it did not expand) for “{id}”.</p>
      )}
    </section>
  );
}

export function DiagramGallery() {
  const { theme, toggleTheme } = useTheme();
  const [narrow, setNarrow] = useState(false);
  const templates = useMemo(() => listDiagramTemplateMetadata(), []);

  return (
    <div className="min-h-screen bg-surface-sunken text-content dark:bg-[#060912] dark:text-white">
      <header className="sticky top-0 z-10 border-b border-subtle bg-surface-sunken/90 backdrop-blur dark:border-white/10 dark:bg-[#060912]/90">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-3">
          <div>
            <h1 className="text-lg font-bold">Diagram gallery</h1>
            <p className="text-xs text-content-subtle">{templates.length} templates · dev only</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setNarrow((n) => !n)}
              className="rounded-lg border border-subtle px-3 py-1.5 text-sm font-medium hover:bg-slate-100 dark:border-white/15 dark:hover:bg-surface/10"
            >
              {narrow ? 'Full width' : 'Mobile width'}
            </button>
            <button
              type="button"
              onClick={toggleTheme}
              suppressHydrationWarning
              className="rounded-lg border border-subtle px-3 py-1.5 text-sm font-medium hover:bg-slate-100 dark:border-white/15 dark:hover:bg-surface/10"
            >
              {theme === 'dark' ? 'Light theme' : 'Dark theme'}
            </button>
          </div>
        </div>
      </header>

      <main className={`mx-auto space-y-6 px-4 py-6 ${narrow ? 'max-w-[420px]' : 'max-w-5xl'}`}>
        {templates.map((t) => (
          <TemplateSection key={t.id} id={t.id} category={t.category} blurb={t.promptBlurb} />
        ))}
      </main>
    </div>
  );
}
