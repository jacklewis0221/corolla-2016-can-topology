import {
  Activity,
  ArrowRight,
  ArrowUpRight,
  ClipboardList,
  LayoutDashboard,
  LayoutGrid,
  Network,
  Wrench,
  type LucideIcon,
} from 'lucide-react';
import { SOURCES } from '../data/sources';
import { SectionHead } from './ui';
import shotDark from '../assets/service-console-dark.webp';
import shotLight from '../assets/service-console-light.webp';

const TOOL = './service-tool.html';

/** Feature cards deep-link into the console with ?view=&vehicle= (see src/tool/App.tsx). */
const FEATURES: { view: string; vehicle?: string; icon: LucideIcon; title: string; body: string }[] = [
  {
    view: 'floor',
    icon: LayoutDashboard,
    title: 'Every car in the shop at once',
    body: 'Eight Corollas stream over wireless adapters on their DLC3 ports. The console sees their trouble codes, live readings and Wi-Fi links side by side.',
  },
  {
    view: 'live',
    vehicle: 'road',
    icon: Activity,
    title: 'Live sensors',
    body: 'Engine and wheel speed are already broadcast on the bus, so they are free to read. Coolant temperature, fuel trims and misfire counts have to be requested.',
  },
  {
    view: 'codes',
    vehicle: 'bay3',
    icon: Wrench,
    title: 'Guided fixes',
    body: 'Six trouble codes walk through the repair manual’s own checks and specified values, from a cylinder misfire to a skid control ECU that went quiet.',
  },
  {
    view: 'bus',
    vehicle: 'bay3',
    icon: Network,
    title: 'Bus monitor',
    body: 'Raw frames decoded bit by bit with this atlas’s message dictionary, with a callout when a module’s IDs stop arriving.',
  },
  {
    view: 'maint',
    vehicle: 'bay5',
    icon: ClipboardList,
    title: 'Maintenance with the customer',
    body: 'The 2016 maintenance schedule, a multipoint inspection and an estimate the customer approves line by line, with warranty and ToyotaCare coverage.',
  },
  {
    view: 'pages',
    vehicle: 'road',
    icon: LayoutGrid,
    title: 'Service pages you build',
    body: 'Drag-and-drop pages from 14 widgets and 8 templates, saved to a file you can hand to another technician.',
  },
];

/** The hops between one car and the console. Adapter, Wi-Fi and console are part of the concept; the bus and DLC3 pins are documented. */
const HOPS: { title: string; detail: string; via?: string }[] = [
  { title: 'CAN V bus', detail: '500 kbit/s, every module' },
  { title: 'Wireless adapter', detail: 'One per car, on the DLC3 port', via: 'DLC3 pins 6 and 14' },
  { title: 'Shop access point', detail: 'Three cover the bays and the lot', via: 'Wi-Fi' },
  { title: 'Service console', detail: 'One screen for the whole shop', via: 'Shop network' },
];

const ACCESS: { title: string; body: string }[] = [
  { title: 'Listen-only', body: 'Never transmits. Decodes only what the car already broadcasts, so it cannot disturb it.' },
  {
    title: 'Read session',
    body: 'Sends diagnostic requests (OBD-II to 0x7DF / 0x7E0, answers on 0x7E8) for values that are not broadcast.',
  },
  { title: 'Exclusive control', body: 'Active tests, clearing codes and registering tire sensors. One technician at a time.' },
];

export function ServiceTeaser() {
  return (
    <section className="section section--svc" aria-labelledby="svc-title" id="service">
      <div className="container">
        <div className="svc-head">
          <SectionHead kicker="06 · In the service bay" title="From the wires to the service drive" id="svc-title">
            <p>
              Everything above is what a dealership technician is reaching into when a Corolla rolls in. This concept imagines the desktop
              tool they would use: one console that watches every car in the shop over wireless CAN adapters, reads sensors, follows the
              repair manual to a fix, pulls up the car’s history and builds a maintenance plan with the customer.
            </p>
          </SectionHead>
          <div className="svc-cta">
            <a className="btn btn--accent btn--lg" href={TOOL} data-testid="svc-open">
              Open the service console <ArrowRight size={18} aria-hidden="true" />
            </a>
            <p className="svc-cta__note">
              A design concept, not a Toyota product — Toyota’s dealer software is{' '}
              <a href={SOURCES.techstream.url} target="_blank" rel="noopener noreferrer" data-testid="svc-techstream">
                Techstream
              </a>
              . Vehicles, customers and live values are invented; checks, specifications and the maintenance schedule come from Toyota’s
              published documents.
            </p>
          </div>
        </div>

        <figure className="svc-figure">
          <a className="svc-shot" href={TOOL} tabIndex={-1} aria-hidden="true" data-testid="svc-shot">
            <span className="svc-shot__bar">
              <span className="svc-shot__dots">
                <i />
                <i />
                <i />
              </span>
              <span className="svc-shot__title">Service Console · Shop floor</span>
              <span className="svc-shot__live">
                <span className="svc-shot__pulse" />8 adapters streaming
              </span>
            </span>
            <img
              className="svc-shot__img svc-shot__img--dark"
              src={shotDark}
              width={1680}
              height={1050}
              alt=""
              loading="lazy"
              decoding="async"
            />
            <img
              className="svc-shot__img svc-shot__img--light"
              src={shotLight}
              width={1680}
              height={1050}
              alt=""
              loading="lazy"
              decoding="async"
            />
          </a>
          <figcaption className="sr-only">
            The console’s shop floor: eight Corollas with live engine, speed and battery readings and their trouble codes, a map of the
            shop’s Wi-Fi access points, and an event feed.
          </figcaption>
        </figure>

        <div className="svc-path">
          <div className="svc-path__intro">
            <h3 className="card__title">How it would reach each car</h3>
            <p className="card__hint">The bus and the DLC3 pins are the car’s own; the adapter, Wi-Fi and console are the concept.</p>
          </div>
          <ol className="svc-hops">
            {HOPS.map((h) => (
              <li key={h.title} className="svc-hop">
                {h.via && (
                  <span className="svc-hop__via">
                    <span>{h.via}</span>
                  </span>
                )}
                <span className="svc-hop__node">
                  <b>{h.title}</b>
                  <span>{h.detail}</span>
                </span>
              </li>
            ))}
          </ol>
          <ul className="svc-access" aria-label="Three levels of access">
            {ACCESS.map((a, i) => (
              <li key={a.title} className="svc-access__item">
                <span className="svc-access__lvl" aria-hidden="true">
                  {i + 1}
                </span>
                <span>
                  <b>{a.title}.</b> {a.body}
                </span>
              </li>
            ))}
          </ul>
        </div>

        <ul className="svc-grid">
          {FEATURES.map((f) => (
            <li key={f.view}>
              <a
                className="svc-card"
                href={`${TOOL}?view=${f.view}${f.vehicle ? `&vehicle=${f.vehicle}` : ''}`}
                data-testid={`svc-${f.view}`}
              >
                <span className="svc-card__icon" aria-hidden="true">
                  <f.icon size={20} />
                </span>
                <span className="svc-card__title">
                  {f.title}
                  <ArrowUpRight size={16} aria-hidden="true" className="svc-card__arrow" />
                </span>
                <span className="svc-card__body">{f.body}</span>
              </a>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
