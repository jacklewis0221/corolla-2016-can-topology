// Live data items the console can show, and where each one comes from on a real car:
//  - 'can'  : a broadcast frame already on the V bus (decoded with the atlas message layouts; free to read,
//             even in listen-only mode)
//  - 'pid'  : an SAE J1979 / OBD-II mode 01 request (functional 0x7DF or physical 0x7E0 → ECM answers 0x7E8)
//  - 'enh'  : a Toyota data-list item (manufacturer-specific request); names follow the repair manual
//  - 'vci'  : measured by the adapter or a shop accessory, not by the car

export type Group = 'Engine' | 'Fuel & misfire' | 'Transmission' | 'Chassis' | 'Body' | 'Climate' | 'Tires' | 'Electrical';

export type SigSrc =
  | { k: 'can'; id: number; sig: string }
  | { k: 'pid'; pid: number; bytes: 1 | 2; formula: string }
  | { k: 'enh'; path: string; basis: 'rm' | 'illus' }
  | { k: 'vci'; what: string };

export type Conv = 'temp' | 'speed' | 'pressure' | 'mpa' | 'torque';

export interface SigDef {
  id: string;
  label: string;
  short: string;
  group: Group;
  unit: string;
  dec: number;
  min: number;
  max: number;
  ecu: string;
  src: SigSrc;
  alt?: SigSrc;
  conv?: Conv;
  kind?: 'bool' | 'enum';
  enumLabels?: Record<number, string>;
  desc: string;
  /** Normal band where one is published (shown as a shaded band in charts). */
  band?: [number, number];
  bandNote?: string;
}

const pid = (p: number, bytes: 1 | 2, formula: string): SigSrc => ({ k: 'pid', pid: p, bytes, formula });
const can = (id: number, sig: string): SigSrc => ({ k: 'can', id, sig });
const enh = (path: string, basis: 'rm' | 'illus' = 'rm'): SigSrc => ({ k: 'enh', path, basis });

const GAS = 'Powertrain / Engine and ECT / Data List';

