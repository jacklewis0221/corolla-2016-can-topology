import type { SourceKey } from './sources';

/** Fail-safe chart rows (Toyota repair manual, CAN communication system “Fail-safe chart”). */
export interface FailSafeRow {
  fn: string;
  master: string[]; // node ids that run the function
  needs: string[]; // node ids whose CAN data it depends on
  failsafe: string;
  driver: string;
  dtcs: string[];
}

export const FAILSAFE: FailSafeRow[] = [
  { fn: 'Anti-lock brakes (ABS)', master: ['skid'], needs: ['airbag'], failsafe: 'If ABS is working when data is lost it finishes stabilizing, then reverts to normal braking; otherwise ABS control is prohibited.', driver: 'Brake, ABS and slip indicator lights come on.', dtcs: ['U0073', 'U0124'] },
  { fn: 'Vehicle stability & traction control', master: ['skid'], needs: ['ecm', 'airbag', 'steer'], failsafe: 'Active control finishes, then VSC / TRAC are prohibited.', driver: 'Brake, ABS and slip indicator lights come on.', dtcs: ['U0073', 'U0100', 'U0124', 'U0126'] },
  { fn: 'Climate control (coolant temperature)', master: ['ac'], needs: ['ecm'], failsafe: 'Assumes a coolant temperature of 80 °C (176 °F).', driver: '—', dtcs: ['U0100'] },
  { fn: 'Compressor lock detection', master: ['ac'], needs: ['ecm'], failsafe: 'Assumes an engine speed of 0 rpm.', driver: '—', dtcs: ['U0100'] },
  { fn: 'Electrical load limiting', master: ['ac'], needs: ['eps'], failsafe: 'Keeps the last state; no load control after a reset.', driver: '—', dtcs: ['U0131'] },
  { fn: 'Panel dimming', master: ['ac'], needs: ['body'], failsafe: 'Cannot switch between day and night dimming.', driver: '—', dtcs: ['U0142'] },
  { fn: 'Ambient temperature correction', master: ['ac'], needs: ['meter'], failsafe: 'Assumes a vehicle speed of 0 km/h.', driver: 'Displayed outside temperature and airflow correction become less accurate.', dtcs: ['U0155'] },
  { fn: 'A/C status on the display', master: ['radio'], needs: ['ac'], failsafe: 'A/C indicators and set-temperature display turn off.', driver: 'A/C information disappears from the screen.', dtcs: ['U0073', 'U0164'] },
  { fn: 'Fuel consumption screen', master: ['radio'], needs: ['ecm', 'skid'], failsafe: 'The screen stops updating.', driver: '—', dtcs: ['U0100', 'U0129'] },
  { fn: 'Rear view monitor', master: ['radio'], needs: ['ecm', 'body'], failsafe: 'None.', driver: 'The screen does not switch to the camera in reverse.', dtcs: ['U0100'] },
  { fn: 'Door lock automation', master: ['body'], needs: ['ecm', 'airbag', 'meter'], failsafe: 'Uses the last known state; speed- and shift-linked auto lock / unlock stop working.', driver: '—', dtcs: ['U0100', 'U0101', 'U0151', 'U0155'] },
  { fn: 'Display auto-dimming', master: ['body'], needs: ['meter'], failsafe: 'Auto-dimming does not work while the taillights are on.', driver: '—', dtcs: ['U0155'] },
  { fn: 'Daytime running lights', master: ['body'], needs: ['ecm'], failsafe: 'DRL control does not operate.', driver: 'DRLs stay off.', dtcs: ['U0100'] },
  { fn: 'Idle-up for electrical load', master: ['ecm'], needs: ['eps'], failsafe: 'No idle-up for electrical load.', driver: 'Idle speed changes.', dtcs: [] },
  { fn: 'A/C cooperative idle-up', master: ['ecm'], needs: ['ac'], failsafe: 'No cooperative control with the A/C.', driver: 'The A/C does not operate.', dtcs: [] },
  { fn: 'Eco driving indicator', master: ['ecm'], needs: ['meter'], failsafe: '—', driver: 'No eco information is displayed.', dtcs: [] },
  { fn: 'Neutral (idle load) control', master: ['ecm'], needs: ['skid', 'airbag'], failsafe: 'Neutral control is not performed.', driver: '—', dtcs: [] },
  { fn: 'Electric power steering', master: ['eps'], needs: ['ecm', 'skid', 'steer'], failsafe: 'Assist temporarily fixed at the level used at 70 km/h (43 mph); steering-angle compensation stops.', driver: 'EPS warning light; steering feels heavy at low speed.', dtcs: ['U0100', 'U0129'] },
  { fn: 'Speed-sensitive assist', master: ['eps'], needs: ['skid'], failsafe: 'Continues as if driving at 70 km/h (43 mph).', driver: 'Heavy below 70 km/h, light above it; EPS warning light.', dtcs: ['U0129'] },
  { fn: 'Entry & push-button start', master: ['cert'], needs: ['ecm', 'meter', 'body'], failsafe: 'Entry unlock is retried; key warnings stop; cranking stops on the direct-wire engine speed signal.', driver: 'Entry lock / unlock or key warnings may not work.', dtcs: ['U0100', 'U0142', 'U0155'] },
  { fn: 'Dome light (smart key)', master: ['body'], needs: ['cert'], failsafe: 'The dome light is turned off.', driver: 'Dome light does not dim normally after the doors close.', dtcs: ['U0327'] },
  { fn: 'Speedometer', master: ['meter'], needs: ['skid'], failsafe: 'Uses a value of 0.', driver: 'Needle drops to 0 km/h (0 mph); trip computer stops.', dtcs: ['U0129'] },
  { fn: 'Tachometer', master: ['meter'], needs: ['ecm'], failsafe: 'Uses a value of 0.', driver: 'Tachometer reads 0 rpm; trip computer stops.', dtcs: ['U0100'] },
  { fn: 'Coolant temperature gauge', master: ['meter'], needs: ['ecm'], failsafe: 'Uses a value of 0.', driver: 'Gauge reads middle or below / no segments.', dtcs: [] },
  { fn: 'Airbag warning light', master: ['meter'], needs: ['airbag'], failsafe: 'Treats the warning as active.', driver: 'Airbag warning light comes on.', dtcs: ['U0151'] },
  { fn: 'EPS warning light', master: ['meter'], needs: ['eps'], failsafe: 'Treats the warning as active.', driver: 'EPS warning light comes on.', dtcs: ['U0131'] },
  { fn: 'Slip indicator', master: ['meter'], needs: ['skid'], failsafe: 'Treats the indicator as active.', driver: 'Slip indicator comes on.', dtcs: [] },
  { fn: 'Tire pressure warning light', master: ['meter'], needs: ['body'], failsafe: 'Treats the warning as active.', driver: 'Tire pressure warning light comes on.', dtcs: ['U0142'] },
];

