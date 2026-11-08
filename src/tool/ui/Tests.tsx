import { Gauge, KeyRound, PlayCircle, Syringe, Wind } from 'lucide-react';
import { sim } from '../sim/engine';
import { useActions } from '../actions';
import { TrendChart } from './charts';

/** Scenario-specific tests: bay procedures (a helper at the pedal, a tire gauge) and console active tests. */
export function ActiveTests({ vid, compact }: { vid: string; compact?: boolean }) {
  const { control } = useActions();
  const rt = sim.byId[vid];
  const t = rt.test;
  const running = (id: string) => t?.id === id;
  switch (rt.v.scenario) {
    case 'lean':
      return (
        <div className="st-tests">
          <div className="st-test">
            <div>
              <b>Hold 2,500 rpm</b>
              <p>Bay procedure: a helper holds the pedal for 25 s. Watch total fuel trim: a leak shrinks as airflow rises.</p>
            </div>
            <button className="st-btn" onClick={() => sim.startTest(vid, 'hold2500')} disabled={!!t} data-testid="test-hold2500">
              <Gauge size={16} aria-hidden="true" /> {running('hold2500') ? 'Holding…' : 'Start'}
            </button>
          </div>
          <div className="st-test">
            <div>
              <b>Control the injection volume for A/F sensor</b>
              <p>
                Active test (repair manual step 4). +12.5 % → AFS below 3.1 V, O2S above 0.55 V. −12.5 % → AFS above 3.4 V, O2S below 0.4 V.
                Needs control.
              </p>
            </div>
            <div className="st-test__btns">
              {[12.5, -12.5].map((a) => (
                <button
                  key={a}
                  className="st-btn"
                  disabled={!!t}
                  onClick={() => control(vid, 'An active test', () => sim.startTest(vid, 'afInj', a))}
                  data-testid={`test-af-${a > 0 ? 'plus' : 'minus'}`}
                >
                  <Syringe size={16} aria-hidden="true" /> {a > 0 ? '+12.5 %' : '−12.5 %'}
                </button>
              ))}
            </div>
          </div>
        </div>
      );
    case 'battery':
      return (
        <div className="st-tests">
          <div className="st-test">
            <div>
              <b>Crank & start</b>
              <p>The adapter samples DLC3 pin 16 at 50 samples/s while the engine cranks — no transmit needed.</p>
            </div>
            <div className="st-test__btns">
              <button
                className="st-btn st-btn--primary"
                disabled={!!t || rt.engine === 'run'}
                onClick={() => sim.startTest(vid, 'crank')}
                data-testid="test-crank"
              >
                <PlayCircle size={16} aria-hidden="true" /> {running('crank') ? 'Recording…' : 'Crank & start'}
              </button>
              <button
                className="st-btn"
                disabled={rt.engine !== 'run' || !!t}
                onClick={() => sim.startTest(vid, 'keyOff')}
                data-testid="test-keyoff"
              >
                <KeyRound size={16} aria-hidden="true" /> Engine off
              </button>
            </div>
          </div>
          {!compact && <CrankChart vid={vid} />}
        </div>
      );
    case 'tpms':
      return (
        <div className="st-tests">
          <div className="st-test">
            <div>
              <b>Drop each tire 40 kPa (5.8 psi)</b>
              <p>Repair manual step 2. The ID value that does not move belongs to the silent transmitter.</p>
            </div>
          </div>
          <div className="st-wheels">
            {(['LF', 'RF', 'LR', 'RR'] as const).map((w) => {
              const res = rt.tpms.tested[w];
              const done = w in rt.tpms.tested;
              return (
                <button
                  key={w}
                  className={`st-wheel${done ? (res === null ? ' is-bad' : ' is-ok') : ''}`}
                  disabled={!!t}
                  onClick={() => sim.startTest(vid, 'deflate', undefined, w)}
                  data-testid={`test-deflate-${w}`}
                >
                  <Wind size={16} aria-hidden="true" />
                  <b>{w}</b>
                  <span>
                    {running('deflate') && t?.wheel === w
                      ? 'Deflating…'
                      : done
                        ? res === null
                          ? 'No ID changed'
                          : `ID ${res} dropped`
                        : 'Deflate'}
                  </span>
                </button>
              );
            })}
          </div>
          <p className="st-foot">
            The receiver knows IDs, not wheel positions — that is why the manual identifies the transmitter this way.
          </p>
        </div>
      );
    default:
      return <p className="st-foot">No active tests are needed for this vehicle’s concern.</p>;
  }
}

export function CrankChart({ vid }: { vid: string }) {
  const rt = sim.byId[vid];
  const c = rt.crank;
  if (!c) return <p className="st-foot">No crank capture yet.</p>;
  const data = Float32Array.from(c.samples.slice(0, 300));
  return (
    <div className="st-crank">
      <p className="st-crank__head">
        <b>Crank capture</b> · minimum <b className={c.min < 9.5 ? 'is-bad' : 'is-ok'}>{c.min.toFixed(2)} V</b> · {c.dur.toFixed(1)} s
        cranking
      </p>
      <TrendChart
        series={[{ key: 'v', label: 'Battery', data, color: 'var(--sig-a)', unit: 'V', dec: 2 }]}
        height={170}
        min={7}
        max={15}
        band={[9.5, 15]}
        seconds={6}
        ariaLabel="Battery voltage during cranking"
      />
      <p className="st-foot">Shaded: above 9.5 V. Below it for long enough, the skid control ECU sets C1241 and prohibits ABS.</p>
    </div>
  );
}
