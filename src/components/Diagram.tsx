import { useMemo, useRef, useState, type KeyboardEvent, type MouseEvent } from 'react';
import { NODE_BY_ID, type NetNode } from '../data/nodes';
import { EDGE_BY_ID, MEDIUM_LABEL, type Edge, type Pt } from '../data/edges';
import {
  calloutLayout,
  calloutWidth,
  edgeGeom,
  edgePoints,
  layerOn,
  nodeLabel,
  presentEdges,
  presentNodes,
  subline,
  type Layers,
  type Opts,
  type Packet,
  type Pulse,
} from '../lib/model';
import { lerp, pointAt, polyPath, wrapLabel } from '../lib/geometry';
import { CarOutline } from './CarOutline';

export interface DiagramProps {
  opts: Opts;
  layers: Layers;
  t: number;
  selected?: string | null;
  selectedEdge?: string | null;
  focus?: string[] | null;
  silent?: string | null;
  dtcBadges?: Record<string, string[]>;
  packets: Packet[];
  pulses: Pulse[];
  now: number;
  pulseMs: number;
  onSelectNode?: (id: string) => void;
  onSelectEdge?: (id: string) => void;
  onBackground?: () => void;
  showIo?: boolean;
  title: string;
  testId: string;
}

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const DOT = 20;

function strokeFor(e: Edge, t: number) {
  const main = e.main ? 7.5 : 5;
  switch (e.medium) {
    case 'can':
      return lerp(main, e.main ? 4.5 : 3, t);
    case 'local':
      return lerp(5, 3, t);
    case 'lin':
      return lerp(3.5, 2.4, t);
    case 'video':
      return lerp(3.5, 2.4, t);
    default:
      return lerp(2.6, 2, t);
  }
}

