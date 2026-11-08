import type { ReactNode } from 'react';
import { Activity, AlertTriangle, CircleCheck, Pause, Play, Radio, ScanLine, Timer, Wifi } from 'lucide-react';
import { STATUS_LABEL, VEHICLES, vehicleTitle, miles, YOU } from '../data/fleet';
import { SIG, fmtValue, unitOf } from '../data/signals';
import { sim, type Rt } from '../sim/engine';
import { usePrefs, useSim } from '../sim/hooks';
import { useActions } from '../actions';
import { Badge, Panel, clock } from '../ui/common';
import { SignalBars, Sparkline } from '../ui/charts';
import { CarGlyph } from '../ui/CarGlyph';

const STATUS_TONE = { road: 'info', diagnosing: 'warn', maintenance: 'accent', waiting: 'accent', ready: 'ok' } as const;

export function ShopFloor() {
  useSim(4);
  const rts = sim.rts;
  const codes = rts.reduce((s, r) => s + r.dtcs.filter((d) => d.status !== 'history').length, 0);
  const withCodes = rts.filter((r) => r.dtcs.some((d) => d.status !== 'history')).length;
  const fps = rts.reduce((s, r) => s + r.link.fps, 0);
  const lat = rts.reduce((s, r) => s + r.link.lat, 0) / rts.length;
  const scanning = rts.some((r) => r.scan.state === 'run');
  const ready = VEHICLES.filter((v) => v.status === 'ready').length;
  return (
    <div className="st-floor">
      <header className="st-pagehead">
        <div>
          <p className="st-kicker">Shop floor · live</p>
          <h1>Eight Corollas, one console</h1>
          <p className="st-lede">
            Each car has a wireless adapter on its DLC3 port bridging the CAN bus to the shop Wi-Fi. Broadcast frames stream from every car
            at once; diagnostic requests go only to the cars you open.
          </p>
        </div>
        <div className="st-pagehead__actions">
          <button
            className="st-btn"
            onClick={() => {
              sim.frozen = !sim.frozen;
              sim.bump();
            }}
            data-testid="floor-pause"
          >
            {sim.frozen ? <Play size={16} aria-hidden="true" /> : <Pause size={16} aria-hidden="true" />}
            {sim.frozen ? 'Resume streams' : 'Pause streams'}
          </button>
          <button className="st-btn st-btn--primary" onClick={() => sim.scanAll()} disabled={scanning} data-testid="scan-all">
            <ScanLine size={16} aria-hidden="true" />
            {scanning ? 'Checking all vehicles…' : 'Health check all'}
          </button>
        </div>
      </header>

      <div className="st-kpis">
        <Kpi icon={<Wifi size={18} />} label="Adapters online" value={`${rts.length} / ${rts.length}`} note="3 access points" />
        <Kpi
          icon={<AlertTriangle size={18} />}
          label="Active trouble codes"
          value={String(codes)}
          note={`on ${withCodes} vehicle${withCodes === 1 ? '' : 's'}`}
          tone={codes ? 'warn' : 'ok'}
        />
        <Kpi
          icon={<Activity size={18} />}
          label="Bus traffic received"
          value={`${(fps / 1000).toFixed(1)}k`}
          note="frames per second, all cars"
        />
        <Kpi icon={<Timer size={18} />} label="Average link latency" value={`${Math.round(lat)} ms`} note="adapter → console" />
        <Kpi icon={<CircleCheck size={18} />} label="Ready for pickup" value={String(ready)} note="final scan clean" tone="ok" />
      </div>

      <div className="st-floor__grid">
        <div className="st-bays" data-testid="bays">
          {rts.map((rt) => (
            <BayCard key={rt.id} rt={rt} />
          ))}
        </div>
        <div className="st-floor__side">
          <Panel
            title="Shop network"
            sub="Adapters roam between access points; the road-test car stays connected on the lot."
            id="net-title"
          >
            <NetworkMap />
          </Panel>
          <Panel title="Event feed" sub="Every adapter reports here in real time." id="feed-title">
            <EventFeed />
          </Panel>
        </div>
      </div>
    </div>
  );
}

