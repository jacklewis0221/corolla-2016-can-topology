import { DOMAIN_LABEL, type Domain } from '../data/nodes';
import type { Medium } from '../data/edges';
import type { Opts } from '../lib/model';

const MEDIA: { m: Medium; title: string; desc: string; eco?: boolean }[] = [
  { m: 'can', title: 'CAN V bus', desc: 'Twisted pair, 500 kbit/s. Amber = CANH, light = CANL (white wire).' },
  { m: 'local', title: 'Local CAN', desc: 'LE Eco only: ECM ↔ Valvematic & generator control.', eco: true },
  { m: 'lin', title: 'LIN', desc: 'One wire, ≤ 20 kbit/s, one master per bus.' },
  { m: 'serial', title: 'Serial & diagnostic', desc: 'Immobiliser link, K-line, PRG/RDA, TS/TC.' },
  { m: 'wire', title: 'Hard-wired signal', desc: 'A dedicated wire, e.g. the SP1 speed pulse.' },
  { m: 'rf', title: 'Radio', desc: 'Key fob and tire-valve transmitters.' },
  { m: 'video', title: 'Analog video', desc: 'Rear camera to the head unit.' },
];

export function Legend({ opts }: { opts: Opts }) {
  return (
    <div className="legend" aria-label="Legend">
      <ul className="legend__media">
        {MEDIA.filter((x) => !x.eco || opts.eco).map((x) => (
          <li key={x.m}>
            <svg width="54" height="14" viewBox="0 0 54 14" aria-hidden="true" className={`edge m-${x.m}`}>
              <path d="M2,7 L52,7" className="edge__a" style={{ strokeWidth: x.m === 'can' || x.m === 'local' ? 5 : 3 }} />
              {(x.m === 'can' || x.m === 'local') && <path d="M2,7 L52,7" className="edge__b" style={{ strokeWidth: 5 }} />}
            </svg>
            <span>
              <b>{x.title}</b>
              {x.desc}
            </span>
          </li>
        ))}
      </ul>
      <ul className="legend__domains">
        {(Object.keys(DOMAIN_LABEL) as Domain[]).map((d) => (
          <li key={d} className={`d-${d}`}>
            <span className="legend__dot" aria-hidden="true" />
            {DOMAIN_LABEL[d]}
          </li>
        ))}
      </ul>
    </div>
  );
}
