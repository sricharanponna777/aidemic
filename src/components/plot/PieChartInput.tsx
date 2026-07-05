'use client';

import { useRef, useState } from 'react';
import { clamp } from '@/lib/plot/scale';
import { getOwnerSvg, svgPointFromEvent } from '@/lib/plot/svgPointer';
import type { PlotPieData } from '@/types';

const RADIUS = 100;
const CENTER = { x: 150, y: 120 };

const angleToPoint = (angleDeg: number, center: typeof CENTER, radius: number) => {
  const rad = (angleDeg * Math.PI) / 180;
  return { x: center.x + radius * Math.sin(rad), y: center.y - radius * Math.cos(rad) };
};

const pointToAngle = (x: number, y: number, center: typeof CENTER) => {
  const dx = x - center.x;
  const dy = y - center.y;
  let angle = (Math.atan2(dx, -dy) * 180) / Math.PI;
  if (angle < 0) angle += 360;
  return angle;
};

const arcPath = (startAngle: number, endAngle: number, center: typeof CENTER, radius: number) => {
  const start = angleToPoint(startAngle, center, radius);
  const end = angleToPoint(endAngle, center, radius);
  const largeArc = endAngle - startAngle > 180 ? 1 : 0;
  return `M ${center.x} ${center.y} L ${start.x} ${start.y} A ${radius} ${radius} 0 ${largeArc} 1 ${end.x} ${end.y} Z`;
};

const anglesToBoundaries = (angles: number[]) => {
  const boundaries: number[] = [];
  let cumulative = 0;
  for (const angle of angles) {
    cumulative += angle;
    boundaries.push(cumulative);
  }
  return boundaries;
};

const boundariesToAngles = (boundaries: number[]) => {
  const full = [0, ...boundaries];
  return full.slice(1).map((b, i) => b - full[i]);
};

function PieSectors({
  spec,
  angles,
  color,
  draggable,
  onDragBoundary,
}: {
  spec: PlotPieData;
  angles: number[];
  color: string;
  draggable: boolean;
  onDragBoundary?: (index: number, angle: number) => void;
}) {
  const boundaries = anglesToBoundaries(angles);
  const activeIndex = useRef<number | null>(null);

  const handlePointerDown = (index: number) => (event: React.PointerEvent<SVGCircleElement>) => {
    if (!draggable) return;
    activeIndex.current = index;
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handlePointerMove = (event: React.PointerEvent<SVGCircleElement>) => {
    if (!draggable || activeIndex.current === null || !onDragBoundary) return;
    const svg = getOwnerSvg(event.target);
    if (!svg) return;
    const point = svgPointFromEvent(svg, event.clientX, event.clientY);
    onDragBoundary(activeIndex.current, pointToAngle(point.x, point.y, CENTER));
  };

  const handlePointerUp = (event: React.PointerEvent<SVGCircleElement>) => {
    activeIndex.current = null;
    event.currentTarget.releasePointerCapture(event.pointerId);
  };

  return (
    <g>
      <circle cx={CENTER.x} cy={CENTER.y} r={RADIUS} fill="none" stroke="currentColor" strokeOpacity={0.15} />
      {spec.categories.map((category, i) => (
        <path
          key={category.label}
          d={arcPath(i === 0 ? 0 : boundaries[i - 1], boundaries[i], CENTER, RADIUS)}
          fill="none"
          stroke={color}
          strokeWidth={2}
        />
      ))}
      {draggable
        ? boundaries.slice(0, -1).map((boundary, i) => {
            const point = angleToPoint(boundary, CENTER, RADIUS);
            return (
              <circle
                key={i}
                cx={point.x}
                cy={point.y}
                r={9}
                fill={color}
                stroke="white"
                strokeWidth={1.5}
                style={{ cursor: 'grab' }}
                onPointerDown={handlePointerDown(i)}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
              />
            );
          })
        : null}
    </g>
  );
}

interface PieChartInputProps {
  spec: PlotPieData;
  value: number[] | null;
  onChange: (value: number[]) => void;
  readOnly?: boolean;
  correctValues?: number[] | null;
}

const defaultAngles = (spec: PlotPieData) => spec.categories.map(() => 360 / spec.categories.length);

export function PieChartInput({ spec, value, onChange, readOnly = false, correctValues }: PieChartInputProps) {
  const [localAngles, setLocalAngles] = useState<number[]>(() => value ?? defaultAngles(spec));

  const handleDragBoundary = (index: number, newAngle: number) => {
    const boundaries = anglesToBoundaries(localAngles);
    const prev = index === 0 ? 0 : boundaries[index - 1];
    const next = index === boundaries.length - 1 ? 360 : boundaries[index + 1];
    const clamped = clamp(newAngle, prev + 1, next - 1);
    const nextBoundaries = boundaries.map((b, i) => (i === index ? clamped : b));
    const nextAngles = boundariesToAngles(nextBoundaries);
    setLocalAngles(nextAngles);
    onChange(nextAngles);
  };

  return (
    <div className="space-y-2">
      <svg
        viewBox="0 0 300 240"
        className="w-full touch-none select-none rounded-lg border border-slate-300 bg-white text-slate-700 dark:border-white/10 dark:bg-[#0A0F1E] dark:text-slate-300"
      >
        {correctValues ? <PieSectors spec={spec} angles={correctValues} color="#16a34a" draggable={false} /> : null}
        {readOnly && !value ? null : (
          <PieSectors
            spec={spec}
            angles={readOnly ? value ?? localAngles : localAngles}
            color={correctValues ? '#f59e0b' : '#4f46e5'}
            draggable={!readOnly}
            onDragBoundary={readOnly ? undefined : handleDragBoundary}
          />
        )}
      </svg>
      <ul className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
        {spec.categories.map((category) => (
          <li key={category.label}>
            {category.label}: {category.value}
          </li>
        ))}
      </ul>
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
        <p className="text-xs text-slate-500 dark:text-slate-400">Drag each divider around the circle so every sector&apos;s angle matches its share of the data.</p>
      )}
    </div>
  );
}
