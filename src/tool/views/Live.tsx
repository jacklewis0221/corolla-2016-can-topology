import { useMemo, useRef, useState, type ReactNode } from 'react';
import { Camera, Download, Lock, Pause, Play, Search } from 'lucide-react';
import { GROUPS, SIG, SIGNALS, convert, decOf, fmtValue, needsRequest, pidBytes, srcLabel, unitOf, type SigDef } from '../data/signals';
import { MESSAGES } from '../../data/messages';
import { NODE_BY_ID } from '../../data/nodes';
import { encode, signalBits } from '../../lib/can';
import { sim } from '../sim/engine';
import { usePrefs, useSim } from '../sim/hooks';
import { useActions } from '../actions';
import { Badge, Panel, hex2, hexId, clock } from '../ui/common';
import { Sparkline, TrendChart } from '../ui/charts';
import { ActiveTests } from '../ui/Tests';

const DEFAULTS: Record<string, string[]> = {
  misfire: ['rpm', 'load', 'mf1', 'mfm'],
  lean: ['stft', 'ltft', 'rpm', 'maf'],
  canSkid: ['vss', 'rpm', 'steer', 'yaw'],
  battery: ['vbat', 'rpm', 'ect'],
  maint: ['vbat', 'ect', 'fuel'],
  tpms: ['tp1', 'tp2', 'tp3', 'tp4'],
  acLow: ['acp', 'vent', 'evap', 'comp'],
  ready: ['vbat', 'ect'],
};
const COLORS = ['var(--sig-a)', 'var(--sig-b)', 'var(--sig-c)', 'var(--sig-d)'];

