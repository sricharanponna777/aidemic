'use client';

import { useRef, useState } from 'react';
import { clamp, deriveAxisFromValues, snapToStep } from '@/lib/plot/scale';
import { getOwnerSvg, svgPointFromEvent } from '@/lib/plot/svgPointer';
import { catmullRomPath, leastSquaresLine } from '@/lib/plot/fitPreview';
import type { PlotScatterData } from '@/types';
import { PlotCanvas, usePlotScale } from './PlotCanvas';

export interface ScatterValue {
  points: { x: number; y: number }[];
  fitShape: 'line' | 'curve' | 'none';
}

function ScatterBody({
  spec,
  points,
  fitShape,
  color,
  draggable,
  onDragPoint,
}: {
  spec: PlotScatterData;
  points: { x: number; y: number }[];
  fitShape: 'line' | 'curve' | 'none';
  color: string;
  draggable: boolean;
  onDragPoint?: (index: number, x: number, y: number) => void;
}) {
  const { xScale, yScale, xInvert, yInvert, plotLeft, plotRight } = usePlotScale();
  const activeIndex = useRef<number | null>(null);
  const screenPoints = points.map((p) => ({ x: xScale(p.x), y: yScale(p.y) }));
  const sortedScreenPoints = [...screenPoints].sort((a, b) => a.x - b.x);

  const handlePointerDown = (index: number) => (event: React.PointerEvent<SVGCircleElement>) => {
    if (!draggable) return;
    activeIndex.current = index;
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handlePointerMove = (event: React.PointerEvent<SVGCircleElement>) => {
    if (!draggable || activeIndex.current === null || !onDragPoint) return;
    const svg = getOwnerSvg(event.target);
    if (!svg) return;
    const point = svgPointFromEvent(svg, event.clientX, event.clientY);
    onDragPoint(activeIndex.current, xInvert(point.x), yInvert(point.y));
  };

  const handlePointerUp = (event: React.PointerEvent<SVGCircleElement>) => {
    activeIndex.current = null;
    event.currentTarget.releasePointerCapture(event.pointerId);
  };

  const fitLine = fitShape === 'line' ? leastSquaresLine(screenPoints) : null;

  return (
    <g>
      {spec.connectPoints ? (
        <path d={catmullRomPath(sortedScreenPoints)} fill="none" stroke={color} strokeWidth={2} />
      ) : fitShape === 'line' && fitLine ? (
        <line
          x1={plotLeft}
          x2={plotRight}
          y1={fitLine.slope * plotLeft + fitLine.intercept}
          y2={fitLine.slope * plotRight + fitLine.intercept}
          stroke="#8b5cf6"
          strokeDasharray="6 4"
          strokeWidth={2}
        />
      ) : fitShape === 'curve' ? (
        <path d={catmullRomPath(sortedScreenPoints)} fill="none" stroke="#8b5cf6" strokeDasharray="6 4" strokeWidth={2} />
      ) : null}
      {screenPoints.map((p, i) => (
        <circle
          key={i}
          cx={p.x}
          cy={p.y}
          r={draggable ? 8 : 5}
          fill={color}
          stroke="white"
          strokeWidth={1.5}
          style={{ cursor: draggable ? 'grab' : 'default' }}
          onPointerDown={handlePointerDown(i)}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
        />
      ))}
    </g>
  );
}

interface ScatterFitInputProps {
  spec: PlotScatterData;
  value: ScatterValue | null;
  onChange: (value: ScatterValue) => void;
  readOnly?: boolean;
  correctValue?: ScatterValue | null;
}

const defaultPoints = (spec: PlotScatterData, yAxisMax: number) =>
  spec.givenPoints.map((point) => ({
    x: point.x,
    y: yAxisMax * 0.5,
  }));

const FIT_OPTIONS = [
  { shape: 'line' as const, label: 'Straight line' },
  { shape: 'curve' as const, label: 'Curve' },
  { shape: 'none' as const, label: 'No fit' },
];

export function ScatterFitInput({ spec, value, onChange, readOnly = false, correctValue }: ScatterFitInputProps) {
  const xAxis = deriveAxisFromValues(spec.givenPoints.map((point) => point.x));
  const yAxis = deriveAxisFromValues(spec.givenPoints.map((point) => point.y));
  const [local, setLocal] = useState<ScatterValue>(() => value ?? { points: defaultPoints(spec, yAxis.max), fitShape: 'none' });

  const emit = (next: ScatterValue) => {
    setLocal(next);
    onChange(next);
  };

  const handleDragPoint = (index: number, dataX: number, dataY: number) => {
    const clampedX = clamp(dataX, 0, xAxis.max);
    const clampedY = clamp(dataY, 0, yAxis.max);
    emit({
      ...local,
      points: local.points.map((p, i) =>
        i === index ? { x: snapToStep(clampedX, xAxis.step), y: snapToStep(clampedY, yAxis.step) } : p
      ),
    });
  };

  const active = readOnly ? value ?? local : local;

  return (
    <div className="space-y-2">
      <PlotCanvas
        xDomain={[0, xAxis.max]}
        yDomain={[0, yAxis.max]}
        xStep={xAxis.step}
        yStep={yAxis.step}
        xLabel={spec.xLabel}
        yLabel={spec.yLabel}
      >
        {correctValue ? <ScatterBody spec={spec} points={correctValue.points} fitShape={correctValue.fitShape} color="#16a34a" draggable={false} /> : null}
        {readOnly && !value ? null : (
          <ScatterBody
            spec={spec}
            points={active.points}
            fitShape={active.fitShape}
            color={correctValue ? '#f59e0b' : '#4f46e5'}
            draggable={!readOnly}
            onDragPoint={readOnly ? undefined : handleDragPoint}
          />
        )}
      </PlotCanvas>
      {!readOnly ? (
        <div className="flex gap-2 text-xs">
          {FIT_OPTIONS.map(({ shape, label }) => (
            <button
              key={shape}
              type="button"
              onClick={() => emit({ ...local, fitShape: shape })}
              className={`rounded-full border px-3 py-1 ${
                local.fitShape === shape
                  ? 'border-indigo-500 bg-indigo-500/10 text-indigo-600 dark:text-indigo-300'
                  : 'border-slate-300 text-slate-500 dark:border-white/10 dark:text-slate-400'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      ) : null}
      {correctValue ? (
        <p className="text-xs text-slate-500 dark:text-slate-400">
          {readOnly && !value
            ? 'No answer was submitted for this question.'
            : (
              <>
                <span className="text-emerald-600 dark:text-emerald-400">Green</span> = correct answer,{' '}
                <span className="text-amber-600 dark:text-amber-400">amber</span> = your answer. {spec.fitDescription}
              </>
            )}
        </p>
      ) : (
        <p className="text-xs text-slate-500 dark:text-slate-400">Drag each point to its position, then choose whether the data needs a straight line or a curve of best fit.</p>
      )}
    </div>
  );
}