export const SIGNALS: SigDef[] = [
  // ── Engine ──
  {
    id: 'rpm',
    label: 'Engine speed',
    short: 'RPM',
    group: 'Engine',
    unit: 'rpm',
    dec: 0,
    min: 0,
    max: 6500,
    ecu: 'ecm',
    src: can(0x1c4, 'RPM'),
    alt: pid(0x0c, 2, '(256A + B) / 4'),
    desc: 'Crankshaft speed. Broadcast by the ECM for the tachometer, EPS, A/C and skid control.',
  },
  {
    id: 'load',
    label: 'Calculated load',
    short: 'Load',
    group: 'Engine',
    unit: '%',
    dec: 0,
    min: 0,
    max: 100,
    ecu: 'ecm',
    src: pid(0x04, 1, '100A / 255'),
    desc: 'How hard the engine is working compared with its peak airflow at this speed.',
  },
  {
    id: 'ect',
    label: 'Coolant temperature',
    short: 'Coolant',
    group: 'Engine',
    unit: '°C',
    dec: 0,
    min: -20,
    max: 120,
    ecu: 'ecm',
    src: pid(0x05, 1, 'A − 40'),
    conv: 'temp',
    band: [75, 100],
    bandNote: 'Warm engine: 75–100 °C (Toyota P0171 procedure, step 5)',
    desc: 'Engine coolant temperature sensor.',
  },
  {
    id: 'iat',
    label: 'Intake air temperature',
    short: 'IAT',
    group: 'Engine',
    unit: '°C',
    dec: 0,
    min: -20,
    max: 80,
    ecu: 'ecm',
    src: pid(0x0f, 1, 'A − 40'),
    conv: 'temp',
    desc: 'Air temperature measured in the mass air flow meter.',
  },
  {
    id: 'maf',
    label: 'Mass air flow',
    short: 'MAF',
    group: 'Engine',
    unit: 'g/s',
    dec: 1,
    min: 0,
    max: 40,
    ecu: 'ecm',
    src: pid(0x10, 2, '(256A + B) / 100'),
    desc: 'Air entering the engine. Toyota’s check: 5.0–10.0 g/s at 3,000 rpm in P or N, A/C off, warm engine.',
  },
  {
    id: 'map',
    label: 'Intake manifold pressure',
    short: 'MAP',
    group: 'Engine',
    unit: 'kPa',
    dec: 0,
    min: 0,
    max: 110,
    ecu: 'ecm',
    src: pid(0x0b, 1, 'A'),
    desc: 'Absolute pressure in the intake manifold; low at idle, near barometric at full throttle.',
  },
  {
    id: 'tps',
    label: 'Throttle position',
    short: 'Throttle',
    group: 'Engine',
    unit: '%',
    dec: 0,
    min: 0,
    max: 100,
    ecu: 'ecm',
    src: pid(0x11, 1, '100A / 255'),
    desc: 'Absolute throttle-valve opening.',
  },
  {
    id: 'accp',
    label: 'Accelerator pedal',
    short: 'Pedal',
    group: 'Engine',
    unit: '%',
    dec: 0,
    min: 0,
    max: 100,
    ecu: 'ecm',
    src: can(0x2c1, 'EACCP'),
    desc: 'Pedal position as broadcast by the ECM (ENG1S01).',
  },
  {
    id: 'etq',
    label: 'Engine torque (actual)',
    short: 'Torque',
    group: 'Engine',
    unit: 'N·m',
    dec: 0,
    min: -20,
    max: 180,
    ecu: 'ecm',
    src: can(0x2c1, 'ETQREAL'),
    conv: 'torque',
    desc: 'Estimated engine torque broadcast for the skid control ECU’s traction control.',
  },
  {
    id: 'timing',
    label: 'Ignition timing advance',
    short: 'Timing',
    group: 'Engine',
    unit: '°',
    dec: 1,
    min: -10,
    max: 50,
    ecu: 'ecm',
    src: pid(0x0e, 1, 'A / 2 − 64'),
    desc: 'Spark advance for cylinder 1, degrees before top dead center.',
  },
  {
    id: 'runtime',
    label: 'Run time since start',
    short: 'Run time',
    group: 'Engine',
    unit: 's',
    dec: 0,
    min: 0,
    max: 7200,
    ecu: 'ecm',
    src: pid(0x1f, 2, '256A + B'),
    desc: 'Seconds since the engine started.',
  },
  {
    id: 'baro',
    label: 'Barometric pressure',
    short: 'Baro',
    group: 'Engine',
    unit: 'kPa',
    dec: 0,
    min: 60,
    max: 110,
    ecu: 'ecm',
    src: pid(0x33, 1, 'A'),
    desc: 'Atmospheric pressure, used to correct fuel and ignition at altitude.',
  },
  {
    id: 'fuel',
    label: 'Fuel level',
    short: 'Fuel',
    group: 'Engine',
    unit: '%',
    dec: 0,
    min: 0,
    max: 100,
    ecu: 'ecm',
    src: pid(0x2f, 1, '100A / 255'),
    desc: 'Fuel tank level input.',
  },
  // ── Fuel & misfire ──
  {
    id: 'stft',
    label: 'Short-term fuel trim B1',
    short: 'STFT',
    group: 'Fuel & misfire',
    unit: '%',
    dec: 1,
    min: -30,
    max: 30,
    ecu: 'ecm',
    src: pid(0x06, 1, '100A / 128 − 100'),
    desc: 'Fast correction that keeps the air-fuel ratio at stoichiometric. Positive = adding fuel.',
  },
  {
    id: 'ltft',
    label: 'Long-term fuel trim B1',
    short: 'LTFT',
    group: 'Fuel & misfire',
    unit: '%',
    dec: 1,
    min: -30,
    max: 30,
    ecu: 'ecm',
    src: pid(0x07, 1, '100A / 128 − 100'),
    desc: 'Learned correction for wear and engine-to-engine differences. Large positive values point to a lean condition.',
  },
  {
    id: 'afs',
    label: 'AFS Voltage B1S1',
    short: 'A/F sensor',
    group: 'Fuel & misfire',
    unit: 'V',
    dec: 2,
    min: 2.5,
    max: 4,
    ecu: 'ecm',
    src: enh(`${GAS} / AFS Voltage B1S1`),
    desc: 'Air-fuel ratio sensor ahead of the catalyst. Below 3.1 V = rich, above 3.4 V = lean during Toyota’s injection-volume active test.',
  },
  {
    id: 'o2s2',
    label: 'O2S B1S2',
    short: 'O2 sensor 2',
    group: 'Fuel & misfire',
    unit: 'V',
    dec: 2,
    min: 0,
    max: 1,
    ecu: 'ecm',
    src: pid(0x15, 2, 'A / 200 (B = 0xFF, trim not used)'),
    alt: enh(`${GAS} / O2S B1S2`),
    desc: 'Oxygen sensor after the catalyst. Above 0.55 V = rich, below 0.4 V = lean during the active test.',
  },
  {
    id: 'mf1',
    label: 'Cylinder #1 Misfire Count',
    short: 'Misfire #1',
    group: 'Fuel & misfire',
    unit: '',
    dec: 0,
    min: 0,
    max: 50,
    ecu: 'ecm',
    src: enh(`${GAS} / Gas Misfire / Cylinder #1 Misfire Count`),
    desc: 'Misfires the ECM has counted on cylinder 1.',
  },
  {
    id: 'mf2',
    label: 'Cylinder #2 Misfire Count',
    short: 'Misfire #2',
    group: 'Fuel & misfire',
    unit: '',
    dec: 0,
    min: 0,
    max: 50,
    ecu: 'ecm',
    src: enh(`${GAS} / Gas Misfire / Cylinder #2 Misfire Count`),
    desc: 'Misfires the ECM has counted on cylinder 2.',
  },
  {
    id: 'mf3',
    label: 'Cylinder #3 Misfire Count',
    short: 'Misfire #3',
    group: 'Fuel & misfire',
    unit: '',
    dec: 0,
    min: 0,
    max: 50,
    ecu: 'ecm',
    src: enh(`${GAS} / Gas Misfire / Cylinder #3 Misfire Count`),
    desc: 'Misfires the ECM has counted on cylinder 3.',
  },
  {
    id: 'mf4',
    label: 'Cylinder #4 Misfire Count',
    short: 'Misfire #4',
    group: 'Fuel & misfire',
    unit: '',
    dec: 0,
    min: 0,
    max: 50,
    ecu: 'ecm',
    src: enh(`${GAS} / Gas Misfire / Cylinder #4 Misfire Count`),
    desc: 'Misfires the ECM has counted on cylinder 4.',
  },
  {
    id: 'mfm',
    label: 'Misfire Margin',
    short: 'Misfire margin',
    group: 'Fuel & misfire',
    unit: '%',
    dec: 0,
    min: 0,
    max: 100,
    ecu: 'ecm',
    src: enh(`${GAS} / Gas Misfire / Misfire Margin`),
    band: [30, 100],
    bandNote: 'Above 30 % is considered normal (Toyota P0300 procedure, step 6)',
    desc: 'How far the engine is from the misfire threshold.',
  },
  // ── Transmission ──
  {
    id: 'gear',
    label: 'Shift position',
    short: 'Gear',
    group: 'Transmission',
    unit: '',
    dec: 0,
    min: 0,
    max: 32,
    ecu: 'ecm',
    src: can(0x3bc, 'GEAR'),
    kind: 'enum',
    enumLabels: { 0: 'D', 1: 'S', 8: 'N', 16: 'R', 32: 'P' },
    desc: 'Selector position broadcast for the meter and the rear camera.',
  },
  {
    id: 'nt',
    label: 'CVT input speed (NT)',
    short: 'Input speed',
    group: 'Transmission',
    unit: 'rpm',
    dec: 0,
    min: 0,
    max: 6500,
    ecu: 'ecm',
    src: can(0x1d0, 'NT'),
    desc: 'Transmission input-shaft speed (ECT1F03).',
  },
  // ── Chassis ──
  {
    id: 'vss',
    label: 'Vehicle speed',
    short: 'Speed',
    group: 'Chassis',
    unit: 'km/h',
    dec: 0,
    min: 0,
    max: 140,
    ecu: 'skid',
    src: can(0x0b4, 'SPEED'),
    alt: pid(0x0d, 1, 'A'),
    conv: 'speed',
    desc: 'Speed computed by the skid control ECU — the value behind the speedometer and EPS assist.',
  },
  {
    id: 'wsFL',
    label: 'Wheel speed FL',
    short: 'FL',
    group: 'Chassis',
    unit: 'km/h',
    dec: 1,
    min: 0,
    max: 140,
    ecu: 'skid',
    src: can(0x0aa, 'WHEEL_SPEED_FL'),
    conv: 'speed',
    desc: 'Front-left wheel speed sensor, via the skid control ECU.',
  },
  {
    id: 'wsFR',
    label: 'Wheel speed FR',
    short: 'FR',
    group: 'Chassis',
    unit: 'km/h',
    dec: 1,
    min: 0,
    max: 140,
    ecu: 'skid',
    src: can(0x0aa, 'WHEEL_SPEED_FR'),
    conv: 'speed',
    desc: 'Front-right wheel speed sensor, via the skid control ECU.',
  },
  {
    id: 'wsRL',
    label: 'Wheel speed RL',
    short: 'RL',
    group: 'Chassis',
    unit: 'km/h',
    dec: 1,
    min: 0,
    max: 140,
    ecu: 'skid',
    src: can(0x0aa, 'WHEEL_SPEED_RL'),
    conv: 'speed',
    desc: 'Rear-left wheel speed sensor, via the skid control ECU.',
  },
  {
    id: 'wsRR',
    label: 'Wheel speed RR',
    short: 'RR',
    group: 'Chassis',
    unit: 'km/h',
    dec: 1,
    min: 0,
    max: 140,
    ecu: 'skid',
    src: can(0x0aa, 'WHEEL_SPEED_RR'),
    conv: 'speed',
    desc: 'Rear-right wheel speed sensor, via the skid control ECU.',
  },
  {
    id: 'brake',
    label: 'Brake pedal',
    short: 'Brake',
    group: 'Chassis',
    unit: '',
    dec: 0,
    min: 0,
    max: 1,
    ecu: 'skid',
    src: can(0x224, 'BRAKE_PRESSED'),
    kind: 'bool',
    enumLabels: { 0: 'Released', 1: 'Pressed' },
    desc: 'Stop-light switch state as broadcast by the skid control ECU.',
  },
  {
    id: 'steer',
    label: 'Steering angle',
    short: 'Steering',
    group: 'Chassis',
    unit: '°',
    dec: 0,
    min: -540,
    max: 540,
    ecu: 'steer',
    src: can(0x025, 'STEER_ANGLE'),
    desc: 'Steering-wheel angle from the steering sensor. Positive = left.',
  },
  {
    id: 'yaw',
    label: 'Yaw rate',
    short: 'Yaw',
    group: 'Chassis',
    unit: '°/s',
    dec: 1,
    min: -40,
    max: 40,
    ecu: 'airbag',
    src: can(0x024, 'YAW_RATE'),
    desc: 'Rotation about the vertical axis, from the sensor inside the airbag sensor assembly.',
  },
  {
    id: 'ax',
    label: 'Longitudinal acceleration',
    short: 'Accel X',
    group: 'Chassis',
    unit: 'm/s²',
    dec: 2,
    min: -8,
    max: 8,
    ecu: 'airbag',
    src: can(0x024, 'ACCEL_X'),
    desc: 'Braking and accelerating force.',
  },
  {
    id: 'ay',
    label: 'Lateral acceleration',
    short: 'Accel Y',
    group: 'Chassis',
    unit: 'm/s²',
    dec: 2,
    min: -8,
    max: 8,
    ecu: 'airbag',
    src: can(0x024, 'ACCEL_Y'),
    desc: 'Cornering force.',
  },
  {
    id: 'epsTq',
    label: 'Driver steering torque',
    short: 'Steer torque',
    group: 'Chassis',
    unit: 'raw',
    dec: 0,
    min: -1000,
    max: 1000,
    ecu: 'eps',
    src: can(0x260, 'STEER_TORQUE_DRIVER'),
    desc: 'Torque sensor in the column (unscaled counts in the open-source DBC).',
  },
  // ── Body ──
  {
    id: 'pbrake',
    label: 'Parking brake',
    short: 'Park brake',
    group: 'Body',
    unit: '',
    dec: 0,
    min: 0,
    max: 1,
    ecu: 'body',
    src: can(0x620, 'PARKING_BRAKE'),
    kind: 'bool',
    enumLabels: { 0: 'Off', 1: 'Set' },
    desc: 'Parking-brake switch, put on CAN by the main body ECU.',
  },
  {
    id: 'belt',
    label: 'Driver belt unlatched',
    short: 'Driver belt',
    group: 'Body',
    unit: '',
    dec: 0,
    min: 0,
    max: 1,
    ecu: 'body',
    src: can(0x620, 'SEATBELT_DRIVER_UNLATCHED'),
    kind: 'bool',
    enumLabels: { 0: 'Latched', 1: 'Unlatched' },
    desc: 'Driver buckle switch.',
  },
  {
    id: 'doorFL',
    label: 'Driver door',
    short: 'Driver door',
    group: 'Body',
    unit: '',
    dec: 0,
    min: 0,
    max: 1,
    ecu: 'body',
    src: can(0x620, 'DOOR_OPEN_FL'),
    kind: 'bool',
    enumLabels: { 0: 'Closed', 1: 'Open' },
    desc: 'Driver door courtesy switch.',
  },
  {
    id: 'lowBeam',
    label: 'Low beam',
    short: 'Low beam',
    group: 'Body',
    unit: '',
    dec: 0,
    min: 0,
    max: 1,
    ecu: 'body',
    src: can(0x622, 'LOW_BEAM'),
    kind: 'bool',
    enumLabels: { 0: 'Off', 1: 'On' },
    desc: 'Headlamp switch state.',
  },
  // ── Climate ──
  {
    id: 'amb',
    label: 'Ambient air temperature',
    short: 'Ambient',
    group: 'Climate',
    unit: '°C',
    dec: 0,
    min: -30,
    max: 50,
    ecu: 'ecm',
    src: pid(0x46, 1, 'A − 40'),
    conv: 'temp',
    desc: 'Outside temperature sensor.',
  },
  {
    id: 'blower',
    label: 'Blower on',
    short: 'Blower',
    group: 'Climate',
    unit: '',
    dec: 0,
    min: 0,
    max: 1,
    ecu: 'ac',
    src: can(0x380, 'BLWON'),
    kind: 'bool',
    enumLabels: { 0: 'Off', 1: 'On' },
    desc: 'Blower state broadcast by the A/C amplifier (ACN1S01).',
  },
  {
    id: 'comp',
    label: 'Compressor request',
    short: 'Compressor',
    group: 'Climate',
    unit: '',
    dec: 0,
    min: 0,
    max: 1,
    ecu: 'ac',
    src: enh('Body Electrical / Air Conditioner / Data List (illustrative item)', 'illus'),
    kind: 'bool',
    enumLabels: { 0: 'Off', 1: 'On' },
    desc: 'Whether the A/C amplifier is asking the compressor to run.',
  },
  {
    id: 'acp',
    label: 'A/C high-side pressure',
    short: 'A/C pressure',
    group: 'Climate',
    unit: 'MPa',
    dec: 2,
    min: 0,
    max: 3.2,
    ecu: 'ac',
    src: enh('Body Electrical / Air Conditioner / Data List (illustrative item)', 'illus'),
    conv: 'mpa',
    band: [0.176, 3.025],
    bandNote: 'B1423/23 sets at ≤ 176 kPa (26 psi) or ≥ 3,025 kPa (439 psi)',
    desc: 'Refrigerant pressure from the sensor on the high-pressure pipe.',
  },
  {
    id: 'evap',
    label: 'Evaporator temperature',
    short: 'Evaporator',
    group: 'Climate',
    unit: '°C',
    dec: 1,
    min: -5,
    max: 40,
    ecu: 'ac',
    src: enh('Body Electrical / Air Conditioner / Data List (illustrative item)', 'illus'),
    conv: 'temp',
    desc: 'Evaporator fin temperature sensor.',
  },
  {
    id: 'vent',
    label: 'Center vent temperature',
    short: 'Vent',
    group: 'Climate',
    unit: '°C',
    dec: 1,
    min: -5,
    max: 45,
    ecu: 'vci',
    src: { k: 'vci', what: 'Wireless probe thermometer in the center vent (shop accessory)' },
    conv: 'temp',
    desc: 'Measured by a probe the technician clips into the vent.',
  },
  // ── Tires ──
  {
    id: 'tp1',
    label: 'ID 1 Tire Inflation Pressure',
    short: 'ID 1',
    group: 'Tires',
    unit: 'kPa',
    dec: 0,
    min: 0,
    max: 320,
    ecu: 'tpms',
    src: enh('Chassis / Tire Pressure Monitor / Data List / ID 1 Tire Inflation Pressure'),
    conv: 'pressure',
    band: [210, 230],
    bandNote: 'Placard: 220 kPa (32 psi) cold for P205/55R16 (2016 owner’s manual)',
    desc: 'Pressure reported by the transmitter registered as ID 1.',
  },
  {
    id: 'tp2',
    label: 'ID 2 Tire Inflation Pressure',
    short: 'ID 2',
    group: 'Tires',
    unit: 'kPa',
    dec: 0,
    min: 0,
    max: 320,
    ecu: 'tpms',
    src: enh('Chassis / Tire Pressure Monitor / Data List / ID 2 Tire Inflation Pressure'),
    conv: 'pressure',
    band: [210, 230],
    bandNote: 'Placard: 220 kPa (32 psi) cold for P205/55R16 (2016 owner’s manual)',
    desc: 'Pressure reported by the transmitter registered as ID 2.',
  },
  {
    id: 'tp3',
    label: 'ID 3 Tire Inflation Pressure',
    short: 'ID 3',
    group: 'Tires',
    unit: 'kPa',
    dec: 0,
    min: 0,
    max: 320,
    ecu: 'tpms',
    src: enh('Chassis / Tire Pressure Monitor / Data List / ID 3 Tire Inflation Pressure'),
    conv: 'pressure',
    band: [210, 230],
    bandNote: 'Placard: 220 kPa (32 psi) cold for P205/55R16 (2016 owner’s manual)',
    desc: 'Pressure reported by the transmitter registered as ID 3.',
  },
  {
    id: 'tp4',
    label: 'ID 4 Tire Inflation Pressure',
    short: 'ID 4',
    group: 'Tires',
    unit: 'kPa',
    dec: 0,
    min: 0,
    max: 320,
    ecu: 'tpms',
    src: enh('Chassis / Tire Pressure Monitor / Data List / ID 4 Tire Inflation Pressure'),
    conv: 'pressure',
    band: [210, 230],
    bandNote: 'Placard: 220 kPa (32 psi) cold for P205/55R16 (2016 owner’s manual)',
    desc: 'Pressure reported by the transmitter registered as ID 4.',
  },
  // ── Electrical ──
  {
    id: 'vbat',
    label: 'Battery voltage (DLC3 pin 16)',
    short: 'Battery',
    group: 'Electrical',
    unit: 'V',
    dec: 2,
    min: 6,
    max: 16,
    ecu: 'vci',
    src: { k: 'vci', what: 'Adapter ADC on DLC3 pin 16 (BAT), like a J2534 READ_VBATT' },
    band: [11, 14],
    bandNote: 'Toyota C1241 procedure, step 1: standard battery voltage 11–14 V',
    desc: 'Battery voltage measured by the adapter itself — available in every mode.',
  },
  {
    id: 'modv',
    label: 'Control module voltage',
    short: 'ECM voltage',
    group: 'Electrical',
    unit: 'V',
    dec: 2,
    min: 6,
    max: 16,
    ecu: 'ecm',
    src: pid(0x42, 2, '(256A + B) / 1000'),
    desc: 'Supply voltage as the ECM sees it.',
  },
];

