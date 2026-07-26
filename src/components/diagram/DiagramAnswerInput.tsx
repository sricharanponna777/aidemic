'use client';

import { useMemo, useRef, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { Check, RotateCcw, Shapes, Spline, Type, X } from 'lucide-react';
import type { DiagramNode, DiagramSlot, DiagramSpec, DiagramSubmission, DiagramTemplateSelection } from '@/types';
import { DiagramCanvas } from './DiagramCanvas';
import { getDiagramPalette, type DiagramGlyphKind } from '@/lib/diagrams/paletteRegistry';
import { resolveDiagramSpec } from '@/lib/ai/diagramTemplate';
import { gradeDiagramSlots, labelMatchesNode } from '@/lib/diagramMarking';

interface DiagramAnswerInputProps {
  diagramSpec: DiagramSpec;
  value: string;
  onChange: (serialized: string) => void;
  mode: 'answer' | 'review';
  studentSubmission?: DiagramSubmission | null;
  /** The template the spec came from, when it is a templated diagram. When present, the spec is
   * re-derived from the template so its geometry AND slot grouping always match the current template
   * code and the server-side marking — even for specs stored before a template change. */
  diagramTemplate?: DiagramTemplateSelection | null;
}

type InteractionMode = 'label' | 'connect' | 'slot';

const parseSubmission = (value: string): DiagramSubmission | null => {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as Partial<DiagramSubmission>;
    return { labels: parsed.labels ?? [], connections: parsed.connections ?? [], slots: parsed.slots ?? [] };
  } catch {
    return null;
  }
};

const FONT_SIZE = 3.2;
const LINE_HEIGHT = FONT_SIZE * 1.15;
const BOX_HEIGHT = 7;
const MIN_BOX_WIDTH = 14;
const MAX_BOX_WIDTH = 32; // capped well below typical column spacing so long labels wrap instead of overlapping neighboring nodes
const CHARS_PER_LINE = Math.floor((MAX_BOX_WIDTH - 6) / (FONT_SIZE * 0.58));
const MAX_LINES = 3;
const EDIT_BOX_WIDTH = 26;
const EDIT_BOX_HEIGHT = 8;
const GLYPH_SLOT_R = 2.6;
const HIT_R = 4.8; // invisible larger pointer/touch target around small anchors and glyph slots

// Below this pointer travel distance (in screen px), a pointerdown/pointerup pair on a node or a
// palette chip counts as a tap rather than a drag -- lets connect-mode and slot-mode keep working
// as two-step tap/click even though the primary gesture is now drag-and-drop.
const TAP_DRAG_THRESHOLD = 6;

// Palettes whose options are full words (real/virtual, upright/inverted, ...) render as a wider
// label-style chip; everything else (dot/cross/±) renders as a small glyph directly on the slot.
const CHIP_PALETTE_IDS = new Set(['image-nature', 'image-orientation', 'image-size']);

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const wrapLabel = (label: string): string[] => {
  const words = label.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (current && next.length > CHARS_PER_LINE) {
      lines.push(current);
      current = word;
    } else {
      current = next;
    }
  }
  if (current) lines.push(current);
  return lines.length > 0 ? lines.slice(0, MAX_LINES) : [''];
};

const boxWidthFor = (lines: string[]) =>
  clamp(Math.max(...lines.map((line) => line.length)) * FONT_SIZE * 0.58 + 6, MIN_BOX_WIDTH, MAX_BOX_WIDTH);

const boxHeightFor = (lines: string[]) => Math.max(BOX_HEIGHT, lines.length * LINE_HEIGHT + 2.5);

// --- Overlap-avoidance layout -------------------------------------------------------------
// Label boxes and word-style slot chips vary in size with their content, so two nodes/slots the
// AI placed close together can end up visually overlapping. This nudges only the resizable boxes
// apart (a few passes of simple AABB separation), leaving fixed-size anchors/glyph-slots in place
// so connections and pictorial callouts stay geometrically accurate.
interface LayoutBox {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  movable: boolean;
}

const LAYOUT_ITERATIONS = 6;
const MAX_LAYOUT_DRIFT = 12; // never wander more than this many units from the authored position

const resolveLayout = (boxes: LayoutBox[]): Map<string, { x: number; y: number }> => {
  const positions = new Map(boxes.map((b) => [b.id, { x: b.x, y: b.y }]));
  const anchors = new Map(boxes.map((b) => [b.id, { x: b.x, y: b.y }]));

  for (let iter = 0; iter < LAYOUT_ITERATIONS; iter++) {
    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i];
        const b = boxes[j];
        if (!a.movable && !b.movable) continue;
        const pa = positions.get(a.id)!;
        const pb = positions.get(b.id)!;
        const overlapX = (a.width + b.width) / 2 - Math.abs(pa.x - pb.x);
        const overlapY = (a.height + b.height) / 2 - Math.abs(pa.y - pb.y);
        if (overlapX <= 0 || overlapY <= 0) continue;

        const pushAlongX = overlapX < overlapY;
        if (pushAlongX) {
          const sign = pa.x - pb.x >= 0 ? 1 : -1;
          if (a.movable && b.movable) {
            pa.x = clamp(pa.x + sign * (overlapX / 2 + 0.2), 0, 100);
            pb.x = clamp(pb.x - sign * (overlapX / 2 + 0.2), 0, 100);
          } else if (a.movable) {
            pa.x = clamp(pa.x + sign * (overlapX + 0.2), 0, 100);
          } else {
            pb.x = clamp(pb.x - sign * (overlapX + 0.2), 0, 100);
          }
        } else {
          const sign = pa.y - pb.y >= 0 ? 1 : -1;
          if (a.movable && b.movable) {
            pa.y = clamp(pa.y + sign * (overlapY / 2 + 0.2), 0, 100);
            pb.y = clamp(pb.y - sign * (overlapY / 2 + 0.2), 0, 100);
          } else if (a.movable) {
            pa.y = clamp(pa.y + sign * (overlapY + 0.2), 0, 100);
          } else {
            pb.y = clamp(pb.y - sign * (overlapY + 0.2), 0, 100);
          }
        }
      }
    }
  }

  for (const box of boxes) {
    if (!box.movable) continue;
    const pos = positions.get(box.id)!;
    const anchor = anchors.get(box.id)!;
    const dx = pos.x - anchor.x;
    const dy = pos.y - anchor.y;
    const dist = Math.hypot(dx, dy);
    if (dist > MAX_LAYOUT_DRIFT) {
      const scale = MAX_LAYOUT_DRIFT / dist;
      positions.set(box.id, { x: clamp(anchor.x + dx * scale, 0, 100), y: clamp(anchor.y + dy * scale, 0, 100) });
    }
  }

  return positions;
};

