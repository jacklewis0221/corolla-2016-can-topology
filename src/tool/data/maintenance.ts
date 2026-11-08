// Toyota's normal-conditions maintenance schedule for the 2016 Corolla, transcribed from the
// 2016 Corolla Warranty & Maintenance Guide (T-MMS-16Corolla). The printed log stops at
// 120,000 miles; beyond that the console repeats the same 120,000-mile pattern (an assumption,
// flagged in the UI). Engine coolant follows the guide's own rule: first at 100,000 miles,
// then every 50,000 miles.

import type { Vehicle } from './fleet';

export interface ServiceItem {
  id: string;
  label: string;
  kind: 'replace' | 'inspect' | 'check';
  why: string;
  price?: number;
}

const BASE: ServiceItem[] = [
  { id: 'mat', label: 'Check installation of driver’s floor mat', kind: 'check', why: 'A loose mat can interfere with the pedals.' },
  { id: 'fluids', label: 'Inspect and adjust all fluid levels', kind: 'check', why: 'Low fluids are the earliest sign of a leak.' },
  { id: 'wipers', label: 'Inspect wiper blades', kind: 'inspect', why: 'Streaking blades reduce visibility in rain and snow.' },
  { id: 'rotate', label: 'Rotate tires', kind: 'replace', why: 'Evens out wear so all four tires last longer.', price: 29.95 },
  {
    id: 'brakesVis',
    label: 'Visually inspect brake linings/drums and brake pads/discs',
    kind: 'inspect',
    why: 'Catches worn pads before they damage rotors.',
  },
];

const OIL: ServiceItem = {
  id: 'oil',
  label: 'Replace engine oil and oil filter (0W-20)',
  kind: 'replace',
  why: 'Fresh 0W-20 protects the engine; capacity with filter is 4.4 qt (owner’s manual). Reset the oil maintenance reminder.',
  price: 89.95,
};

const INSPECT_15: string[] = [
  'Ball joints and dust covers',
  'Brake lines and hoses',
  'Drive shaft boots',
  'Engine coolant',
  'Exhaust pipes and mountings',
  'Radiator and condenser',
  'Steering gear box',
  'Steering linkage and boots',
];

const INSPECT_30: string[] = [
  'Ball joints and dust covers',
  'Brake lines and hoses',
  'Brake linings/drums and pads/discs (thickness and runout)',
  'Drive shaft boots',
  'Engine coolant',
  'Exhaust pipes and mountings',
  'Front differential oil',
  'Fuel lines and connections, fuel tank band and vapor vent hoses',
  'Fuel tank cap gasket',
  'Radiator and condenser',
  'Steering gear box',
  'Steering linkage and boots',
  'Transmission for signs of leakage',
];

export interface ServiceVisit {
  at: number;
  /** Months column printed next to this interval in the guide. */
  months: number;
  items: ServiceItem[];
  inspections: string[];
  notes: string[];
  repeated: boolean;
}

/** Items Toyota lists at a given 5,000-mile interval (normal operating conditions). */
export function serviceAt(at: number, valvematic: boolean): ServiceVisit {
  const repeated = at > 120000;
  const m = ((at - 1) % 120000) + 1; // position inside the printed 120k log
  const items: ServiceItem[] = [...BASE];
  const notes: string[] = [];
  let inspections: string[] = [];
  if (m % 10000 === 0) items.splice(3, 0, OIL);
  else notes.push('If 0W-20 oil was not used at the last oil change, replace engine oil and oil filter.');
  if (m % 30000 === 0) {
    items.splice(
      3,
      0,
      {
        id: 'cabin',
        label: 'Replace cabin air filter',
        kind: 'replace',
        why: 'Keeps airflow strong and helps prevent window fogging.',
        price: 54.95,
      },
      { id: 'airf', label: 'Replace engine air filter', kind: 'replace', why: 'A clogged filter starves the engine of air.', price: 44.95 },
    );
    inspections = [...INSPECT_30];
  } else if (m % 15000 === 0) {
    inspections = [...INSPECT_15];
  }
  // Drive belts: initial inspection at 60,000 miles, then every 15,000 miles.
  if (inspections.length && at >= 60000) inspections.splice(inspections.indexOf('Drive shaft boots'), 0, 'Drive belts');
  if (at >= 100000 && (at - 100000) % 50000 === 0) {
    items.push({
      id: 'coolant',
      label: 'Replace engine coolant (Toyota SLLC)',
      kind: 'replace',
      why: 'Coolant’s corrosion inhibitors wear out; first change at 100,000 mi, then every 50,000 mi.',
      price: 169.0,
    });
  }
  if (m === 120000) {
    items.push({
      id: 'plugs',
      label: 'Replace spark plugs',
      kind: 'replace',
      why: 'Worn plugs cause misfires and poor fuel economy; required under the emission control warranty terms.',
      price: 239.0,
    });
    if (valvematic)
      items.push({
        id: 'vacpump',
        label: 'Replace vacuum pump (vane type) for brake booster',
        kind: 'replace',
        why: 'Listed for the VALVEMATIC (LE Eco) engine only.',
        price: 410.0,
      });
  }
  return { at, months: (at / 5000) * 6, items, inspections, notes, repeated };
}

/** The interval due now: the next 5,000-mile mark, or the one just passed if it was within 1,000 miles. */
export function dueInterval(miles: number): number {
  const next = Math.ceil(miles / 5000) * 5000;
  const prev = next - 5000;
  return miles - prev <= 1000 && prev > 0 ? prev : next;
}

export function upcoming(miles: number, count = 4): number[] {
  const first = dueInterval(miles);
  return Array.from({ length: count }, (_, i) => first + i * 5000);
}

function monthsBetween(a: string, b: Date): number {
  const d = new Date(a + 'T12:00:00');
  return (b.getFullYear() - d.getFullYear()) * 12 + (b.getMonth() - d.getMonth()) + (b.getDate() - d.getDate()) / 30;
}

export interface Coverage {
  label: string;
  limit: string;
  active: boolean;
  remaining: string;
  source: 'maintGuide' | 'toyotaCare';
}

export function coverage(v: Vehicle, today: Date): Coverage[] {
  const mo = monthsBetween(v.inService, today);
  const row = (label: string, months: number, mi: number, source: Coverage['source']): Coverage => {
    const active = mo < months && v.miles < mi;
    const left = active ? `${Math.max(0, Math.floor(months - mo))} mo / ${(mi - v.miles).toLocaleString('en-US')} mi left` : 'Expired';
    return { label, limit: `${months / 12} yr / ${mi.toLocaleString('en-US')} mi`, active, remaining: left, source };
  };
  return [
    row('ToyotaCare scheduled maintenance', 24, 25000, 'toyotaCare'),
    row('Basic warranty', 36, 36000, 'maintGuide'),
    row('Powertrain warranty', 60, 60000, 'maintGuide'),
  ];
}

/** Average miles per month from the visit history (used to forecast the next visits). */
export function milesPerMonth(v: Vehicle, today: Date): number {
  const mo = Math.max(1, monthsBetween(v.inService, today));
  return v.miles / mo;
}

export function forecastDate(v: Vehicle, at: number, today: Date): Date {
  const rate = milesPerMonth(v, today);
  const months = Math.max(0, (at - v.miles) / rate);
  const d = new Date(today);
  d.setDate(d.getDate() + Math.round(months * 30.4));
  return d;
}