export const SIG: Record<string, SigDef> = Object.fromEntries(SIGNALS.map((s) => [s.id, s]));
export const SIG_IDS = SIGNALS.map((s) => s.id);
export const SIG_INDEX: Record<string, number> = Object.fromEntries(SIGNALS.map((s, i) => [s.id, i]));
export const GROUPS: Group[] = ['Engine', 'Fuel & misfire', 'Transmission', 'Chassis', 'Body', 'Climate', 'Tires', 'Electrical'];

/** Does reading this item need the adapter to transmit (i.e. not available in listen-only mode)? */
export function needsRequest(s: SigDef): boolean {
  return s.src.k === 'pid' || s.src.k === 'enh';
}

export type Units = 'us' | 'metric';

export function convert(s: SigDef, v: number, units: Units): number {
  if (units === 'metric' || !s.conv) return v;
  switch (s.conv) {
    case 'temp':
      return (v * 9) / 5 + 32;
    case 'speed':
      return v / 1.609344;
    case 'pressure':
      return v * 0.1450377;
    case 'mpa':
      return v * 145.0377;
    case 'torque':
      return v * 0.7375621;
  }
}

export function unitOf(s: SigDef, units: Units): string {
  if (units === 'metric' || !s.conv) return s.unit;
  return { temp: '°F', speed: 'mph', pressure: 'psi', mpa: 'psi', torque: 'lb·ft' }[s.conv];
}

