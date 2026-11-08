// "Suggested fix" ranking: the console's own inference from live data, history and the repair manual's
// trouble-area lists. It is deliberately labelled as inference in the UI — the manual procedure decides.

import { sim, type Rt } from './engine';

export interface Cause {
  label: string;
  score: number;
  evidence: string[];
  action: string;
}

export interface Insight {
  headline: string;
  causes: Cause[];
  resolved?: boolean;
}

const finite = (a: ArrayLike<number>) => Array.from(a).filter(Number.isFinite);
const avg = (a: number[]) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : NaN);

export function insights(rt: Rt): Insight | null {
  const f = rt.fixed;
  switch (rt.v.scenario) {
    case 'misfire': {
      if (f.has('plugs'))
        return { headline: 'Spark plugs replaced — misfire counts are back to zero on the road test.', causes: [], resolved: true };
      const sums = ['mf1', 'mf2', 'mf3', 'mf4'].map((id) => finite(sim.series(rt, id)).reduce((s, x) => s + x, 0));
      const total = sums.reduce((s, x) => s + x, 0) || 1;
      const share = Math.round((sums[0] / total) * 100);
      return {
        headline: `Cylinder 1 accounts for ${share} % of misfires in the last minute, and they rise with engine load.`,
        causes: [
          {
            label: 'Spark plug, cylinder 1',
            score: 0.82,
            evidence: [
              'Original plugs at 118,640 mi; Toyota’s schedule replaces them at 120,000 mi',
              'Misfire climbs above about 40 % load — typical of a plug that cannot fire under cylinder pressure',
            ],
            action: 'Repair manual step 7: inspect the cylinder 1 plug',
          },
          {
            label: 'Ignition coil, cylinder 1',
            score: 0.48,
            evidence: ['Single cylinder affected', 'Step 8 spark test separates the coil from the plug'],
            action: 'Swap coils 1 ↔ 2 and see if the misfire follows (shop practice)',
          },
          {
            label: 'Fuel injector, cylinder 1',
            score: 0.2,
            evidence: ['Fuel trims are normal (+1 to +3 %), so a lean cylinder is less likely'],
            action: 'Steps 10–11: injector terminal voltage and injector check',
          },
          {
            label: 'Low compression, cylinder 1',
            score: 0.1,
            evidence: ['No mechanical noise reported; misfire is load-dependent, not constant'],
            action: 'Step 9: compression test',
          },
        ],
      };
    }
    case 'lean': {
      if (f.has('pcv'))
        return { headline: 'PCV hose replaced — long-term fuel trim is relearning toward normal.', causes: [], resolved: true };
      const rpm = finite(sim.series(rt, 'rpm'));
      const st = sim.series(rt, 'stft');
      const lt = sim.series(rt, 'ltft');
      const r = sim.series(rt, 'rpm');
      const idle: number[] = [];
      const high: number[] = [];
      for (let i = 0; i < r.length; i++) {
        const tot = st[i] + lt[i];
        if (!Number.isFinite(tot)) continue;
        if (r[i] < 900) idle.push(tot);
        else if (r[i] > 2200) high.push(tot);
      }
      const ti = avg(idle);
      const th = avg(high);
      const tested = high.length > 20;
      return {
        headline: tested
          ? `Total fuel trim falls from ${ti >= 0 ? '+' : ''}${ti.toFixed(0)} % at idle to ${th >= 0 ? '+' : ''}${th.toFixed(0)} % at 2,500 rpm — the pattern of air leaking in after the MAF.`
          : `Total fuel trim is ${ti >= 0 ? '+' : ''}${(ti || 28).toFixed(0)} % at idle. Hold 2,500 rpm to see whether it shrinks with airflow (a leak) or grows (fuel delivery).`,
        causes: [
          {
            label: 'Unmetered air: PCV hose or intake leak',
            score: tested ? 0.88 : 0.7,
            evidence: [
              'Last visit noted hardened PCV hoses',
              tested
                ? 'Trim improves as airflow rises, so the extra air is a fixed leak'
                : 'Idle MAF reads low (about 2.1 g/s) while trims add fuel',
              rpm.length ? 'Rough, hunting idle' : 'Rough idle reported',
            ],
            action: 'Repair manual steps 2–3: PCV hose connections, then intake system',
          },
          {
            label: 'Dirty or failing MAF meter',
            score: tested ? 0.22 : 0.38,
            evidence: ['A low-reading MAF also leans the mixture, but usually at every speed'],
            action: 'Step 6: MAF at 3,000 rpm should read 5.0–10.0 g/s',
          },
          {
            label: 'Low fuel pressure',
            score: 0.14,
            evidence: ['Would make trims worse at higher load, the opposite of what we see'],
            action: 'Step 7: fuel pressure check',
          },
          {
            label: 'A/F sensor',
            score: 0.08,
            evidence: ['The injection-volume active test shows the sensor responding normally'],
            action: 'Step 4: injection-volume active test',
          },
        ],
      };
    }
    case 'canSkid': {
      if (f.has('branch'))
        return {
          headline: 'CAN branch repaired — the skid control ECU is answering again. Clear the U0129 history codes.',
          causes: [],
          resolved: true,
        };
      return {
        headline:
          'Every ECU answers except the skid control ECU, and four ECUs independently report losing it (U0129). The main line is fine; the problem is on its branch.',
        causes: [
          {
            label: 'Open CAN branch to the skid control ECU (A41)',
            score: 0.84,
            evidence: [
              'Lights came on right after a front-end body repair (customer-reported)',
              'Both terminators are on the bus: the ECM and the meter still talk, so the main line is intact',
              'Skid control is the only ECU on the No. 2 junction connector’s branch',
            ],
            action: 'Repair manual step 2: measure A41-25 ↔ A41-14 (54–69 Ω)',
          },
          {
            label: 'Skid control ECU power (ECU-IG NO. 2) or ground',
            score: 0.36,
            evidence: ['A dead ECU also goes silent; check IG1 / GND1 if the branch measures OK'],
            action: 'Check fuse and A41 power / ground pins',
          },
          {
            label: 'Skid control ECU (brake actuator assembly)',
            score: 0.12,
            evidence: ['Only if the branch and power checks pass'],
            action: 'Replace the brake actuator assembly',
          },
        ],
      };
    }
    case 'battery': {
      if (f.has('battery'))
        return { headline: 'New battery fitted — cranking voltage now stays well above 9.5 V.', causes: [], resolved: true };
      const c = rt.crank;
      return {
        headline: c
          ? `Cranking pulled the battery to ${c.min.toFixed(1)} V — below the 9.5 V level at which the skid control ECU sets C1241 and stops ABS.`
          : 'No codes stored, but C1241 clears itself when voltage recovers. Record a crank test to see how far the battery drops.',
        causes: [
          {
            label: '12 V battery at end of life',
            score: c ? 0.9 : 0.72,
            evidence: [
              'Battery is 6 years old (fitted December 2020)',
              'Tested marginal in July and replacement was declined',
              c ? `Crank minimum ${c.min.toFixed(1)} V` : 'Resting voltage 12.05 V',
            ],
            action: 'Replace the battery, then repeat the crank test',
          },
          {
            label: 'Loose or corroded battery terminals / ground',
            score: 0.25,
            evidence: ['Would also drop voltage under starter load'],
            action: 'Inspect and clean terminals and the engine ground strap',
          },
          {
            label: 'Charging system',
            score: 0.08,
            evidence: ['Charging voltage at idle is normal once running'],
            action: 'Charging check after start',
          },
        ],
      };
    }
    case 'tpms': {
      if (rt.tpms.initialized)
        return { headline: 'New transmitter registered and initialized — all four IDs are reporting.', causes: [], resolved: true };
      return {
        headline:
          'Three transmitters report normally; ID 3 has gone silent. They are the original 2015 sensors, reused when tires were replaced in 2023.',
        causes: [
          {
            label: 'ID 3 transmitter stopped sending (internal battery)',
            score: 0.84,
            evidence: ['About 11 years old', 'IDs match the registration, so it is not a mistyped ID'],
            action: 'Repair manual steps 2–4: identify, check ID, replace',
          },
          {
            label: 'Transmitter damaged during tire service',
            score: 0.22,
            evidence: ['Tires were replaced in 2023 with the sensors reused'],
            action: 'Inspect the valve stem and transmitter body',
          },
          {
            label: 'Radio interference',
            score: 0.06,
            evidence: ['Other three IDs receive fine in the same bay'],
            action: 'Step 1: frequency receiving condition',
          },
        ],
      };
    }
    case 'acLow': {
      if (f.has('acLeak'))
        return {
          headline: 'Leak repaired and system charged — high-side pressure and vent temperature are normal.',
          causes: [],
          resolved: true,
        };
      return {
        headline:
          'High-side pressure is about 0.15 MPa (22 psi) with the compressor held off — under the 176 kPa limit that sets B1423/23. The refrigerant has leaked out.',
        causes: [
          {
            label: 'Refrigerant leak (low charge)',
            score: 0.86,
            evidence: ['Cooling faded over the summer', 'Pressure far below what a charged system shows at shop temperature'],
            action: 'Repair manual steps 3 → 11 → 12: sensor signal, harness, vacuum leak test',
          },
          {
            label: 'Pressure sensor or its circuit',
            score: 0.18,
            evidence: ['Steps 1–3 rule the circuit in or out'],
            action: 'Measure E37-9 (PRE): 0.74–4.62 V',
          },
          {
            label: 'Blocked expansion valve',
            score: 0.06,
            evidence: ['Would usually show with refrigerant present'],
            action: 'Steps 7–8 if the code returns after charging',
          },
        ],
      };
    }
    default:
      return null;
  }
}