export interface Dtc {
  code: string;
  meaning: string;
  about: string | null; // node the code names (null: bus-off)
  storedBy: string[];
  detect: string;
}

export const DTCS: Dtc[] = [
  { code: 'U0073', meaning: 'Control module communication bus off', about: null, storedBy: ['skid', 'radio', 'nav'], detect: 'Skid control ECU: bus off once or more within 5 s. Receivers: no send / receive for 5 s.' },
  { code: 'U0100', meaning: 'Lost communication with ECM / PCM', about: 'ecm', storedBy: ['skid', 'eps', 'body', 'cert', 'ac', 'radio', 'nav', 'meter'], detect: 'Example: skid control ECU gets no ECM data for 2 s at 15 km/h or more.' },
  { code: 'U0101', meaning: 'Lost communication with TCM (transmission data from the ECM)', about: 'ecm', storedBy: ['body'], detect: 'No ECM data for 10 s.' },
  { code: 'U011B', meaning: 'Lost communication with rocker arm control module “A” (Valvematic)', about: 'vvl', storedBy: ['ecm'], detect: 'No data from the Valvematic controller for 0.99 s — a local CAN fault.' },
  { code: 'U0120', meaning: 'Lost communication with starter / generator control module', about: 'cert', storedBy: ['body'], detect: 'No certification ECU data for 10 s.' },
  { code: 'U0124', meaning: 'Lost communication with lateral acceleration sensor module', about: 'airbag', storedBy: ['skid'], detect: 'No airbag sensor data for 1 s at 7 km/h or more, or 10 losses within 60 s.' },
  { code: 'U0126', meaning: 'Lost communication with steering angle sensor module', about: 'steer', storedBy: ['skid'], detect: 'No steering sensor data for 1 s, or 10 losses within 60 s.' },
  { code: 'U0129', meaning: 'Lost communication with brake system control module', about: 'skid', storedBy: ['ecm', 'eps', 'radio', 'nav', 'meter'], detect: 'Example: ECM gets no skid control data for 2.22 s; EPS for 2.34 s.' },
  { code: 'U0131', meaning: 'Lost communication with power steering control module', about: 'eps', storedBy: ['ac', 'meter'], detect: 'A/C amplifier: 5 s. Meter: 3 s.' },
  { code: 'U0140', meaning: 'Lost communication with body control module', about: 'body', storedBy: ['cert', 'radio', 'nav'], detect: 'Certification ECU: 3 s. Receivers: 10 s.' },
  { code: 'U0142', meaning: 'Lost communication with body control module “B”', about: 'body', storedBy: ['cert', 'ac', 'meter'], detect: 'A/C amplifier: 5 s. Others: 10 s.' },
  { code: 'U0151', meaning: 'Lost communication with restraints control module', about: 'airbag', storedBy: ['body', 'meter'], detect: 'No airbag sensor data for 10 s.' },
  { code: 'U0155', meaning: 'Lost communication with instrument panel cluster', about: 'meter', storedBy: ['body', 'cert', 'ac', 'radio', 'nav'], detect: 'A/C amplifier: 5 s. Others: 10 s.' },
  { code: 'U0164', meaning: 'Lost communication with HVAC control module', about: 'ac', storedBy: ['body', 'radio', 'nav'], detect: 'No A/C amplifier data for 10 s.' },
  { code: 'U0327', meaning: 'Software incompatibility with vehicle security control module', about: 'cert', storedBy: ['body'], detect: 'No certification ECU data for 10 s.' },
];