export function Diagram(props: DiagramProps) {
  const {
    opts,
    layers,
    t,
    selected,
    selectedEdge,
    focus,
    silent,
    dtcBadges,
    packets,
    pulses,
    now,
    pulseMs,
    onSelectNode,
    onSelectEdge,
    onBackground,
    showIo,
    title,
    testId,
  } = props;
  const wrap = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<{ id: string; x: number; y: number } | null>(null);

  const nodes = useMemo(() => presentNodes(opts), [opts]);
  const edges = useMemo(() => presentEdges(opts), [opts]);
  const visibleEdges = useMemo(() => edges.filter((e) => layerOn(e, layers)), [edges, layers]);
  const callouts = useMemo(() => calloutLayout(nodes), [nodes]);

  const focusSet = useMemo(() => (focus && focus.length ? new Set(focus) : null), [focus]);
  const liveEdges = useMemo(() => {
    const s = new Set<string>();
    for (const p of packets) if (now >= p.start && now <= p.start + p.dur) s.add(p.edge);
    return s;
  }, [packets, now]);

  const textO = clamp01(1 - t * 2.2);
  const calloutO = clamp01((t - 0.55) / 0.45);
  const sizeT = clamp01(t * 1.5);

  const posOf = (n: NetNode): Pt => [lerp(n.pos.s[0], n.pos.p[0], t), lerp(n.pos.s[1], n.pos.p[1], t)];

  const onEdgeMove = (id: string) => (ev: MouseEvent) => {
    const r = wrap.current?.getBoundingClientRect();
    if (!r) return;
    setHover({ id, x: ev.clientX - r.left, y: ev.clientY - r.top });
  };

  const keySelect = (id: string) => (ev: KeyboardEvent) => {
    if (ev.key === 'Enter' || ev.key === ' ') {
      ev.preventDefault();
      onSelectNode?.(id);
    }
  };

  const hoverEdge = hover ? EDGE_BY_ID[hover.id] : null;

  return (
    <div className="diagram" ref={wrap} data-testid={testId}>
      <svg
        className="diagram__svg"
        viewBox="0 0 1600 1000"
        role="img"
        aria-label={title}
        onClick={(ev) => {
          if (ev.target === ev.currentTarget) onBackground?.();
        }}
      >
        <defs>
          <pattern id={`${testId}-grid`} width="32" height="32" patternUnits="userSpaceOnUse">
            <circle cx="1.5" cy="1.5" r="1.5" className="grid-dot" />
          </pattern>
          <radialGradient id={`${testId}-glow`}>
            <stop offset="0%" stopColor="currentColor" stopOpacity="0.55" />
            <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
          </radialGradient>
        </defs>

        <rect
          x="0"
          y="0"
          width="1600"
          height="1000"
          fill={`url(#${testId}-grid)`}
          style={{ opacity: 1 - t }}
          onClick={() => onBackground?.()}
        />
        <CarOutline opacity={clamp01(t * 1.4 - 0.2)} />

        {/* callout leader lines (in-car view) */}
        {calloutO > 0 && (
          <g className="leaders" style={{ opacity: calloutO }}>
            {nodes.map((n) => {
              const c = callouts[n.id];
              if (!c) return null;
              const [x, y] = n.pos.p;
              const ly = c.top ? c.y + 15 : c.y - 15;
              return <path key={n.id} d={`M${x},${y} L${c.x},${ly}`} className={`leader${selected === n.id ? ' is-on' : ''}`} />;
            })}
          </g>
        )}

        {/* edges */}
        <g className="edges">
          {visibleEdges.map((e) => {
            const pts = edgePoints(e, t);
            const g = edgeGeom(e);
            const d = t <= 0.001 ? g.sD : t >= 0.999 ? g.pD : polyPath(pts);
            const w = strokeFor(e, t);
            // CAN branches of a focused module stay lit (bus membership); other links only when both ends are in focus
            const touchesFocus = focusSet
              ? e.medium === 'can' || e.medium === 'local'
                ? focusSet.has(e.from) || focusSet.has(e.to)
                : focusSet.has(e.from) && focusSet.has(e.to)
              : true;
            const dim = focusSet && !liveEdges.has(e.id) && !touchesFocus;
            const related = selected && (e.from === selected || e.to === selected);
            const cut = silent && (e.from === silent || e.to === silent) && (e.medium === 'can' || e.medium === 'local');
            const cls = [
              'edge',
              `m-${e.medium}`,
              e.main ? 'is-main' : '',
              liveEdges.has(e.id) ? 'is-live' : '',
              selectedEdge === e.id || related ? 'is-selected' : '',
              dim ? 'is-dim' : '',
              cut ? 'is-cut' : '',
            ]
              .filter(Boolean)
              .join(' ');
            const mid = pointAt(pts, 0.5);
            return (
              <g key={e.id} className={cls}>
                {(e.medium === 'can' || e.medium === 'local') && <path d={d} className="edge__halo" style={{ strokeWidth: w + 8 }} />}
                <path d={d} className="edge__a" style={{ strokeWidth: w }} />
                {(e.medium === 'can' || e.medium === 'local') && <path d={d} className="edge__b" style={{ strokeWidth: w }} />}
                <path
                  d={d}
                  className="edge__hit"
                  onMouseMove={onEdgeMove(e.id)}
                  onMouseLeave={() => setHover(null)}
                  onClick={(ev) => {
                    ev.stopPropagation();
                    onSelectEdge?.(e.id);
                  }}
                />
                {cut && (
                  <g transform={`translate(${mid[0]},${mid[1]})`} className="cut-mark">
                    <circle r="15" />
                    <path d="M-6,-6 L6,6 M6,-6 L-6,6" />
                  </g>
                )}
              </g>
            );
          })}
        </g>

        {/* pulses */}
        <g className="pulses">
          {pulses.map((p) => {
            const n = NODE_BY_ID[p.node];
            if (!n) return null;
            const k = (now - p.start) / pulseMs;
            if (k < 0 || k > 1) return null;
            const [x, y] = posOf(n);
            const [w0, h0] = n.size ?? [156, 76];
            const w = lerp(w0, DOT, sizeT);
            const h = lerp(h0, DOT, sizeT);
            const grow = 6 + k * 26;
            return (
              <rect
                key={p.key}
                className={`pulse pulse--${p.kind}`}
                x={x - w / 2 - grow}
                y={y - h / 2 - grow}
                width={w + grow * 2}
                height={h + grow * 2}
                rx={lerp(14, 14, t) + grow}
                style={{ opacity: (1 - k) * 0.9 }}
              />
            );
          })}
        </g>

        {/* packets */}
        <g className="packets">
          {packets.map((p) => {
            const e = EDGE_BY_ID[p.edge];
            if (!e) return null;
            const f = (now - p.start) / p.dur;
            if (f < 0 || f > 1) return null;
            const pts = edgePoints(e, t);
            const [x, y] = pointAt(pts, p.reverse ? 1 - f : f);
            return (
              <g key={p.key} className={`packet m-${p.medium}`} transform={`translate(${x},${y})`}>
                <circle r="20" fill={`url(#${testId}-glow)`} />
                <circle r="8" className="packet__body" />
                <circle r="3.4" className="packet__core" />
                {p.label && (
                  <g transform="translate(14,-30)">
                    <rect x="0" y="-15" width={p.label.length * 9.6 + 18} height="28" rx="8" className="packet__tag" />
                    <text x="9" y="4.5" className="packet__text">
                      {p.label}
                    </text>
                  </g>
                )}
              </g>
            );
          })}
        </g>

        {/* nodes */}
        <g className="nodes">
          {nodes.map((n) => {
            const [x, y] = posOf(n);
            const [w0, h0] = n.size ?? [156, 76];
            const isJc = n.kind === 'junction';
            const w = lerp(w0, isJc ? 16 : DOT, sizeT);
            const h = lerp(h0, isJc ? 16 : DOT, sizeT);
            const rx = isJc ? lerp(8, 4, sizeT) : lerp(12, DOT / 2, sizeT);
            const isSel = selected === n.id;
            const isSilent = silent === n.id;
            const isFocus = focusSet?.has(n.id) || (focusSet && isSilent);
            const dim = focusSet && !isFocus;
            const cls = [
              'node',
              `k-${n.kind}`,
              `d-${n.domain}`,
              n.can?.length ? 'on-can' : '',
              isSel ? 'is-selected' : '',
              isFocus ? 'is-focus' : '',
              dim ? 'is-dim' : '',
              isSilent ? 'is-silent' : '',
            ]
              .filter(Boolean)
              .join(' ');
            const titleSize = isJc ? (n.id === 'jc3' ? 18 : 15.5) : w0 >= 156 ? 17.5 : 16.5;
            const lines = isJc && n.id !== 'jc3' ? [nodeLabel(n)] : wrapLabel(nodeLabel(n), w0 - 22, titleSize, 0.53);
            const sub = subline(n);
            const lh = titleSize * 1.16;
            const blockH = lines.length * lh + (sub ? 19 : 0);
            const y0 = -blockH / 2 + titleSize * 0.8;
            return (
              <g
                key={n.id}
                className={cls}
                transform={`translate(${x},${y})`}
                role="button"
                tabIndex={0}
                aria-label={`${n.name}${isSel ? ', selected' : ''}`}
                aria-pressed={isSel}
                data-testid={`${testId}-node-${n.id}`}
                onClick={(ev) => {
                  ev.stopPropagation();
                  onSelectNode?.(n.id);
                }}
                onKeyDown={keySelect(n.id)}
              >
                <rect className="node__glow" x={-w / 2 - 7} y={-h / 2 - 7} width={w + 14} height={h + 14} rx={rx + 7} />
                <rect className="node__box" x={-w / 2} y={-h / 2} width={w} height={h} rx={rx} />
                {textO > 0 && (
                  <g style={{ opacity: textO }} className="node__text">
                    {lines.map((l, i) => (
                      <text key={i} x={0} y={y0 + i * lh} textAnchor="middle" className="node__title" style={{ fontSize: titleSize }}>
                        {l}
                      </text>
                    ))}
                    {sub && (
                      <text x={0} y={y0 + lines.length * lh + 2} textAnchor="middle" className="node__sub">
                        {sub}
                      </text>
                    )}
                  </g>
                )}
                {n.terminator && textO > 0 && !dtcBadges?.[n.id]?.length && (
                  <g transform={`translate(${-w / 2 + 4},${-h / 2 - 28})`} style={{ opacity: textO }} className="badge-term">
                    <rect width="66" height="24" rx="7" />
                    <text x="33" y="16.5" textAnchor="middle">
                      120 Ω
                    </text>
                  </g>
                )}
                {showIo && n.io && n.io.length > 0 && textO > 0 && !dtcBadges?.[n.id]?.length && (
                  <g transform={`translate(${w / 2 - 4},${-h / 2 - 28})`} style={{ opacity: textO }} className="badge-io">
                    <rect x={-70} width="70" height="24" rx="7" />
                    <text x={-35} y="16.5" textAnchor="middle">
                      {n.io.length} I/O
                    </text>
                  </g>
                )}
                {isSilent && (
                  <g transform={`translate(0,${h / 2 + 18})`} className="badge-off">
                    <rect x="-46" y="-13" width="92" height="26" rx="8" />
                    <text y="5" textAnchor="middle">
                      OFFLINE
                    </text>
                  </g>
                )}
              </g>
            );
          })}
        </g>

        {/* DTC badges */}
        {dtcBadges && (
          <g className="dtcs">
            {Object.entries(dtcBadges).map(([id, codes]) => {
              const n = NODE_BY_ID[id];
              if (!n || !codes.length || !nodes.includes(n)) return null;
              const [x, y] = posOf(n);
              const [, h0] = n.size ?? [156, 76];
              const h = lerp(h0, DOT, sizeT);
              const shown = codes.slice(0, 2).join(' ') + (codes.length > 2 ? ` +${codes.length - 2}` : '');
              const wpx = shown.length * 9.2 + 20;
              return (
                <g key={id} transform={`translate(${x},${y - h / 2 - 20})`} className="dtc-badge">
                  <rect x={-wpx / 2} y="-14" width={wpx} height="28" rx="8" />
                  <text y="5" textAnchor="middle">
                    {shown}
                  </text>
                </g>
              );
            })}
          </g>
        )}

        {/* callout labels (in-car view) */}
        {calloutO > 0 && (
          <g className="callouts" style={{ opacity: calloutO }}>
            {nodes.map((n) => {
              const c = callouts[n.id];
              if (!c) return null;
              const label = nodeLabel(n);
              const wpx = calloutWidth(label);
              const isSel = selected === n.id;
              const dim = focusSet && !focusSet.has(n.id);
              return (
                <g
                  key={n.id}
                  transform={`translate(${c.x},${c.y})`}
                  className={`callout d-${n.domain}${isSel ? ' is-selected' : ''}${dim ? ' is-dim' : ''}`}
                  onClick={(ev) => {
                    ev.stopPropagation();
                    onSelectNode?.(n.id);
                  }}
                >
                  <rect x={-wpx / 2} y="-15" width={wpx} height="30" rx="9" />
                  <circle cx={-wpx / 2 + 14} cy="0" r="4" className="callout__dot" />
                  <text x={-wpx / 2 + 26} y="5.5">
                    {label}
                  </text>
                </g>
              );
            })}
            <text x="800" y="975" textAnchor="middle" className="car__note">
              Positions are approximate, based on Toyota’s parts-location drawings. Wires are drawn point to point.
            </text>
          </g>
        )}
      </svg>

      {hoverEdge && hover && (
        <div
          className="tooltip"
          style={{
            left: Math.min(hover.x + 14, (wrap.current?.clientWidth ?? 0) - 300),
            top: hover.y + 16,
          }}
          role="tooltip"
        >
          <div className={`tooltip__medium m-${hoverEdge.medium}`}>{MEDIUM_LABEL[hoverEdge.medium]}</div>
          <div className="tooltip__title">{hoverEdge.label}</div>
          <div className="tooltip__body">{hoverEdge.detail}</div>
        </div>
      )}
    </div>
  );
}
