import { useEffect, useMemo, useState } from 'react';
import { MESSAGE_BY_ID, hex, type Signal } from '../data/messages';
import { buildFrame, decode, encode, FIELD_INFO, fmt, toBin, toHex, toyotaChecksum, BIT_TIME_US, signalBits, type FieldKey } from '../lib/can';
import { SectionHead, SourceLinks } from './ui';
import { nameOf } from './Inspector';
import { Arbitration } from './Arbitration';
import { LinFrame } from './LinFrame';

interface Ctl {
  name: string;
  min?: number;
  max?: number;
  step?: number;
  def: number;
  options?: { v: number; label: string }[];
  toggle?: boolean;
}

export const LAB: { id: number; title: string; ctl: Ctl[] }[] = [
  {
    id: 0x1c4,
    title: 'Engine speed',
    ctl: [
      { name: 'RPM', min: 0, max: 7000, step: 25, def: 2400 },
      { name: 'ENGINE_RUNNING', def: 1, toggle: true },
    ],
  },
  {
    id: 0x0b4,
    title: 'Vehicle speed',
    ctl: [
      { name: 'SPEED', min: 0, max: 200, step: 1, def: 60 },
      { name: 'ENCODER', min: 0, max: 255, step: 1, def: 0 },
    ],
  },
  {
    id: 0x024,
    title: 'Yaw & G',
    ctl: [
      { name: 'YAW_RATE', min: -60, max: 60, step: 0.5, def: 12 },
      { name: 'ACCEL_X', min: -9, max: 9, step: 0.1, def: 0 },
      { name: 'ACCEL_Y', min: -9, max: 9, step: 0.1, def: 3.5 },
    ],
  },
  {
    id: 0x025,
    title: 'Steering angle',
    ctl: [
      { name: 'STEER_ANGLE', min: -540, max: 540, step: 1.5, def: -45 },
      { name: 'STEER_RATE', min: -400, max: 400, step: 1, def: 0 },
    ],
  },
  {
    id: 0x3bc,
    title: 'Shift position',
    ctl: [
      {
        name: 'GEAR',
        def: 16,
        options: [
          { v: 32, label: 'P' },
          { v: 16, label: 'R' },
          { v: 8, label: 'N' },
          { v: 0, label: 'D' },
        ],
      },
    ],
  },
  {
    id: 0x620,
    title: 'Doors & brake',
    ctl: [
      { name: 'DOOR_OPEN_FL', def: 1, toggle: true },
      { name: 'DOOR_OPEN_FR', def: 0, toggle: true },
      { name: 'DOOR_OPEN_RL', def: 0, toggle: true },
      { name: 'DOOR_OPEN_RR', def: 0, toggle: true },
      { name: 'PARKING_BRAKE', def: 1, toggle: true },
      { name: 'SEATBELT_DRIVER_UNLATCHED', def: 1, toggle: true },
    ],
  },
  {
    id: 0x614,
    title: 'Turn signals',
    ctl: [
      {
        name: 'TURN_SIGNALS',
        def: 1,
        options: [
          { v: 3, label: 'off' },
          { v: 1, label: 'left' },
          { v: 2, label: 'right' },
        ],
      },
      { name: 'HAZARD_LIGHT', def: 0, toggle: true },
    ],
  },
];

const SIG_COLORS = ['sig-a', 'sig-b', 'sig-c', 'sig-d', 'sig-e', 'sig-f'];

const FIELD_ORDER: FieldKey[] = ['sof', 'id', 'rtr', 'ide', 'r0', 'dlc', 'data', 'crc', 'crcDel', 'ack', 'ackDel', 'eof'];

