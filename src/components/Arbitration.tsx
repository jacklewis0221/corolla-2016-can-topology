import { useEffect, useState } from 'react';
import { Play, RotateCcw } from 'lucide-react';
import { hex } from '../data/messages';
import { usePrefersReducedMotion } from '../lib/hooks';

const CONTENDERS = [
  { id: 0x620, who: 'Main body ECU', what: 'door status' },
  { id: 0x1c4, who: 'ECM', what: 'engine speed' },
  { id: 0x024, who: 'Airbag sensor', what: 'yaw rate & G' },
];

const bitsOf = (id: number) => Array.from({ length: 11 }, (_, i) => (id >> (10 - i)) & 1);

export function Arbitration() {
  const reduced = usePrefersReducedMotion();
  const [k, setK] = useState(11); // bits revealed
  const [running, setRunning] = useState(false);

  useEffect(() => {
    if (!running) return;
    if (k >= 11) {
      setRunning(false);
      return;
    }
    const id = window.setTimeout(() => setK((x) => x + 1), reduced ? 0 : 520);
    return () => window.clearTimeout(id);
  }, [running, k, reduced]);

  const rows = CONTENDERS.map((c) => ({ ...c, bits: bitsOf(c.id) }));
  // who is still transmitting at each bit
  const alive: boolean[][] = rows.map(() => []);
  const bus: number[] = [];
  let still = rows.map(() => true);
  for (let i = 0; i < 11; i++) {
    const level = rows.some((r, j) => still[j] && r.bits[i] === 0) ? 0 : 1;
    bus.push(level);
    rows.forEach((_, j) => alive[j].push(still[j]));
    still = still.map((s, j) => s && rows[j].bits[i] === level);
  }
  const lostAt = rows.map((_, j) => {
    const idx = alive[j].findIndex((a, i) => a && rows[j].bits[i] !== bus[i]);
    return idx;
  });
  const winner = rows.findIndex((_, j) => lostAt[j] === -1);

  return (
    <div className="card arb" data-testid="arbitration">
      <h3 className="card__title">Arbitration: who talks first?</h3>
      <p className="card__hint">
        Three modules start a frame at the same instant. Each sends its ID bit by bit and listens: a 0 (dominant) overwrites a 1
        (recessive). A module that sends 1 but hears 0 stops and retries later — so the lowest ID wins without any frame being
        damaged.
      </p>
      <div className="arb__grid" style={{ ['--cols' as string]: 11 }}>
        <div className="arb__row arb__row--head">
          <span className="arb__who">ID bit</span>
          {Array.from({ length: 11 }, (_, i) => (
            <span key={i} className="arb__h">
              {10 - i}
            </span>
          ))}
        </div>
        {rows.map((r, j) => (
          <div key={r.id} className={`arb__row${winner === j && k >= 11 ? ' is-winner' : ''}`}>
            <span className="arb__who">
              <code>{hex(r.id)}</code>
              <span>
                {r.who} · {r.what}
              </span>
            </span>
            {r.bits.map((b, i) => {
              const shown = i < k;
              const out = shown && lostAt[j] !== -1 && i > lostAt[j];
              const lose = shown && lostAt[j] === i;
              return (
                <span key={i} className={`arb__bit${shown ? ' is-shown' : ''}${out ? ' is-out' : ''}${lose ? ' is-lose' : ''}${b === 0 ? ' is-dom' : ''}`}>
                  {shown ? (out ? '·' : b) : ''}
                </span>
              );
            })}
          </div>
        ))}
        <div className="arb__row arb__row--bus">
          <span className="arb__who">
            <b>Bus</b>
            <span>what everyone hears</span>
          </span>
          {bus.map((b, i) => (
            <span key={i} className={`arb__bit is-bus${i < k ? ' is-shown' : ''}${b === 0 ? ' is-dom' : ''}`}>
              {i < k ? b : ''}
            </span>
          ))}
        </div>
      </div>
      <div className="arb__foot">
        <button
          className="btn btn--accent btn--sm"
          onClick={() => {
            setK(0);
            setRunning(true);
          }}
          data-testid="arb-play"
        >
          {k >= 11 ? <RotateCcw size={15} aria-hidden="true" /> : <Play size={15} aria-hidden="true" />}
          {k >= 11 ? 'Replay' : 'Running…'}
        </button>
        <p className="arb__result" aria-live="polite">
          {k >= 11 ? (
            <>
              <b>{rows[winner].who}</b> ({hex(rows[winner].id)}) wins. {rows.filter((_, j) => j !== winner).map((r) => r.who).join(' and ')} drop
              out at bits {rows.map((_, j) => lostAt[j]).filter((x) => x >= 0).map((x) => 10 - x).join(' and ')}.
            </>
          ) : (
            'Comparing bits…'
          )}
        </p>
      </div>
    </div>
  );
}
