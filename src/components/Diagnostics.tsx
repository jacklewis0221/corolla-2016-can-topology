import { useMemo, useState } from 'react';
import { DLC3_PINS, FAILSAFE, FAULTS, PROBES, DIAG_SOURCES, type FaultId } from '../data/diagnostics';
import { SectionHead, SourceLinks, Segmented, Pill } from './ui';

const SCAN_ROWS: { who: string; req: string; res: string; basis: string; tone: 'ok' | 'info' | 'neutral' }[] = [
  { who: 'ECM', req: '0x7E0', res: '0x7E8', basis: 'logged on a Corolla', tone: 'ok' },
  { who: 'Skid control ECU', req: '0x7B0', res: '0x7B8', basis: 'Corolla firmware query', tone: 'info' },
  { who: 'Power steering ECU', req: '0x7A1', res: '0x7A9', basis: 'Corolla firmware query', tone: 'info' },
  { who: 'Airbag sensor', req: '0x780', res: '0x788', basis: 'later Toyota list', tone: 'neutral' },
  { who: 'Combination meter', req: '0x7C0', res: '0x7C8', basis: 'later Toyota list', tone: 'neutral' },
  { who: 'A/C amplifier', req: '0x7C4', res: '0x7CC', basis: 'later Toyota list', tone: 'neutral' },
];
import { nameOf } from './Inspector';

function verdict(probe: string, r: number | 'OL') {
  if (r === 'OL') return { tone: 'warn', text: probe === 'dlc' ? 'No reading: the DLC3 branch is open' : 'Open circuit: no terminator reachable' };
  if (r < 54) return { tone: 'danger', text: 'Below 54 Ω: CANH and CANL are shorted' };
  if (probe === 'dlc' || probe === 'branch') {
    if (r <= 69) return { tone: 'ok', text: 'Within 54–69 Ω: both terminators present' };
    return { tone: 'warn', text: '70 Ω or more: open in the main line' };
  }
  if (r >= 108 && r <= 132) return { tone: 'ok', text: 'Within 108–132 Ω: the far terminator is reachable' };
  return { tone: 'warn', text: 'Out of range' };
}

function BusSketch({ fault, probe }: { fault: FaultId; probe: string }) {
  const H = 46;
  const L = 104;
  const x = { meter: 70, jc3: 250, jc2: 420, ecm: 590 };
  const cut = (cx: number) => (
    <g className="sk-cut" transform={`translate(${cx},${(H + L) / 2})`}>
      <path d={`M-9,${H - (H + L) / 2 - 9} l18,18 M9,${H - (H + L) / 2 - 9} l-18,18`} />
      <path d={`M-9,${L - (H + L) / 2 - 9} l18,18 M9,${L - (H + L) / 2 - 9} l-18,18`} />
    </g>
  );
  const resistor = (cx: number, off: boolean) => (
    <g className={`sk-res${off ? ' is-off' : ''}`}>
      <path d={`M${cx},${H} L${cx},${H + 12} l8,4 l-16,6 l16,6 l-16,6 l16,6 l-8,4 L${cx},${L}`} />
      <text x={cx} y={L + 22} textAnchor="middle">
        120 Ω
      </text>
    </g>
  );
  return (
    <svg viewBox="0 0 660 190" className="sketch" role="img" aria-label="Simplified V bus with the selected fault and probe point">
      <line x1={x.meter} x2={x.ecm} y1={H} y2={H} className="sk-h" />
      <line x1={x.meter} x2={x.ecm} y1={L} y2={L} className="sk-l" />
      {resistor(x.meter, fault === 'meterOut' || probe === 'meterConn')}
      {resistor(x.ecm, fault === 'ecmOut' || probe === 'ecmConn')}
      <text x={x.meter} y={22} textAnchor="middle" className="sk-lbl">
        Meter
      </text>
      <text x={x.ecm} y={22} textAnchor="middle" className="sk-lbl">
        ECM
      </text>
      {[x.jc3, x.jc2].map((jx, i) => (
        <g key={jx}>
          <circle cx={jx} cy={H} r="6" className="sk-jc" />
          <circle cx={jx} cy={L} r="6" className="sk-jc" />
          <text x={jx} y={22} textAnchor="middle" className="sk-lbl">
            {i === 0 ? 'No. 3 J/C' : 'No. 2 J/C'}
          </text>
        </g>
      ))}
      {/* DLC3 branch — CANH hops over the CANL main line */}
      <path d={`M${x.jc3 - 20},${H} L${x.jc3 - 20},${L - 9} A9,9 0 0 0 ${x.jc3 - 20},${L + 9} L${x.jc3 - 20},160`} className="sk-h sk-br" />
      <line x1={x.jc3 - 6} x2={x.jc3 - 6} y1={L} y2={160} className="sk-l sk-br" />
      <rect x={x.jc3 - 46} y={150} width="66" height="30" rx="7" className={`sk-box${probe === 'dlc' ? ' is-probe' : ''}`} />
      <text x={x.jc3 - 13} y={170} textAnchor="middle" className="sk-boxt">
        DLC3
      </text>
      <circle cx={x.jc3 - 20} cy={H} r="4" className="sk-tap sk-tap--h" />
      <circle cx={x.jc3 - 6} cy={L} r="4" className="sk-tap sk-tap--l" />
      <circle cx={x.jc3 + 54} cy={H} r="4" className="sk-tap sk-tap--h" />
      <circle cx={x.jc3 + 68} cy={L} r="4" className="sk-tap sk-tap--l" />
      {/* A/C branch */}
      <path d={`M${x.jc3 + 54},${H} L${x.jc3 + 54},${L - 9} A9,9 0 0 0 ${x.jc3 + 54},${L + 9} L${x.jc3 + 54},160`} className="sk-h sk-br" />
      <line x1={x.jc3 + 68} x2={x.jc3 + 68} y1={L} y2={160} className="sk-l sk-br" />
      <rect x={x.jc3 + 26} y={150} width="70" height="30" rx="7" className={`sk-box${probe === 'branch' ? ' is-probe' : ''}`} />
      <text x={x.jc3 + 61} y={170} textAnchor="middle" className="sk-boxt">
        A/C amp
      </text>
      {probe === 'meterConn' && <rect x={x.meter - 30} y={H - 14} width="60" height={L - H + 28} rx="9" className="sk-probe" />}
      {probe === 'ecmConn' && <rect x={x.ecm - 30} y={H - 14} width="60" height={L - H + 28} rx="9" className="sk-probe" />}
      {fault === 'openMeter' && cut((x.meter + x.jc3) / 2)}
      {fault === 'openJc' && cut((x.jc3 + x.jc2) / 2 + 30)}
      {fault === 'openEcm' && cut((x.jc2 + x.ecm) / 2)}
      {fault === 'dlcOpen' && (
        <g className="sk-cut">
          <path d={`M${x.jc3 - 29},126 l18,18 M${x.jc3 - 11},126 l-18,18`} />
        </g>
      )}
      {fault === 'short' && <line x1={x.jc2 + 60} x2={x.jc2 + 60} y1={H} y2={L} className="sk-short" />}
    </svg>
  );
}