export function decOf(s: SigDef, units: Units): number {
  if (units === 'us' && s.conv === 'mpa') return 0;
  if (units === 'us' && s.conv === 'pressure') return 1;
  return s.dec;
}

export function rangeOf(s: SigDef, units: Units): [number, number] {
  const a = convert(s, s.min, units);
  const b = convert(s, s.max, units);
  return [Math.min(a, b), Math.max(a, b)];
}

export function fmtValue(s: SigDef, v: number, units: Units): string {
  if (!Number.isFinite(v)) return '—';
  if (s.kind && s.enumLabels) return s.enumLabels[Math.round(v)] ?? String(Math.round(v));
  const c = convert(s, v, units);
  const d = decOf(s, units);
  return c.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
}

/** OBD-II response data bytes (A, B) for a mode 01 PID value. */
export function pidBytes(p: number, v: number): number[] {
  const c = (n: number) => Math.max(0, Math.min(255, Math.round(n)));
  const two = (raw: number) => {
    const r = Math.max(0, Math.min(65535, Math.round(raw)));
    return [r >> 8, r & 0xff];
  };
  switch (p) {
    case 0x04:
    case 0x11:
    case 0x2f:
      return [c((v * 255) / 100)];
    case 0x05:
    case 0x0f:
    case 0x46:
      return [c(v + 40)];
    case 0x06:
    case 0x07:
      return [c(((v + 100) * 128) / 100)];
    case 0x0b:
    case 0x0d:
    case 0x33:
      return [c(v)];
    case 0x0c:
      return two(v * 4);
    case 0x0e:
      return [c((v + 64) * 2)];
    case 0x10:
      return two(v * 100);
    case 0x15:
      return [c(v * 200), 0xff];
    case 0x1f:
      return two(v);
    case 0x42:
      return two(v * 1000);
    default:
      return [0];
  }
}

export function srcLabel(src: SigSrc): string {
  switch (src.k) {
    case 'can':
      return `Broadcast 0x${src.id.toString(16).toUpperCase().padStart(3, '0')}`;
    case 'pid':
      return `OBD-II PID ${src.pid.toString(16).toUpperCase().padStart(2, '0')}`;
    case 'enh':
      return src.basis === 'rm' ? 'Toyota data list' : 'Toyota data list (illustrative)';
    case 'vci':
      return 'Adapter / shop probe';
  }
}
