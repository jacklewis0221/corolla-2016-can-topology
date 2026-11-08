import type { Rt } from '../sim/engine';
import { PRESETS } from '../../lib/model';

interface Box {
  id: string;
  label: string;
  x: number;
  y: number;
  w?: number;
}

const W = 760;
const H = 300;
const Y = 150;
const J2 = 220;
const J3 = 470;

/**
 * The car's V bus as the atlas documents it: ECM (120 Ω) — No. 2 J/C (skid control branch) —
 * No. 3 J/C (DLC3 and the other branches) — combination meter (120 Ω). Each box takes its status
 * from the vehicle's latest health check.
 */
export function BusDiagram({ rt, openBranch }: { rt: Rt; openBranch?: boolean }) {
  const o = PRESETS[rt.v.preset].opts;
  const top: Box[] = [
    { id: 'dlc3', label: 'DLC3 · adapter', x: 330, y: 44 },
    { id: 'steer', label: 'Steering sensor', x: 440, y: 44 },
    { id: 'eps', label: 'Power steering', x: 550, y: 44 },
    { id: 'airbag', label: 'Airbag sensor', x: 660, y: 44 },
  ];
  const bottom: Box[] = [
    { id: 'body', label: 'Main body ECU', x: 330, y: 256 },
    { id: 'ac', label: 'A/C amplifier', x: 440, y: 256 },
    { id: o.nav ? 'nav' : 'radio', label: o.nav ? 'Navigation' : 'Radio & display', x: 550, y: 256 },
    ...(o.smartKey ? [{ id: 'cert', label: 'Certification', x: 660, y: 256 }] : []),
  ];
  const st = (id: string) => {
    if (id === 'dlc3') return 'tool';
    const e = rt.ecu[id];
    return e ? e.status : 'idle';
  };
  const node = (b: Box) => {
    const w = b.w ?? 104;
    const s = st(b.id);
    return (
      <g key={b.id} className={`st-bd__node is-${s}`} transform={`translate(${b.x - w / 2} ${b.y - 17})`}>
        <rect width={w} height="34" rx="8" />
        <text x={w / 2} y="21.5" textAnchor="middle">
          {b.label}
        </text>
        {(s === 'none' || s === 'ok' || s === 'querying') && <circle cx={w - 8} cy="8" r="3.5" className="st-bd__dot" />}
      </g>
    );
  };
  const spoke = (b: Box) => {
    const end = b.y < Y ? b.y + 17 : b.y - 17;
    return (
      <g key={`s-${b.id}`} className="st-bd__branch">
        <path d={`M${J3 - 1.5} ${Y} L${b.x - 1.5} ${end}`} className="st-bd__h" />
        <path d={`M${J3 + 1.5} ${Y} L${b.x + 1.5} ${end}`} className="st-bd__l" />
      </g>
    );
  };
  return (
    <div className="st-bd-wrap">
      <svg className="st-bd" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="CAN V bus topology with module status">
        <g className="st-bd__main">
          <path d={`M106 ${Y - 3} H654`} className="st-bd__h" />
          <path d={`M106 ${Y + 3} H654`} className="st-bd__l" />
        </g>
        {[...top, ...bottom].map(spoke)}
        <g className={`st-bd__branch${openBranch ? ' is-open' : ''}`}>
          <path d={`M${J2 - 3} ${Y} V239`} className="st-bd__h" />
          <path d={`M${J2 + 3} ${Y} V239`} className="st-bd__l" />
          {openBranch && (
            <g className="st-bd__break" transform={`translate(${J2} 200)`}>
              <circle r="12" />
              <path d="M-5 -5 L5 5 M5 -5 L-5 5" />
            </g>
          )}
        </g>
        {o.eco && (
          <g className="st-bd__local">
            <path d={`M58 ${Y + 17} V212 M58 212 L32 251 M58 212 L100 251`} />
            <circle cx="58" cy="212" r="5" />
            <text x="68" y="206">
              Local CAN
            </text>
          </g>
        )}
        <g className="st-bd__jc">
          <rect x={J2 - 9} y={Y - 9} width="18" height="18" rx="4" />
          <text x={J2} y={Y - 17} textAnchor="middle">
            No. 2 J/C
          </text>
          <rect x={J3 - 9} y={Y - 9} width="18" height="18" rx="4" />
          <text x={J3 + 16} y={Y - 15}>
            No. 3 J/C
          </text>
        </g>
        {node({ id: 'ecm', label: 'ECM · 120 Ω', x: 58, y: Y, w: 96 })}
        {node({ id: 'meter', label: 'Meter · 120 Ω', x: 702, y: Y, w: 96 })}
        {node({ id: 'skid', label: 'Skid control', x: J2, y: 256, w: 104 })}
        {o.eco && (
          <>
            {node({ id: 'vvl', label: 'Valvematic', x: 40, y: 268, w: 76 })}
            {node({ id: 'genecu', label: 'Generator', x: 122, y: 268, w: 76 })}
          </>
        )}
        {top.map(node)}
        {bottom.map(node)}
      </svg>
    </div>
  );
}
