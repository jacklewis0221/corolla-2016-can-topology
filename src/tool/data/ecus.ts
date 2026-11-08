import { NODE_BY_ID } from '../../data/nodes';
import { PRESETS } from '../../lib/model';
import type { PresetKey } from './fleet';

export type AddrBasis = 'obd' | 'openpilot' | 'late' | 'none';

export interface EcuEntry {
  node: string;
  name: string;
  bus: 'V bus' | 'Local CAN' | 'LIN' | 'Serial';
  /** direct: answers on the V bus; gateway: reached through (or reported by) another module. */
  path: 'direct' | 'gateway';
  via?: string;
  req?: number;
  res?: number;
  basis: AddrBasis;
  /** Toyota-style system name used in the health check list. */
  system: string;
}

export const ADDR_NOTE: Record<AddrBasis, string> = {
  obd: 'SAE J1979 standard address',
  openpilot: 'From openpilot’s Corolla firmware query',
  late: 'Late-model Toyota address list; not confirmed on this car',
  none: 'Address not published',
};

const short = (id: string) => NODE_BY_ID[id]?.short ?? id;

const DIRECT: EcuEntry[] = [
  { node: 'ecm', name: short('ecm'), bus: 'V bus', path: 'direct', req: 0x7e0, res: 0x7e8, basis: 'obd', system: 'Engine and ECT' },
  { node: 'skid', name: short('skid'), bus: 'V bus', path: 'direct', req: 0x7b0, res: 0x7b8, basis: 'openpilot', system: 'ABS/VSC/TRAC' },
  {
    node: 'eps',
    name: short('eps'),
    bus: 'V bus',
    path: 'direct',
    req: 0x7a1,
    res: 0x7a9,
    basis: 'openpilot',
    system: 'EMPS (power steering)',
  },
  { node: 'airbag', name: short('airbag'), bus: 'V bus', path: 'direct', req: 0x780, res: 0x788, basis: 'late', system: 'SRS airbag' },
  { node: 'meter', name: short('meter'), bus: 'V bus', path: 'direct', req: 0x7c0, res: 0x7c8, basis: 'late', system: 'Combination meter' },
  { node: 'ac', name: short('ac'), bus: 'V bus', path: 'direct', req: 0x7c4, res: 0x7cc, basis: 'late', system: 'Air conditioner' },
  { node: 'body', name: short('body'), bus: 'V bus', path: 'direct', basis: 'none', system: 'Main body' },
  { node: 'steer', name: short('steer'), bus: 'V bus', path: 'direct', basis: 'none', system: 'Steering angle sensor' },
  { node: 'radio', name: short('radio'), bus: 'V bus', path: 'direct', basis: 'none', system: 'Audio / display' },
  { node: 'nav', name: short('nav'), bus: 'V bus', path: 'direct', basis: 'none', system: 'Navigation' },
  { node: 'cert', name: short('cert'), bus: 'V bus', path: 'direct', basis: 'none', system: 'Smart key' },
];

const SUB: EcuEntry[] = [
  { node: 'tpms', name: short('tpms'), bus: 'Serial', path: 'gateway', via: 'body', basis: 'none', system: 'Tire pressure monitor' },
  { node: 'pwm', name: short('pwm'), bus: 'LIN', path: 'gateway', via: 'body', basis: 'none', system: 'Power window' },
  { node: 'roof', name: short('roof'), bus: 'LIN', path: 'gateway', via: 'body', basis: 'none', system: 'Sliding roof' },
  { node: 'acpanel', name: short('acpanel'), bus: 'LIN', path: 'gateway', via: 'ac', basis: 'none', system: 'A/C control panel' },
  { node: 'idbox', name: short('idbox'), bus: 'LIN', path: 'gateway', via: 'cert', basis: 'none', system: 'ID code box' },
  { node: 'slock', name: short('slock'), bus: 'LIN', path: 'gateway', via: 'cert', basis: 'none', system: 'Steering lock' },
  {
    node: 'immo',
    name: short('immo'),
    bus: 'Serial',
    path: 'gateway',
    via: 'dlc3',
    basis: 'none',
    system: 'Immobiliser (K-line, DLC3 pin 7)',
  },
  { node: 'vvl', name: short('vvl'), bus: 'Local CAN', path: 'gateway', via: 'ecm', basis: 'none', system: 'Valvematic' },
  { node: 'genecu', name: short('genecu'), bus: 'Local CAN', path: 'gateway', via: 'ecm', basis: 'none', system: 'Generator control' },
];

function present(id: string, preset: PresetKey): boolean {
  const n = NODE_BY_ID[id];
  if (!n) return false;
  const o = PRESETS[preset].opts;
  if (n.requires && !n.requires.every((r) => o[r])) return false;
  if (n.excludes && n.excludes.some((r) => o[r])) return false;
  return true;
}

export function ecusFor(preset: PresetKey): EcuEntry[] {
  return [...DIRECT, ...SUB].filter((e) => present(e.node, preset));
}

export function hex3(n: number): string {
  return `0x${n.toString(16).toUpperCase().padStart(3, '0')}`;
}
