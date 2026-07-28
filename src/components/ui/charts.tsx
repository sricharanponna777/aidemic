"use client";

/**
 * Dependency-free inline-SVG charts. Kept intentionally small — the app only
 * needs three simple visualisations and none of the bundled libraries draw
 * charts, so a charting dependency isn't worth the weight. All colours resolve
 * through the design tokens, so both themes and future re-skins come for free.
 */

type Point = { label: string; value: number };

const AXIS = "var(--t-subtle)";
const LINE = "var(--t-accent)";
const AREA = "var(--t-accent-muted)";

function niceMax(max: number) {
  if (max <= 0) return 1;
  const pow = Math.pow(10, Math.floor(Math.log10(max)));
  return Math.ceil(max / pow) * pow;
}

/** Line chart with a soft filled area. Good for retention/accuracy over time. */
export function LineChart({
  data,
  height = 140,
  suffix = "",
  ariaLabel,
}: {
  data: Point[];
  height?: number;
  suffix?: string;
  ariaLabel: string;
}) {
  if (data.length === 0) return null;
  const width = 320;
  const padX = 6;
  const padY = 10;
  const max = niceMax(Math.max(...data.map((d) => d.value), 1));
  const innerW = width - padX * 2;
  const innerH = height - padY * 2;
  const stepX = data.length > 1 ? innerW / (data.length - 1) : 0;
  const x = (i: number) => padX + i * stepX;
  const y = (v: number) => padY + innerH - (v / max) * innerH;

  const linePath = data.map((d, i) => `${i === 0 ? "M" : "L"}${x(i)},${y(d.value)}`).join(" ");
  const areaPath = `${linePath} L${x(data.length - 1)},${padY + innerH} L${x(0)},${padY + innerH} Z`;

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="h-auto w-full"
      role="img"
      aria-label={ariaLabel}
      preserveAspectRatio="none"
    >
      <line x1={padX} y1={padY + innerH} x2={width - padX} y2={padY + innerH} stroke={AXIS} strokeWidth={1} />
      <path d={areaPath} fill={AREA} opacity={0.7} />
      <path d={linePath} fill="none" stroke={LINE} strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />
      {data.map((d, i) => (
        <circle key={i} cx={x(i)} cy={y(d.value)} r={2.5} fill={LINE}>
          <title>{`${d.label}: ${d.value}${suffix}`}</title>
        </circle>
      ))}
    </svg>
  );
}

/** Vertical bar chart. Good for cards reviewed per day. */
export function BarChart({
  data,
  height = 140,
  suffix = "",
  ariaLabel,
}: {
  data: Point[];
  height?: number;
  suffix?: string;
  ariaLabel: string;
}) {
  if (data.length === 0) return null;
  const width = 320;
  const padX = 6;
  const padY = 10;
  const max = niceMax(Math.max(...data.map((d) => d.value), 1));
  const innerW = width - padX * 2;
  const innerH = height - padY * 2;
  const slot = innerW / data.length;
  const barW = Math.max(2, Math.min(slot * 0.7, 18));

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="h-auto w-full" role="img" aria-label={ariaLabel}>
      <line x1={padX} y1={padY + innerH} x2={width - padX} y2={padY + innerH} stroke={AXIS} strokeWidth={1} />
      {data.map((d, i) => {
        const h = (d.value / max) * innerH;
        const cx = padX + slot * i + slot / 2;
        return (
          <rect
            key={i}
            x={cx - barW / 2}
            y={padY + innerH - h}
            width={barW}
            height={h}
            rx={2}
            fill={LINE}
            opacity={d.value === 0 ? 0.25 : 0.85}
          >
            <title>{`${d.label}: ${d.value}${suffix}`}</title>
          </rect>
        );
      })}
    </svg>
  );
}
