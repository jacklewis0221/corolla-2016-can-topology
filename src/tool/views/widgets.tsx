import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import {
  Activity,
  BatteryCharging,
  Binary,
  CircleDot,
  Cpu,
  Disc3,
  Gauge as GaugeIcon,
  Hash,
  LayoutDashboard,
  ListChecks,
  NotebookPen,
  Plus,
  ScanLine,
  TriangleAlert,
  Trash2,
  Wifi,
  Wrench,
} from 'lucide-react';
import { MESSAGES, type CanMessage } from '../../data/messages';
import { decode } from '../../lib/can';
import { SIG, convert, fmtValue, rangeOf, unitOf } from '../data/signals';
import { DTC_DEFS } from '../data/procedures';
import { ecusFor } from '../data/ecus';
import { STATUS_LABEL, VEHICLES, YOU, vehicleTitle } from '../data/fleet';
import { NODE_BY_ID } from '../../data/nodes';
import { sim, type Rt } from '../sim/engine';
import { usePrefs } from '../sim/hooks';
import { useActions } from '../actions';
import { Badge, hex2, hexId } from '../ui/common';
import { Gauge, Meter, SignalBars, Sparkline, TrendChart } from '../ui/charts';

export type WType =
  | 'gauge'
  | 'value'
  | 'trend'
  | 'tires'
  | 'wheels'
  | 'lamps'
  | 'dtcs'
  | 'ecus'
  | 'bus'
  | 'crank'
  | 'checklist'
  | 'notes'
  | 'fleet'
  | 'frame';

export interface CheckItem {
  t: string;
  done: boolean;
}

export interface Widget {
  id: string;
  type: WType;
  w: 1 | 2 | 3 | 4;
  h: 1 | 2;
  sig?: string;
  sigs?: string[];
  frame?: number;
  items?: CheckItem[];
  text?: string;
}

export const CATALOG: Record<
  WType,
  { name: string; desc: string; icon: typeof Activity; w: Widget['w']; h: Widget['h']; needs?: 'sig' | 'sigs' | 'frame'; minW?: number }
> = {
  gauge: { name: 'Gauge', desc: 'Radial gauge for one live value.', icon: GaugeIcon, w: 1, h: 1, needs: 'sig' },
  value: { name: 'Value + trend', desc: 'Large reading with a 60-second sparkline.', icon: Hash, w: 1, h: 1, needs: 'sig' },
  trend: { name: 'Trend chart', desc: 'Up to three values on one 60-second chart.', icon: Activity, w: 4, h: 1, needs: 'sigs', minW: 2 },
  tires: { name: 'Tire pressures', desc: 'TPMS pressures by transmitter ID, with learned wheel positions.', icon: CircleDot, w: 2, h: 1 },
  wheels: { name: 'Wheel speeds', desc: 'The four wheel-speed sensors, side by side.', icon: Disc3, w: 2, h: 1 },
  lamps: { name: 'Warning lamps', desc: 'What the combination meter is showing the driver.', icon: TriangleAlert, w: 2, h: 1 },
  dtcs: { name: 'Trouble codes', desc: 'Stored codes with a jump to the guided fix.', icon: Wrench, w: 2, h: 1 },
  ecus: { name: 'Module status', desc: 'Health-check result for every module on the V bus.', icon: Cpu, w: 2, h: 2 },
  bus: { name: 'Adapter & bus', desc: 'Wi-Fi link, latency, frame rate, bus load and session.', icon: Wifi, w: 2, h: 1 },
  crank: { name: 'Battery & cranking', desc: 'Battery voltage and the latest crank capture.', icon: BatteryCharging, w: 2, h: 2 },
  checklist: { name: 'Checklist', desc: 'An editable checklist for this job.', icon: ListChecks, w: 2, h: 1 },
  notes: { name: 'Notes', desc: 'Free-form technician notes for this page.', icon: NotebookPen, w: 2, h: 1 },
  fleet: { name: 'Shop overview', desc: 'Every connected vehicle, its status and its link.', icon: LayoutDashboard, w: 4, h: 2, minW: 2 },
  frame: {
    name: 'Raw frame',
    desc: 'One broadcast CAN frame, byte by byte, with decoded signals.',
    icon: Binary,
    w: 2,
    h: 1,
    needs: 'frame',
  },
};

