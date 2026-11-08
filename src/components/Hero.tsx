import { ArrowDown, Play } from 'lucide-react';
import { MESSAGES } from '../data/messages';

const BUS = ['Meter', 'DLC3', 'Steering', 'EPS', 'Airbag', 'Body ECU', 'A/C', 'Radio', 'Skid ctrl', 'ECM'];

function scrollTo(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

export function Hero() {
  return (
    <section className="hero" aria-labelledby="hero-title">
      <div className="container hero__inner">
        <p className="kicker">2016 Toyota Corolla LE · E170 · in-vehicle network</p>
        <h1 id="hero-title" className="hero__title">
          How a Corolla <span className="hero__accent">talks to itself</span>
        </h1>
        <p className="hero__lede">
          An interactive map of the car’s CAN network — every control module, junction connector, LIN sub-bus, sensor and display —
          drawn from Toyota’s factory service documents and the open-source CAN databases that decode it.
        </p>
        <div className="hero__cta">
          <button className="btn btn--accent btn--lg" onClick={() => scrollTo('network-stage')} data-testid="cta-explore">
            Explore the network <ArrowDown size={18} aria-hidden="true" />
          </button>
          <button className="btn btn--lg" onClick={() => scrollTo('scenario-stage')} data-testid="cta-scenario">
            <Play size={17} aria-hidden="true" /> Play a scenario
          </button>
        </div>

        <svg className="hero__bus" viewBox="0 0 1200 150" role="img" aria-label="Ten stations on one shared CAN bus, with a frame travelling from the ECM">
          <line x1="40" x2="1160" y1="96" y2="96" className="hb-h" />
          <line x1="40" x2="1160" y1="96" y2="96" className="hb-l" />
          {BUS.map((b, i) => {
            const x = 70 + i * 117.8;
            return (
              <g key={b} transform={`translate(${x},0)`}>
                <line x1="0" x2="0" y1="52" y2="96" className="hb-tap" />
                <rect x="-46" y="20" width="92" height="34" rx="9" className={`hb-node${i === 0 || i === BUS.length - 1 ? ' is-term' : ''}`} />
                <text x="0" y="42" textAnchor="middle" className="hb-text">
                  {b}
                </text>
              </g>
            );
          })}
          <g className="hb-packet">
            <circle r="16" className="hb-glow" cy="96" />
            <circle r="7" className="hb-dot" cy="96" />
          </g>
          <g className="hb-packet hb-packet--2">
            <circle r="16" className="hb-glow" cy="96" />
            <circle r="7" className="hb-dot" cy="96" />
          </g>
          <text x="40" y="136" className="hb-cap">
            120 Ω
          </text>
          <text x="1160" y="136" textAnchor="end" className="hb-cap">
            120 Ω
          </text>
          <text x="600" y="136" textAnchor="middle" className="hb-cap">
            one twisted pair · every module hears every frame
          </text>
        </svg>

        <dl className="kpis">
          <div>
            <dt>Main bus speed</dt>
            <dd>
              500 <small>kbit/s</small>
            </dd>
          </div>
          <div>
            <dt>Modules on CAN, base LE</dt>
            <dd>9</dd>
          </div>
          <div>
            <dt>Terminators · ECM & meter</dt>
            <dd>
              2 × 120 <small>Ω</small>
            </dd>
          </div>
          <div>
            <dt>Time per bit</dt>
            <dd>
              2 <small>µs</small>
            </dd>
          </div>
          <div>
            <dt>LIN sub-buses, base LE</dt>
            <dd>2</dd>
          </div>
          <div>
            <dt>CAN IDs catalogued</dt>
            <dd>{MESSAGES.length}</dd>
          </div>
        </dl>
      </div>
    </section>
  );
}

export function Primer() {
  const cards = [
    {
      n: '1',
      t: 'One pair of wires, many modules',
      d: 'CAN is a shared party line. Every module on the twisted pair hears every frame; there is no central computer routing traffic.',
    },
    {
      n: '2',
      t: 'Messages are named, not addressed',
      d: 'A frame carries an 11-bit ID such as 0x1C4 (engine speed). Each receiver decides which IDs it needs. If two start at once, the lower ID wins.',
    },
    {
      n: '3',
      t: 'Gateways and sub-buses',
      d: 'Slower one-wire LIN buses hang off gateway ECUs — the main body ECU, A/C amplifier and smart key ECU. Most sensors are still plain wires to one ECU.',
    },
    {
      n: '4',
      t: 'Terminated at both ends',
      d: 'A 120 Ω resistor in the ECM and another in the combination meter stop reflections. Together they read 60 Ω across DLC3 pins 6 and 14.',
    },
  ];
  return (
    <section className="primer" aria-label="How to read this network">
      <div className="container primer__grid">
        {cards.map((c) => (
          <article key={c.n} className="primer__card">
            <span className="primer__n" aria-hidden="true">
              {c.n}
            </span>
            <h3>{c.t}</h3>
            <p>{c.d}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
