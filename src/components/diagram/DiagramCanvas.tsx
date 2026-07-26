'use client';

import { forwardRef } from 'react';
import type { DiagramPrimitive, DiagramSpec } from '@/types';

/** Renders one validated drawing primitive as a React SVG element. Every prop is a
 * number or an already-validated string (see normalizeDiagramSpec) — no raw markup is
 * ever passed through, so nothing here can inject script/href/foreignObject. */
function Primitive({ primitive: p, index }: { primitive: DiagramPrimitive; index: number }) {
  const common = { stroke: p.stroke, fill: p.fill, strokeWidth: p.strokeWidth } as const;
  switch (p.kind) {
    case 'path':
      return <path key={index} d={p.d} {...common} fill={p.fill} />;
    case 'line':
      return <line key={index} x1={p.x1} y1={p.y1} x2={p.x2} y2={p.y2} stroke={p.stroke} strokeWidth={p.strokeWidth} strokeLinecap="round" />;
    case 'circle':
      return <circle key={index} cx={p.cx} cy={p.cy} r={p.r} {...common} />;
    case 'ellipse':
      return <ellipse key={index} cx={p.cx} cy={p.cy} rx={p.rx} ry={p.ry} {...common} />;
    case 'rect':
      return <rect key={index} x={p.x} y={p.y} width={p.width} height={p.height} rx={0.6} {...common} />;
    case 'polygon':
      return <polygon key={index} points={p.points.join(' ')} {...common} />;
    case 'polyline':
      return <polyline key={index} points={p.points.join(' ')} fill="none" stroke={p.stroke} strokeWidth={p.strokeWidth} strokeLinecap="round" strokeLinejoin="round" />;
    case 'text':
      return (
        <text key={index} x={p.x} y={p.y} fontSize={p.fontSize} fill={p.fill} textAnchor="middle" dominantBaseline="middle">
          {p.text}
        </text>
      );
    default:
      return null;
  }
}

interface DiagramCanvasProps {
  spec: DiagramSpec;
  children?: React.ReactNode;
  /** viewBox to render into. Defaults to the full normalized 0..100 space; DiagramAnswerInput passes
   * a content-fitted box so diagrams fill the frame instead of floating in empty margins. */
  viewBox?: string;
  /** Accessible name for the whole figure (announced by screen readers via role="img"). */
  ariaLabel?: string;
}

/** The shared SVG substrate for diagram-completion questions: a normalized 0..100 coordinate
 * space holding the AI-drawn base image (pictorial) plus arrowhead marker defs. Interactive
 * nodes and connections are rendered by DiagramAnswerInput as children, inside this same svg.
 * Forwards the raw <svg> node so callers can convert pointer client coordinates into viewBox
 * coordinates (via getScreenCTM) for drag interactions. */
export const DiagramCanvas = forwardRef<SVGSVGElement, DiagramCanvasProps>(function DiagramCanvas(
  { spec, children, viewBox = '0 0 100 100', ariaLabel },
  ref
) {
  return (
    <svg
      ref={ref}
      viewBox={viewBox}
      role="img"
      aria-label={ariaLabel || spec.title || 'Diagram'}
      className="w-full touch-none select-none rounded-xl border border-subtle bg-surface text-content-muted shadow-sm dark:border-white/10 dark:text-slate-300"
      style={{ maxHeight: 440 }}
    >
      <title>{spec.title || 'Diagram'}</title>
      <defs>
        <marker id="diagram-arrow-muted" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto" markerUnits="strokeWidth">
          <path d="M0,0 L6,3 L0,6 Z" fill="currentColor" opacity={0.5} />
        </marker>
        <marker id="diagram-arrow-amber" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto" markerUnits="strokeWidth">
          <path d="M0,0 L6,3 L0,6 Z" fill="#d97706" />
        </marker>
        <marker id="diagram-arrow-green" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto" markerUnits="strokeWidth">
          <path d="M0,0 L6,3 L0,6 Z" fill="#16a34a" />
        </marker>
        <marker id="diagram-arrow-indigo" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto" markerUnits="strokeWidth">
          <path d="M0,0 L6,3 L0,6 Z" fill="#6366f1" />
        </marker>
      </defs>

      {spec.primitives.map((primitive, index) => (
        <Primitive key={index} primitive={primitive} index={index} />
      ))}

      {children}
    </svg>
  );
});
