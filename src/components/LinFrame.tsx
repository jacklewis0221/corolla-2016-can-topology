import { useState } from 'react';

const FIELDS = [
  { k: 'break', label: 'Break', short: 'Break', bits: 14, who: 'master', desc: 'At least 13 dominant bits plus a delimiter — longer than any normal byte, so every node knows a new frame starts.' },
  { k: 'sync', label: 'Sync byte 0x55', short: 'Sync', bits: 10, who: 'master', desc: 'Alternating 1-0 pattern. Responders time it to lock onto the master’s bit rate.' },
  { k: 'pid', label: 'Protected ID', short: 'PID', bits: 10, who: 'master', desc: '6-bit frame ID plus 2 parity bits: which data the master wants, e.g. the panel’s button states.' },
  { k: 'data', label: 'Data, 2 · 4 · 8 bytes', short: 'Data', bits: 40, who: 'slave', desc: 'The responder that owns this ID fills in the bytes. Toyota uses 2, 4 or 8 byte payloads.' },
  { k: 'sum', label: 'Checksum', short: 'Checksum', bits: 10, who: 'slave', desc: 'One byte that lets the master check the response.' },
] as const;

export function LinFrame() {
  const [on, setOn] = useState<(typeof FIELDS)[number]['k']>('pid');
  const total = FIELDS.reduce((a, f) => a + f.bits, 0);
  const cur = FIELDS.find((f) => f.k === on)!;
  return (
    <div className="card lin" data-testid="lin-frame">
      <h3 className="card__title">A LIN frame, for contrast</h3>
      <p className="card__hint">
        LIN is a single wire at up to 20 kbit/s with exactly one master. The master always sends the header; a responder answers in
        the same frame. On the A/C bus the amplifier asks and the control panel answers.
      </p>
      <div className="lin__who">
        <span className="lin__tag lin__tag--m">Header · A/C amplifier (master)</span>
        <span className="lin__tag lin__tag--s">Response · A/C control panel</span>
      </div>
      <div className="lin__bar" role="tablist" aria-label="LIN frame fields">
        {FIELDS.map((f) => (
          <button
            key={f.k}
            role="tab"
            aria-selected={on === f.k}
            className={`lin__f lin__f--${f.who}${on === f.k ? ' is-on' : ''}`}
            style={{ flexGrow: f.bits / total }}
            onClick={() => setOn(f.k)}
            onMouseEnter={() => setOn(f.k)}
            data-testid={`lin-${f.k}`}
          >
            {f.short}
          </button>
        ))}
      </div>
      <p className="lin__desc" aria-live="polite">
        <b>{cur.label}.</b> {cur.desc}
      </p>
      <dl className="lin__cmp">
        <div>
          <dt>CAN V bus</dt>
          <dd>500 kbit/s · twisted pair · any node may talk · 1–8 bytes</dd>
        </div>
        <div>
          <dt>LIN</dt>
          <dd>9.6–20 kbit/s · one wire · master polls · 2, 4 or 8 bytes</dd>
        </div>
      </dl>
    </div>
  );
}