function Kpi({ icon, label, value, note, tone }: { icon: ReactNode; label: string; value: string; note: string; tone?: 'ok' | 'warn' }) {
  return (
    <div className={`st-kpi${tone ? ` is-${tone}` : ''}`}>
      <div className="st-kpi__icon" aria-hidden="true">
        {icon}
      </div>
      <div>
        <p className="st-kpi__label">{label}</p>
        <p className="st-kpi__value">{value}</p>
        <p className="st-kpi__note">{note}</p>
      </div>
    </div>
  );
}

function BayCard({ rt }: { rt: Rt }) {
  const { open } = useActions();
  const { units } = usePrefs();
  const v = rt.v;
  const active = rt.dtcs.filter((d) => d.status !== 'history');
  const codes = [...new Set(active.map((d) => d.code))];
  const rpm = sim.read(rt, 'rpm');
  const vss = sim.read(rt, 'vss');
  const vb = sim.read(rt, 'vbat');
  const spark = sim.series(rt, rt.engine === 'off' ? 'vbat' : 'rpm', 300);
  const scanning = rt.scan.state === 'run';
  const progress = scanning ? rt.scan.i / Math.max(1, rt.scan.order.length) : rt.scan.state === 'done' ? 1 : 0;
  const silent = Object.values(rt.ecu).filter((e) => e.status === 'none').length;
  const L = rt.lamps;
  return (
    <article className={`st-bay${codes.length ? ' has-codes' : ''}${silent ? ' has-silent' : ''}`} data-testid={`bay-${rt.id}`}>
      <header className="st-bay__head">
        <span className="st-bay__slot">{v.slot}</span>
        <Badge tone={STATUS_TONE[v.status]} dot>
          {STATUS_LABEL[v.status]}
        </Badge>
        <span className="st-bay__sig" title={`${v.adapter.id} · ${Math.round(rt.link.rssi)} dBm`}>
          <SignalBars rssi={rt.link.rssi} />
        </span>
      </header>
      <div className="st-bay__car">
        <CarGlyph color={v.swatch} size={92} moving={rt.id === 'road' && vss > 1} />
        <div>
          <h3 className="st-bay__title">
            <button className="st-stretch" onClick={() => open(rt.id)} data-testid={`open-${rt.id}`}>
              {vehicleTitle(v)}
            </button>
          </h3>
          <p className="st-bay__meta">
            {miles(Math.round(rt.s.odo))} · RO {v.ro}
          </p>
          <p className="st-bay__meta">
            {v.customer} · due {v.promised}
          </p>
        </div>
      </div>
      <p className="st-bay__concern">{v.concern}</p>
      <div className="st-bay__live">
        <div>
          <span>{rt.engine === 'off' ? 'Engine off' : 'Engine'}</span>
          <b className="mono">{rt.engine === 'off' ? '—' : `${Math.round(rpm)}`}</b>
          <small>rpm</small>
        </div>
        <div>
          <span>Speed</span>
          <b className="mono">{Number.isFinite(vss) ? fmtValue(SIG.vss, vss, units) : '—'}</b>
          <small>{Number.isFinite(vss) ? unitOf(SIG.vss, units) : 'no data'}</small>
        </div>
        <div>
          <span>Battery</span>
          <b className="mono">{vb.toFixed(1)}</b>
          <small>V</small>
        </div>
        <div className="st-bay__spark">
          <Sparkline data={spark} color={codes.length ? 'var(--warn-ink)' : 'var(--ok-ink)'} height={30} label={`${v.slot} trend`} />
        </div>
      </div>
      <div className="st-bay__codes">
        {codes.length ? (
          codes.slice(0, 3).map((c) => (
            <span key={c} className="st-code">
              {c}
              {active.filter((d) => d.code === c).length > 1 && <small>×{active.filter((d) => d.code === c).length}</small>}
            </span>
          ))
        ) : (
          <span className="st-bay__clean">No active codes</span>
        )}
        <span className="st-lamps" aria-label="Warning lamps">
          {L.mil > 0 && <i className={`st-lamp st-lamp--mil${L.mil === 2 ? ' is-blink' : ''}`} title="Check engine" />}
          {L.abs && <i className="st-lamp st-lamp--abs" title="ABS" />}
          {L.eps && <i className="st-lamp st-lamp--eps" title="EPS" />}
          {L.tpms > 0 && <i className={`st-lamp st-lamp--tpms${L.tpms === 2 ? ' is-blink' : ''}`} title="Tire pressure" />}
        </span>
      </div>
      <footer className="st-bay__foot">
        <span className="mono">
          {v.adapter.id} · {v.adapter.ap === 'AP-3' && rt.id === 'road' ? 'AP-3 lot' : v.adapter.ap}
        </span>
        <span className="mono">{Math.round(rt.link.lat)} ms</span>
        <span className="mono">{Math.round(rt.link.fps)} f/s</span>
        <span className={`st-mode st-mode--${rt.mode}`}>{rt.mode === 'listen' ? 'Listen-only' : 'Read'}</span>
        <span className={`st-holder${rt.holder === YOU ? ' is-you' : ''}`}>{rt.holder === YOU ? 'You' : rt.holder}</span>
      </footer>
      {(scanning || rt.scan.state === 'done') && (
        <div className="st-bay__scan" aria-hidden="true">
          <span style={{ width: `${progress * 100}%` }} className={silent ? 'is-bad' : ''} />
        </div>
      )}
    </article>
  );
}

