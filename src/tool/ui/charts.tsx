import { useId, useLayoutEffect, useMemo, useRef, useState, type PointerEvent } from 'react';

function pathFor(data: ArrayLike<number>, w: number, h: number, lo: number, hi: number, pad = 2): string {
  const n = data.length;
  if (n < 2) return '';
  const span = hi - lo || 1;
  let d = '';
  let pen = false;
  for (let i = 0; i < n; i++) {
    const v = data[i];
    if (!Number.isFinite(v)) {
      pen = false;
      continue;
    }
    const x = (i / (n - 1)) * w;
    const y = pad + (1 - (Math.min(hi, Math.max(lo, v)) - lo) / span) * (h - pad * 2);
    d += `${pen ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`;
    pen = true;
  }
  return d;
}

function autoRange(data: ArrayLike<number>, min?: number, max?: number): [number, number] {
  let lo = Infinity;
  let hi = -Infinity;
  for (let i = 0; i < data.length; i++) {
    const v = data[i];
    if (!Number.isFinite(v)) continue;
    if (v < lo) lo = v;
    if (v > hi) hi = v;
  }
  if (!Number.isFinite(lo)) return [min ?? 0, max ?? 1];
  if (min !== undefined) lo = Math.min(lo, min);
  if (max !== undefined) hi = Math.max(hi, max);
  if (hi - lo < 1e-6) {
    hi += 0.5;
    lo -= 0.5;
  }
  const m = (hi - lo) * 0.08;
  return [lo - m, hi + m];
}

export function Sparkline({
  data,
  color = 'var(--accent)',
  height = 34,
  min,
  max,
  fill = true,
  label,
}: {
  data: ArrayLike<number>;
  color?: string;
  height?: number;
  min?: number;
  max?: number;
  fill?: boolean;
  label?: string;
}) {
  const w = 200;
  const [lo, hi] = autoRange(data, min, max);
  const d = pathFor(data, w, height, lo, hi);
  const gid = useId().replace(/:/g, '');
  return (
    <svg
      className="st-spark"
      viewBox={`0 0 ${w} ${height}`}
      preserveAspectRatio="none"
      style={{ height }}
      role="img"
      aria-label={label ?? 'Trend'}
    >
      <defs>
        <linearGradient id={`g${gid}`} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor={color} stopOpacity="0.28" />
          <stop offset="1" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      {fill && d && <path d={`${d}L${w} ${height}L0 ${height}Z`} fill={`url(#g${gid})`} stroke="none" />}
      {d && <path d={d} fill="none" stroke={color} strokeWidth="1.6" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />}
    </svg>
  );
}

export interface Series {
  key: string;
  label: string;
  data: ArrayLike<number>;
  color: string;
  unit?: string;
  dec?: number;
}

