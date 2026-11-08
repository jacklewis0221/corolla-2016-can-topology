import { useEffect, useMemo, useState } from 'react';
import { ExternalLink, Pause, Play, Search } from 'lucide-react';
import { MESSAGES, type CanMessage } from '../../data/messages';
import { NODE_BY_ID } from '../../data/nodes';
import { decode, signalBits } from '../../lib/can';
import { sim, periodOf, type Frame, type IdStat } from '../sim/engine';
import { useSim } from '../sim/hooks';
import { Badge, Panel, Seg, hex2, hexId } from '../ui/common';

const MSG = new Map<number, CanMessage>(MESSAGES.map((m) => [m.id, m]));
const name = (id: number) => {
  if (id === 0x7e0) return 'OBD-II request → ECM';
  if (id === 0x7e8) return 'ECM response';
  const m = MSG.get(id);
  return m?.toyota ?? m?.dbc ?? 'undocumented';
};
const sender = (id: number) => {
  if (id === 0x7e0) return 'This console';
  const m = MSG.get(id);
  if (id === 0x7e8) return 'ECM';
  return m?.sender ? (NODE_BY_ID[m.sender]?.short ?? m.sender) : '—';
};

export function Bus({ vid }: { vid: string }) {
  const [paused, setPaused] = useState(false);
  useSim(paused ? 0.2 : 4);
  const [mode, setMode] = useState<'id' | 'trace'>('id');
  const [q, setQ] = useState('');
  const [sel, setSel] = useState<number>(0x1c4);
  const [snap, setSnap] = useState<{ stats: IdStat[]; trace: Frame[] } | null>(null);
  useEffect(() => {
    sim.setMonitor(vid);
    return () => sim.setMonitor(null);
  }, [vid]);
  const rt = sim.byId[vid];
  const live = { stats: [...sim.idStats.values()], trace: sim.trace };
  const view = paused && snap ? snap : live;
  const togglePause = () => {
    if (!paused) setSnap({ stats: live.stats.map((s) => ({ ...s, data: [...s.data] })), trace: live.trace.slice(-80) });
    setPaused((p) => !p);
  };
  const filt = q.trim().toLowerCase();
  const match = (id: number) =>
    !filt ||
    hexId(id).toLowerCase().includes(filt.replace(/^0x/, '')) ||
    name(id).toLowerCase().includes(filt) ||
    sender(id).toLowerCase().includes(filt);
  const stats = view.stats.filter((s) => match(s.id)).sort((a, b) => a.id - b.id);
  const trace = view.trace
    .filter((f) => match(f.id))
    .slice(-60)
    .reverse();
  const nowMs = Math.round(sim.t * 1000);

  // Frames this vehicle should carry but that never arrived (e.g. a module off the bus).
  const expected = useMemo(() => MESSAGES.filter((m) => m.basis !== 'diagnostic' && m.sender === 'skid'), []);
  const missing = rt.v.scenario === 'canSkid' && !rt.fixed.has('branch') ? expected : [];
  const selStat = view.stats.find((s) => s.id === sel);
  const selMsg = MSG.get(sel);

  return (
    <div className="st-bus">
      <header className="st-viewhead">
        <div>
          <h2>Bus monitor</h2>
          <p className="st-lede">
            Raw CAN frames from {rt.v.slot}, received through {rt.v.adapter.id}. The table refreshes a few times a second; the bus itself
            runs at 500 kbit/s.
          </p>
        </div>
        <div className="st-viewhead__actions">
          <Seg
            value={mode}
            onChange={setMode}
            label="Monitor view"
            testId="bus-mode"
            options={[
              { value: 'id', label: 'By ID' },
              { value: 'trace', label: 'Trace' },
            ]}
          />
          <button className="st-btn" onClick={togglePause} data-testid="bus-pause">
            {paused ? <Play size={16} aria-hidden="true" /> : <Pause size={16} aria-hidden="true" />}
            {paused ? 'Resume' : 'Pause'}
          </button>
        </div>
      </header>
      <div className="st-busstats">
        <div>
          <span>Frames / s</span>
          <b className="mono">{Math.round(rt.link.fps).toLocaleString('en-US')}</b>
        </div>
        <div>
          <span>Bus load</span>
          <b className="mono">{(rt.link.load * 100).toFixed(1)} %</b>
        </div>
        <div>
          <span>IDs seen</span>
          <b className="mono">{live.stats.length}</b>
        </div>
        <div>
          <span>Error frames</span>
          <b className="mono">0</b>
        </div>
        <div className={missing.length ? 'is-bad' : ''}>
          <span>Missing IDs</span>
          <b className="mono">{missing.length}</b>
        </div>
      </div>
      {missing.length > 0 && (
        <div className="st-callout st-callout--danger">
          <span>
            <b>No frames from the skid control ECU</b> — {missing.map((m) => `0x${hexId(m.id)}`).join(', ')} never arrive. Wheel speeds,
            vehicle speed and brake lamp requests are gone from the bus, which is why the meter and EPS fall back to their fail-safe
            behavior.
          </span>
        </div>
      )}
      <div className="st-bus__grid">
        <Panel
          title={mode === 'id' ? 'Frames by ID' : 'Frame trace'}
          sub={mode === 'id' ? 'One row per identifier; bytes flash when they change.' : 'Newest first; console requests are marked TX.'}
          id="frames-title"
          actions={
            <label className="st-filter st-filter--inline">
              <Search size={15} aria-hidden="true" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Filter ID, name, sender"
                aria-label="Filter frames"
                data-testid="bus-filter"
              />
            </label>
          }
        >
          <div className="st-tablewrap st-tablewrap--tall">
            {mode === 'id' ? (
              <table className="st-table st-table--frames" data-testid="bus-table">
                <thead>
                  <tr>
                    <th scope="col">ID</th>
                    <th scope="col">Name · sender</th>
                    <th scope="col">Data</th>
                    <th scope="col" className="num">
                      Count
                    </th>
                    <th scope="col" className="num">
                      Period
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {stats.map((s) => (
                    <tr key={s.id} className={`${sel === s.id ? 'is-sel' : ''}${s.id >= 0x7e0 ? ' is-diag' : ''}`}>
                      <td>
                        <button className="st-linkbtn mono" onClick={() => setSel(s.id)} data-testid={`frame-${hexId(s.id)}`}>
                          0x{hexId(s.id)}
                        </button>
                      </td>
                      <td className="st-table__name">
                        <span className="mono">{name(s.id)}</span>
                        <span className="st-table__sub">{sender(s.id)}</span>
                      </td>
                      <td className="mono st-hex">
                        {s.data.map((b, i) => (
                          <span key={i} className={!paused && nowMs - (s.changedAt[i] ?? 0) < 450 ? 'is-chg' : ''}>
                            {hex2(b)}
                          </span>
                        ))}
                      </td>
                      <td className="num mono">{s.count.toLocaleString('en-US')}</td>
                      <td className="num mono">{s.id >= 0x7e0 ? 'poll' : `${s.period} ms`}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <table className="st-table st-table--frames" data-testid="bus-trace">
                <thead>
                  <tr>
                    <th scope="col">Time</th>
                    <th scope="col">Dir</th>
                    <th scope="col">ID</th>
                    <th scope="col">Name</th>
                    <th scope="col">Data</th>
                  </tr>
                </thead>
                <tbody>
                  {trace.map((f, i) => (
                    <tr key={`${f.t}-${f.id}-${i}`} className={f.tx ? 'is-tx' : f.id >= 0x7e0 ? 'is-diag' : ''}>
                      <td className="mono">{(f.t / 1000).toFixed(3)}</td>
                      <td>
                        <Badge tone={f.tx ? 'accent' : 'neutral'}>{f.tx ? 'TX' : 'RX'}</Badge>
                      </td>
                      <td>
                        <button className="st-linkbtn mono" onClick={() => setSel(f.id)}>
                          0x{hexId(f.id)}
                        </button>
                      </td>
                      <td className="mono st-table__name">{name(f.id)}</td>
                      <td className="mono st-hex">
                        {f.data.map((b, j) => (
                          <span key={j}>{hex2(b)}</span>
                        ))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </Panel>
        <Panel
          title={`0x${hexId(sel)} · ${name(sel)}`}
          sub={selMsg?.summary ?? (sel >= 0x7e0 ? 'OBD-II traffic generated by this console’s read session.' : '')}
          id="decode-title"
        >
          {selStat ? (
            <Decode id={sel} data={selStat.data} msg={selMsg} />
          ) : (
            <p className="st-foot">This ID has not been seen on {rt.v.slot}.</p>
          )}
          {selMsg && (
            <p className="st-foot">
              Sender: {sender(sel)} · simulated period {periodOf(selMsg)} ms ·{' '}
              <a href={`./index.html?lab=0x${hexId(sel)}`} data-testid="open-atlas-lab">
                Open it in the CAN atlas <ExternalLink size={12} aria-hidden="true" />
              </a>
            </p>
          )}
        </Panel>
      </div>
    </div>
  );
}

const SIG_COLORS = ['var(--sig-a)', 'var(--sig-b)', 'var(--sig-c)', 'var(--sig-d)', 'var(--sig-e)', 'var(--sig-f)'];

function Decode({ id, data, msg }: { id: number; data: number[]; msg?: CanMessage }) {
  if (id === 0x7e0 || id === 0x7e8) {
    const pid = data[2];
    return (
      <div className="st-decode">
        <p className="st-prose">
          {id === 0x7e0 ? (
            <>
              Single-frame request: <b className="mono">{hex2(data[0])}</b> data bytes, service <b className="mono">01</b> (current data),
              PID <b className="mono">{hex2(pid)}</b>.
            </>
          ) : (
            <>
              Response: <b className="mono">{hex2(data[0])}</b> bytes follow, <b className="mono">41</b> = service 01 + 0x40 (positive
              answer), PID <b className="mono">{hex2(pid)}</b>, then the value bytes.
            </>
          )}
        </p>
        <Bytes data={data} />
      </div>
    );
  }
  const sigs = msg?.signals ?? [];
  const owner = new Map<number, number>();
  sigs.forEach((s, i) => signalBits(s).forEach((b) => owner.set(b, i)));
  return (
    <div className="st-decode">
      {sigs.length ? (
        <>
          <div className="st-bitgrid" role="img" aria-label="Bit layout of this frame">
            {data.map((byte, r) => (
              <div key={r} className="st-bitgrid__row">
                <span className="st-bitgrid__byte mono">B{r}</span>
                {Array.from({ length: 8 }, (_, k) => {
                  const bit = 7 - k;
                  const pos = r * 8 + bit;
                  const o = owner.get(pos);
                  return (
                    <span
                      key={k}
                      className="st-bitgrid__bit mono"
                      style={o !== undefined ? { background: SIG_COLORS[o % SIG_COLORS.length], color: 'var(--sig-ink)' } : undefined}
                    >
                      {(byte >> bit) & 1}
                    </span>
                  );
                })}
                <span className="st-bitgrid__hex mono">{hex2(byte)}</span>
              </div>
            ))}
          </div>
          <ul className="st-siglegend">
            {sigs.map((s, i) => (
              <li key={s.name}>
                <i style={{ background: SIG_COLORS[i % SIG_COLORS.length] }} aria-hidden="true" />
                <span className="mono">{s.name}</span>
                <b className="mono">
                  {(() => {
                    const v = decode(data, s);
                    const t = s.values?.[Math.round(v)];
                    return t ?? `${Number.isInteger(s.factor) ? v.toFixed(0) : v.toFixed(2)}${s.unit ? ` ${s.unit}` : ''}`;
                  })()}
                </b>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <>
          <Bytes data={data} />
          <p className="st-foot">
            The layout of this frame is not public, so the console shows raw bytes only. Values here are placeholders.
          </p>
        </>
      )}
    </div>
  );
}

function Bytes({ data }: { data: number[] }) {
  return (
    <div className="st-bytes">
      {data.map((b, i) => (
        <span key={i}>
          <small>{i}</small>
          {hex2(b)}
        </span>
      ))}
    </div>
  );
}
