import type { SourceKey } from './sources';
import { NODE_BY_ID, type Option } from './nodes';

export type Medium = 'can' | 'local' | 'lin' | 'serial' | 'wire' | 'rf' | 'video';
export type Layer = 'can' | 'lin' | 'serial' | 'wire' | 'rfvideo';
export type Pt = [number, number];

export interface Edge {
  id: string;
  from: string;
  to: string;
  medium: Medium;
  label: string;
  detail: string;
  main?: boolean;
  /** Schematic route (absolute coordinates in the 1600 × 1000 drawing). */
  route: Pt[];
  requires?: Option[];
  excludes?: Option[];
  sources: SourceKey[];
}

export const MEDIUM_LAYER: Record<Medium, Layer> = {
  can: 'can',
  local: 'can',
  lin: 'lin',
  serial: 'serial',
  wire: 'wire',
  rf: 'rfvideo',
  video: 'rfvideo',
};

export const MEDIUM_LABEL: Record<Medium, string> = {
  can: 'CAN “V bus” · 500 kbit/s twisted pair',
  local: 'Local CAN (LE Eco engine bus)',
  lin: 'LIN · single wire · ≤ 20 kbit/s',
  serial: 'Serial & diagnostic lines',
  wire: 'Hard-wired signal',
  rf: 'Radio link',
  video: 'Analog video',
};

export const LAYER_LABEL: Record<Layer, string> = {
  can: 'CAN',
  lin: 'LIN',
  serial: 'Serial & diag',
  wire: 'Hard-wired',
  rfvideo: 'Radio & video',
};

// ── geometry helpers (schematic) ──
function box(id: string) {
  const n = NODE_BY_ID[id];
  if (!n) throw new Error(`unknown node ${id}`);
  const [w, h] = n.size ?? [156, 76];
  const [x, y] = n.pos.s;
  return { x, y, w, h, l: x - w / 2, r: x + w / 2, t: y - h / 2, b: y + h / 2 };
}
const T = (id: string, dx = 0): Pt => [box(id).x + dx, box(id).t];
const B = (id: string, dx = 0): Pt => [box(id).x + dx, box(id).b];
const L = (id: string, dy = 0): Pt => [box(id).l, box(id).y + dy];
const R = (id: string, dy = 0): Pt => [box(id).r, box(id).y + dy];

const jc3 = box('jc3');
const jc2 = box('jc2');

/** Vertical branch from a node to the top or bottom edge of a junction bar. */
function branch(id: string, jc: ReturnType<typeof box>): Pt[] {
  const n = box(id);
  return n.y < jc.y ? [[n.x, n.b], [n.x, jc.t]] : [[n.x, n.t], [n.x, jc.b]];
}

const CAN_SRC: SourceKey[] = ['ewdCan', 'rmCanDescription', 'ncfCanDiagram'];