/** Multi-series time chart: the last 60 s, newest on the right. */
export function TrendChart({
  series,
  height = 220,
  min,
  max,
  band,
  seconds = 60,
  ariaLabel,
  paused,
  width,
}: {
  series: Series[];
  /** Drawing width in px; pass the measured container width so text stays at its CSS size. */
  width?: number;
  height?: number;
  min?: number;
  max?: number;
  band?: [number, number];
  seconds?: number;
  ariaLabel: string;
  paused?: boolean;
}) {
  const wrap = useRef<HTMLDivElement>(null);
  const [measured, setMeasured] = useState(0);
  useLayoutEffect(() => {
    if (width) return;
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setMeasured(Math.round(e.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, [width]);
  // Draw at the container's pixel width so axis text renders at its CSS size instead of being scaled.
  const w = Math.max(240, width ?? (measured || 640));
  const padL = 44;
  const padR = 12;
  const padT = 10;
  const padB = 22;
  const iw = w - padL - padR;
  const ih = height - padT - padB;
  const all = useMemo(() => {
    const out: number[] = [];
    for (const s of series) for (let i = 0; i < s.data.length; i++) out.push(s.data[i]);
    return out;
  }, [series]);
  const [lo, hi] = autoRange(all, min, max);
  const ticks = niceTicks(lo, hi, 4);
  const [hover, setHover] = useState<number | null>(null);
  const ref = useRef<SVGSVGElement>(null);
  const onMove = (e: PointerEvent<SVGSVGElement>) => {
    const r = ref.current?.getBoundingClientRect();
    if (!r) return;
    const x = ((e.clientX - r.left) / r.width) * w;
    if (x < padL || x > w - padR) return setHover(null);
    setHover((x - padL) / iw);
  };
  const yOf = (v: number) => padT + (1 - (v - lo) / (hi - lo || 1)) * ih;
  const hoverVals =
    hover === null
      ? null
      : series.map((s) => {
          const n = s.data.length;
          const i = Math.round(hover * (n - 1));
          return { s, v: s.data[i] };
        });
  return (
    <div className="st-trend" ref={wrap}>
      <svg
        ref={ref}
        viewBox={`0 0 ${w} ${height}`}
        role="img"
        aria-label={ariaLabel}
        onPointerMove={onMove}
        onPointerLeave={() => setHover(null)}
      >
        {band && (
          <rect
            x={padL}
            width={iw}
            y={yOf(Math.min(hi, band[1]))}
            height={Math.max(0, yOf(Math.max(lo, band[0])) - yOf(Math.min(hi, band[1])))}
            className="st-trend__band"
          />
        )}
        {ticks.map((t) => (
          <g key={t}>
            <line x1={padL} x2={w - padR} y1={yOf(t)} y2={yOf(t)} className="st-trend__grid" />
            <text x={padL - 6} y={yOf(t) + 4} className="st-trend__tick" textAnchor="end">
              {fmtTick(t, ticks.length > 1 ? ticks[1] - ticks[0] : 1)}
            </text>
          </g>
        ))}
        {[0, 0.25, 0.5, 0.75, 1].map((f) => (
          <text
            key={f}
            x={padL + f * iw}
            y={height - 6}
            className="st-trend__tick"
            textAnchor={f === 0 ? 'start' : f === 1 ? 'end' : 'middle'}
          >
            {f === 1 ? (paused ? 'paused' : 'now') : `−${Math.round((1 - f) * seconds)} s`}
          </text>
        ))}
        <g transform={`translate(${padL} 0)`}>
          {series.map((s) => (
            <path
              key={s.key}
              d={pathFor(s.data, iw, ih, lo, hi, 0)}
              transform={`translate(0 ${padT})`}
              fill="none"
              stroke={s.color}
              strokeWidth="1.8"
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
            />
          ))}
        </g>
        {hover !== null && <line x1={padL + hover * iw} x2={padL + hover * iw} y1={padT} y2={padT + ih} className="st-trend__cursor" />}
      </svg>
      {hoverVals && (
        <div className="st-trend__tip" style={{ left: `${((padL + (hover ?? 0) * iw) / w) * 100}%` }}>
          <b>−{Math.round((1 - (hover ?? 0)) * seconds)} s</b>
          {hoverVals.map(({ s, v }) => (
            <span key={s.key}>
              <i style={{ background: s.color }} />
              {s.label}: {Number.isFinite(v) ? v.toFixed(s.dec ?? 1) : '—'} {s.unit}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function niceTicks(lo: number, hi: number, n: number): number[] {
  const span = hi - lo;
  if (!(span > 0)) return [lo];
  const raw = span / n;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const norm = raw / mag;
  const step = (norm < 1.5 ? 1 : norm < 3 ? 2 : norm < 7 ? 5 : 10) * mag;
  const out: number[] = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi + 1e-9; v += step) out.push(Number(v.toFixed(6)));
  return out;
}

/** Tick label with just enough decimals for the tick spacing, so neighbouring labels never repeat. */
function fmtTick(v: number, step: number): string {
  const a = Math.abs(v);
  if (a >= 1000 && step >= 100) return `${(v / 1000).toFixed(step >= 1000 ? 0 : 1)}k`;
  const dec = step >= 1 ? 0 : step >= 0.1 ? 1 : step >= 0.01 ? 2 : 3;
  return v.toFixed(dec);
}

/** 240° radial gauge. */
export function Gauge({
  value,
  min,
  max,
  label,
  unit,
  text,
  band,
  size = 150,
  tone,
}: {
  value: number;
  min: number;
  max: number;
  label: string;
  unit: string;
  text: string;
  band?: [number, number];
  size?: number;
  tone?: 'ok' | 'warn' | 'danger';
}) {
  const r = 52;
  const cx = 70;
  const cy = 68;
  const a0 = (-210 * Math.PI) / 180;
  const a1 = (30 * Math.PI) / 180;
  const f = (v: number) => (Math.min(max, Math.max(min, v)) - min) / (max - min || 1);
  const ang = (t: number) => a0 + (a1 - a0) * t;
  const pt = (a: number, rr = r) => [cx + rr * Math.cos(a), cy + rr * Math.sin(a)];
  const arc = (t0: number, t1: number, rr = r) => {
    const [x0, y0] = pt(ang(t0), rr);
    const [x1, y1] = pt(ang(t1), rr);
    const large = (a1 - a0) * (t1 - t0) > Math.PI ? 1 : 0;
    return `M${x0.toFixed(2)} ${y0.toFixed(2)}A${rr} ${rr} 0 ${large} 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`;
  };
  const ok = Number.isFinite(value);
  const tv = ok ? f(value) : 0;
  const [nx, ny] = pt(ang(tv), r - 14);
  return (
    <div className={`st-gauge${tone ? ` is-${tone}` : ''}`} style={{ width: size }}>
      <svg viewBox="0 0 140 112" role="img" aria-label={`${label}: ${text} ${unit}`}>
        <path d={arc(0, 1)} className="st-gauge__track" />
        {band && <path d={arc(f(band[0]), f(band[1]))} className="st-gauge__band" />}
        {ok && tv > 0.002 && <path d={arc(0, tv)} className="st-gauge__value" />}
        {ok && <line x1={cx} y1={cy} x2={nx} y2={ny} className="st-gauge__needle" />}
        <circle cx={cx} cy={cy} r="3.5" className="st-gauge__hub" />
        <text x={cx} y={cy + 26} textAnchor="middle" className="st-gauge__num">
          {text}
        </text>
        <text x={cx} y={cy + 40} textAnchor="middle" className="st-gauge__unit">
          {unit}
        </text>
      </svg>
      <div className="st-gauge__label">{label}</div>
    </div>
  );
}

/** Horizontal meter with an optional normal band. */
export function Meter({
  value,
  min,
  max,
  band,
  tone,
}: {
  value: number;
  min: number;
  max: number;
  band?: [number, number];
  tone?: string;
}) {
  const f = (v: number) => `${Math.max(0, Math.min(1, (v - min) / (max - min || 1))) * 100}%`;
  return (
    <div className="st-meter" aria-hidden="true">
      {band && <span className="st-meter__band" style={{ left: f(band[0]), width: `calc(${f(band[1])} - ${f(band[0])})` }} />}
      {Number.isFinite(value) && <span className={`st-meter__fill${tone ? ` is-${tone}` : ''}`} style={{ width: f(value) }} />}
    </div>
  );
}

export function SignalBars({ rssi }: { rssi: number }) {
  const bars = rssi > -55 ? 4 : rssi > -62 ? 3 : rssi > -70 ? 2 : 1;
  return (
    <span className="st-bars" aria-label={`Signal ${Math.round(rssi)} dBm`} role="img">
      {[1, 2, 3, 4].map((b) => (
        <i key={b} className={b <= bars ? 'on' : ''} style={{ height: 3 + b * 3 }} />
      ))}
    </span>
  );
}