export function Live({ vid }: { vid: string }) {
  useSim(5);
  const { units } = usePrefs();
  const { read } = useActions();
  const rt = sim.byId[vid];
  const [sel, setSel] = useState<string[]>(() => DEFAULTS[rt.v.scenario] ?? ['rpm']);
  const [focus, setFocus] = useState<string>(sel[0]);
  const [q, setQ] = useState('');
  const [paused, setPaused] = useState(false);
  const frozen = useRef<Record<string, Float32Array> | null>(null);
  const [snaps, setSnaps] = useState<{ at: number; vals: Record<string, number> }[]>([]);

  const ser = (id: string) => (paused && frozen.current?.[id] ? frozen.current[id] : sim.series(rt, id));
  const val = (id: string) => {
    if (paused && frozen.current?.[id]) {
      const a = frozen.current[id];
      return a[a.length - 1];
    }
    return sim.read(rt, id);
  };
  const togglePause = () => {
    if (!paused) frozen.current = Object.fromEntries(SIGNALS.map((s) => [s.id, sim.series(rt, s.id)]));
    setPaused((p) => !p);
  };
  const toggle = (id: string) => {
    setFocus(id);
    setSel((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id].slice(-4)));
  };
  const list = useMemo(() => {
    const t = q.trim().toLowerCase();
    return SIGNALS.filter((s) => !t || `${s.label} ${s.short} ${s.group}`.toLowerCase().includes(t));
  }, [q]);

  const exportCsv = () => {
    const ids = sel;
    const cols = ids.map((id) => sim.series(rt, id));
    const n = Math.min(...cols.map((c) => c.length));
    const head = ['seconds', ...ids.map((id) => `${SIG[id].label} (${unitOf(SIG[id], units)})`)];
    const rows = [head.join(',')];
    for (let i = 0; i < n; i++) {
      rows.push(
        [
          ((i - n + 1) / 10).toFixed(1),
          ...cols.map((c, j) => (Number.isFinite(c[c.length - n + i]) ? convert(SIG[ids[j]], c[c.length - n + i], units).toFixed(3) : '')),
        ].join(','),
      );
    }
    const blob = new Blob([rows.join('\n')], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${rt.v.slot.replace(/\s+/g, '-').toLowerCase()}-live-data.csv`;
    a.click();
    window.setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };

  const gatedCount = SIGNALS.filter((s) => needsRequest(s)).length;

  return (
    <div className="st-live">
      <header className="st-viewhead">
        <div>
          <h2>Live data</h2>
          <p className="st-lede">
            Broadcast values are decoded straight off the bus. OBD-II and Toyota data-list items are requested by the adapter, so they need
            a read session.
          </p>
        </div>
        <div className="st-viewhead__actions">
          <button className="st-btn" onClick={togglePause} data-testid="live-pause">
            {paused ? <Play size={16} aria-hidden="true" /> : <Pause size={16} aria-hidden="true" />}
            {paused ? 'Resume' : 'Freeze'}
          </button>
          <button
            className="st-btn"
            onClick={() =>
              setSnaps((s) => [{ at: Date.now(), vals: Object.fromEntries(sel.map((id) => [id, val(id)])) }, ...s].slice(0, 6))
            }
            data-testid="live-snapshot"
          >
            <Camera size={16} aria-hidden="true" /> Snapshot
          </button>
          <button className="st-btn" onClick={exportCsv} data-testid="live-export">
            <Download size={16} aria-hidden="true" /> Export CSV
          </button>
        </div>
      </header>
      {rt.mode === 'listen' && (
        <div className="st-callout st-callout--info">
          <Lock size={16} aria-hidden="true" />
          <span>
            <b>Listen-only.</b> The adapter is not transmitting, so {gatedCount} requested items are hidden. Broadcast frames still decode.
          </span>
          <button
            className="st-btn st-btn--sm"
            onClick={() => read(vid, 'Requested live data', () => undefined)}
            data-testid="live-open-read"
          >
            Open read session
          </button>
        </div>
      )}
      <div className="st-live__grid">
        <Panel className="st-siglist" title="Data list" sub={`${SIGNALS.length} items · pick up to 4 to chart`} id="sig-title">
          <label className="st-filter">
            <Search size={15} aria-hidden="true" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Filter items"
              aria-label="Filter data items"
              data-testid="live-filter"
            />
          </label>
          <div className="st-siglist__scroll">
            {GROUPS.map((g) => {
              const items = list.filter((s) => s.group === g);
              if (!items.length) return null;
              return (
                <div key={g} className="st-siggroup">
                  <p className="st-siggroup__name">{g}</p>
                  {items.map((s) => {
                    const v = val(s.id);
                    const gated = sim.gated(rt, s.id);
                    const on = sel.includes(s.id);
                    return (
                      <div key={s.id} className={`st-sigrow${on ? ' is-on' : ''}${focus === s.id ? ' is-focus' : ''}`}>
                        <label className="st-check">
                          <input type="checkbox" checked={on} onChange={() => toggle(s.id)} data-testid={`sig-${s.id}`} />
                          <span
                            className="st-check__box"
                            aria-hidden="true"
                            style={on ? { background: COLORS[sel.indexOf(s.id)] } : undefined}
                          />
                          <span className="st-sr">Chart {s.label}</span>
                        </label>
                        <button className="st-sigrow__name" onClick={() => setFocus(s.id)} data-testid={`sigfocus-${s.id}`}>
                          {s.label}
                          <small>{srcLabel(s.src)}</small>
                        </button>
                        <span className="st-sigrow__val mono">
                          {gated ? <Lock size={13} aria-label="Needs a read session" /> : fmtValue(s, v, units)}
                          {!gated && !s.kind && <small>{unitOf(s, units)}</small>}
                        </span>
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </Panel>
        <div className="st-live__main">
          <div className="st-charts">
            {sel.map((id, i) => {
              const s = SIG[id];
              const data = ser(id);
              const conv = Float32Array.from(data, (x) => (Number.isFinite(x) && !sim.gated(rt, id) ? convert(s, x, units) : NaN));
              const band = s.band ? ([convert(s, s.band[0], units), convert(s, s.band[1], units)] as [number, number]) : undefined;
              const lo = convert(s, s.min, units);
              const hi = convert(s, s.max, units);
              const v = val(id);
              return (
                <div key={id} className="st-chartcard">
                  <div className="st-chartcard__head">
                    <i style={{ background: COLORS[i] }} aria-hidden="true" />
                    <button onClick={() => setFocus(id)} data-testid={`chart-${id}`}>
                      {s.label}
                    </button>
                    <b className="mono">
                      {sim.gated(rt, id) ? '—' : fmtValue(s, v, units)} <small>{s.kind ? '' : unitOf(s, units)}</small>
                    </b>
                  </div>
                  <TrendChart
                    series={[{ key: id, label: s.short, data: conv, color: COLORS[i], unit: unitOf(s, units), dec: decOf(s, units) }]}
                    height={150}
                    min={s.kind ? lo : undefined}
                    max={s.kind ? hi : undefined}
                    band={band}
                    ariaLabel={`${s.label} over the last 60 seconds`}
                    paused={paused}
                  />
                  {s.bandNote && <p className="st-chartcard__note">{s.bandNote}</p>}
                </div>
              );
            })}
            {!sel.length && <p className="st-foot">Tick items in the data list to chart them.</p>}
          </div>
          <div className="st-live__lower">
            <HowRead sig={SIG[focus] ?? SIG.rpm} vid={vid} />
            <Panel title="Tests for this concern" sub="Bay procedures and console active tests" id="tests-title">
              <ActiveTests vid={vid} />
            </Panel>
          </div>
          {snaps.length > 0 && (
            <Panel title="Snapshots" sub="Frozen values you captured — like a manual freeze frame" id="snap-title">
              <div className="st-tablewrap">
                <table className="st-table">
                  <thead>
                    <tr>
                      <th scope="col">Time</th>
                      {Object.keys(snaps[0].vals).map((id) => (
                        <th key={id} scope="col">
                          {SIG[id].short}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {snaps.map((s) => (
                      <tr key={s.at}>
                        <td className="mono">{clock(s.at)}</td>
                        {Object.entries(s.vals).map(([id, v]) => (
                          <td key={id} className="mono">
                            {fmtValue(SIG[id], v, units)} {SIG[id].kind ? '' : unitOf(SIG[id], units)}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Panel>
          )}
        </div>
      </div>
    </div>
  );
}

function HowRead({ sig, vid }: { sig: SigDef; vid: string }) {
  const { units } = usePrefs();
  const rt = sim.byId[vid];
  const v = sim.read(rt, sig.id);
  const raw = rt.val[SIGNALS.indexOf(sig)];
  const src = sig.src;
  const node = NODE_BY_ID[sig.ecu];
  let body: ReactNode = null;
  if (src.k === 'can') {
    const m = MESSAGES.find((x) => x.id === src.id)!;
    const s = m.signals!.find((x) => x.name === src.sig)!;
    const data = encode(m.dlc, [s], { [s.name]: Number.isFinite(raw) ? raw : 0 });
    const bits = new Set(signalBits(s).map((b) => Math.floor(b / 8)));
    const rawInt = Math.round(((Number.isFinite(raw) ? raw : 0) - s.offset) / s.factor);
    body = (
      <>
        <p>
          The {node?.short ?? sig.ecu} broadcasts frame <b className="mono">0x{hexId(m.id)}</b>
          {m.toyota && (
            <>
              {' '}
              (<span className="mono">{m.toyota}</span>)
            </>
          )}{' '}
          on the V bus. Any listener can decode it — no request needed.
        </p>
        <div className="st-bytes" aria-label="Frame bytes with this signal highlighted">
          {data.map((b, i) => (
            <span key={i} className={bits.has(i) ? 'is-sig' : ''}>
              <small>{i}</small>
              {hex2(b)}
            </span>
          ))}
        </div>
        <dl className="st-kvs">
          <div>
            <dt>Signal</dt>
            <dd className="mono">{s.name}</dd>
          </div>
          <div>
            <dt>Start bit · length</dt>
            <dd className="mono">
              {s.start} · {s.len} bits{s.signed ? ' signed' : ''}
            </dd>
          </div>
          <div>
            <dt>Scaling</dt>
            <dd className="mono">
              raw × {s.factor} {s.offset ? `${s.offset > 0 ? '+' : '−'} ${Math.abs(s.offset)}` : ''}
            </dd>
          </div>
          <div>
            <dt>Right now</dt>
            <dd className="mono">
              {rawInt} × {s.factor}
              {s.offset ? ` ${s.offset > 0 ? '+' : '−'} ${Math.abs(s.offset)}` : ''} ={' '}
              {Number.isFinite(raw) ? (rawInt * s.factor + s.offset).toFixed(2) : 'no frames'} {s.unit ?? ''}
            </dd>
          </div>
        </dl>
        {sig.alt?.k === 'pid' && (
          <p className="st-foot">Also available as OBD-II PID {hex2(sig.alt.pid)}, but the broadcast is free and faster.</p>
        )}
      </>
    );
  } else if (src.k === 'pid') {
    const b = pidBytes(src.pid, Number.isFinite(raw) ? raw : 0);
    const req = [0x02, 0x01, src.pid, 0, 0, 0, 0, 0];
    const res = [2 + b.length, 0x41, src.pid, ...b];
    while (res.length < 8) res.push(0);
    body = (
      <>
        <p>
          The console asks the ECM with an OBD-II service 01 request. Physical address <span className="mono">0x7E0</span> (or functional{' '}
          <span className="mono">0x7DF</span>); the ECM answers on <span className="mono">0x7E8</span>.
        </p>
        <div className="st-xchg">
          <div>
            <span className="st-xchg__dir is-tx">Request · 0x7E0</span>
            <div className="st-bytes">
              {req.map((x, i) => (
                <span key={i} className={i === 2 ? 'is-sig' : ''}>
                  <small>{i}</small>
                  {hex2(x)}
                </span>
              ))}
            </div>
          </div>
          <div>
            <span className="st-xchg__dir is-rx">Response · 0x7E8</span>
            <div className="st-bytes">
              {res.map((x, i) => (
                <span key={i} className={i >= 3 && i < 3 + b.length ? 'is-sig' : ''}>
                  <small>{i}</small>
                  {hex2(x)}
                </span>
              ))}
            </div>
          </div>
        </div>
        <dl className="st-kvs">
          <div>
            <dt>Bytes</dt>
            <dd className="mono">length · 0x41 (service 01 + 0x40) · PID · data</dd>
          </div>
          <div>
            <dt>Formula</dt>
            <dd className="mono">{src.formula}</dd>
          </div>
          <div>
            <dt>Right now</dt>
            <dd className="mono">
              A = {b[0]}
              {b.length > 1 && src.bytes === 2 ? `, B = ${b[1]}` : ''} → {fmtValue(sig, v, units)} {sig.kind ? '' : unitOf(sig, units)}
            </dd>
          </div>
        </dl>
      </>
    );
  } else if (src.k === 'enh') {
    body = (
      <>
        <p>
          A Toyota data-list item: the console sends a manufacturer-specific request to the {node?.short ?? sig.ecu} and decodes the answer
          with Toyota’s definition, which is not public.
        </p>
        <dl className="st-kvs">
          <div>
            <dt>Menu path</dt>
            <dd>{src.path}</dd>
          </div>
          <div>
            <dt>Name source</dt>
            <dd>{src.basis === 'rm' ? 'Item name as printed in the repair manual' : 'Illustrative item for this concept'}</dd>
          </div>
        </dl>
      </>
    );
  } else {
    body = (
      <>
        <p>{src.what}. The car is not asked for anything, so this works in every mode.</p>
      </>
    );
  }
  return (
    <Panel
      title={
        <>
          How it’s read · <span className="st-accent">{sig.label}</span>
        </>
      }
      sub={sig.desc}
      id="how-title"
      actions={
        <Badge tone={src.k === 'can' ? 'ok' : src.k === 'pid' ? 'info' : src.k === 'vci' ? 'neutral' : 'accent'}>{srcLabel(src)}</Badge>
      }
    >
      <div className="st-how">
        {body}
        <div className="st-how__spark">
          <Sparkline data={sim.series(rt, sig.id, 300)} color="var(--accent)" height={40} label={`${sig.label} last 30 seconds`} />
        </div>
      </div>
    </Panel>
  );
}