// --- Content-fit viewBox ---------------------------------------------------------------------
// The base geometry is authored in 0..100 but a given diagram usually occupies only part of it, so
// rendering the full square leaves large empty margins. We compute the tight bounding box of every
// drawn thing (primitives, label boxes, slots, connection endpoints) and render into that instead,
// so the diagram fills the frame and text is as large/legible as possible.
interface Bounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

const FULL_VIEWBOX = '0 0 100 100';
const VIEWBOX_PADDING = 4;
const MIN_VIEWBOX_EXTENT = 34; // never zoom in so far that a tiny diagram looks comically large

const growBounds = (b: Bounds, x: number, y: number, halfW = 0, halfH = 0) => {
  b.minX = Math.min(b.minX, x - halfW);
  b.minY = Math.min(b.minY, y - halfH);
  b.maxX = Math.max(b.maxX, x + halfW);
  b.maxY = Math.max(b.maxY, y + halfH);
};

const clientToSvgPoint = (svg: SVGSVGElement, clientX: number, clientY: number): { x: number; y: number } => {
  const ctm = svg.getScreenCTM();
  if (!ctm) return { x: 0, y: 0 };
  const point = svg.createSVGPoint();
  point.x = clientX;
  point.y = clientY;
  const transformed = point.matrixTransform(ctm.inverse());
  return { x: transformed.x, y: transformed.y };
};

function SlotGlyph({ glyphKind, glyphText }: { glyphKind: DiagramGlyphKind; glyphText?: string }) {
  switch (glyphKind) {
    case 'dot':
    return <circle r={1.3} className="fill-current" />;
    case 'cross':
      return (
        <>
        <line x1={-1.4} y1={-1.4} x2={1.4} y2={1.4} className="stroke-current" strokeWidth={0.6} />
        <line x1={-1.4} y1={1.4} x2={1.4} y2={-1.4} className="stroke-current" strokeWidth={0.6} />
        </>
      );
    default:
      return (
        <text fontSize={3} textAnchor="middle" dominantBaseline="middle" className="fill-current">
          {glyphText ?? ''}
        </text>
      );
  }
}

/** Small ✓/✗ marker shown on a reviewed node/slot so correctness is never conveyed by colour alone. */
function StatusBadge({ x, y, correct }: { x: number; y: number; correct: boolean }) {
  return (
    <g transform={`translate(${x} ${y})`} aria-hidden>
      <circle r={2} className={correct ? 'fill-emerald-500' : 'fill-amber-500'} />
      {correct ? (
        <path d="M-1 0 L-0.2 0.9 L1.1 -0.9" fill="none" stroke="white" strokeWidth={0.5} strokeLinecap="round" strokeLinejoin="round" />
      ) : (
        <>
          <line x1={-0.9} y1={-0.9} x2={0.9} y2={0.9} stroke="white" strokeWidth={0.5} strokeLinecap="round" />
          <line x1={-0.9} y1={0.9} x2={0.9} y2={-0.9} stroke="white" strokeWidth={0.5} strokeLinecap="round" />
        </>
      )}
    </g>
  );
}

const MODE_META: Record<InteractionMode, { label: string; hint: string; Icon: typeof Type }> = {
  label: { label: 'Label parts', hint: 'Select a blank box and type the answer. Press Enter to save, Escape to cancel.', Icon: Type },
  connect: { label: 'Draw connections', hint: 'Drag from one node to another — or select one then the other — to draw a connection. Click a line to remove it.', Icon: Spline },
  slot: { label: 'Place symbols', hint: 'Drag a symbol onto a blank slot, or select a slot then tap its symbol. Select a filled slot to clear it.', Icon: Shapes },
};

/** Interactive "complete the diagram" widget: the student types blank labels into their boxes, drags
 * symbol chips from a palette onto blank slots (or taps to place), and drags between nodes to draw
 * missing connections. Fully operable by mouse, touch and keyboard. Serializes to a DiagramSubmission
 * JSON string via onChange, matching the updateAnswer(index, value: string) contract every question
 * type uses. */