export const DECODABLE: CanMessage[] = MESSAGES.filter((m) => m.basis !== 'diagnostic' && m.signals?.length).sort((a, b) => a.id - b.id);
const MSG = new Map<number, CanMessage>(MESSAGES.map((m) => [m.id, m]));

export function widgetTitle(w: Widget): string {
  switch (w.type) {
    case 'gauge':
    case 'value':
      return SIG[w.sig ?? '']?.label ?? CATALOG[w.type].name;
    case 'trend':
      return (w.sigs ?? []).map((s) => SIG[s]?.short ?? s).join(' · ') || 'Trend';
    case 'frame': {
      const m = MSG.get(w.frame ?? 0);
      return `0x${hexId(w.frame ?? 0)}${m ? ` · ${m.toyota ?? m.dbc}` : ''}`;
    }
    default:
      return CATALOG[w.type].name;
  }
}

/** Measures an element so SVG charts can draw at 1 unit = 1 CSS pixel. */
function useBox<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [box, setBox] = useState({ w: 0, h: 0 });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => {
      const r = e.contentRect;
      setBox((b) =>
        Math.abs(b.w - r.width) > 1 || Math.abs(b.h - r.height) > 1 ? { w: Math.round(r.width), h: Math.round(r.height) } : b,
      );
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, box] as const;
}

const COLORS = ['var(--sig-a)', 'var(--sig-b)', 'var(--sig-c)'];

export function WidgetBody({ w, vid, onChange }: { w: Widget; vid: string; onChange: (patch: Partial<Widget>) => void }) {
  const rt = sim.byId[vid];
  switch (w.type) {
    case 'gauge':
      return <GaugeW rt={rt} sig={w.sig ?? 'rpm'} />;
    case 'value':
      return <ValueW rt={rt} sig={w.sig ?? 'vbat'} />;
    case 'trend':
      return <TrendW rt={rt} sigs={w.sigs?.length ? w.sigs : ['rpm']} />;
    case 'tires':
      return <TiresW rt={rt} />;
    case 'wheels':
      return <WheelsW rt={rt} />;
    case 'lamps':
      return <LampsW rt={rt} />;
    case 'dtcs':
      return <DtcsW rt={rt} />;
    case 'ecus':
      return <EcusW rt={rt} />;
    case 'bus':
      return <BusW rt={rt} />;
    case 'crank':
      return <CrankW rt={rt} />;
    case 'checklist':
      return <ChecklistW items={w.items ?? []} onChange={(items) => onChange({ items })} id={w.id} />;
    case 'notes':
      return <NotesW text={w.text ?? ''} onChange={(text) => onChange({ text })} id={w.id} />;
    case 'fleet':
      return <FleetW />;
    case 'frame':
      return <FrameW rt={rt} id={w.frame ?? 0x1c4} />;
  }
}

function Gated({ rt, children }: { rt: Rt; children?: ReactNode }) {
  return (
    <div className="st-w__gated">
      <span>{rt.mode === 'listen' ? 'Needs a read session (adapter is listen-only)' : 'No data'}</span>
      {children}
    </div>
  );
}

function GaugeW({ rt, sig }: { rt: Rt; sig: string }) {
  const { units } = usePrefs();
  const [ref, box] = useBox<HTMLDivElement>();
  const s = SIG[sig];
  const raw = sim.read(rt, sig);
  const [lo, hi] = rangeOf(s, units);
  const band = s.band
    ? ([convert(s, s.band[0], units), convert(s, s.band[1], units)].sort((a, b) => a - b) as [number, number])
    : undefined;
  const v = convert(s, raw, units);
  const tone = band && Number.isFinite(v) ? (v < band[0] || v > band[1] ? 'warn' : 'ok') : undefined;
  const size = Math.max(140, Math.min(230, box.w - 8, (box.h - 26) * 1.25));
  return (
    <div className="st-w__center" ref={ref}>
      {box.w > 0 && (
        <Gauge
          value={v}
          min={lo}
          max={hi}
          label={sim.gated(rt, sig) ? 'Needs a read session' : s.short}
          unit={unitOf(s, units)}
          text={fmtValue(s, raw, units)}
          band={band}
          size={size}
          tone={tone}
        />
      )}
    </div>
  );
}

