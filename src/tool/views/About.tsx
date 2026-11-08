import { ExternalLink } from 'lucide-react';
import { SOURCES, type SourceKey } from '../../data/sources';
import { Dialog } from '../ui/common';

const GROUPS: { title: string; keys: SourceKey[] }[] = [
  {
    title: 'Toyota repair manual procedures (guided fixes)',
    keys: ['rmP0300', 'rmP0171', 'rmStopSkid', 'rmC1241', 'rmC2121', 'rmB1423', 'rmFailSafe'],
  },
  { title: 'Maintenance, specifications and coverage', keys: ['maintGuide', 'ownersManual', 'toyotaCare', 'toyotaPlans'] },
  { title: 'Diagnostic tooling and protocols', keys: ['techstream', 'obdPids', 'j2534', 'openpilotFingerprint', 'opendbc'] },
];

export function About({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Dialog
      open={open}
      title="About this concept"
      onClose={onClose}
      testId="about"
      wide
      footer={
        <button className="st-btn st-btn--primary" onClick={onClose} data-testid="about-done" data-autofocus>
          Back to the console
        </button>
      }
    >
      <div className="st-about">
        <p className="st-about__lead">
          A theoretical desktop service console for a Toyota dealership: one screen that watches every car in the shop over wireless CAN
          adapters, then lets a technician drop into any one of them to read sensors, follow a guided fix, review history and walk a
          customer through maintenance. It is a design study — not a Toyota product, and not affiliated with or endorsed by Toyota. Toyota’s
          real dealer software is{' '}
          <a href={SOURCES.techstream.url} target="_blank" rel="noopener noreferrer" data-testid="about-techstream">
            Techstream
          </a>
          .
        </p>

        <section aria-labelledby="about-arch">
          <h3 id="about-arch">How it would connect</h3>
          <ol className="st-about__arch">
            <li>
              <b>An adapter on every car.</b> A wireless vehicle communication interface plugs into the DLC3 port under the dash and bridges
              the car’s CAN V bus (500 kbit/s) to the shop Wi-Fi. The console talks to every adapter at once.
            </li>
            <li>
              <b>Three levels of access.</b> <em>Listen-only</em> never transmits, so it can only decode frames the car already broadcasts —
              it cannot disturb the car. A <em>read session</em> sends diagnostic requests (OBD-II service 01 to 0x7DF/0x7E0, answers on
              0x7E8, plus Toyota data-list requests). <em>Exclusive control</em> — active tests, clearing codes, registering TPMS IDs —
              belongs to one technician at a time; everyone else keeps read access.
            </li>
            <li>
              <b>Broadcast versus requested.</b> Engine speed, wheel speeds and gear are already on the bus for other modules, so they are
              free to read. Coolant temperature, fuel trims and misfire counts must be asked for. Battery voltage is measured by the adapter
              itself on DLC3 pin 16, the way a J2534 interface answers READ_VBATT.
            </li>
          </ol>
        </section>

        <div className="st-about__cols">
          <section aria-labelledby="about-real">
            <h3 id="about-real">Taken from documentation</h3>
            <ul>
              <li>The CAN topology, modules and message layouts (from the atlas page and its sources).</li>
              <li>
                Trouble-code definitions, detection conditions, inspection steps and specified values in the guided fixes (Toyota repair
                manual).
              </li>
              <li>The maintenance schedule through 120,000 miles and the warranty terms (2016 Warranty & Maintenance Guide).</li>
              <li>Tire pressures, oil type and capacity, wheel-nut torque and warning-lamp behavior (2016 owner’s manual).</li>
              <li>OBD-II request addresses and PID formulas (SAE J1979).</li>
            </ul>
          </section>
          <section aria-labelledby="about-made">
            <h3 id="about-made">Invented for the demo</h3>
            <ul>
              <li>Every vehicle, customer, repair order, price, visit and inspection result.</li>
              <li>The wireless adapters, access points and the console’s workflows.</li>
              <li>Live values (simulated), bytes of frames whose layout is not public, and frame timing.</li>
              <li>“Likely cause” percentages — the console’s inference, not Toyota’s.</li>
              <li>Diagnostic addresses marked “late” and items marked illustrative.</li>
              <li>Repeating the 120,000-mile maintenance pattern beyond 120,000 miles.</li>
            </ul>
          </section>
        </div>

        <section aria-labelledby="about-src">
          <h3 id="about-src">Sources</h3>
          {GROUPS.map((g) => (
            <div key={g.title} className="st-about__src">
              <h4>{g.title}</h4>
              <ul>
                {g.keys.map((k) => (
                  <li key={k}>
                    <a href={SOURCES[k].url} target="_blank" rel="noopener noreferrer" data-testid={`about-src-${k}`}>
                      {SOURCES[k].title} <ExternalLink size={12} aria-hidden="true" />
                    </a>
                    <span className="muted"> · {SOURCES[k].publisher}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </section>
      </div>
    </Dialog>
  );
}