export function DiagramAnswerInput({ diagramSpec: rawDiagramSpec, value, onChange, mode, studentSubmission, diagramTemplate }: DiagramAnswerInputProps) {
  const readOnly = mode === 'review';
  const reduceMotion = useReducedMotion();
  const submission = readOnly ? studentSubmission ?? null : parseSubmission(value);

  // For a templated diagram, re-derive the spec from the template so its geometry and slot grouping
  // match the current template code and the (server-side) marking, even if the stored spec predates
  // a template change. Falls back to the given spec for freehand diagrams or if resolution fails.
  const baseSpec = useMemo(
    () => (diagramTemplate?.templateId ? resolveDiagramSpec(rawDiagramSpec, diagramTemplate) ?? rawDiagramSpec : rawDiagramSpec),
    [rawDiagramSpec, diagramTemplate]
  );

  // Defensive against diagram data saved before slots/role/style/acceptableLabels existed (older
  // attempts/assignments) -- treat missing fields as their pre-template-era meaning.
  const diagramSpec: DiagramSpec = {
    ...baseSpec,
    nodes: (baseSpec.nodes ?? []).map((node) => ({ ...node, role: node.role ?? 'label', acceptableLabels: node.acceptableLabels ?? [] })),
    connections: (baseSpec.connections ?? []).map((connection) => ({ ...connection, style: connection.style ?? 'solid' })),
    slots: baseSpec.slots ?? [],
    labelBank: baseSpec.labelBank ?? [],
  };

  const labelsMap = new Map((submission?.labels ?? []).map((item) => [item.nodeId, item.label]));
  const drawnConnections = submission?.connections ?? [];
  const slotsMap = new Map((submission?.slots ?? []).map((item) => [item.slotId, item.optionId]));
  // In review, colour slots using the same order-independent grouping the marker uses, so a valid
  // but "swapped" electron (e.g. dot and cross the other way round in a bond) reads as correct.
  const slotGrades = readOnly ? gradeDiagramSlots(diagramSpec, submission) : null;

  const blankNodes = diagramSpec.nodes.filter((node) => !node.given && node.role === 'label');
  const missingConnections = diagramSpec.connections.filter((connection) => !connection.given);
  const blankSlots = diagramSpec.slots.filter((slot) => !slot.given);
  const hasBlankNodes = blankNodes.length > 0;
  const hasMissingConnections = missingConnections.length > 0;
  const hasBlankSlots = blankSlots.length > 0;

  const availableModes = ([hasBlankNodes && 'label', hasMissingConnections && 'connect', hasBlankSlots && 'slot'] as const).filter(
    (m): m is InteractionMode => Boolean(m)
  );

  const [interactionMode, setInteractionMode] = useState<InteractionMode>(availableModes[0] ?? 'label');
  const [editingNodeId, setEditingNodeId] = useState<string | null>(null);
  const [draftText, setDraftText] = useState('');
  const [pendingFrom, setPendingFrom] = useState<string | null>(null);
  const [activeDragFrom, setActiveDragFrom] = useState<string | null>(null);
  const [liveDragPoint, setLiveDragPoint] = useState<{ x: number; y: number } | null>(null);
  const [selectedSlotId, setSelectedSlotId] = useState<string | null>(null);
  const [dragChip, setDragChip] = useState<{ optionId: string; label: string; x: number; y: number } | null>(null);
  const [hoverSlotId, setHoverSlotId] = useState<string | null>(null);
  const [focusedId, setFocusedId] = useState<string | null>(null);

  const svgRef = useRef<SVGSVGElement | null>(null);
  const suppressNextChipClick = useRef(false);

  const nodeById = new Map(diagramSpec.nodes.map((node) => [node.id, node] as const));
  const slotById = new Map(diagramSpec.slots.map((slot) => [slot.id, slot] as const));

  const emit = (labels: Map<string, string>, connections: { from: string; to: string }[], slots: Map<string, string>) => {
    onChange(
      JSON.stringify({
        labels: [...labels].map(([nodeId, label]) => ({ nodeId, label })),
        connections,
        slots: [...slots].map(([slotId, optionId]) => ({ slotId, optionId })),
      } satisfies DiagramSubmission)
    );
  };

  const assignLabel = (nodeId: string, label: string) => {
    const next = new Map(labelsMap);
    next.set(nodeId, label);
    emit(next, drawnConnections, slotsMap);
  };

  const clearLabel = (nodeId: string) => {
    const next = new Map(labelsMap);
    next.delete(nodeId);
    emit(next, drawnConnections, slotsMap);
  };

  const addConnection = (from: string, to: string) => {
    if (from === to) return;
    if (drawnConnections.some((c) => c.from === from && c.to === to)) return;
    emit(labelsMap, [...drawnConnections, { from, to }], slotsMap);
  };

  const removeConnection = (index: number) => {
    emit(
      labelsMap,
      drawnConnections.filter((_, i) => i !== index),
      slotsMap
    );
  };

  const assignSlot = (slotId: string, optionId: string) => {
    const next = new Map(slotsMap);
    next.set(slotId, optionId);
    emit(labelsMap, drawnConnections, next);
    setSelectedSlotId(null);
  };

  const clearSlot = (slotId: string) => {
    const next = new Map(slotsMap);
    next.delete(slotId);
    emit(labelsMap, drawnConnections, next);
  };

  const clearAll = () => {
    onChange(JSON.stringify({ labels: [], connections: [], slots: [] } satisfies DiagramSubmission));
    setEditingNodeId(null);
    setPendingFrom(null);
    setSelectedSlotId(null);
  };

  const labelForNode = (node: DiagramNode) => {
    if (node.given) return node.correctLabel;
    return labelsMap.get(node.id) ?? '';
  };

  const openLabelEditor = (node: DiagramNode) => {
    if (readOnly || node.role === 'anchor' || node.given) return;
    setEditingNodeId(node.id);
    setDraftText(labelsMap.get(node.id) ?? '');
  };

  const commitEdit = () => {
    if (!editingNodeId) return;
    const nodeId = editingNodeId;
    const text = draftText.trim();
    setEditingNodeId(null);
    if (text) assignLabel(nodeId, text);
    else clearLabel(nodeId);
  };

  // Two-step "select source, then target" connection flow, shared by tap and keyboard.
  const activateConnect = (nodeId: string) => {
    setPendingFrom((current) => {
      if (current === null) return nodeId;
      if (current === nodeId) return null;
      addConnection(current, nodeId);
      return null;
    });
  };

  const handleSlotClick = (slot: DiagramSlot) => {
    if (readOnly || slot.given) return;
    if (slotsMap.has(slot.id)) {
      clearSlot(slot.id);
      setSelectedSlotId(null);
    } else {
      setSelectedSlotId((current) => (current === slot.id ? null : slot.id));
    }
  };

  // Drag-to-connect: press on a node, drag to another node and release to link them. A press/
  // release with little travel is treated as a tap instead (activateConnect).
  const handleNodePointerDown = (e: React.PointerEvent, node: DiagramNode) => {
    if (readOnly || interactionMode !== 'connect') return;
    e.stopPropagation();
    const startX = e.clientX;
    const startY = e.clientY;
    const startNodeId = node.id;

    const onMove = (ev: PointerEvent) => {
      if (!svgRef.current) return;
      setActiveDragFrom(startNodeId);
      setLiveDragPoint(clientToSvgPoint(svgRef.current, ev.clientX, ev.clientY));
    };

    const onUp = (ev: PointerEvent) => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      setActiveDragFrom(null);
      setLiveDragPoint(null);

      const distance = Math.hypot(ev.clientX - startX, ev.clientY - startY);
      const targetEl = document.elementFromPoint(ev.clientX, ev.clientY) as Element | null;
      const targetNodeId = targetEl?.closest('[data-node-id]')?.getAttribute('data-node-id') ?? null;

      if (distance < TAP_DRAG_THRESHOLD) {
        activateConnect(startNodeId);
        return;
      }

      if (targetNodeId && targetNodeId !== startNodeId) {
        addConnection(startNodeId, targetNodeId);
      }
      setPendingFrom(null);
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  // Drag-and-drop: press a palette chip, drag it over a blank slot and release to place it. A short
  // press falls through to the chip's onClick (place into the selected / next-empty slot).
  const handleChipPointerDown = (e: React.PointerEvent, optionId: string, chipLabel: string) => {
    if (readOnly) return;
    const startX = e.clientX;
    const startY = e.clientY;

    const onMove = (ev: PointerEvent) => {
      setDragChip({ optionId, label: chipLabel, x: ev.clientX, y: ev.clientY });
      const el = document.elementFromPoint(ev.clientX, ev.clientY) as Element | null;
      setHoverSlotId(el?.closest('[data-slot-id]')?.getAttribute('data-slot-id') ?? null);
    };

    const onUp = (ev: PointerEvent) => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      setDragChip(null);
      setHoverSlotId(null);

      const distance = Math.hypot(ev.clientX - startX, ev.clientY - startY);
      if (distance < TAP_DRAG_THRESHOLD) return; // let the click handler treat this as a tap

      suppressNextChipClick.current = true;
      const el = document.elementFromPoint(ev.clientX, ev.clientY) as Element | null;
      const slotId = el?.closest('[data-slot-id]')?.getAttribute('data-slot-id') ?? null;
      const slot = slotId ? slotById.get(slotId) : undefined;
      if (slot && !slot.given) assignSlot(slot.id, optionId);
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  const nodeState = (node: DiagramNode): 'given' | 'editing' | 'filled' | 'blank' | 'correct' | 'wrong' => {
    if (node.given) return 'given';
    if (readOnly) {
      const placed = labelsMap.get(node.id) ?? '';
      return placed && labelMatchesNode(placed, node) ? 'correct' : 'wrong';
    }
    if (editingNodeId === node.id) return 'editing';
    return labelsMap.has(node.id) ? 'filled' : 'blank';
  };

  const activeSlotForPalette = selectedSlotId ? slotById.get(selectedSlotId) : blankSlots[0];
  const activePalette = activeSlotForPalette ? getDiagramPalette(activeSlotForPalette.paletteId) : null;

  // Progress across every blank the student can fill (not correctness — no answer leak).
  const totalFeatures = blankNodes.length + missingConnections.length + blankSlots.length;
  const placedFeatures =
    blankNodes.filter((n) => (labelsMap.get(n.id) ?? '').trim().length > 0).length +
    Math.min(drawnConnections.length, missingConnections.length) +
    blankSlots.filter((s) => slotsMap.has(s.id)).length;
  const hasAnyPlaced = placedFeatures > 0 || drawnConnections.length > 0;
  const progressPct = totalFeatures > 0 ? Math.round((placedFeatures / totalFeatures) * 100) : 0;

  // --- Overlap-avoidance layout: compute once per render from current content. -----------------
  const layoutBoxes: LayoutBox[] = [];
  diagramSpec.nodes.forEach((node) => {
    if (node.role === 'anchor') {
      layoutBoxes.push({ id: node.id, x: node.x, y: node.y, width: 3, height: 3, movable: false });
      return;
    }
    const lines = wrapLabel(labelForNode(node) || '?');
    layoutBoxes.push({ id: node.id, x: node.x, y: node.y, width: boxWidthFor(lines), height: boxHeightFor(lines), movable: true });
  });
  diagramSpec.slots.forEach((slot) => {
    if (CHIP_PALETTE_IDS.has(slot.paletteId)) {
      const palette = getDiagramPalette(slot.paletteId);
      const chosenOptionId = slot.given ? slot.correctOption : slotsMap.get(slot.id);
      const option = chosenOptionId ? palette?.options.find((o) => o.id === chosenOptionId) : undefined;
      const lines = wrapLabel(option?.label || (slot.given ? '' : '?'));
      layoutBoxes.push({ id: slot.id, x: slot.x, y: slot.y, width: boxWidthFor(lines), height: boxHeightFor(lines), movable: true });
    } else {
      layoutBoxes.push({ id: slot.id, x: slot.x, y: slot.y, width: 5.2, height: 5.2, movable: false });
    }
  });
  const layoutPositions = resolveLayout(layoutBoxes);
  const positionFor = (id: string, fallbackX: number, fallbackY: number) => layoutPositions.get(id) ?? { x: fallbackX, y: fallbackY };

  // --- Content-fit viewBox from the resolved layout + primitives -------------------------------
  const computeViewBox = (): string => {
    // Paths have no cheap bounds; if any exist, fall back to the full square rather than risk cropping.
    if (diagramSpec.primitives.some((p) => p.kind === 'path')) return FULL_VIEWBOX;
    const b: Bounds = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };

    for (const p of diagramSpec.primitives) {
      switch (p.kind) {
        case 'circle':
          growBounds(b, p.cx, p.cy, p.r, p.r);
          break;
        case 'ellipse':
          growBounds(b, p.cx, p.cy, p.rx, p.ry);
          break;
        case 'rect':
          growBounds(b, p.x + p.width / 2, p.y + p.height / 2, p.width / 2, p.height / 2);
          break;
        case 'line':
          growBounds(b, p.x1, p.y1);
          growBounds(b, p.x2, p.y2);
          break;
        case 'polygon':
        case 'polyline':
          for (let i = 0; i + 1 < p.points.length; i += 2) growBounds(b, p.points[i], p.points[i + 1]);
          break;
        case 'text':
          growBounds(b, p.x, p.y, (p.text.length * p.fontSize) / 3.2, p.fontSize * 0.7);
          break;
      }
    }
    for (const box of layoutBoxes) {
      const pos = layoutPositions.get(box.id) ?? { x: box.x, y: box.y };
      growBounds(b, pos.x, pos.y, box.width / 2, box.height / 2);
    }

    if (!Number.isFinite(b.minX)) return FULL_VIEWBOX;
    let minX = b.minX - VIEWBOX_PADDING;
    let minY = b.minY - VIEWBOX_PADDING;
    let maxX = b.maxX + VIEWBOX_PADDING;
    let maxY = b.maxY + VIEWBOX_PADDING;
    // Enforce a minimum extent so small diagrams don't over-zoom.
    if (maxX - minX < MIN_VIEWBOX_EXTENT) {
      const mid = (minX + maxX) / 2;
      minX = mid - MIN_VIEWBOX_EXTENT / 2;
      maxX = mid + MIN_VIEWBOX_EXTENT / 2;
    }
    if (maxY - minY < MIN_VIEWBOX_EXTENT) {
      const mid = (minY + maxY) / 2;
      minY = mid - MIN_VIEWBOX_EXTENT / 2;
      maxY = mid + MIN_VIEWBOX_EXTENT / 2;
    }
    minX = clamp(minX, -5, 100);
    minY = clamp(minY, -5, 100);
    maxX = clamp(maxX, 0, 105);
    maxY = clamp(maxY, 0, 105);
    return `${minX.toFixed(1)} ${minY.toFixed(1)} ${(maxX - minX).toFixed(1)} ${(maxY - minY).toFixed(1)}`;
  };
  const viewBox = computeViewBox();

  const connectionLine = (
    from: string,
    to: string,
    opts: { color: string; marker: string; dashed?: boolean; key: string; directed: boolean }
  ) => {
    const a = nodeById.get(from);
    const b = nodeById.get(to);
    if (!a || !b) return null;
    const pa = positionFor(from, a.x, a.y);
    const pb = positionFor(to, b.x, b.y);
    return (
      <line
        key={opts.key}
        x1={pa.x}
        y1={pa.y}
        x2={pb.x}
        y2={pb.y}
        stroke={opts.color}
        strokeWidth={0.8}
        strokeLinecap="round"
        strokeDasharray={opts.dashed ? '2 1.5' : undefined}
        markerEnd={opts.directed ? `url(#${opts.marker})` : undefined}
      />
    );
  };

  const currentMode = MODE_META[interactionMode];

  return (
    <div className="space-y-3">
      {/* Toolbar (answer mode) --------------------------------------------------------------- */}
      {!readOnly ? (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="min-w-0">
              {diagramSpec.title ? (
                <p className="truncate text-sm font-semibold text-content-muted text-content">{diagramSpec.title}</p>
              ) : null}
              <p className="text-xs text-content-subtle">
                {placedFeatures} of {totalFeatures} placed
              </p>
            </div>
            <div className="flex items-center gap-2">
              {availableModes.length > 1 ? (
                <div className="inline-flex rounded-lg bg-slate-100 p-0.5 dark:bg-surface/5" role="tablist" aria-label="Diagram interaction mode">
                  {availableModes.map((m) => {
                    const { label, Icon } = MODE_META[m];
                    const active = interactionMode === m;
                    return (
                      <button
                        key={m}
                        type="button"
                        role="tab"
                        aria-selected={active}
                        onClick={() => {
                          setInteractionMode(m);
                          setEditingNodeId(null);
                          setPendingFrom(null);
                          setSelectedSlotId(null);
                        }}
                        className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition ${
                          active
                            ? 'bg-surface text-accent shadow-sm dark:bg-surface/10 dark:text-white'
                            : 'text-content-subtle hover:text-content-muted dark:hover:text-slate-200'
                        }`}
                      >
                      <Icon className="h-3.5 w-3.5" aria-hidden />
                        {label}
                      </button>
                    );
                  })}
                </div>
              ) : null}
              {hasAnyPlaced ? (
                <button
                  type="button"
                  onClick={clearAll}
                  className="inline-flex items-center gap-1 rounded-lg border border-subtle px-2.5 py-1 text-xs font-medium text-content-subtle transition hover:border-subtle hover:text-content-muted dark:hover:text-slate-200"
                >
                <RotateCcw className="h-3.5 w-3.5" aria-hidden />
                  Clear
                </button>
              ) : null}
            </div>
          </div>
          {totalFeatures > 0 ? (
            <div className="h-1 overflow-hidden rounded-full bg-slate-100 dark:bg-surface/10" role="progressbar" aria-valuenow={placedFeatures} aria-valuemin={0} aria-valuemax={totalFeatures}>
              <div className="h-full rounded-full bg-indigo-500 transition-all" style={{ width: `${progressPct}%` }} />
            </div>
          ) : null}
          <p className="text-xs text-content-subtle">
            {interactionMode === 'connect' && (pendingFrom || activeDragFrom) ? 'Now drag to (or select) the node to connect it to.' : currentMode.hint}
          </p>
        </div>
      ) : null}

      {/* Legend (review mode) ---------------------------------------------------------------- */}
      {readOnly ? (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-content-subtle">
          <span className="inline-flex items-center gap-1">
            <Check className="h-3.5 w-3.5 text-emerald-500" aria-hidden /> Correct
          </span>
          <span className="inline-flex items-center gap-1">
            <X className="h-3.5 w-3.5 text-amber-500" aria-hidden /> Your answer needs work
          </span>
          {hasMissingConnections ? (
            <span className="inline-flex items-center gap-1">
              <svg width="18" height="8" viewBox="0 0 18 8" aria-hidden>
                <line x1="1" y1="4" x2="17" y2="4" stroke="#16a34a" strokeWidth="1.4" strokeDasharray="3 2" />
              </svg>
              Correct answer
            </span>
          ) : null}
        </div>
      ) : null}

      <DiagramCanvas ref={svgRef} spec={diagramSpec} viewBox={viewBox} ariaLabel={diagramSpec.title}>
        {/* Given (pre-drawn) connections */}
        {diagramSpec.connections
          .filter((connection) => connection.given)
          .map((connection, index) =>
            connectionLine(connection.from, connection.to, {
              color: 'currentColor',
              marker: 'diagram-arrow-muted',
              dashed: connection.style === 'dashed',
              key: `given-${index}`,
              directed: connection.directed,
            })
          )}

        {/* Correct answer overlay (review only) — the connections the student had to draw */}
        {readOnly
          ? missingConnections.map((connection, index) =>
              connectionLine(connection.from, connection.to, {
                color: '#16a34a',
                marker: 'diagram-arrow-green',
                dashed: true,
                key: `correct-${index}`,
                directed: connection.directed,
              })
            )
          : null}

        {/* Student-drawn connections (+ click-to-remove hit line in answer/connect mode) */}
        {drawnConnections.map((connection, index) => {
          const a = nodeById.get(connection.from);
          const b = nodeById.get(connection.to);
          if (!a || !b) return null;
          const pa = positionFor(connection.from, a.x, a.y);
          const pb = positionFor(connection.to, b.x, b.y);
          const removable = !readOnly && interactionMode === 'connect';
          return (
            <g key={`drawn-${connection.from}-${connection.to}-${index}`}>
              <motion.line
                x1={pa.x}
                y1={pa.y}
                x2={pb.x}
                y2={pb.y}
                stroke="#d97706"
                strokeWidth={0.8}
                strokeLinecap="round"
                markerEnd="url(#diagram-arrow-amber)"
                initial={reduceMotion ? false : { pathLength: 0, opacity: 0 }}
                animate={{ pathLength: 1, opacity: 1 }}
                transition={{ duration: 0.25 }}
              />
              {removable ? (
                <line
                  x1={pa.x}
                  y1={pa.y}
                  x2={pb.x}
                  y2={pb.y}
                  stroke="transparent"
                  strokeWidth={3.5}
                  className="cursor-pointer"
                  onClick={() => removeConnection(index)}
                >
                  <title>Remove this connection</title>
                </line>
              ) : null}
            </g>
          );
        })}

        {/* Live rubber-band line while dragging a connection */}
        {activeDragFrom && liveDragPoint
          ? (() => {
              const from = nodeById.get(activeDragFrom);
              if (!from) return null;
              const pa = positionFor(activeDragFrom, from.x, from.y);
              return <line x1={pa.x} y1={pa.y} x2={liveDragPoint.x} y2={liveDragPoint.y} stroke="#6366f1" strokeWidth={0.8} strokeLinecap="round" strokeDasharray="1.5 1" />;
            })()
          : null}

        {/* Anchor nodes — pure connection endpoints (e.g. ray-diagram kink points), never labelled */}
        {diagramSpec.nodes
          .filter((node) => node.role === 'anchor')
          .map((node) => {
            const pos = positionFor(node.id, node.x, node.y);
            const isConnectPending = pendingFrom === node.id || activeDragFrom === node.id;
            const isFocused = focusedId === node.id;
            const interactive = !readOnly && interactionMode === 'connect';
            const highlight = isConnectPending || isFocused;
            return (
              <g
                key={node.id}
                data-node-id={node.id}
                onPointerDown={(e) => handleNodePointerDown(e, node)}
                onKeyDown={interactive ? (e) => keyActivate(e, () => activateConnect(node.id)) : undefined}
                onFocus={() => setFocusedId(node.id)}
                onBlur={() => setFocusedId((f) => (f === node.id ? null : f))}
                tabIndex={interactive ? 0 : undefined}
                role={interactive ? 'button' : undefined}
                aria-label={interactive ? `Connection point. Press Enter to ${pendingFrom ? 'connect it to the selected node' : 'start a connection here'}.` : undefined}
                className={`${interactive ? 'cursor-pointer focus:outline-none' : ''}`}
              >
              {highlight ? <circle cx={pos.x} cy={pos.y} r={2.6} className="fill-indigo-500/15 stroke-indigo-500" strokeWidth={0.4} /> : null}
                <circle cx={pos.x} cy={pos.y} r={HIT_R} fill="transparent" />
                <circle cx={pos.x} cy={pos.y} r={highlight ? 1.6 : 1} className={highlight ? 'fill-indigo-500' : 'fill-slate-400 dark:fill-slate-500'} />
              </g>
            );
          })}

        {/* Label nodes */}
        {diagramSpec.nodes
          .filter((node) => node.role === 'label')
          .map((node) => {
            const pos = positionFor(node.id, node.x, node.y);
            const label = labelForNode(node);
            const display = label || (node.given ? node.correctLabel : '?');
            const lines = wrapLabel(display);
            const width = boxWidthFor(lines);
            const height = boxHeightFor(lines);
            const x = clamp(pos.x - width / 2, 0, 100 - width);
            const y = clamp(pos.y - height / 2, 0, 100 - height);
            const state = nodeState(node);

            const boxClass =
              state === 'given'
                ? 'fill-slate-100 stroke-slate-300 dark:fill-slate-800 dark:stroke-slate-600'
                : state === 'editing'
                  ? 'fill-indigo-50 stroke-indigo-500 dark:fill-indigo-500/10'
                  : state === 'filled'
                    ? 'fill-white stroke-indigo-400 dark:fill-slate-900'
                    : state === 'correct'
                      ? 'fill-emerald-50 stroke-emerald-500 dark:fill-emerald-500/10'
                      : state === 'wrong'
                        ? 'fill-amber-50 stroke-amber-500 dark:fill-amber-500/10'
                        : 'fill-white stroke-slate-400 dark:fill-slate-900';

            const isConnectPending = pendingFrom === node.id || activeDragFrom === node.id;
            const isFocused = focusedId === node.id;
            const clickableForLabel = !readOnly && interactionMode === 'label' && !node.given;
            const clickableForConnect = !readOnly && interactionMode === 'connect';
            const interactive = clickableForLabel || clickableForConnect;
            const highlight = isConnectPending || (isFocused && clickableForConnect);

            const ariaLabel = readOnly
              ? state === 'correct'
                ? `${node.correctLabel}: correct`
                : `Your answer ${label || 'blank'} is incorrect. Correct answer: ${node.correctLabel}`
              : node.given
                ? `${node.correctLabel} (given)`
                : clickableForLabel
                  ? label
                    ? `Label: ${label}. Press Enter to edit.`
                    : 'Blank label. Press Enter to type an answer.'
                  : `${label || 'Blank'}. Press Enter to ${pendingFrom ? 'connect it to the selected node' : 'start a connection here'}.`;

            return (
              <g
                key={node.id}
                data-node-id={node.id}
                onClick={() => clickableForLabel && openLabelEditor(node)}
                onPointerDown={(e) => handleNodePointerDown(e, node)}
                onKeyDown={
                  interactive
                    ? (e) => keyActivate(e, () => (clickableForLabel ? openLabelEditor(node) : activateConnect(node.id)))
                    : undefined
                }
                onFocus={() => setFocusedId(node.id)}
                onBlur={() => setFocusedId((f) => (f === node.id ? null : f))}
                tabIndex={interactive ? 0 : undefined}
                role={interactive ? 'button' : undefined}
                aria-label={interactive || readOnly ? ariaLabel : undefined}
                className={interactive ? 'cursor-pointer focus:outline-none' : ''}
              >
                {highlight || (isFocused && clickableForLabel) ? (
                  <rect x={x - 1} y={y - 1} width={width + 2} height={height + 2} rx={2.2} className="fill-none stroke-indigo-500" strokeWidth={0.5} strokeDasharray="1.5 1" />
                ) : null}
                <rect
                  x={x}
                  y={y}
                  width={width}
                  height={height}
                  rx={1.6}
                  strokeWidth={highlight ? 1 : 0.5}
                className={`${boxClass} ${highlight ? 'stroke-indigo-500' : ''}`}
                  strokeDasharray={!node.given && !label && !readOnly ? '1.5 1' : undefined}
                />
                {state === 'editing' ? null : (
                  <text
                    fontSize={FONT_SIZE}
                    textAnchor="middle"
                className={
                      state === 'given'
                        ? 'fill-slate-600 dark:fill-slate-300'
                        : state === 'correct'
                          ? 'fill-emerald-700 dark:fill-emerald-300'
                          : state === 'wrong'
                            ? 'fill-amber-700 dark:fill-amber-300'
                            : state === 'blank'
                              ? 'fill-slate-400 dark:fill-slate-500'
                              : 'fill-slate-700 dark:fill-slate-200'
                    }
                  >
                    {lines.map((line, lineIndex) => (
                      <tspan key={lineIndex} x={pos.x} y={pos.y - ((lines.length - 1) / 2 - lineIndex) * LINE_HEIGHT} dominantBaseline="middle">
                        {line}
                      </tspan>
                    ))}
                  </text>
                )}
                {readOnly && (state === 'correct' || state === 'wrong') ? <StatusBadge x={x + width} y={y} correct={state === 'correct'} /> : null}
                {/* In review, show the correct label under a wrongly/blank-filled node */}
                {readOnly && state === 'wrong' ? (
                  <text x={pos.x} y={y + height + FONT_SIZE} fontSize={FONT_SIZE * 0.85} textAnchor="middle" className="fill-emerald-600 dark:fill-emerald-400">
                    {node.correctLabel}
                  </text>
                ) : null}
              </g>
            );
          })}

        {/* Inline text editor for the label currently being typed */}
        {editingNodeId
          ? (() => {
              const node = nodeById.get(editingNodeId);
              if (!node) return null;
              const pos = positionFor(node.id, node.x, node.y);
              const x = clamp(pos.x - EDIT_BOX_WIDTH / 2, 0, 100 - EDIT_BOX_WIDTH);
              const y = clamp(pos.y - EDIT_BOX_HEIGHT / 2, 0, 100 - EDIT_BOX_HEIGHT);
              return (
                <foreignObject x={x} y={y} width={EDIT_BOX_WIDTH} height={EDIT_BOX_HEIGHT}>
                  <input
                    autoFocus
                    value={draftText}
                    onChange={(e) => setDraftText(e.target.value)}
                    onBlur={commitEdit}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        commitEdit();
                      } else if (e.key === 'Escape') {
                        e.preventDefault();
                        setEditingNodeId(null);
                      }
                    }}
                    className="h-full w-full bg-surface text-content-muted dark:bg-slate-900 text-content"
                    style={{ fontSize: `${FONT_SIZE}px`, padding: '0 1px', border: '0.4px solid #6366f1', borderRadius: '1.4px', outline: 'none' }}
                  />
                </foreignObject>
              );
            })()
          : null}

        {/* Symbol slots (e.g. dot-and-cross electrons, image-property choices) */}
        {diagramSpec.slots.map((slot) => {
          const pos = positionFor(slot.id, slot.x, slot.y);
          const palette = getDiagramPalette(slot.paletteId);
          const chosenOptionId = slot.given ? slot.correctOption : slotsMap.get(slot.id);
          const option = chosenOptionId ? palette?.options.find((o) => o.id === chosenOptionId) : undefined;
          const isChipStyle = CHIP_PALETTE_IDS.has(slot.paletteId);
          const clickable = !readOnly && !slot.given;
          const isDropHover = hoverSlotId === slot.id && !slot.given;
          const isFocused = focusedId === slot.id;

          const state: 'given' | 'blank' | 'filled' | 'selected' | 'correct' | 'wrong' = slot.given
            ? 'given'
            : readOnly
              ? slotGrades?.get(slot.id)
                ? 'correct'
                : 'wrong'
              : selectedSlotId === slot.id
                ? 'selected'
                : chosenOptionId
                  ? 'filled'
                  : 'blank';

          const strokeClass =
            isDropHover || isFocused
              ? 'stroke-indigo-500'
              : state === 'selected'
                ? 'stroke-indigo-500'
                : state === 'filled'
                  ? 'stroke-indigo-400'
                  : state === 'correct'
                    ? 'stroke-emerald-500'
                    : state === 'wrong'
                      ? 'stroke-amber-500'
                      : 'stroke-slate-400 dark:stroke-slate-500';

          const slotAria = readOnly
            ? state === 'correct'
              ? `${slot.description || 'Symbol'}: correct`
              : `${slot.description || 'Symbol'}: incorrect. Correct answer: ${palette?.options.find((o) => o.id === slot.correctOption)?.label ?? slot.correctOption}`
            : `${slot.description || 'Symbol slot'}${chosenOptionId ? `, currently ${option?.label ?? chosenOptionId}` : ', empty'}. Press Enter to ${chosenOptionId ? 'clear it' : 'select it, then choose a symbol'}.`;

          const interactiveProps = {
            'data-slot-id': slot.id,
            onClick: () => clickable && handleSlotClick(slot),
            onKeyDown: clickable ? (e: React.KeyboardEvent) => keyActivate(e, () => handleSlotClick(slot)) : undefined,
            onFocus: () => setFocusedId(slot.id),
            onBlur: () => setFocusedId((f: string | null) => (f === slot.id ? null : f)),
            tabIndex: clickable ? 0 : undefined,
            role: clickable ? 'button' : undefined,
            'aria-label': clickable || readOnly ? slotAria : undefined,
            className: clickable ? 'cursor-pointer focus:outline-none' : '',
          };

          if (isChipStyle) {
            const display = option?.label || (slot.given ? '' : '?');
            const lines = wrapLabel(display);
            const width = boxWidthFor(lines);
            const height = boxHeightFor(lines);
            const x = clamp(pos.x - width / 2, 0, 100 - width);
            const y = clamp(pos.y - height / 2, 0, 100 - height);
            return (
              <g key={slot.id} {...interactiveProps}>
                {isFocused ? <rect x={x - 1} y={y - 1} width={width + 2} height={height + 2} rx={2.2} className="fill-none stroke-indigo-500" strokeWidth={0.5} strokeDasharray="1.5 1" /> : null}
                <rect
                  x={x}
                  y={y}
                  width={width}
                  height={height}
                  rx={1.6}
                  strokeWidth={isDropHover ? 1 : 0.5}
                  className={`fill-white dark:fill-slate-900 ${strokeClass}`}
                  strokeDasharray={state === 'blank' ? '1.5 1' : undefined}
                />
                <text
                  fontSize={FONT_SIZE}
                  textAnchor="middle"
                className={
                    state === 'correct'
                      ? 'fill-emerald-700 dark:fill-emerald-300'
                      : state === 'wrong'
                        ? 'fill-amber-700 dark:fill-amber-300'
                        : state === 'blank'
                          ? 'fill-slate-400 dark:fill-slate-500'
                          : 'fill-slate-700 dark:fill-slate-200'
                  }
                >
                  {lines.map((line, lineIndex) => (
                    <tspan key={lineIndex} x={pos.x} y={pos.y - ((lines.length - 1) / 2 - lineIndex) * LINE_HEIGHT} dominantBaseline="middle">
                      {line}
                    </tspan>
                  ))}
                </text>
                {readOnly && (state === 'correct' || state === 'wrong') ? <StatusBadge x={x + width} y={y} correct={state === 'correct'} /> : null}
                {readOnly && state === 'wrong' ? (
                  <text x={pos.x} y={y + height + FONT_SIZE} fontSize={FONT_SIZE * 0.85} textAnchor="middle" className="fill-emerald-600 dark:fill-emerald-400">
                    {palette?.options.find((o) => o.id === slot.correctOption)?.label ?? slot.correctOption}
                  </text>
                ) : null}
              </g>
            );
          }

          return (
            <g key={slot.id} transform={`translate(${pos.x} ${pos.y})`} {...interactiveProps}>
              <circle r={HIT_R} fill="transparent" />
              {isFocused && state === 'blank' ? <circle r={GLYPH_SLOT_R + 1.4} className="fill-none stroke-indigo-500" strokeWidth={0.3} strokeDasharray="1 0.8" /> : null}
              <circle
                r={isDropHover ? GLYPH_SLOT_R + 0.6 : GLYPH_SLOT_R}
                strokeWidth={isDropHover ? 0.7 : 0.4}
                className={`fill-white dark:fill-slate-900 ${strokeClass}`}
                strokeDasharray={state === 'blank' ? '1 0.8' : undefined}
              />
              {option ? (
                <motion.g
                  key={chosenOptionId}
                  initial={reduceMotion ? false : { scale: 0.5, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ type: 'spring', stiffness: 500, damping: 26 }}
                  className={state === 'correct' ? 'text-emerald-600 dark:text-emerald-400' : state === 'wrong' ? 'text-amber-600 dark:text-amber-400' : 'text-content-muted'}
                >
                  <SlotGlyph glyphKind={option.glyphKind} glyphText={option.glyphText} />
                </motion.g>
              ) : null}
              {/* No ✓/✗ badge on glyph slots: they pack too densely (electron shells / dot-and-cross)
                  for badges not to collide. Correct/wrong reads from colour + the distinct dot vs cross
                  glyph shape; the label-box and word-chip slots (which are sparse) keep their badges. */}
            </g>
          );
        })}
      </DiagramCanvas>

      {/* Symbol palette — draggable chips; tap places into the selected (or next empty) slot */}
      {!readOnly && hasBlankSlots && interactionMode === 'slot' && activePalette ? (
        <div className="flex flex-wrap items-center gap-2">
          {activePalette.options.map((option) => (
            <button
              key={option.id}
              type="button"
              onPointerDown={(e) => handleChipPointerDown(e, option.id, option.glyphText || option.label)}
              onClick={() => {
                if (suppressNextChipClick.current) {
                  suppressNextChipClick.current = false;
                  return;
                }
                const target = selectedSlotId ?? blankSlots.find((s) => !slotsMap.has(s.id) && s.paletteId === activePalette.id)?.id;
                if (target) assignSlot(target, option.id);
              }}
              className="inline-flex cursor-grab touch-none items-center gap-1.5 rounded-lg border border-subtle bg-surface px-2.5 py-1.5 text-xs font-medium text-content-muted shadow-sm transition hover:border-indigo-400 hover:text-accent active:cursor-grabbing dark:border-white/10 dark:bg-surface/5 dark:hover:border-indigo-400/60"
            >
              <GlyphPreview glyphKind={option.glyphKind} glyphText={option.glyphText} />
              {option.label}
            </button>
          ))}
        </div>
      ) : null}

      {/* Floating preview of the symbol chip currently being dragged */}
      {dragChip ? (
        <div
        className="pointer-events-none fixed z-50 -translate-x-1/2 -translate-y-1/2 rounded-lg border border-indigo-400 bg-surface px-2.5 py-1 text-xs font-medium text-indigo-700 shadow-lg dark:border-indigo-500/50 dark:bg-slate-900 dark:text-indigo-300"
          style={{ left: dragChip.x, top: dragChip.y }}
        >
          {dragChip.label}
        </div>
      ) : null}

      {/* Drawn connections list with remove (answer mode) */}
      {!readOnly && drawnConnections.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {drawnConnections.map((connection, index) => {
            const from = nodeById.get(connection.from);
            const to = nodeById.get(connection.to);
            return (
              <button
                key={`${connection.from}-${connection.to}-${index}`}
                type="button"
                onClick={() => removeConnection(index)}
                className="inline-flex items-center gap-1 rounded-lg border border-amber-300 bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-700 transition hover:border-amber-500 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-300"
              >
                {(from?.correctLabel || from?.id) ?? '?'} → {(to?.correctLabel || to?.id) ?? '?'}
                <X className="h-3 w-3" aria-hidden />
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

/** Enter/Space activate a role="button" SVG element. */
function keyActivate(e: React.KeyboardEvent, action: () => void) {
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault();
    action();
  }
}

/** Tiny inline preview of a palette option's glyph, shown on its selection chip. */
function GlyphPreview({ glyphKind, glyphText }: { glyphKind: DiagramGlyphKind; glyphText?: string }) {
  if (glyphKind === 'text' && !glyphText) return null;
  return (
    <svg width="12" height="12" viewBox="-3 -3 6 6" className="text-current" aria-hidden>
      <SlotGlyph glyphKind={glyphKind} glyphText={glyphText} />
    </svg>
  );
}