export function Diagnostics() {
  const [fault, setFault] = useState<FaultId>('ok');
  const [probe, setProbe] = useState('dlc');
  const [pin, setPin] = useState(6);
  const [provider, setProvider] = useState('ecm');

  const pr = PROBES.find((p) => p.id === probe)!;
  const reading = pr.fault[fault];
  const v = verdict(probe, reading);
  const f = FAULTS.find((x) => x.id === fault)!;
  const pinInfo = DLC3_PINS.find((p) => p.pin === pin);

  const providers = useMemo(() => [...new Set(FAILSAFE.flatMap((r) => r.needs))], []);
  const rows = FAILSAFE.filter((r) => r.needs.includes(provider));

  return (
    <section className="section section--diag" aria-labelledby="diag-title" id="diagnostics">
      <div className="container">
        <SectionHead kicker="05 · Diagnostics" title="How a technician sees the network" id="diag-title">
          <p>
            The DLC3 gives a scan tool the whole V bus, a multimeter across pins 6 and 14 tells you whether the wiring is sound, and every
            module has a defined fallback when a partner goes quiet.
          </p>
        </SectionHead>

        <div className="diag-grid">
          <div className="card dlc">
            <h3 className="card__title">DLC3 · the OBD-II port</h3>
            <p className="card__hint">Facing the connector under the driver side of the dash (standard OBD-II numbering). Pick a pin.</p>
            <div className="dlc__wrap">
            <svg viewBox="0 0 520 210" className="dlc__svg" role="group" aria-label="DLC3 pinout">
              <path d="M20,30 Q20,14 36,14 L484,14 Q500,14 500,30 L470,190 Q467,200 456,200 L64,200 Q53,200 50,190 Z" className="dlc__shell" />
              {Array.from({ length: 16 }, (_, i) => {
                const n = i + 1;
                const row = n <= 8 ? 0 : 1;
                const col = row === 0 ? n - 1 : n - 9;
                const cx = 80 + col * 51.5;
                const cy = row === 0 ? 74 : 146;
                const info = DLC3_PINS.find((p) => p.pin === n);
                return (
                  <g
                    key={n}
                    className={`dlc__pin${info ? ` net-${info.net}` : ' is-empty'}${pin === n ? ' is-on' : ''}`}
                    transform={`translate(${cx},${cy})`}
                    onClick={() => info && setPin(n)}
                    role="button"
                    tabIndex={info ? 0 : -1}
                    aria-label={info ? `Pin ${n}, ${info.name}: ${info.desc}` : `Pin ${n}, not used`}
                    onKeyDown={(e) => {
                      if (info && (e.key === 'Enter' || e.key === ' ')) {
                        e.preventDefault();
                        setPin(n);
                      }
                    }}
                    data-testid={`dlc-pin-${n}`}
                  >
                    <rect x="-21" y="-24" width="42" height="48" rx="9" />
                    <text y="-4" textAnchor="middle" className="dlc__n">
                      {n}
                    </text>
                    <text y="14" textAnchor="middle" className="dlc__name">
                      {info?.name ?? ''}
                    </text>
                  </g>
                );
              })}
            </svg>
            </div>
            {pinInfo && (
              <p className="dlc__info" aria-live="polite">
                <code>Pin {pinInfo.pin}</code> <b>{pinInfo.name}</b> — {pinInfo.desc}
              </p>
            )}
            <div className="scan">
              <h4 className="scan__title">How a scan tool asks</h4>
              <p className="card__hint">
                A tool on pins 6 and 14 sends a request to one module’s diagnostic ID. Only that module answers, on the request ID + 8;
                everyone else ignores the exchange.
              </p>
              <table className="scan__t">
                <thead>
                  <tr>
                    <th scope="col">Module</th>
                    <th scope="col">Request</th>
                    <th scope="col">Reply</th>
                    <th scope="col">Basis</th>
                  </tr>
                </thead>
                <tbody>
                  {SCAN_ROWS.map((r) => (
                    <tr key={r.req}>
                      <td>{r.who}</td>
                      <td>
                        <code>{r.req}</code>
                      </td>
                      <td>
                        <code>{r.res}</code>
                      </td>
                      <td>
                        <Pill tone={r.tone}>{r.basis}</Pill>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="card meterbox" data-testid="ohmmeter">
            <h3 className="card__title">Resistance check</h3>
            <p className="card__hint">Battery disconnected. Choose a fault, then where you put the probes.</p>
            <div className="meterbox__row">
              <div className="dmm" aria-live="polite">
                <span className="dmm__val" data-testid="dmm-value">
                  {reading === 'OL' ? 'O.L' : reading < 1 ? reading.toFixed(1) : reading.toFixed(0)}
                </span>
                <span className="dmm__unit">{reading === 'OL' ? 'MΩ' : 'Ω'}</span>
                <span className={`dmm__verdict tone-${v.tone}`}>{v.text}</span>
              </div>
              <div className="sketch-wrap">
                <BusSketch fault={fault} probe={probe} />
              </div>
            </div>
            <div className="meterbox__ctl">
              <span className="toolbar__label">Probe at</span>
              <Segmented
                label="Probe point"
                testId="probe"
                value={probe}
                onChange={setProbe}
                options={PROBES.map((p) => ({ value: p.id, label: p.label, title: p.where }))}
              />
              <p className="meterbox__spec">
                {pr.where}. Spec: {pr.spec}.
              </p>
            </div>
            <div className="faults" role="radiogroup" aria-label="Fault">
              {FAULTS.map((x) => (
                <button
                  key={x.id}
                  role="radio"
                  aria-checked={fault === x.id}
                  className={`fault${fault === x.id ? ' is-on' : ''}`}
                  onClick={() => setFault(x.id)}
                  data-testid={`fault-${x.id}`}
                >
                  {x.label}
                </button>
              ))}
            </div>
            <p className="meterbox__explain">{f.explain}</p>
          </div>
        </div>

        <div className="card failsafe">
          <div className="failsafe__head">
            <div>
              <h3 className="card__title">When a module goes quiet</h3>
              <p className="card__hint">Toyota’s fail-safe chart: pick the module whose data disappears.</p>
            </div>
            <div className="chips" role="radiogroup" aria-label="Module that goes silent">
              {providers.map((p) => (
                <button
                  key={p}
                  role="radio"
                  aria-checked={provider === p}
                  className={`chip${provider === p ? ' is-on' : ''}`}
                  onClick={() => setProvider(p)}
                  data-testid={`fs-${p}`}
                >
                  {nameOf(p)}
                </button>
              ))}
            </div>
          </div>
          <div className="table-wrap">
            <table className="fs-table">
              <thead>
                <tr>
                  <th scope="col">Function</th>
                  <th scope="col">Runs in</th>
                  <th scope="col">Fallback</th>
                  <th scope="col">Driver notices</th>
                  <th scope="col">DTCs</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.fn}>
                    <td>
                      <b>{r.fn}</b>
                    </td>
                    <td>{r.master.map(nameOf).join(' / ')}</td>
                    <td>{r.failsafe}</td>
                    <td>{r.driver}</td>
                    <td>
                      {r.dtcs.length ? (
                        r.dtcs.map((d) => (
                          <code key={d} className="dtc">
                            {d}
                          </code>
                        ))
                      ) : (
                        <span className="muted">none</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <SourceLinks keys={DIAG_SOURCES} compact />
        </div>
      </div>
    </section>
  );
}
