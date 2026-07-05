'use client';

import { useRef, useState } from 'react';
import { clamp, deriveAxisFromValues, snapToStep } from '@/lib/plot/scale';
import type { AxisScaleChoice } from '@/lib/plot/scaleRules';
import { getOwnerSvg, svgPointFromEvent } from '@/lib/plot/svgPointer';
import { catmullRomPath, leastSquaresLine } from '@/lib/plot/fitPreview';
import type { PlotLineData } from '@/types';
import { AxisScaleInput } from './AxisScaleInput';
import { PlotCanvas, usePlotScale } from './PlotCanvas';

export interface LineGraphValue {
  yValues: number[];
  fitShape: 'line' | 'curve' | 'none';
}

function LineChartBody({
  spec,
  yValues,
  fitShape,
  color,
  draggable,
  onDrag,
  showFitPreview,
}: {
  spec: PlotLineData;
  yValues: number[];
  fitShape: 'line' | 'curve' | 'none';
  color: string;
  draggable: boolean;
  onDrag?: (index: number, value: number) => void;
  showFitPreview: boolean;
}) {
  const { xScale, yScale, yInvert, plotLeft, plotRight } = usePlotScale();
  const activeIndex = useRef<number | null>(null);
  const screenPoints = spec.points.map((point, i) => ({ x: xScale(point.x), y: yScale(yValues[i] ?? 0) }));

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

  const fitLine = fitShape === 'line' ? leastSquaresLine(screenPoints) : null;

  return (
    <g>
      <polyline points={screenPoints.map((p) => `${p.x},${p.y}`).join(' ')} fill="none" stroke={color} strokeWidth={2} strokeOpacity={showFitPreview && fitShape !== 'none' ? 0.35 : 1} />
      {showFitPreview && fitShape === 'line' && fitLine ? (
        <line
          x1={plotLeft}
          x2={plotRight}
          y1={fitLine.slope * plotLeft + fitLine.intercept}
          y2={fitLine.slope * plotRight + fitLine.intercept}
          stroke="#8b5cf6"
          strokeDasharray="6 4"
          strokeWidth={2}
        />
      ) : null}
      {showFitPreview && fitShape === 'curve' ? (
        <path d={catmullRomPath(screenPoints)} fill="none" stroke="#8b5cf6" strokeDasharray="6 4" strokeWidth={2} />
      ) : null}
      {spec.points.map((point, i) => (
        <circle
          key={point.x}
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

interface LineGraphInputProps {
  spec: PlotLineData;
  value: LineGraphValue | null;
  yAxisChoice?: AxisScaleChoice | null;
  xAxisChoice?: AxisScaleChoice | null;
  onChange: (value: LineGraphValue, yAxisChoice: AxisScaleChoice, xAxisChoice: AxisScaleChoice) => void;
  readOnly?: boolean;
  correctValue?: LineGraphValue | null;
}

const FIT_OPTIONS = [
  { shape: 'line' as const, label: 'Straight line' },
  { shape: 'curve' as const, label: 'Curve' },
  { shape: 'none' as const, label: 'No fit' },
];

export function LineGraphInput({ spec, value, yAxisChoice, xAxisChoice, onChange, readOnly = false, correctValue }: LineGraphInputProps) {
  const xValues = spec.points.map((p) => p.x);
  const defaultXAxis = deriveAxisFromValues(xValues);
  const defaultYAxis = deriveAxisFromValues(spec.correctYValues);
  const [local, setLocal] = useState<LineGraphValue>(
    () => value ?? { yValues: spec.points.map(() => defaultYAxis.max * 0.4), fitShape: 'none' }
  );
  const [localYAxis, setLocalYAxis] = useState<AxisScaleChoice>(() => yAxisChoice ?? defaultYAxis);
  const [localXAxis, setLocalXAxis] = useState<AxisScaleChoice>(() => xAxisChoice ?? defaultXAxis);

  const emit = (next: LineGraphValue) => {
    setLocal(next);
    onChange(next, localYAxis, localXAxis);
  };

  const handleYAxisChange = (next: AxisScaleChoice) => {
    setLocalYAxis(next);
    onChange(local, next, localXAxis);
  };

  const handleXAxisChange = (next: AxisScaleChoice) => {
    setLocalXAxis(next);
    onChange(local, localYAxis, next);
  };

  const handleDrag = (index: number, dataY: number) => {
    const snapped = snapToStep(clamp(dataY, 0, localYAxis.max), localYAxis.step);
    emit({ ...local, yValues: local.yValues.map((v, i) => (i === index ? snapped : v)) });
  };

  const active = readOnly ? value ?? local : local;
  const displayYAxis = readOnly ? { max: Math.max(localYAxis.max, defaultYAxis.max), step: localYAxis.step || defaultYAxis.step } : localYAxis;
  const displayXAxis = readOnly ? { max: Math.max(localXAxis.max, defaultXAxis.max), step: localXAxis.step || defaultXAxis.step } : localXAxis;

  return (
    <div className="space-y-2">
      {readOnly ? null : (
        <>
          <AxisScaleInput value={localXAxis} onChange={handleXAxisChange} axisLabel={spec.xLabel} />
          <AxisScaleInput value={localYAxis} onChange={handleYAxisChange} axisLabel={spec.yLabel} />
        </>
      )}
      <PlotCanvas xDomain={[0, displayXAxis.max]} xStep={displayXAxis.step} yDomain={[0, displayYAxis.max]} yStep={displayYAxis.step} xLabel={spec.xLabel} yLabel={spec.yLabel}>
        {correctValue ? (
          <LineChartBody spec={spec} yValues={correctValue.yValues} fitShape={correctValue.fitShape} color="#16a34a" draggable={false} showFitPreview={spec.requiresBestFit} />
        ) : null}
        {readOnly && !value ? null : (
          <LineChartBody
            spec={spec}
            yValues={active.yValues}
            fitShape={active.fitShape}
            color={correctValue ? '#f59e0b' : '#4f46e5'}
            draggable={!readOnly}
            onDrag={readOnly ? undefined : handleDrag}
            showFitPreview={spec.requiresBestFit}
          />
        )}
      </PlotCanvas>
      {spec.requiresBestFit && !readOnly ? (
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
                <span className="text-amber-600 dark:text-amber-400">amber</span> = your answer.
              </>
            )}
        </p>
      ) : (
        <p className="text-xs text-slate-500 dark:text-slate-400">
          {spec.requiresBestFit
            ? 'Drag each point into position, then choose whether a straight line or a curve of best fit should be drawn.'
            : 'Drag each point into position.'}
        </p>
      )}
    </div>
  );
}
