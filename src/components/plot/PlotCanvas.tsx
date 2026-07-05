'use client';

import { createContext, useContext, useMemo } from 'react';
import { invertLinearScale, linearScale, niceStep } from '@/lib/plot/scale';

interface PlotScaleContextValue {
  xScale: (value: number) => number;
  yScale: (value: number) => number;
  xInvert: (pixel: number) => number;
  yInvert: (pixel: number) => number;
  plotLeft: number;
  plotRight: number;
  plotTop: number;
  plotBottom: number;
}

const PlotScaleContext = createContext<PlotScaleContextValue | null>(null);

export const usePlotScale = () => {
  const context = useContext(PlotScaleContext);
  if (!context) throw new Error('usePlotScale must be used within a PlotCanvas');
  return context;
};

interface PlotCanvasProps {
  width?: number;
  height?: number;
  xDomain: [number, number];
  yDomain: [number, number];
  xLabel?: string;
  yLabel?: string;
  xTickCount?: number;
  yTickCount?: number;
  /** When set, overrides the auto "nice" tick step for that axis and draws a 10x10 minor
   * grid (step/10 spacing) so a student-chosen axis scale is visibly snappable, matching how
   * marks are plotted to the nearest small square on GCSE graph paper. */
  xStep?: number;
  yStep?: number;
  children: React.ReactNode;
}

const MARGIN = { top: 16, right: 16, bottom: 40, left: 56 };
const SQUARE_PX = 10;
const MAX_MINOR_SQUARES_PER_AXIS = 300;

const ticksAtStep = (domain: [number, number], step: number) => {
  if (step <= 0) return [];
  const [d0, d1] = domain;
  const first = Math.ceil(d0 / step) * step;
  const ticks: number[] = [];
  for (let tick = first; tick <= d1 + step * 1e-9; tick += step) {
    ticks.push(Math.round(tick / step) * step);
  }
  return ticks;
};

const niceTicks = (domain: [number, number], count: number) => {
  if (count <= 0) return [];
  const [d0, d1] = domain;
  return ticksAtStep(domain, niceStep(d1 - d0, count));
};

const formatTick = (value: number) => Math.round(value * 100) / 100;