function ValueW({ rt, sig }: { rt: Rt; sig: string }) {
  const { units } = usePrefs();
  const s = SIG[sig];
  const raw = sim.read(rt, sig);
  const gated = sim.gated(rt, sig);
  const series = gated ? new Float32Array(0) : sim.series(rt, sig, 600);
  const conv = Float32Array.from(series, (x) => convert(s, x, units));
  const band = s.band ? [convert(s, s.band[0], units), convert(s, s.band[1], units)].sort((a, b) => a - b) : null;
  const v = convert(s, raw, units);
  const off = band && Number.isFinite(v) && (v < band[0] || v > band[1]);
  if (gated) return <Gated rt={rt} />;
  return (
    <div className="st-w__value">
      <p className={`st-w__num${off ? ' is-off' : ''}`}>
        <b className="mono">{fmtValue(s, raw, units)}</b>
        {!s.kind && <span>{unitOf(s, units)}</span>}
      </p>
      {!s.kind && <Sparkline data={conv} height={44} label={`${s.label}, last 60 seconds`} color={off ? 'var(--warn)' : 'var(--accent)'} />}
      <p className="st-w__note">{s.bandNote ?? s.desc}</p>
    </div>
  );
}

function TrendW({ rt, sigs }: { rt: Rt; sigs: string[] }) {
  const { units } = usePrefs();
  const [ref, box] = useBox<HTMLDivElement>();
  const list = sigs.filter((id) => SIG[id]).slice(0, 3);
  const series = list.map((id, i) => {
    const s = SIG[id];
    const d = sim.gated(rt, id) ? new Float32Array(0) : sim.series(rt, id, 600);
    return {
      key: id,
      label: s.short,
      data: Float32Array.from(d, (x) => convert(s, x, units)),
      color: COLORS[i],
      unit: unitOf(s, units),
      dec: s.dec,
    };
  });
  const gated = list.filter((id) => sim.gated(rt, id));
  return (
    <div className="st-w__trend">
      <ul className="st-w__keys">
        {series.map((s) => (
          <li key={s.key}>
            <i style={{ background: s.color }} aria-hidden="true" />
            {s.label} <span className="muted">{s.unit}</span>
          </li>
        ))}
        {gated.length > 0 && <li className="muted">{gated.map((g) => SIG[g].short).join(', ')}: needs a read session</li>}
      </ul>
      <div className="st-w__chart" ref={ref}>
        {box.w > 0 && box.h > 40 && (
          <TrendChart series={series} width={box.w} height={box.h} ariaLabel={`Trend of ${series.map((s) => s.label).join(', ')}`} />
        )}
      </div>
    </div>
  );
}

function TiresW({ rt }: { rt: Rt }) {
  const { units } = usePrefs();
  const learned: Record<number, string> = {};
  for (const [wheel, id] of Object.entries(rt.tpms.tested)) if (id !== null) learned[id] = wheel;
  const dead = Object.entries(rt.tpms.tested).find(([, id]) => id === null)?.[0];
  if (dead) learned[3] = dead;
  return (
    <div className="st-w__tires">
      <div className="st-w__tiregrid">
        {[1, 2, 3, 4].map((i) => {
          const s = SIG[`tp${i}`];
          const raw = sim.read(rt, s.id);
          const low = Number.isFinite(raw) && raw < 205;
          return (
            <div key={i} className={`st-w__tire${!Number.isFinite(raw) ? ' is-none' : low ? ' is-low' : ''}`}>
              <span>
                ID {i}
                {learned[i] && <em> · {learned[i]}</em>}
              </span>
              <b className="mono">{fmtValue(s, raw, units)}</b>
              <small>{Number.isFinite(raw) ? unitOf(s, units) : sim.gated(rt, s.id) ? 'read session' : 'no signal'}</small>
            </div>
          );
        })}
      </div>
      <p className="st-w__note">This TPMS reports by transmitter ID, not wheel position. Placard: 32 psi cold.</p>
    </div>
  );
}