/** LIN-side codes stored by the gateway (master) ECUs. */
export const LIN_DTCS = [
  { code: 'B2321', meaning: 'Driver door motor ECU communication stop', storedBy: 'body', about: 'pwm' },
  { code: 'B1273', meaning: 'Sliding roof ECU communication stop', storedBy: 'body', about: 'roof' },
  { code: 'B2325', meaning: 'LIN communication bus malfunction (door bus)', storedBy: 'body', about: null },
  { code: 'B2785', meaning: 'Communication malfunction between ECUs connected by LIN', storedBy: 'cert', about: null },
  { code: 'B2786', meaning: 'No response from steering lock ECU', storedBy: 'cert', about: 'slock' },
  { code: 'B2789', meaning: 'No response from ID code box', storedBy: 'cert', about: 'idbox' },
  { code: 'B278C', meaning: 'Lost communication with power source control', storedBy: 'cert', about: null },
] as const;

/** DTCs an ECU logs about everyone else when its own branch line is cut (communication stop mode table). */
export const STOP_MODE_SELF: Record<string, string[]> = {
  skid: ['U0073', 'U0100', 'U0124', 'U0126'],
  ac: ['U0100', 'U0131', 'U0142', 'U0155'],
  radio: ['U0100', 'U0129', 'U0140', 'U0155', 'U0164'],
  nav: ['U0100', 'U0129', 'U0140', 'U0155', 'U0164'],
  cert: ['U0100', 'U0140', 'U0142', 'U0155'],
  eps: ['U0100', 'U0129'],
  body: ['U0100', 'U0101', 'U0120', 'U0151', 'U0155', 'U0164', 'U0327'],
};

export const DLC3_PINS: { pin: number; name: string; desc: string; to?: string; net?: 'can' | 'serial' | 'power' }[] = [
  { pin: 1, name: 'OP4', desc: 'Occupant detection service line', to: 'ods', net: 'serial' },
  { pin: 4, name: 'CG', desc: 'Chassis ground (W-B)', net: 'power' },
  { pin: 5, name: 'SG', desc: 'Signal ground (BR)', net: 'power' },
  { pin: 6, name: 'CANH', desc: 'CAN high (R) → No. 3 J/C E55-11', to: 'jc3', net: 'can' },
  { pin: 7, name: 'SIL', desc: 'K-line → transponder key ECU, occupant detection ECU', to: 'immo', net: 'serial' },
  { pin: 9, name: 'TAC', desc: 'Engine speed (TACH) from ECM A40-31', to: 'ecm', net: 'serial' },
  { pin: 12, name: 'TS', desc: 'Test input → power steering ECU E40-6', to: 'eps', net: 'serial' },
  { pin: 13, name: 'TC', desc: 'Test / diagnosis input → ECM A40-23', to: 'ecm', net: 'serial' },
  { pin: 14, name: 'CANL', desc: 'CAN low (W) → No. 3 J/C E55-22', to: 'jc3', net: 'can' },
  { pin: 16, name: 'BAT', desc: 'Battery +12 V through the 7.5 A OBD fuse', net: 'power' },
];

