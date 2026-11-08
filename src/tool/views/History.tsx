import { CarFront, ClipboardCheck, ExternalLink, Hammer, Radio, ShieldCheck, Wrench } from 'lucide-react';
import { money, miles as mi, type Visit } from '../data/fleet';
import { coverage, dueInterval, forecastDate, milesPerMonth } from '../data/maintenance';
import { SOURCES } from '../../data/sources';
import { sim } from '../sim/engine';
import { useSim } from '../sim/hooks';
import { Badge, Kv, Panel, clock } from '../ui/common';

const KIND: Record<Visit['kind'], { label: string; icon: typeof Wrench; tone: 'ok' | 'info' | 'accent' | 'warn' | 'neutral' }> = {
  maintenance: { label: 'Maintenance', icon: ClipboardCheck, tone: 'ok' },
  repair: { label: 'Repair', icon: Wrench, tone: 'warn' },
  tires: { label: 'Tires', icon: CarFront, tone: 'info' },
  inspection: { label: 'Inspection', icon: ShieldCheck, tone: 'ok' },
  customer: { label: 'Customer-reported', icon: Hammer, tone: 'accent' },
};

const fmtDate = (s: string | Date) =>
  (typeof s === 'string' ? new Date(s + 'T12:00:00') : s).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });

export function HistoryView({ vid }: { vid: string }) {
  useSim(1);
  const rt = sim.byId[vid];
  const v = rt.v;
  const today = new Date();
  const cov = coverage(v, today);
  const rate = milesPerMonth(v, today);
  const due = dueInterval(v.miles);
  const visits = [...v.history].sort((a, b) => b.date.localeCompare(a.date));
  const events = sim.events.filter((e) => e.vid === vid).slice(0, 8);
  const ageYears = (today.getTime() - new Date(v.inService + 'T12:00:00').getTime()) / (365.25 * 864e5);
  return (
    <div className="st-history">
      <header className="st-viewhead">
        <div>
          <h2>Vehicle history</h2>
          <p className="st-lede">
            Service visits at this dealership, coverage status and what the console logged during today’s visit. Visit records are sample
            data.
          </p>
        </div>
      </header>
      <div className="st-history__top">
        <Panel title="Vehicle record" id="rec-title">
          <dl className="st-kvlist">
            <Kv k="Vehicle" v={`${v.year} Corolla · ${v.trim}`} />
            <Kv k="Engine" v={v.engine === '2ZR-FAE' ? '2ZR-FAE 1.8 L Valvematic' : '2ZR-FE 1.8 L'} />
            <Kv k="VIN" v={`…${v.vin8}`} mono />
            <Kv k="Plate" v={v.plate} mono />
            <Kv k="In service" v={`${fmtDate(v.inService)} · ${ageYears.toFixed(1)} years`} />
            <Kv k="Average use" v={`${Math.round(rate).toLocaleString('en-US')} mi / month`} />
            <Kv k="Next scheduled service" v={`${due.toLocaleString('en-US')} mi · around ${fmtDate(forecastDate(v, due, today))}`} />
          </dl>
        </Panel>
        <Panel title="Coverage" sub="Computed from the in-service date and odometer" id="cov-title">
          <ul className="st-cov">
            {cov.map((c) => (
              <li key={c.label}>
                <div>
                  <b>{c.label}</b>
                  <span>{c.limit}</span>
                </div>
                <Badge tone={c.active ? 'ok' : 'neutral'} dot>
                  {c.remaining}
                </Badge>
              </li>
            ))}
          </ul>
          <p className="st-foot">
            Terms:{' '}
            <a href={SOURCES.toyotaCare.url} target="_blank" rel="noopener noreferrer" data-testid="src-toyotacare">
              ToyotaCare <ExternalLink size={12} aria-hidden="true" />
            </a>{' '}
            ·{' '}
            <a href={SOURCES.maintGuide.url} target="_blank" rel="noopener noreferrer" data-testid="src-maintguide">
              2016 Warranty & Maintenance Guide <ExternalLink size={12} aria-hidden="true" />
            </a>
          </p>
        </Panel>
        <Panel title="Odometer over time" sub="Each dot is a visit" id="odo-title">
          <OdoChart vid={vid} />
        </Panel>
      </div>
      <div className="st-history__grid">
        <Panel title="Service visits" sub={`${visits.length} records`} id="visits-title">
          <ol className="st-timeline" data-testid="history-timeline">
            {visits.map((h) => {
              const K = KIND[h.kind];
              const Icon = K.icon;
              return (
                <li key={`${h.date}-${h.ro}`} className={`st-tl is-${h.kind}`}>
                  <span className="st-tl__icon" aria-hidden="true">
                    <Icon size={16} />
                  </span>
                  <div className="st-tl__body">
                    <p className="st-tl__head">
                      <b>{h.title}</b>
                      <Badge tone={K.tone}>{K.label}</Badge>
                    </p>
                    <p className="st-tl__meta mono">
                      {fmtDate(h.date)} · {mi(h.miles)} · RO {h.ro}
                      {h.total ? ` · ${money(h.total)}` : ''}
                    </p>
                    <ul>
                      {h.items.map((i) => (
                        <li key={i}>{i}</li>
                      ))}
                    </ul>
                    {h.finding && <p className="st-tl__finding">{h.finding}</p>}
                  </div>
                </li>
              );
            })}
          </ol>
        </Panel>
        <Panel title="Today’s console log" sub="Adapter, scans, tests and repairs on this RO" id="log-title">
          {events.length ? (
            <ol className="st-feed">
              {events.map((e, i) => (
                <li key={`${e.at}-${i}`} className={`st-feed__item is-${e.level}`}>
                  <span className="st-feed__time mono">{clock(e.at)}</span>
                  <span className="st-feed__slot">
                    <Radio size={12} aria-hidden="true" />
                    {v.adapter.id}
                  </span>
                  <span className="st-feed__text">{e.text}</span>
                </li>
              ))}
            </ol>
          ) : (
            <p className="st-foot">Nothing logged yet for this vehicle today.</p>
          )}
        </Panel>
      </div>
    </div>
  );
}