function NetworkMap() {
  const { reduced } = usePrefs();
  const aps = [
    { id: 'AP-1', x: 132, y: 54, label: 'AP-1 · Bays 1–4' },
    { id: 'AP-2', x: 132, y: 150, label: 'AP-2 · Bays 5–7, Quick lane' },
    { id: 'AP-3', x: 132, y: 246, label: 'AP-3 · Lot' },
  ];
  const rows = sim.rts.map((rt, i) => ({ rt, x: 268, y: 22 + i * 34.5 }));
  return (
    <svg
      className={`st-netmap${reduced ? ' is-still' : ''}`}
      viewBox="0 0 420 300"
      role="img"
      aria-label="Console, access points and the eight vehicle adapters"
    >
      <g className="st-netmap__console">
        <rect x="4" y="122" width="72" height="56" rx="9" />
        <text x="40" y="146" textAnchor="middle">
          Console
        </text>
        <text x="40" y="164" textAnchor="middle" className="st-netmap__sub">
          this PC
        </text>
      </g>
      {aps.map((a) => (
        <g key={a.id}>
          <path d={`M76 150 C 96 150, 96 ${a.y}, ${a.x - 22} ${a.y}`} className="st-netmap__link st-netmap__link--wired" />
        </g>
      ))}
      {rows.map(({ rt, x, y }) => {
        const ap = aps.find((a) => a.id === (rt.id === 'road' ? 'AP-3' : rt.v.adapter.ap))!;
        const q = rt.link.rssi > -60 ? 'good' : rt.link.rssi > -68 ? 'fair' : 'weak';
        return (
          <g key={rt.id}>
            <path
              d={`M${ap.x + 22} ${ap.y} C ${ap.x + 64} ${ap.y}, ${x - 56} ${y}, ${x - 12} ${y}`}
              className={`st-netmap__link st-netmap__link--${q}`}
            />
            <circle cx={x - 6} cy={y} r="6" className={`st-netmap__vci st-netmap__vci--${q}`} />
            <text x={x + 6} y={y + 4} className="st-netmap__label">
              {rt.v.slot}
            </text>
            <text x={416} y={y + 4} textAnchor="end" className="st-netmap__sub st-netmap__dbm mono">
              {Math.round(rt.link.rssi)} dBm
            </text>
          </g>
        );
      })}
      {aps.map((a) => (
        <g key={`n-${a.id}`} className="st-netmap__ap">
          <rect x={a.x - 22} y={a.y - 15} width="44" height="30" rx="7" />
          <text x={a.x} y={a.y + 4} textAnchor="middle">
            {a.id}
          </text>
        </g>
      ))}
    </svg>
  );
}

function EventFeed() {
  const ev = sim.events.slice(0, 9);
  const slot = (id: string) => (id === 'all' ? 'All' : (sim.byId[id]?.v.slot ?? id));
  return (
    <ol className="st-feed" data-testid="event-feed">
      {ev.map((e, i) => (
        <li key={`${e.at}-${i}`} className={`st-feed__item is-${e.level}`}>
          <span className="st-feed__time mono">{clock(e.at)}</span>
          <span className="st-feed__slot">
            <Radio size={12} aria-hidden="true" />
            {slot(e.vid)}
          </span>
          <span className="st-feed__text">{e.text}</span>
        </li>
      ))}
    </ol>
  );
}