export function PlotCanvas({
  width = 640,
  height = 360,
  xDomain,
  yDomain,
  xLabel = '',
  yLabel = '',
  xTickCount = 8,
  yTickCount = 8,
  xStep,
  yStep,
  children,
}: PlotCanvasProps) {
  /** When both axes have a chosen step, size the plot area from a fixed pixel-per-minor-square
   * constant instead of stretching a fixed box -- otherwise x and y end up with different
   * pixel-per-unit ratios and every "square" renders as a rectangle. Falls back to the fixed
   * width/height box (single stretched box, as before) if only one axis has a step, or if the
   * data would need an unreasonable number of squares. */
  let plotWidthPx = width - MARGIN.left - MARGIN.right;
  let plotHeightPx = height - MARGIN.top - MARGIN.bottom;
  if (xStep && yStep) {
    const xMinorCount = (xDomain[1] - xDomain[0]) / (xStep / 10);
    const yMinorCount = (yDomain[1] - yDomain[0]) / (yStep / 10);
    if (
      Number.isFinite(xMinorCount) &&
      Number.isFinite(yMinorCount) &&
      xMinorCount > 0 &&
      yMinorCount > 0 &&
      xMinorCount <= MAX_MINOR_SQUARES_PER_AXIS &&
      yMinorCount <= MAX_MINOR_SQUARES_PER_AXIS
    ) {
      plotWidthPx = xMinorCount * SQUARE_PX;
      plotHeightPx = yMinorCount * SQUARE_PX;
    }
  }
  const svgWidth = plotWidthPx + MARGIN.left + MARGIN.right;
  const svgHeight = plotHeightPx + MARGIN.top + MARGIN.bottom;

  const plotLeft = MARGIN.left;
  const plotRight = plotLeft + plotWidthPx;
  const plotTop = MARGIN.top;
  const plotBottom = plotTop + plotHeightPx;

  const xScale = useMemo(() => linearScale(xDomain, [plotLeft, plotRight]), [xDomain, plotLeft, plotRight]);
  const yScale = useMemo(() => linearScale(yDomain, [plotBottom, plotTop]), [yDomain, plotBottom, plotTop]);
  const xInvert = useMemo(() => invertLinearScale(xDomain, [plotLeft, plotRight]), [xDomain, plotLeft, plotRight]);
  const yInvert = useMemo(() => invertLinearScale(yDomain, [plotBottom, plotTop]), [yDomain, plotBottom, plotTop]);

  const xTicks = useMemo(() => (xStep ? ticksAtStep(xDomain, xStep) : niceTicks(xDomain, xTickCount)), [xDomain, xTickCount, xStep]);
  const yTicks = useMemo(() => (yStep ? ticksAtStep(yDomain, yStep) : niceTicks(yDomain, yTickCount)), [yDomain, yTickCount, yStep]);
  const xMinorTicks = useMemo(() => (xStep ? ticksAtStep(xDomain, xStep / 10) : []), [xDomain, xStep]);
  const yMinorTicks = useMemo(() => (yStep ? ticksAtStep(yDomain, yStep / 10) : []), [yDomain, yStep]);

  /** Pixel size of one minor square, taken from whichever axis actually has a chosen step.
   * Used to fill in a matching square mesh on the OTHER axis when it has no numeric step of
   * its own (e.g. a bar chart's categorical x-axis) -- so the grid still reads as squares,
   * not one-directional stripes, even though that axis has no real gridline values. */
  const squarePx = useMemo(() => {
    if (yStep) return (plotHeightPx / (yDomain[1] - yDomain[0])) * (yStep / 10);
    if (xStep) return (plotWidthPx / (xDomain[1] - xDomain[0])) * (xStep / 10);
    return null;
  }, [yStep, xStep, plotHeightPx, plotWidthPx, yDomain, xDomain]);

  const pixelLines = (start: number, end: number, size: number | null) => {
    if (!size || size <= 0) return [];
    const lines: number[] = [];
    for (let pos = start; pos <= end + 0.01; pos += size) lines.push(pos);
    return lines;
  };

  const syntheticVerticalMinor = useMemo(() => (xStep ? [] : pixelLines(plotLeft, plotRight, squarePx)), [xStep, squarePx, plotLeft, plotRight]);
  const syntheticVerticalMajor = useMemo(
    () => (xStep ? [] : pixelLines(plotLeft, plotRight, squarePx ? squarePx * 10 : null)),
    [xStep, squarePx, plotLeft, plotRight]
  );
  const syntheticHorizontalMinor = useMemo(() => (yStep ? [] : pixelLines(plotTop, plotBottom, squarePx)), [yStep, squarePx, plotTop, plotBottom]);
  const syntheticHorizontalMajor = useMemo(
    () => (yStep ? [] : pixelLines(plotTop, plotBottom, squarePx ? squarePx * 10 : null)),
    [yStep, squarePx, plotTop, plotBottom]
  );

  const contextValue = useMemo<PlotScaleContextValue>(
    () => ({ xScale, yScale, xInvert, yInvert, plotLeft, plotRight, plotTop, plotBottom }),
    [xScale, yScale, xInvert, yInvert, plotLeft, plotRight, plotTop, plotBottom]
  );

  return (
    <svg
      viewBox={`0 0 ${svgWidth} ${svgHeight}`}
      className="w-full touch-none select-none rounded-lg border border-slate-300 bg-white text-slate-700 dark:border-white/10 dark:bg-[#0A0F1E] dark:text-slate-300"
    >
      {xMinorTicks.map((tick) => (
        <line key={`xmg-${tick}`} x1={xScale(tick)} x2={xScale(tick)} y1={plotTop} y2={plotBottom} stroke="currentColor" strokeOpacity={0.14} />
      ))}
      {syntheticVerticalMinor.map((x) => (
        <line key={`xmgs-${x}`} x1={x} x2={x} y1={plotTop} y2={plotBottom} stroke="currentColor" strokeOpacity={0.14} />
      ))}
      {yMinorTicks.map((tick) => (
        <line key={`ymg-${tick}`} x1={plotLeft} x2={plotRight} y1={yScale(tick)} y2={yScale(tick)} stroke="currentColor" strokeOpacity={0.14} />
      ))}
      {syntheticHorizontalMinor.map((y) => (
        <line key={`ymgs-${y}`} x1={plotLeft} x2={plotRight} y1={y} y2={y} stroke="currentColor" strokeOpacity={0.14} />
      ))}
      {xTicks.map((tick) => (
        <line key={`xg-${tick}`} x1={xScale(tick)} x2={xScale(tick)} y1={plotTop} y2={plotBottom} stroke="currentColor" strokeOpacity={0.3} />
      ))}
      {syntheticVerticalMajor.map((x) => (
        <line key={`xgs-${x}`} x1={x} x2={x} y1={plotTop} y2={plotBottom} stroke="currentColor" strokeOpacity={0.3} />
      ))}
      {yTicks.map((tick) => (
        <line key={`yg-${tick}`} x1={plotLeft} x2={plotRight} y1={yScale(tick)} y2={yScale(tick)} stroke="currentColor" strokeOpacity={0.3} />
      ))}
      {syntheticHorizontalMajor.map((y) => (
        <line key={`ygs-${y}`} x1={plotLeft} x2={plotRight} y1={y} y2={y} stroke="currentColor" strokeOpacity={0.3} />
      ))}

      <line x1={plotLeft} x2={plotRight} y1={plotBottom} y2={plotBottom} stroke="currentColor" strokeOpacity={0.4} />
      <line x1={plotLeft} x2={plotLeft} y1={plotTop} y2={plotBottom} stroke="currentColor" strokeOpacity={0.4} />

      {xTicks.map((tick) => (
        <text key={`xt-${tick}`} x={xScale(tick)} y={plotBottom + 16} fontSize={10} textAnchor="middle" fill="currentColor" opacity={0.6}>
          {formatTick(tick)}
        </text>
      ))}
      {yTicks.map((tick) => (
        <text key={`yt-${tick}`} x={plotLeft - 8} y={yScale(tick) + 3} fontSize={10} textAnchor="end" fill="currentColor" opacity={0.6}>
          {formatTick(tick)}
        </text>
      ))}

      {xLabel ? (
        <text x={(plotLeft + plotRight) / 2} y={svgHeight - 4} fontSize={11} textAnchor="middle" fill="currentColor" opacity={0.8}>
          {xLabel}
        </text>
      ) : null}
      {yLabel ? (
        <text
          x={14}
          y={(plotTop + plotBottom) / 2}
          fontSize={11}
          textAnchor="middle"
          fill="currentColor"
          opacity={0.8}
          transform={`rotate(-90 14 ${(plotTop + plotBottom) / 2})`}
        >
          {yLabel}
        </text>
      ) : null}

      <PlotScaleContext.Provider value={contextValue}>{children}</PlotScaleContext.Provider>
    </svg>
  );
}