function WheelsW({ rt }: { rt: Rt }) {
  const { units } = usePrefs();
  const ids = ['wsFL', 'wsFR', 'wsRL', 'wsRR'];
  const max = units === 'us' ? 90 : 140;
  return (
    <div className="st-w__wheels">
      {ids.map((id) => {
        const s = SIG[id];
        const raw = sim.read(rt, id);
        const v = convert(s, raw, units);
        return (
          <div key={id} className="st-w__wheel">
            <span>{s.short}</span>
            <div className="st-w__bar" aria-hidden="true">
              <i style={{ height: `${Number.isFinite(v) ? Math.min(100, (v / max) * 100) : 0}%` }} />
            </div>
            <b className="mono">{fmtValue(s, raw, units)}</b>
            <small>{Number.isFinite(raw) ? unitOf(s, units) : 'no data'}</small>
          </div>
        );
      })}
    </div>
  );
}

function LampsW({ rt }: { rt: Rt }) {
  const L = rt.lamps;
  const lamps = [
    { k: 'mil', on: L.mil > 0, label: L.mil === 2 ? 'MIL blinking' : 'Check engine', blink: L.mil === 2 },
    { k: 'abs', on: L.abs, label: 'ABS' },
    { k: 'brake', on: L.brake, label: 'Brake' },
    { k: 'slip', on: L.slip, label: 'Slip' },
    { k: 'eps', on: L.eps, label: 'EPS' },
    { k: 'tpms', on: L.tpms > 0, label: 'Tire pressure' },
  ];
  const on = lamps.filter((l) => l.on).length;
  return (
    <div className="st-w__lamps">
      <ul className="st-lamps">
        {lamps.map((l) => (
          <li key={l.k} className={l.on ? 'is-on' : ''}>
            <i className={`st-lamp st-lamp--${l.k}${l.on ? '' : ' is-off'}${l.blink ? ' is-blink' : ''}`} aria-hidden="true" />
            <span>{l.label}</span>
          </li>
        ))}
      </ul>
      <p className="st-w__note">{on ? `${on} lamp${on === 1 ? '' : 's'} on` : 'All warning lamps off'}</p>
    </div>
  );
}

function DtcsW({ rt }: { rt: Rt }) {
  const { setFocusCode, open } = useActions();
  const groups = new Map<string, { code: string; ecus: string[]; status: string }>();
  for (const d of rt.dtcs) {
    const g = groups.get(d.code);
    if (g) g.ecus.push(d.ecu);
    else groups.set(d.code, { code: d.code, ecus: [d.ecu], status: d.status });
  }
  const list = [...groups.values()];
  if (!list.length) return <div className="st-w__empty">No codes stored</div>;
  return (
    <ul className="st-w__dtcs">
      {list.map((g) => (
        <li key={g.code}>
          <span className="mono st-w__code">{DTC_DEFS[g.code]?.code ?? g.code}</span>
          <div>
            <b>{DTC_DEFS[g.code]?.title ?? 'Trouble code'}</b>
            <span>
              {g.ecus.map((e) => NODE_BY_ID[e]?.short ?? e).join(', ')} · {g.status}
            </span>
          </div>
          <button
            className="st-btn st-btn--sm"
            onClick={() => {
              setFocusCode(g.code);
              open(rt.id, 'codes');
            }}
            data-testid={`w-dtc-${g.code}`}
          >
            Fix
          </button>
        </li>
      ))}
    </ul>
  );
}