/** Resistance checks from the repair manual, modelled with two 120 Ω terminators. */
export interface Probe {
  id: string;
  label: string;
  where: string;
  spec: string;
  fault: Record<FaultId, number | 'OL'>;
}
export type FaultId = 'ok' | 'openMeter' | 'openJc' | 'openEcm' | 'meterOut' | 'ecmOut' | 'short' | 'dlcOpen';

export const FAULTS: { id: FaultId; label: string; explain: string }[] = [
  { id: 'ok', label: 'Healthy bus', explain: 'Both 120 Ω terminators are in circuit. In parallel they read 60 Ω.' },
  { id: 'openMeter', label: 'Main line open · meter side', explain: 'The meter’s terminator is cut off, so the DLC3 only sees the ECM’s 120 Ω.' },
  { id: 'openJc', label: 'Main line open · between J/Cs', explain: 'The DLC3 sits on the No. 3 J/C, so it now sees only the meter’s 120 Ω.' },
  { id: 'openEcm', label: 'Main line open · ECM side', explain: 'The ECM’s terminator is cut off; the meter’s 120 Ω remains.' },
  { id: 'meterOut', label: 'Meter unplugged', explain: 'Measuring the harness side of the meter connector reads through the bus to the ECM terminator only.' },
  { id: 'ecmOut', label: 'ECM unplugged', explain: 'Measuring the harness side of the ECM connector reads through the bus to the meter terminator only.' },
  { id: 'short', label: 'CANH shorted to CANL', explain: 'A short collapses the reading toward 0 Ω — every ECU loses the bus.' },
  { id: 'dlcOpen', label: 'DLC3 branch open', explain: 'The bus is fine but the scan tool cannot reach it. No ECU stores a DTC for this branch.' },
];

export const PROBES: Probe[] = [
  {
    id: 'dlc',
    label: 'DLC3 pins 6 ↔ 14',
    where: 'Battery disconnected, everything plugged in',
    spec: '54–69 Ω normal · ≥ 70 Ω open main line · < 54 Ω short',
    fault: { ok: 60, openMeter: 120, openJc: 120, openEcm: 120, meterOut: 120, ecmOut: 120, short: 0.4, dlcOpen: 'OL' },
  },
  {
    id: 'meterConn',
    label: 'Meter connector E43-32 ↔ E43-31',
    where: 'Meter unplugged, harness side',
    spec: '108–132 Ω (only the ECM terminator remains)',
    fault: { ok: 120, openMeter: 'OL', openJc: 'OL', openEcm: 'OL', meterOut: 120, ecmOut: 'OL', short: 0.4, dlcOpen: 120 },
  },
  {
    id: 'ecmConn',
    label: 'ECM connector A40-13 ↔ A40-26',
    where: 'ECM unplugged, harness side',
    spec: '108–132 Ω (only the meter terminator remains)',
    fault: { ok: 120, openMeter: 'OL', openJc: 'OL', openEcm: 'OL', meterOut: 'OL', ecmOut: 120, short: 0.4, dlcOpen: 120 },
  },
  {
    id: 'branch',
    label: 'A/C amplifier connector E37-11 ↔ E37-12',
    where: 'A/C amplifier unplugged, harness side',
    spec: '54–69 Ω (a branch sees both terminators)',
    fault: { ok: 60, openMeter: 120, openJc: 120, openEcm: 120, meterOut: 120, ecmOut: 120, short: 0.4, dlcOpen: 60 },
  },
];

export const DIAG_SOURCES: SourceKey[] = ['rmFailSafe', 'rmDiagnosis', 'rmOpenMain', 'rmShort', 'ewdDlc3', 'ncfCanDetails'];
