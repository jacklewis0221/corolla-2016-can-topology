import { ScanLine, Wrench } from 'lucide-react';
import { ADDR_NOTE, ecusFor, hex3 } from '../data/ecus';
import { NODE_BY_ID } from '../../data/nodes';
import { sim } from '../sim/engine';
import { useSim } from '../sim/hooks';
import { useActions } from '../actions';
import { Badge, Panel } from '../ui/common';
import { BusDiagram } from '../ui/BusDiagram';

const STATUS = {
  idle: { t: 'Not checked', tone: 'neutral' },
  querying: { t: 'Querying…', tone: 'accent' },
  ok: { t: 'Responding', tone: 'ok' },
  none: { t: 'No response', tone: 'danger' },
  skipped: { t: 'Skipped · listen-only', tone: 'neutral' },
} as const;

export function Health({ vid }: { vid: string }) {
  useSim(5);
  const { read, go, setFocusCode } = useActions();
  const rt = sim.byId[vid];
  const list = ecusFor(rt.v.preset);
  const direct = list.filter((e) => e.path === 'direct');
  const answered = direct.filter((e) => rt.ecu[e.node]?.status === 'ok').length;
  const silent = direct.filter((e) => rt.ecu[e.node]?.status === 'none');
  const active = rt.dtcs.filter((d) => d.status !== 'history');
  const scanning = rt.scan.state === 'run';
  const done = rt.scan.state === 'done';
  const L = rt.lamps;
  const lamps: { k: string; on: boolean; label: string; state: string; why?: string }[] = [
    {
      k: 'mil',
      on: L.mil > 0,
      label: 'Check engine (MIL)',
      state: L.mil === 2 ? 'Blinking' : L.mil ? 'On' : 'Off',
      why: L.mil === 2 ? 'Blinks for a misfire that could damage the catalyst.' : undefined,
    },
    {
      k: 'abs',
      on: L.abs,
      label: 'ABS',
      state: L.abs ? 'On' : 'Off',
      why:
        L.abs && rt.v.scenario === 'canSkid'
          ? 'Meter has lost skid control data (fail-safe chart).'
          : L.abs
            ? 'Low supply voltage prohibits ABS (C1241).'
            : undefined,
    },
    { k: 'brake', on: L.brake, label: 'Brake system', state: L.brake ? 'On' : 'Off' },
    {
      k: 'slip',
      on: L.slip,
      label: 'Slip indicator',
      state: L.slip ? 'On' : 'Off',
      why: L.slip && rt.v.scenario === 'canSkid' ? 'Meter treats the slip indicator as active without skid data.' : undefined,
    },
    {
      k: 'eps',
      on: L.eps,
      label: 'EPS',
      state: L.eps ? 'On' : 'Off',
      why: L.eps ? 'EPS fixes assist at its 70 km/h (43 mph) level without speed data — heavy at parking speeds.' : undefined,
    },
    {
      k: 'tpms',
      on: L.tpms > 0,
      label: 'Tire pressure',
      state: L.tpms === 2 ? 'Blinked 1 min, then on' : L.tpms ? 'On' : 'Off',
      why: L.tpms === 2 ? 'Owner’s manual: blinking for 1 minute then staying on means a system malfunction.' : undefined,
    },
  ];
  return (
    <div className="st-health">
      <header className="st-viewhead">
        <div>
          <h2>Health check</h2>
          <p className="st-lede">Asks every module on the V bus for its status and trouble codes, like a CAN bus check.</p>
        </div>
        <div className="st-viewhead__actions">
          <div className="st-scanstat" aria-live="polite">
            {scanning ? (
              <span>
                Checking module {Math.min(rt.scan.i + 1, rt.scan.order.length)} of {rt.scan.order.length}…
              </span>
            ) : done ? (
              <span>
                <b>{answered}</b> of {direct.length} modules answered · <b>{active.length}</b> active code{active.length === 1 ? '' : 's'}
              </span>
            ) : (
              <span>Not checked this session</span>
            )}
          </div>
          <button
            className="st-btn st-btn--primary"
            disabled={scanning}
            onClick={() => read(vid, 'A health check', () => sim.scan(vid))}
            data-testid="health-scan"
          >
            <ScanLine size={16} aria-hidden="true" />
            {scanning ? 'Checking…' : done ? 'Check again' : 'Run health check'}
          </button>
        </div>
      </header>

      <Panel
        title="CAN V bus"
        sub="Topology from the atlas page. Boxes turn green when a module answers, red when it stays silent."
        id="bus-title"
        actions={
          <div className="st-legend">
            <span className="is-ok">Responding</span>
            <span className="is-none">No response</span>
            <span className="is-idle">Not checked</span>
          </div>
        }
      >
        <BusDiagram rt={rt} openBranch={!!rt.steps['canSkid.s2'] && rt.steps['canSkid.s2'].result === 'ng' && !rt.fixed.has('branch')} />
        {silent.length > 0 && (
          <div className="st-callout st-callout--danger">
            <b>{silent.map((s) => s.name).join(', ')} did not answer.</b> Four other modules report losing it too (U0129), so the fault sits
            on its own branch, its power or the module — not the main line.
            <button
              className="st-btn st-btn--sm"
              onClick={() => {
                setFocusCode('U0129');
                go('codes');
              }}
              data-testid="health-goto-fix"
            >
              <Wrench size={14} aria-hidden="true" /> Open guided fix
            </button>
          </div>
        )}
      </Panel>

      <div className="st-health__grid">
        <Panel
          title="Modules"
          sub="Diagnostic addresses where they are published; others are reached by Toyota-specific requests."
          id="mods-title"
        >
          <div className="st-tablewrap">
            <table className="st-table" data-testid="module-table">
              <thead>
                <tr>
                  <th scope="col">Module</th>
                  <th scope="col">Bus</th>
                  <th scope="col">Request → response</th>
                  <th scope="col">Status</th>
                  <th scope="col" className="num">
                    Codes
                  </th>
                </tr>
              </thead>
              <tbody>
                {list.map((e) => {
                  const s = rt.ecu[e.node]?.status ?? 'idle';
                  const S = STATUS[s];
                  const n = rt.dtcs.filter((d) => d.ecu === e.node && d.status !== 'history').length;
                  return (
                    <tr key={e.node} className={e.path === 'gateway' ? 'is-sub' : undefined}>
                      <td>
                        <b>{e.name}</b>
                        <span className="st-table__sub">
                          {e.system}
                          {e.via && ` · via ${NODE_BY_ID[e.via]?.short ?? e.via}`}
                        </span>
                      </td>
                      <td>{e.bus}</td>
                      <td className="mono" title={ADDR_NOTE[e.basis]}>
                        {e.req ? (
                          <>
                            {hex3(e.req)} → {hex3(e.res!)}
                            {e.basis !== 'obd' && <sup className="st-note">{e.basis === 'openpilot' ? 'op' : 'late'}</sup>}
                          </>
                        ) : (
                          <span className="muted">{e.path === 'gateway' ? 'through gateway' : 'not published'}</span>
                        )}
                      </td>
                      <td>
                        <Badge tone={S.tone} dot>
                          {S.t}
                        </Badge>
                      </td>
                      <td className="num mono">{s === 'ok' || s === 'none' ? (s === 'none' ? '?' : n) : '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="st-foot">
            <sup className="st-note">op</sup> openpilot’s Corolla firmware query · <sup className="st-note">late</sup> late-model Toyota
            list, not confirmed on this car · 0x7E0 → 0x7E8 is the SAE J1979 engine address.
          </p>
        </Panel>
        <Panel title="Warning lamps" sub="What the combination meter is showing the driver right now." id="lamps-title">
          <ul className="st-lamplist">
            {lamps.map((l) => (
              <li key={l.k} className={l.on ? 'is-on' : ''}>
                <i className={`st-lamp st-lamp--${l.k}${l.on ? '' : ' is-off'}`} aria-hidden="true" />
                <div>
                  <b>{l.label}</b>
                  <span>{l.state}</span>
                  {l.why && <p>{l.why}</p>}
                </div>
              </li>
            ))}
          </ul>
        </Panel>
      </div>
    </div>
  );
}