function EcusW({ rt }: { rt: Rt }) {
  const { read } = useActions();
  const list = ecusFor(rt.v.preset).filter((e) => e.path === 'direct');
  const st = (n: string) => rt.ecu[n]?.status ?? 'idle';
  const ok = list.filter((e) => st(e.node) === 'ok').length;
  const none = list.filter((e) => st(e.node) === 'none').length;
  const running = rt.scan.state === 'run';
  return (
    <div className="st-w__ecus">
      <div className="st-w__ecuhead">
        <span>
          <b>{ok}</b> responding · <b className={none ? 'is-bad' : ''}>{none}</b> silent
        </span>
        <button
          className="st-btn st-btn--sm"
          disabled={running}
          onClick={() => read(rt.id, 'A health check', () => sim.scan(rt.id))}
          data-testid="w-ecus-scan"
        >
          <ScanLine size={14} aria-hidden="true" /> {running ? 'Checking…' : 'Check'}
        </button>
      </div>
      <ul className="st-w__ecugrid">
        {list.map((e) => (
          <li key={e.node} className={`is-${st(e.node)}`}>
            <i aria-hidden="true" />
            <span>{e.name}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function BusW({ rt }: { rt: Rt }) {
  const L = rt.link;
  return (
    <div className="st-w__bus">
      <div className="st-w__busrow">
        <SignalBars rssi={L.rssi} />
        <div>
          <b>{rt.v.adapter.id}</b>
          <span>
            {rt.v.adapter.ap} · {Math.round(L.rssi)} dBm · {Math.round(L.lat)} ms
          </span>
        </div>
        <Badge tone={rt.mode === 'listen' ? 'info' : 'accent'}>{rt.mode === 'listen' ? 'Listen-only' : 'Read session'}</Badge>
      </div>
      <dl className="st-w__busstats">
        <div>
          <dt>Frames / s</dt>
          <dd className="mono">{Math.round(L.fps).toLocaleString('en-US')}</dd>
        </div>
        <div>
          <dt>Bus load</dt>
          <dd className="mono">{(L.load * 100).toFixed(1)} %</dd>
        </div>
        <div>
          <dt>Control</dt>
          <dd>{rt.holder === YOU ? 'You' : rt.holder}</dd>
        </div>
      </dl>
      <Meter value={L.load * 100} min={0} max={100} band={[0, 60]} />
    </div>
  );
}

function CrankW({ rt }: { rt: Rt }) {
  const [ref, box] = useBox<HTMLDivElement>();
  const c = rt.crank;
  const vb = sim.read(rt, 'vbat');
  const canCrank = rt.v.scenario === 'battery' && rt.engine === 'off' && !rt.test;
  const series = c
    ? [{ key: 'c', label: 'Battery', data: Float32Array.from(c.samples.slice(0, 300)), color: 'var(--sig-a)', unit: 'V', dec: 2 }]
    : [{ key: 'v', label: 'Battery', data: sim.series(rt, 'vbat', 600), color: 'var(--sig-a)', unit: 'V', dec: 2 }];
  return (
    <div className="st-w__trend">
      <div className="st-w__ecuhead">
        <span>
          Battery <b className="mono">{Number.isFinite(vb) ? vb.toFixed(2) : '—'} V</b>
          {c && (
            <>
              {' '}
              · crank min <b className={`mono ${c.min < 9.5 ? 'is-bad' : 'is-ok'}`}>{c.min.toFixed(2)} V</b>
            </>
          )}
        </span>
        {canCrank && (
          <button className="st-btn st-btn--sm st-btn--primary" onClick={() => sim.startTest(rt.id, 'crank')} data-testid="w-crank">
            Crank & start
          </button>
        )}
      </div>
      <div className="st-w__chart" ref={ref}>
        {box.w > 0 && box.h > 40 && (
          <TrendChart
            series={series}
            width={box.w}
            height={box.h}
            min={c ? 7 : 11}
            max={15}
            band={c ? [9.5, 15] : [11, 14]}
            seconds={c ? 6 : 60}
            ariaLabel="Battery voltage"
          />
        )}
      </div>
      <p className="st-w__note">
        {c
          ? 'Shaded: above 9.5 V during cranking.'
          : 'Shaded: 11–14 V standard battery voltage (Toyota C1241 procedure). Measured by the adapter on DLC3 pin 16.'}
      </p>
    </div>
  );
}

function ChecklistW({ items, onChange, id }: { items: CheckItem[]; onChange: (items: CheckItem[]) => void; id: string }) {
  const [t, setT] = useState('');
  const done = items.filter((i) => i.done).length;
  const add = () => {
    if (!t.trim()) return;
    onChange([...items, { t: t.trim().slice(0, 120), done: false }]);
    setT('');
  };
  return (
    <div className="st-w__check">
      <p className="st-w__note">
        {done} of {items.length} done
      </p>
      <ul>
        {items.map((it, i) => (
          <li key={`${i}-${it.t}`} className={it.done ? 'is-done' : ''}>
            <label className="st-check">
              <input
                type="checkbox"
                checked={it.done}
                onChange={() => onChange(items.map((x, j) => (j === i ? { ...x, done: !x.done } : x)))}
                data-testid={`w-check-${id}-${i}`}
              />
              <span className="st-check__box" aria-hidden="true" />
              <span>{it.t}</span>
            </label>
            <button
              className="st-icon st-icon--sm"
              aria-label={`Remove “${it.t}”`}
              onClick={() => onChange(items.filter((_, j) => j !== i))}
              data-testid={`w-check-del-${id}-${i}`}
            >
              <Trash2 size={14} />
            </button>
          </li>
        ))}
      </ul>
      <form
        className="st-w__add"
        onSubmit={(e) => {
          e.preventDefault();
          add();
        }}
      >
        <input
          value={t}
          onChange={(e) => setT(e.target.value)}
          placeholder="Add a step"
          aria-label="New checklist step"
          data-testid={`w-check-input-${id}`}
        />
        <button className="st-icon" type="submit" aria-label="Add step" data-testid={`w-check-add-${id}`}>
          <Plus size={16} />
        </button>
      </form>
    </div>
  );
}

function NotesW({ text, onChange, id }: { text: string; onChange: (t: string) => void; id: string }) {
  return (
    <textarea
      className="st-w__notes"
      value={text}
      onChange={(e) => onChange(e.target.value.slice(0, 4000))}
      placeholder="Notes for this job — kept for this session only."
      aria-label="Technician notes"
      data-testid={`w-notes-${id}`}
    />
  );
}

function FleetW() {
  const { open } = useActions();
  return (
    <div className="st-w__fleet">
      <table className="st-table">
        <thead>
          <tr>
            <th scope="col">Bay</th>
            <th scope="col">Vehicle</th>
            <th scope="col">Status</th>
            <th scope="col" className="num">
              Codes
            </th>
            <th scope="col">Link</th>
          </tr>
        </thead>
        <tbody>
          {VEHICLES.map((v) => {
            const rt = sim.byId[v.id];
            const codes = new Set(rt.dtcs.filter((d) => d.status !== 'history').map((d) => d.code)).size;
            return (
              <tr key={v.id}>
                <td>
                  <button className="st-linkbtn" onClick={() => open(v.id, 'health')} data-testid={`w-fleet-${v.id}`}>
                    <i className="st-swatch" style={{ background: v.swatch }} aria-hidden="true" />
                    {v.slot}
                  </button>
                </td>
                <td>
                  {vehicleTitle(v)} <span className="muted">· {v.customer}</span>
                </td>
                <td>{STATUS_LABEL[v.status]}</td>
                <td className="num mono">{codes ? <b className="is-bad">{codes}</b> : 0}</td>
                <td>
                  <SignalBars rssi={rt.link.rssi} /> <span className="muted mono">{Math.round(rt.link.lat)} ms</span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function FrameW({ rt, id }: { rt: Rt; id: number }) {
  const m = MSG.get(id);
  if (!m) return <div className="st-w__empty">Unknown frame</div>;
  const present = rt.msgs.some((x) => x.id === id);
  if (!present) return <div className="st-w__empty">0x{hexId(id)} is not on this vehicle’s bus right now.</div>;
  const data = sim.payload(rt, m);
  return (
    <div className="st-w__frame">
      <div className="st-bytes">
        {data.map((b, i) => (
          <span key={i}>
            <small>{i}</small>
            {hex2(b)}
          </span>
        ))}
      </div>
      <ul className="st-w__sigs">
        {(m.signals ?? [])
          .filter((s) => s.name !== 'CHECKSUM')
          .slice(0, 5)
          .map((s) => {
            const v = decode(data, s);
            return (
              <li key={s.name}>
                <span className="mono">{s.name}</span>
                <b className="mono">
                  {s.values?.[Math.round(v)] ?? `${Number.isInteger(s.factor) ? v.toFixed(0) : v.toFixed(2)}${s.unit ? ` ${s.unit}` : ''}`}
                </b>
              </li>
            );
          })}
      </ul>
    </div>
  );
}