function OdoChart({ vid }: { vid: string }) {
  const v = sim.byId[vid].v;
  const pts = [
    { t: new Date(v.inService + 'T12:00:00').getTime(), m: 0 },
    ...v.history.map((h) => ({ t: new Date(h.date + 'T12:00:00').getTime(), m: h.miles })),
    { t: Date.now(), m: v.miles },
  ].sort((a, b) => a.t - b.t);
  const next = dueInterval(v.miles);
  const nt = forecastDate(v, next + 5000, new Date()).getTime();
  const t0 = pts[0].t;
  const t1 = nt;
  const m1 = Math.max(next + 5000, v.miles) * 1.05;
  const W = 360;
  const H = 170;
  const x = (t: number) => 46 + ((t - t0) / (t1 - t0)) * (W - 58);
  const y = (m: number) => H - 22 - (m / m1) * (H - 34);
  const d = pts.map((p, i) => `${i ? 'L' : 'M'}${x(p.t).toFixed(1)} ${y(p.m).toFixed(1)}`).join('');
  const last = pts[pts.length - 1];
  const years: number[] = [];
  for (let yy = new Date(t0).getFullYear() + 1; yy <= new Date(t1).getFullYear(); yy += 2) years.push(yy);
  return (
    <svg className="st-odo" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Odometer at each visit with a forecast">
      {[0, 0.5, 1].map((f) => (
        <g key={f}>
          <line x1="46" x2={W - 10} y1={y(m1 * f)} y2={y(m1 * f)} className="st-trend__grid" />
          <text x="40" y={y(m1 * f) + 4} textAnchor="end" className="st-trend__tick">
            {Math.round((m1 * f) / 1000)}k
          </text>
        </g>
      ))}
      {years.map((yy) => (
        <text key={yy} x={x(new Date(`${yy}-01-01T00:00:00`).getTime())} y={H - 6} textAnchor="middle" className="st-trend__tick">
          {yy}
        </text>
      ))}
      <path d={d} className="st-odo__line" />
      <path d={`M${x(last.t)} ${y(last.m)} L${x(nt)} ${y(next + 5000)}`} className="st-odo__fore" />
      {pts.slice(1).map((p, i) => (
        <circle
          key={i}
          cx={x(p.t)}
          cy={y(p.m)}
          r={i === pts.length - 2 ? 4.5 : 3}
          className={i === pts.length - 2 ? 'st-odo__now' : 'st-odo__dot'}
        />
      ))}
    </svg>
  );
}
