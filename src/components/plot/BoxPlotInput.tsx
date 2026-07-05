'use client';

import { useRef, useState } from 'react';
import { clamp } from '@/lib/plot/scale';
import { getOwnerSvg, svgPointFromEvent } from '@/lib/plot/svgPointer';
import type { PlotBoxPlotData } from '@/types';
import { PlotCanvas, usePlotScale } from './PlotCanvas';

export type BoxPlotValues = {
  min: number;
  lowerQuartile: number;
  median: number;
  upperQuartile: number;
  max: number;
};

const KEYS: (keyof BoxPlotValues)[] = ['min', 'lowerQuartile', 'median', 'upperQuartile', 'max'];
const LABELS: Record<keyof BoxPlotValues, string> = {
  min: 'Min',
  lowerQuartile: 'LQ',
  median: 'Median',
  upperQuartile: 'UQ',
  max: 'Max',
};

const defaultValues = (spec: PlotBoxPlotData): BoxPlotValues => {
  const range = spec.axisMax - spec.axisMin;
  return {
    min: spec.axisMin + range * 0.1,
    lowerQuartile: spec.axisMin + range * 0.3,
    median: spec.axisMin + range * 0.5,
    upperQuartile: spec.axisMin + range * 0.7,
    max: spec.axisMin + range * 0.9,
  };
};

function BoxAndWhisker({
  values,
  color,
  draggable,
  onDrag,
}: {
  values: BoxPlotValues;
  color: string;
  draggable: boolean;
  onDrag?: (key: keyof BoxPlotValues, dataX: number) => void;
}) {
  const { xScale, xInvert, plotTop, plotBottom } = usePlotScale();
  const midY = (plotTop + plotBottom) / 2;
  const boxHalfHeight = (plotBottom - plotTop) * 0.18;
  const activeKey = useRef<keyof BoxPlotValues | null>(null);

  const handlePointerDown = (key: keyof BoxPlotValues) => (event: React.PointerEvent<SVGCircleElement>) => {
    if (!draggable) return;
    activeKey.current = key;
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handlePointerMove = (event: React.PointerEvent<SVGCircleElement>) => {
    if (!draggable || !activeKey.current || !onDrag) return;
    const svg = getOwnerSvg(event.target);
    if (!svg) return;
    const point = svgPointFromEvent(svg, event.clientX, event.clientY);
    onDrag(activeKey.current, xInvert(point.x));
  };

  const handlePointerUp = (event: React.PointerEvent<SVGCircleElement>) => {
    activeKey.current = null;
    event.currentTarget.releasePointerCapture(event.pointerId);
  };

  return (
    <g>
      <line x1={xScale(values.min)} x2={xScale(values.lowerQuartile)} y1={midY} y2={midY} stroke={color} strokeWidth={2} />
      <line x1={xScale(values.upperQuartile)} x2={xScale(values.max)} y1={midY} y2={midY} stroke={color} strokeWidth={2} />
      <rect
        x={Math.min(xScale(values.lowerQuartile), xScale(values.upperQuartile))}
        y={midY - boxHalfHeight}
        width={Math.abs(xScale(values.upperQuartile) - xScale(values.lowerQuartile))}
        height={boxHalfHeight * 2}
        fill="none"
        stroke={color}
        strokeWidth={2}
      />
      <line x1={xScale(values.median)} x2={xScale(values.median)} y1={midY - boxHalfHeight} y2={midY + boxHalfHeight} stroke={color} strokeWidth={2} />
      <line x1={xScale(values.min)} x2={xScale(values.min)} y1={midY - boxHalfHeight / 2} y2={midY + boxHalfHeight / 2} stroke={color} strokeWidth={2} />
      <line x1={xScale(values.max)} x2={xScale(values.max)} y1={midY - boxHalfHeight / 2} y2={midY + boxHalfHeight / 2} stroke={color} strokeWidth={2} />

      {KEYS.map((key) => (
        <g key={key}>
          <circle
            cx={xScale(values[key])}
            cy={midY}
            r={draggable ? 8 : 5}
            fill={color}
            stroke="white"
            strokeWidth={1.5}
            style={{ cursor: draggable ? 'ew-resize' : 'default' }}
            onPointerDown={handlePointerDown(key)}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
          />
          <text x={xScale(values[key])} y={midY - boxHalfHeight - 10} fontSize={10} textAnchor="middle" fill={color}>
            {LABELS[key]}
          </text>
        </g>
      ))}
    </g>
  );
}

interface BoxPlotInputProps {
  spec: PlotBoxPlotData;
  value: BoxPlotValues | null;
  onChange: (value: BoxPlotValues) => void;
  readOnly?: boolean;
  correctValues?: BoxPlotValues | null;
}

export function BoxPlotInput({ spec, value, onChange, readOnly = false, correctValues }: BoxPlotInputProps) {
  const [localValues, setLocalValues] = useState<BoxPlotValues>(() => value ?? defaultValues(spec));

  const handleDrag = (key: keyof BoxPlotValues, dataX: number) => {
    const clamped = clamp(dataX, spec.axisMin, spec.axisMax);
    const next = { ...localValues, [key]: clamped };
    setLocalValues(next);
    onChange(next);
  };

  return (
    <div className="space-y-2">
      <PlotCanvas xDomain={[spec.axisMin, spec.axisMax]} yDomain={[0, 1]} xLabel={spec.axisLabel} yTickCount={0} height={200}>
        {correctValues ? <BoxAndWhisker values={correctValues} color="#16a34a" draggable={false} /> : null}
        {readOnly && !value ? null : (
          <BoxAndWhisker
            values={readOnly ? value ?? localValues : localValues}
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
        <p className="text-xs text-slate-500 dark:text-slate-400">Drag each handle (Min, LQ, Median, UQ, Max) into position.</p>
      )}
    </div>
  );
}