export function FrameLab({ msgId, seed, onMsg }: { msgId: number; seed?: Record<string, number>; onMsg: (id: number) => void }) {
  const lab = LAB.find((l) => l.id === msgId) ?? LAB[0];
  const m = MESSAGE_BY_ID[lab.id];
  const initial = () => Object.fromEntries(lab.ctl.map((c) => [c.name, seed && c.name in seed ? seed[c.name] : c.def]));
  const [vals, setVals] = useState<Record<string, number>>(initial);
  const [hoverField, setHoverField] = useState<FieldKey | null>(null);

  useEffect(() => {
    setVals(initial());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lab, seed]);

  const sigs: Signal[] = (m.signals ?? []).filter((s) => lab.ctl.some((c) => c.name === s.name) || s.name === 'CHECKSUM');
  const data = useMemo(() => {
    const d = encode(m.dlc, m.signals ?? [], vals);
    if ((m.signals ?? []).some((s) => s.name === 'CHECKSUM')) d[m.dlc - 1] = toyotaChecksum(m.id, d);
    return d;
  }, [m, vals]);
  const frame = useMemo(() => buildFrame(m.id, data), [m.id, data]);

  const bitOwner = useMemo(() => {
    const own: Record<number, number> = {};
    sigs.forEach((s, i) => signalBits(s).forEach((b) => (own[b] = i)));
    return own;
  }, [sigs]);

  const fieldSpans = useMemo(() => {
    const spans: { field: FieldKey; n: number; stuff: number }[] = [];
    for (const f of FIELD_ORDER) {
      const bits = frame.bits.filter((b) => b.field === f);
      spans.push({ field: f, n: bits.length, stuff: bits.filter((b) => b.stuff).length });
    }
    return spans;
  }, [frame]);

  const total = frame.bits.length;
  const BW = 10;
  const W = total * BW + 20;

  // waveform path
  const level = (b: 0 | 1, hi: boolean) => (b === 0 ? (hi ? 3.5 : 1.5) : 2.5);
  const yv = (v: number) => 150 - v * 34;
  const wave = (hi: boolean) => {
    let d = '';
    frame.bits.forEach((b, i) => {
      const x0 = 10 + i * BW;
      const y = yv(level(b.bit, hi));
      d += i === 0 ? `M${x0},${y}` : ` L${x0},${y}`;
      d += ` L${x0 + BW},${y}`;
    });
    return d;
  };

  return (
    <section className="section section--lab" aria-labelledby="lab-title" id="frames">
      <div className="container">
        <SectionHead kicker="03 · Frame lab" title="What one CAN message looks like" id="lab-title">
          <p>
            Move the sliders: the physical value is scaled into raw bits, packed into the 8 data bytes exactly as Toyota lays them out,
            wrapped in a CAN frame with its CRC, bit-stuffed, and driven onto the two wires as voltages.
          </p>
        </SectionHead>

        <div className="lab-picker" role="tablist" aria-label="Message">
          {LAB.map((l) => (
            <button
              key={l.id}
              role="tab"
              aria-selected={l.id === lab.id}
              className={`lab-tab${l.id === lab.id ? ' is-on' : ''}`}
              onClick={() => onMsg(l.id)}
              data-testid={`lab-${hex(l.id)}`}
            >
              <code>{hex(l.id)}</code>
              <span>{l.title}</span>
            </button>
          ))}
        </div>

        <div className="lab-grid">
          <div className="card lab-ctl">
            <div className="lab-ctl__head">
              <code className="lab-id">{hex(m.id)}</code>
              <div>
                <div className="lab-names">
                  {m.toyota && <b>{m.toyota}</b>} {m.dbc && <span>{m.dbc}</span>}
                </div>
                <div className="lab-sender">
                  Sent by <b>{m.sender ? nameOf(m.sender) : 'unknown'}</b> · {m.dlc} bytes
                </div>
              </div>
            </div>
            <p className="lab-sum">{m.summary}</p>
            <div className="ctls">
              {lab.ctl.map((c) => {
                const s = m.signals!.find((x) => x.name === c.name)!;
                const color = SIG_COLORS[sigs.indexOf(s) % SIG_COLORS.length];
                const v = vals[c.name] ?? c.def;
                return (
                  <div key={c.name} className={`ctl ${color}${c.toggle || c.options ? '' : ' ctl--wide'}`}>
                    <label htmlFor={`ctl-${c.name}`} className="ctl__label">
                      <span className="ctl__swatch" aria-hidden="true" />
                      <code>{c.name}</code>
                      <span className="ctl__desc">{s.desc}</span>
                    </label>
                    {c.toggle ? (
                      <button
                        id={`ctl-${c.name}`}
                        type="button"
                        className={`switch${v ? ' is-on' : ''}`}
                        aria-pressed={Boolean(v)}
                        onClick={() => setVals((p) => ({ ...p, [c.name]: v ? 0 : 1 }))}
                        data-testid={`ctl-${c.name}`}
                      >
                        <span className="switch__knob" />
                        <span className="switch__text">{v ? '1' : '0'}</span>
                      </button>
                    ) : c.options ? (
                      <div className="seg seg--sm" role="radiogroup" aria-label={c.name}>
                        {c.options.map((o) => (
                          <button
                            key={o.v}
                            role="radio"
                            aria-checked={v === o.v}
                            className={`seg__btn${v === o.v ? ' is-on' : ''}`}
                            onClick={() => setVals((p) => ({ ...p, [c.name]: o.v }))}
                            data-testid={`ctl-${c.name}-${o.label}`}
                          >
                            {o.label}
                          </button>
                        ))}
                      </div>
                    ) : (
                      <div className="ctl__range">
                        <input
                          id={`ctl-${c.name}`}
                          type="range"
                          min={c.min}
                          max={c.max}
                          step={c.step}
                          value={v}
                          onChange={(e) => setVals((p) => ({ ...p, [c.name]: Number(e.target.value) }))}
                          data-testid={`ctl-${c.name}`}
                        />
                        <output htmlFor={`ctl-${c.name}`}>
                          {fmt(decode(data, s), s)} {s.unit}
                        </output>
                      </div>
                    )}
                    <div className="ctl__math">
                      raw = ({fmt(v, s)} − {s.offset}) ÷ {s.factor} = <b>{Math.round((v - s.offset) / s.factor)}</b> · {s.len} bits from bit {s.start}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="card lab-bytes">
            <h3 className="card__title">Payload · bit map</h3>
            <p className="card__hint">Each row is a byte (B0 first on the wire). Colored cells belong to a signal; Toyota packs big-endian.</p>
            <div className="bitmap" role="table" aria-label="Payload bits">
              <div className="bitmap__row bitmap__row--head" role="row">
                <span role="columnheader" />
                {[7, 6, 5, 4, 3, 2, 1, 0].map((b) => (
                  <span key={b} role="columnheader">
                    {b}
                  </span>
                ))}
                <span role="columnheader">hex</span>
              </div>
              {data.map((byte, bi) => (
                <div key={bi} className="bitmap__row" role="row">
                  <span className="bitmap__b" role="rowheader">
                    B{bi}
                  </span>
                  {[7, 6, 5, 4, 3, 2, 1, 0].map((b) => {
                    const pos = bi * 8 + b;
                    const owner = bitOwner[pos];
                    const on = (byte >> b) & 1;
                    return (
                      <span
                        key={b}
                        role="cell"
                        className={`bit${on ? ' is-1' : ''}${owner !== undefined ? ` ${SIG_COLORS[owner % SIG_COLORS.length]} is-owned` : ''}`}
                        title={owner !== undefined ? sigs[owner].name : 'unused'}
                      >
                        {on}
                      </span>
                    );
                  })}
                  <span className="bitmap__hex" role="cell">
                    {toHex(byte)}
                  </span>
                </div>
              ))}
            </div>
            {sigs.some((s) => s.name === 'CHECKSUM') && (
              <p className="card__hint">
                Last byte is Toyota’s checksum: DLC + ID bytes + data bytes, keep the low 8 bits → <code>0x{toHex(data[m.dlc - 1])}</code>.
              </p>
            )}
          </div>
        </div>

        <div className="card wire">
          <div className="wire__head">
            <h3 className="card__title">On the wire</h3>
            <div className="wire__stats">
              <span>
                <b>{total}</b> bits incl. <b>{frame.stuffCount}</b> stuff bits
              </span>
              <span>
                <b>{(total * BIT_TIME_US).toFixed(0)} µs</b> at 500 kbit/s
              </span>
              <span>
                CRC-15 <code>0x{toHex(frame.crc, 4)}</code>
              </span>
            </div>
          </div>
          <div className="fields" aria-label="Frame fields">
            {fieldSpans.map((f) => (
              <button
                key={f.field}
                className={`field f-${f.field}${hoverField === f.field ? ' is-on' : ''}`}
                style={{ flexGrow: f.n }}
                onMouseEnter={() => setHoverField(f.field)}
                onFocus={() => setHoverField(f.field)}
                onMouseLeave={() => setHoverField(null)}
                onBlur={() => setHoverField(null)}
                data-testid={`field-${f.field}`}
              >
                <span className="field__k">{FIELD_INFO[f.field].short}</span>
                <span className="field__n">{f.n - f.stuff}</span>
              </button>
            ))}
          </div>
          <p className="field-desc" aria-live="polite">
            {hoverField ? (
              <>
                <b>{FIELD_INFO[hoverField].label}.</b> {FIELD_INFO[hoverField].desc}
                {(() => {
                  const f = fieldSpans.find((x) => x.field === hoverField);
                  return f && f.stuff ? ` In this frame it also carries ${f.stuff} stuff bit${f.stuff > 1 ? 's' : ''}.` : '';
                })()}
              </>
            ) : (
              <>
                Identifier <code>{toBin(m.id, 11)}</code> · DLC <code>{toBin(m.dlc, 4)}</code> — hover a field for its job.
              </>
            )}
          </p>
          <div className="scope" role="img" aria-label="CANH and CANL voltage waveform for this frame">
            <svg width={W} height="176" viewBox={`0 0 ${W} 176`}>
              {[1.5, 2.5, 3.5].map((v) => (
                <g key={v}>
                  <line x1="0" x2={W} y1={yv(v)} y2={yv(v)} className="scope__grid" />
                </g>
              ))}
              {frame.bits.map((b, i) => (
                <rect
                  key={i}
                  x={10 + i * BW}
                  y="8"
                  width={BW}
                  height="10"
                  className={`scope__field f-${b.field}${b.stuff ? ' is-stuff' : ''}${hoverField === b.field ? ' is-on' : ''}`}
                />
              ))}
              <path d={wave(true)} className="scope__h" />
              <path d={wave(false)} className="scope__l" />
              {frame.bits.map((b, i) =>
                b.stuff ? <circle key={`s${i}`} cx={10 + i * BW + BW / 2} cy="166" r="3" className="scope__stuff" /> : null,
              )}
            </svg>
          </div>
          <div className="scope__legend">
            <span className="lg-h">CANH 2.5 → 3.5 V when dominant</span>
            <span className="lg-l">CANL 2.5 → 1.5 V when dominant</span>
            <span className="lg-s">stuff bit (inserted after five equal bits)</span>
          </div>
          <SourceLinks keys={['tiCan', 'opendbc', 'opendbcRef', 'opendbcChecksum', 'ncfCan']} compact />
        </div>

        <div className="lab-duo">
          <Arbitration />
          <LinFrame />
        </div>
      </div>
    </section>
  );
}
