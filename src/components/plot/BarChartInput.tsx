'use client';

import { useRef, useState } from 'react';
import { bandScale, clamp, deriveAxisFromValues, snapToStep } from '@/lib/plot/scale';
import type { AxisScaleChoice } from '@/lib/plot/scaleRules';
import { getOwnerSvg, svgPointFromEvent } from '@/lib/plot/svgPointer';
import type { PlotBarData } from '@/types';
import { AxisScaleInput } from './AxisScaleInput';
import { PlotCanvas, usePlotScale } from './PlotCanvas';

const defaultValues = (spec: PlotBarData) => spec.categories.map(() => deriveAxisFromValues(spec.correctValues).max * 0.4);

function CategoryLabels({ spec }: { spec: PlotBarData }) {
  const { plotLeft, plotRight, plotBottom } = usePlotScale();
  const { position, bandwidth } = bandScale(spec.categories, [plotLeft, plotRight]);
  return (
    <g>
      {spec.categories.map((category) => (
        <text key={category} x={position(category) + bandwidth / 2} y={plotBottom + 16} fontSize={10} textAnchor="middle" fill="currentColor" opacity={0.6}>
          {category}
        </text>
      ))}
    </g>
  );
}

function Bars({
  spec,
  values,
  color,
  draggable,
  onDrag,
}: {
  spec: PlotBarData;
  values: number[];
  color: string;
  draggable: boolean;
  onDrag?: (index: number, value: number) => void;
}) {
  const { yScale, yInvert, plotLeft, plotRight, plotBottom } = usePlotScale();
  const { position, bandwidth } = bandScale(spec.categories, [plotLeft, plotRight]);
  const activeIndex = useRef<number | null>(null);

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
      {spec.categories.map((category, i) => {
        const value = values[i] ?? 0;
        const x = position(category);
        const barTop = yScale(value);
        return (
          <g key={category}>
            <rect x={x} y={barTop} width={bandwidth} height={Math.max(plotBottom - barTop, 0)} fill={color} fillOpacity={0.35} stroke={color} strokeWidth={2} />
            <circle
              cx={x + bandwidth / 2}
              cy={barTop}
              r={draggable ? 8 : 5}
              fill={color}
              stroke="white"
              strokeWidth={1.5}
              style={{ cursor: draggable ? 'ns-resize' : 'default' }}
              onPointerDown={handlePointerDown(i)}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
            />
          </g>
        );
      })}
    </g>
  );
}

interface BarChartInputProps {
  spec: PlotBarData;
  value: number[] | null;
  axisChoice?: AxisScaleChoice | null;
  onChange: (value: number[], axisChoice: AxisScaleChoice) => void;
  readOnly?: boolean;
  correctValues?: number[] | null;
}

export function BarChartInput({ spec, value, axisChoice, onChange, readOnly = false, correctValues }: BarChartInputProps) {
  const defaultAxis = deriveAxisFromValues(spec.correctValues);
  const [localValues, setLocalValues] = useState<number[]>(() => value ?? defaultValues(spec));
  const [localAxis, setLocalAxis] = useState<AxisScaleChoice>(() => axisChoice ?? defaultAxis);

  const handleDrag = (index: number, dataY: number) => {
    const snapped = snapToStep(clamp(dataY, 0, localAxis.max), localAxis.step);
    const next = localValues.map((v, i) => (i === index ? snapped : v));
    setLocalValues(next);
    onChange(next, localAxis);
  };

  const handleAxisChange = (next: AxisScaleChoice) => {
    setLocalAxis(next);
    onChange(localValues, next);
  };

  const displayAxis = readOnly ? { max: Math.max(localAxis.max, defaultAxis.max), step: localAxis.step || defaultAxis.step } : localAxis;

  return (
    <div className="space-y-2">
      {readOnly ? null : <AxisScaleInput value={localAxis} onChange={handleAxisChange} axisLabel={spec.yAxisLabel} />}
      <PlotCanvas xDomain={[0, spec.categories.length]} yDomain={[0, displayAxis.max]} yStep={displayAxis.step} yLabel={spec.yAxisLabel} xTickCount={0}>
        {correctValues ? <Bars spec={spec} values={correctValues} color="#16a34a" draggable={false} /> : null}
        {readOnly && !value ? null : (
          <Bars
            spec={spec}
            values={readOnly ? value ?? localValues : localValues}
            color={correctValues ? '#f59e0b' : '#4f46e5'}
            draggable={!readOnly}
            onDrag={readOnly ? undefined : handleDrag}
          />
        )}
        <CategoryLabels spec={spec} />
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
        <p className="text-xs text-slate-500 dark:text-slate-400">Drag each bar&apos;s handle up or down to the correct height.</p>
      )}
    </div>
  );
}