export const EDGES: Edge[] = [
  // ───────── V bus main line (terminated at both ends) ─────────
  {
    id: 'main-meter',
    from: 'meter',
    to: 'jc3',
    medium: 'can',
    main: true,
    label: 'Main line · meter end',
    detail: 'Combination meter E43-32 (CANH, LG) / E43-31 (CANL, W) ↔ No. 3 J/C E55-4 / E55-15. The meter holds a 120 Ω terminator.',
    route: [R('meter'), [jc3.l, jc3.y]],
    sources: [...CAN_SRC, 'rmOpenMain'],
  },
  {
    id: 'main-jc',
    from: 'jc3',
    to: 'jc2',
    medium: 'can',
    main: true,
    label: 'Main line · J/C to J/C',
    detail: 'No. 3 J/C E55-1 / E55-12 ↔ inline connector AE4-7 / AE4-8 (L / W) ↔ No. 2 J/C A39-4 / A39-15.',
    route: [[jc3.r, jc3.y], [jc2.l, jc2.y]],
    sources: [...CAN_SRC, 'rmOpenMain'],
  },
  {
    id: 'main-ecm',
    from: 'jc2',
    to: 'ecm',
    medium: 'can',
    main: true,
    label: 'Main line · ECM end',
    detail: 'No. 2 J/C A39-6 / A39-17 ↔ ECM A40-13 (CANH, B) / A40-26 (CANL, W). The ECM holds the second 120 Ω terminator.',
    route: [[jc2.r, jc2.y], L('ecm')],
    sources: [...CAN_SRC, 'rmOpenMain'],
  },
  // ───────── V bus branch lines ─────────
  {
    id: 'br-dlc3',
    from: 'dlc3',
    to: 'jc3',
    medium: 'can',
    label: 'Branch · DLC3',
    detail: 'DLC3 E13-6 (CANH, R) / E13-14 (CANL, W) ↔ No. 3 J/C E55-11 / E55-22. No ECU stores a DTC for this branch.',
    route: branch('dlc3', jc3),
    sources: [...CAN_SRC, 'ewdDlc3'],
  },
  {
    id: 'br-steer',
    from: 'steer',
    to: 'jc3',
    medium: 'can',
    label: 'Branch · steering sensor',
    detail: 'Steering sensor E50-3 (CANH, SB) / E50-2 (CANL, W) ↔ No. 3 J/C E55-10 / E55-21.',
    route: branch('steer', jc3),
    sources: CAN_SRC,
  },
  {
    id: 'br-eps',
    from: 'eps',
    to: 'jc3',
    medium: 'can',
    label: 'Branch · power steering ECU',
    detail: 'Power steering ECU E40-7 (CANH, GR) / E40-8 (CANL, W) ↔ No. 3 J/C E55-9 / E55-20.',
    route: branch('eps', jc3),
    sources: CAN_SRC,
  },
  {
    id: 'br-airbag',
    from: 'airbag',
    to: 'jc3',
    medium: 'can',
    label: 'Branch · airbag sensor',
    detail: 'Airbag sensor E14-13 (CANH, V) / E14-22 (CANL, W) ↔ No. 3 J/C E55-5 / E55-16.',
    route: branch('airbag', jc3),
    sources: CAN_SRC,
  },
  {
    id: 'br-body',
    from: 'body',
    to: 'jc3',
    medium: 'can',
    label: 'Branch · main body ECU',
    detail: 'Main body ECU E31-14 (CANH, B) / E31-13 (CANL, W) ↔ No. 3 J/C E55-8 / E55-19.',
    route: branch('body', jc3),
    sources: CAN_SRC,
  },
  {
    id: 'br-ac',
    from: 'ac',
    to: 'jc3',
    medium: 'can',
    label: 'Branch · A/C amplifier',
    detail: 'A/C amplifier E37-11 (CANH, Y) / E37-12 (CANL, W) ↔ No. 3 J/C E55-2 / E55-13.',
    route: branch('ac', jc3),
    sources: CAN_SRC,
  },
  {
    id: 'br-radio',
    from: 'radio',
    to: 'jc3',
    medium: 'can',
    label: 'Branch · radio & display receiver',
    detail: 'Radio & display receiver E29-9 (CANH, G) / E29-10 (CANL, W) ↔ No. 3 J/C E55-3 / E55-14.',
    route: branch('radio', jc3),
    excludes: ['nav'],
    sources: CAN_SRC,
  },
  {
    id: 'br-nav',
    from: 'nav',
    to: 'jc3',
    medium: 'can',
    label: 'Branch · navigation receiver',
    detail: 'Navigation receiver E67-9 (CANH, G) / E67-10 (CANL, W) ↔ No. 3 J/C E55-3 / E55-14 — the same pins as the radio it replaces.',
    route: branch('nav', jc3),
    requires: ['nav'],
    sources: CAN_SRC,
  },
  {
    id: 'br-cert',
    from: 'cert',
    to: 'jc3',
    medium: 'can',
    label: 'Branch · certification ECU',
    detail: 'Certification ECU E59-14 (CANH, P) / E59-15 (CANL, W) ↔ No. 3 J/C E55-6 / E55-17.',
    route: branch('cert', jc3),
    requires: ['smartKey'],
    sources: CAN_SRC,
  },
  {
    id: 'br-skid',
    from: 'skid',
    to: 'jc2',
    medium: 'can',
    label: 'Branch · skid control ECU',
    detail: 'Skid control ECU A41-25 (CANH, V) / A41-14 (CANL, W) ↔ No. 2 J/C A39-5 / A39-16.',
    route: branch('skid', jc2),
    sources: CAN_SRC,
  },
  // ───────── LE Eco local CAN ─────────
  {
    id: 'lc-ecm',
    from: 'ecm',
    to: 'jc1',
    medium: 'local',
    label: 'Local CAN · ECM',
    detail: 'ECM B33-61 (CAN+, B) / B33-62 (CAN−, GR) ↔ No. 1 CAN J/C A35. A separate bus from the V bus; the ECM bridges the two.',
    route: [B('ecm'), T('jc1')],
    requires: ['eco'],
    sources: ['ewdCan', 'ewdEngineEco'],
  },
  {
    id: 'lc-vvl',
    from: 'jc1',
    to: 'vvl',
    medium: 'local',
    label: 'Local CAN · Valvematic controller',
    detail: 'No. 1 CAN J/C A36 ↔ continuously variable valve lift controller B40-4 (CAN+, L) / B40-2 (CAN−, GR).',
    route: [B('jc1', -30), [box('jc1').x - 30, 724], [box('vvl').x, 724], T('vvl')],
    requires: ['eco'],
    sources: ['ewdCan', 'ewdEngineEco'],
  },
  {
    id: 'lc-gen',
    from: 'jc1',
    to: 'genecu',
    medium: 'local',
    label: 'Local CAN · generator control ECU',
    detail: 'No. 1 CAN J/C A37 ↔ generator control ECU A24-3 (CA3P, R) / A24-2 (CA3N, GR).',
    route: [B('jc1', 30), [box('jc1').x + 30, 724], [box('genecu').x, 724], T('genecu')],
    requires: ['eco'],
    sources: ['ewdCan', 'ewdChargingEco'],
  },
  // ───────── LIN sub-buses ─────────
  {
    id: 'lin-pwm',
    from: 'body',
    to: 'pwm',
    medium: 'lin',
    label: 'Door LIN bus · driver window',
    detail: 'Main body ECU LIN2 (MB-16) → driver-side junction block 3C-52 → power window motor H9-9. Main body ECU is the master.',
    route: [B('body'), [box('body').x, 800], [box('pwm').x, 800], T('pwm')],
    sources: ['ncfLinDiagram', 'ewdPowerWindow', 'rmDoorLin'],
  },
  {
    id: 'lin-roof',
    from: 'body',
    to: 'roof',
    medium: 'lin',
    label: 'Door LIN bus · sliding roof',
    detail: 'Junction block 3C-53 → sliding roof ECU O6-11 (MPX1). Same LIN wire as the driver window motor.',
    route: [B('body'), [box('body').x, 800], [box('roof').x, 800], T('roof')],
    requires: ['roof'],
    sources: ['ncfLinDiagram', 'ewdSunroof', 'rmLinDtc'],
  },
  {
    id: 'lin-ac',
    from: 'ac',
    to: 'acpanel',
    medium: 'lin',
    label: 'A/C LIN bus',
    detail: 'A/C amplifier E37-37 (LIN1) ↔ A/C control assembly E16-6 (LIN1). The amplifier is the master.',
    route: [B('ac'), [box('ac').x, 812], [box('acpanel').x, 812], T('acpanel')],
    sources: ['ncfLinDiagram', 'ewdAc'],
  },
  {
    id: 'lin-idbox',
    from: 'cert',
    to: 'idbox',
    medium: 'lin',
    label: 'Certification LIN bus · ID code box',
    detail: 'Certification ECU E59-17 ↔ ID code box E56-2 on a shared LIN wire.',
    route: [B('cert'), [box('cert').x, 800], [box('idbox').x, 800], T('idbox')],
    requires: ['smartKey'],
    sources: ['ncfLinDiagram', 'ewdSmartKey', 'rmCertLin'],
  },
  {
    id: 'lin-slock',
    from: 'cert',
    to: 'slock',
    medium: 'lin',
    label: 'Certification LIN bus · steering lock',
    detail: 'Certification ECU E59-17 ↔ steering lock ECU E61-5 — the same LIN wire as the ID code box.',
    route: [B('cert'), [box('cert').x, 800], [box('slock').x, 800], T('slock')],
    requires: ['smartKey'],
    sources: ['ncfLinDiagram', 'ewdSmartKey', 'rmCertLin'],
  },
  {
    id: 'lin-gen',
    from: 'genecu',
    to: 'gen',
    medium: 'lin',
    label: 'Generator LIN',
    detail: 'Generator control ECU A24-6 (LIN1) → generator regulator B37-1: the voltage request.',
    route: [B('genecu'), T('gen')],
    requires: ['eco'],
    sources: ['ewdChargingEco', 'ncfCharging'],
  },
  // ───────── Serial and diagnostic lines ─────────
  {
    id: 'ser-rcv',
    from: 'rcv',
    to: 'body',
    medium: 'serial',
    label: 'Receiver serial · keyless entry',
    detail: 'Door control receiver L25-3 (PRG) / L25-2 (RDA) ↔ main body ECU E31-4 / E31-16. Shared with the TPMS receiver.',
    route: [R('rcv', -8), L('body', -8)],
    excludes: ['smartKey'],
    sources: ['ewdWireless', 'ewdTpms'],
  },
  {
    id: 'ser-tpms',
    from: 'tpms',
    to: 'body',
    medium: 'serial',
    label: 'Receiver serial · TPMS',
    detail: 'TPMS ECU & receiver PRG / RDA ↔ main body ECU E31-4 / E31-16. The main body ECU puts tire-pressure warnings on CAN.',
    route: [R('tpms'), [262, box('tpms').y], [262, box('body').y + 10], L('body', 10)],
    sources: ['ewdTpms', 'ncfTpms'],
  },
  {
    id: 'ser-immo',
    from: 'immo',
    to: 'ecm',
    medium: 'serial',
    label: 'Immobiliser link',
    detail: 'Transponder key ECU E25-12 (EFII) / E25-13 (EFIO) ↔ ECM A40-29 (IMO) / A40-28 (IMI). A dedicated two-wire code exchange, not CAN.',
    route: [R('immo'), [box('ecm').x, box('immo').y], T('ecm')],
    excludes: ['smartKey'],
    sources: ['ewdImmobiliser', 'ncfImmobiliser'],
  },
  {
    id: 'ser-idbox',
    from: 'idbox',
    to: 'ecm',
    medium: 'serial',
    label: 'Immobiliser link (smart key)',
    detail: 'ID code box E56-3 (EFII) / E56-4 (EFIO) ↔ ECM A40-29 (IMO) / A40-28 (IMI).',
    route: [B('idbox'), [box('idbox').x, 968], [1240, 968], [1240, 596], [1345, 596], [1345, box('ecm').b]],
    requires: ['smartKey'],
    sources: ['ewdSmartKey', 'ncfSmartKey'],
  },
  {
    id: 'ser-ods',
    from: 'ods',
    to: 'airbag',
    medium: 'serial',
    label: 'Occupant classification link',
    detail: 'Occupant detection ECU ↔ airbag sensor on dedicated lines (L47-12 / L47-13 ↔ S2-7 / S2-4): passenger classification for the passenger airbags.',
    route: [L('ods'), R('airbag')],
    sources: ['ewdSeatbelt', 'ncfOcs', 'ncfAirbag'],
  },
  {
    id: 'kl-immo',
    from: 'dlc3',
    to: 'immo',
    medium: 'serial',
    label: 'K-line (DLC3 pin 7)',
    detail: 'DLC3 E13-7 (SIL) ↔ transponder key ECU E25-9. Techstream reaches non-CAN ECUs on this single-wire serial line.',
    route: [T('dlc3', -20), [box('dlc3').x - 20, 168], [box('immo').x, 168], T('immo')],
    excludes: ['smartKey'],
    sources: ['ewdDlc3', 'ewdImmobiliser'],
  },
  {
    id: 'kl-ods',
    from: 'dlc3',
    to: 'ods',
    medium: 'serial',
    label: 'K-line (DLC3 pin 7)',
    detail: 'DLC3 E13-7 (SIL) ↔ occupant detection ECU S2-2 (DIA).',
    route: [T('dlc3', -20), [box('dlc3').x - 20, 168], [box('ods').x, 168], T('ods')],
    sources: ['ewdDlc3', 'ewdSeatbelt'],
  },
  {
    id: 'dg-ts',
    from: 'dlc3',
    to: 'eps',
    medium: 'serial',
    label: 'TS terminal',
    detail: 'DLC3 E13-12 (TS) ↔ power steering ECU E40-6 (TS): a test-mode input used during EPS calibration.',
    route: [T('dlc3', 20), [box('dlc3').x + 20, 196], [box('eps').x, 196], T('eps')],
    sources: ['ewdDlc3', 'ewdEps'],
  },
  {
    id: 'dg-tc',
    from: 'dlc3',
    to: 'ecm',
    medium: 'serial',
    label: 'TC and TAC terminals',
    detail: 'DLC3 E13-13 (TC) ↔ ECM A40-23 (TC); DLC3 E13-9 ↔ ECM A40-31 (TACH). TC puts systems into flash-code / test modes.',
    route: [T('dlc3', -40), [box('dlc3').x - 40, 140], [1490, 140], [1490, box('ecm').t]],
    sources: ['ewdDlc3', 'ewdEngine'],
  },
  // ───────── Hard-wired signal shown on the map ─────────
  {
    id: 'hw-sp1',
    from: 'skid',
    to: 'meter',
    medium: 'wire',
    label: 'Speed pulse (SP1)',
    detail: 'Skid control ECU A41-11 (SP1) → combination meter E43-5: a hard-wired vehicle speed signal alongside the CAN data.',
    route: [L('skid', 12), [1040, box('skid').y + 12], [1040, 610], [222, 610], [222, box('meter').b]],
    sources: ['ewdBrake', 'ewdMeter'],
  },
  // ───────── Radio and video ─────────
  {
    id: 'rf-fob',
    from: 'fob',
    to: 'rcv',
    medium: 'rf',
    label: 'Key fob radio',
    detail: 'Lock, unlock, panic and trunk commands with a rolling ID code, received by the door control receiver.',
    route: [B('fob'), T('rcv')],
    excludes: ['smartKey'],
    sources: ['ncfWireless'],
  },
  {
    id: 'rf-valves',
    from: 'valves',
    to: 'tpms',
    medium: 'rf',
    label: 'Tire valve radio',
    detail: 'Each valve transmitter sends pressure, temperature and its ID code to the TPMS ECU & receiver.',
    route: [T('valves'), B('tpms')],
    sources: ['ncfTpms'],
  },
  {
    id: 'vid-radio',
    from: 'camera',
    to: 'radio',
    medium: 'video',
    label: 'Rear camera video',
    detail: 'Rear television camera L35-3 (CV+) / L35-2 (CV−) → receiver E30-12 / E30-24; power CB+ L35-6 ← E30-11.',
    route: [T('camera'), [box('camera').x, 822], [box('radio').x + 20, 822], B('radio', 20)],
    excludes: ['nav'],
    sources: ['ewdAudio', 'ncfRearCamera'],
  },
  {
    id: 'vid-nav',
    from: 'camera',
    to: 'nav',
    medium: 'video',
    label: 'Rear camera video',
    detail: 'Rear television camera CV+ / CV− → navigation receiver E68-12 / E68-24; power CB+ ← E68-11.',
    route: [T('camera'), [box('camera').x, 822], [box('nav').x + 20, 822], B('nav', 20)],
    requires: ['nav'],
    sources: ['ewdAudio', 'ncfRearCamera'],
  },
];

export const EDGE_BY_ID: Record<string, Edge> = Object.fromEntries(EDGES.map((e) => [e.id, e]));
