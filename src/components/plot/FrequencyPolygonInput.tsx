'use client';

import { useRef, useState } from 'react';
import { clamp } from '@/lib/plot/scale';
import { getOwnerSvg, svgPointFromEvent } from '@/lib/plot/svgPointer';
import type { PlotFrequencyPolygonData } from '@/types';
import { PlotCanvas, usePlotScale } from './PlotCanvas';

const midpoints = (spec: PlotFrequencyPolygonData) => spec.classStart.map((start, i) => (start + spec.classEnd[i]) / 2);

function PolygonBody({
  spec,
  yValues,
  color,
  draggable,
  onDrag,
}: {
  spec: PlotFrequencyPolygonData;
  yValues: number[];
  color: string;
  draggable: boolean;
  onDrag?: (index: number, value: number) => void;
}) {
  const { xScale, yScale, yInvert } = usePlotScale();
  const activeIndex = useRef<number | null>(null);
  const xValues = midpoints(spec);
  const screenPoints = xValues.map((x, i) => ({ x: xScale(x), y: yScale(yValues[i] ?? 0) }));

  const handlePointerDown = (index: number) => (event: React.PointerEvent<SVGCircleElement>) => {
    if (!draggable) return;
    activeIndex.current = index;
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handlePointerMove = (event: React.PointerEvent<SVGCircleElement>) => {
    if (!draggable || activeIndex.current === null || !onDrag) return;
    const svg = getOwnerSvg(event.target);
    if (!svg) return;
    const point = svgPointFromEvent(svg, event.clientX, event.clientY);
    onDrag(activeIndex.current, yInvert(point.y));
  };

  const handlePointerUp = (event: React.PointerEvent<SVGCircleElement>) => {
    activeIndex.current = null;
    event.currentTarget.releasePointerCapture(event.pointerId);
  };

  return (
    <g>
      <polyline points={screenPoints.map((p) => `${p.x},${p.y}`).join(' ')} fill="none" stroke={color} strokeWidth={2} />
      {xValues.map((x, i) => (
        <circle
          key={x}
          cx={screenPoints[i].x}
          cy={screenPoints[i].y}
          r={draggable ? 8 : 5}
          fill={color}
          stroke="white"
          strokeWidth={1.5}
          style={{ cursor: draggable ? 'ns-resize' : 'default' }}
          onPointerDown={handlePointerDown(i)}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
        />
      ))}
    </g>
  );
}

interface FrequencyPolygonInputProps {
  spec: PlotFrequencyPolygonData;
  value: number[] | null;
  onChange: (value: number[]) => void;
  readOnly?: boolean;
  correctValues?: number[] | null;
}

export function FrequencyPolygonInput({ spec, value, onChange, readOnly = false, correctValues }: FrequencyPolygonInputProps) {
  const yMax = Math.max(...spec.frequency, 1) * 1.25;
  const [localValues, setLocalValues] = useState<number[]>(() => value ?? spec.classStart.map(() => 0));

  const handleDrag = (index: number, dataY: number) => {
    const clamped = clamp(dataY, 0, yMax);
    const next = localValues.map((v, i) => (i === index ? clamped : v));
    setLocalValues(next);
    onChange(next);
  };

  return (
    <div className="space-y-2">
      <PlotCanvas
        xDomain={[spec.classStart[0], spec.classEnd[spec.classEnd.length - 1]]}
        yDomain={[0, yMax]}
        xLabel={spec.xLabel}
        yLabel={spec.yLabel}
      >
        {correctValues ? <PolygonBody spec={spec} yValues={correctValues} color="#16a34a" draggable={false} /> : null}
        {readOnly && !value ? null : (
          <PolygonBody
            spec={spec}
            yValues={readOnly ? value ?? localValues : localValues}
            color={correctValues ? '#f59e0b' : '#4f46e5'}
            draggable={!readOnly}
            onDrag={readOnly ? undefined : handleDrag}
          />
        )}
      </PlotCanvas>
      {correctValues ? (
        <p className="text-xs text-slate-500 dark:text-slate-400">
          {readOnly && !value
            ? 'No answer was submitted for this question.'
            : (
              <>
                <span className="text-emerald-600 dark:text-emerald-400">Green</span> = correct answer,{' '}
                <span className="text-amber-600 dark:text-amber-400">amber</span> = your answer.
              </>
            )}
        </p>
      ) : (
        <p className="text-xs text-slate-500 dark:text-slate-400">Drag each point to (class midpoint, frequency), then they&apos;ll be joined into a polygon.</p>
      )}
    </div>
  );
}
