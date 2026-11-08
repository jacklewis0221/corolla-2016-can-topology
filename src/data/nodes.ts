import type { SourceKey } from './sources';

export type Domain = 'powertrain' | 'chassis' | 'body' | 'safety' | 'infotainment' | 'diagnostic';
export type NodeKind = 'ecu' | 'junction' | 'port' | 'device' | 'sensor';
/** Equipment options that change which parts exist on the car. */
export type Option = 'smartKey' | 'nav' | 'roof' | 'eco';

export interface IoItem {
  name: string;
  dir: 'in' | 'out';
  kind: 'sensor' | 'switch' | 'actuator' | 'indicator' | 'ecu' | 'display' | 'antenna';
  pins?: string;
  note?: string;
  /** Only present with these options (all must be on). */
  requires?: Option[];
  excludes?: Option[];
}

export interface CanTap {
  connector: string;
  canh: string;
  canl: string;
  /** Toyota wire color codes from the EWD (V bus CANL is white on every branch; local CAN uses gray). */
  colorH: string;
  colorL: string;
  /** Pins on the junction connector where this branch lands. */
  jc?: string;
  bus: 'V bus' | 'Local CAN';
}

export interface NetNode {
  id: string;
  name: string; // Toyota part name
  short: string; // label in the diagram
  kind: NodeKind;
  domain: Domain;
  location: string;
  role: string;
  facts?: string[];
  requires?: Option[];
  excludes?: Option[];
  terminator?: boolean;
  gateway?: string;
  can?: CanTap[];
  io?: IoItem[];
  /** Plain-language list of what this node publishes to other ECUs. */
  publishes?: string[];
  /** Plain-language list of what it consumes from other ECUs. */
  consumes?: string[];
  silentDtc?: { code: string; meaning: string; storedBy: string[] }[];
  sources: SourceKey[];
  /** Schematic and in-car positions in the 1600 x 1000 drawing space. */
  pos: { s: [number, number]; p: [number, number] };
  size?: [number, number];
}

export const DOMAIN_LABEL: Record<Domain, string> = {
  powertrain: 'Powertrain',
  chassis: 'Chassis',
  body: 'Body electrical',
  safety: 'Restraints',
  infotainment: 'Audio & display',
  diagnostic: 'Network & diagnostics',
};

export const OPTION_LABEL: Record<Option, string> = {
  smartKey: 'Smart key + push start',
  nav: 'Navigation receiver',
  roof: 'Sliding roof',
  eco: 'LE Eco (2ZR-FAE Valvematic)',
};

const ECU: [number, number] = [156, 76];
const SMALL: [number, number] = [140, 64];

export const NODES: NetNode[] = [
  // ───────────────────────────── CAN V bus ─────────────────────────────
  {
    id: 'ecm',
    name: 'ECM (Engine Control Module)',
    short: 'ECM',
    kind: 'ecu',
    domain: 'powertrain',
    location: 'Engine compartment, driver side next to the battery',
    role:
      'Runs the 1.8 L engine (2ZR-FE, or the 2ZR-FAE Valvematic engine on the LE Eco) and the K313 CVT: fuel injection, ignition, the electronic throttle (ETCS-i), Dual VVT-i, cruise control and transmission ratio control. It is one end of the V bus and contains one of the two 120 Ω terminating resistors.',
    terminator: true,
    facts: [
      'Transmission control is inside the ECM; there is no separate TCM on this car.',
      'Cruise control is an ECM function: the steering-wheel switch is wired to the ECM through the spiral cable.',
      'Stops the fuel pump when the airbag sensor reports a deployment.',
    ],
    can: [
      { connector: 'A40', canh: '13', canl: '26', colorH: 'B', colorL: 'W', jc: 'No. 2 J/C A39-6 / A39-17', bus: 'V bus' },
      { connector: 'B33', canh: '61 (CAN+)', canl: '62 (CAN−)', colorH: 'B', colorL: 'GR', jc: 'No. 1 J/C A35-1 / A35-2', bus: 'Local CAN' },
    ],
    io: [
      { name: 'Mass air flow meter (with intake air temp sensor)', dir: 'in', kind: 'sensor' },
      { name: 'Crank position sensor', dir: 'in', kind: 'sensor' },
      { name: 'VVT sensors — intake & exhaust cam position', dir: 'in', kind: 'sensor' },
      { name: 'Engine coolant temperature sensor', dir: 'in', kind: 'sensor' },
      { name: 'Accelerator pedal sensor', dir: 'in', kind: 'sensor' },
      { name: 'Throttle position sensor (throttle body)', dir: 'in', kind: 'sensor' },
      { name: 'Knock control sensor', dir: 'in', kind: 'sensor' },
      { name: 'Air-fuel ratio sensor (bank 1 sensor 1)', dir: 'in', kind: 'sensor' },
      { name: 'Heated oxygen sensor (bank 1 sensor 2)', dir: 'in', kind: 'sensor' },
      { name: 'CVT revolution sensors NIN / NOUT / NT', dir: 'in', kind: 'sensor' },
      { name: 'CVT fluid temperature & oil pressure sensors', dir: 'in', kind: 'sensor' },
      { name: 'Park/neutral position switch', dir: 'in', kind: 'switch' },
      { name: 'Stop light switch', dir: 'in', kind: 'switch', pins: 'A40-10' },
      { name: 'Cruise control switch (via spiral cable)', dir: 'in', kind: 'switch' },
      { name: 'Fuel injectors ×4', dir: 'out', kind: 'actuator' },
      { name: 'Ignition coils ×4 (IGT1–IGT4, IGF1)', dir: 'out', kind: 'actuator' },
      { name: 'Throttle control motor (ETCS-i)', dir: 'out', kind: 'actuator' },
      { name: 'Camshaft timing oil control valves ×2', dir: 'out', kind: 'actuator' },
      { name: 'CVT solenoids SC / SL / SLU / SLP / SLS', dir: 'out', kind: 'actuator' },
      { name: 'Fuel pump control', dir: 'out', kind: 'actuator' },
      { name: 'Purge VSV & canister pump module (EVAP)', dir: 'out', kind: 'actuator' },
      { name: 'Starter (cranking control)', dir: 'out', kind: 'actuator' },
      { name: 'Cooling fan ECU (SI duty signal)', dir: 'out', kind: 'ecu', pins: 'A40-45 → A31-2' },
      { name: 'A/F and O₂ sensor heaters', dir: 'out', kind: 'actuator' },
      { name: 'Valvematic controller (local CAN)', dir: 'out', kind: 'ecu', requires: ['eco'] },
    ],
    publishes: [
      'Engine speed, coolant temperature, throttle and accelerator position',
      'Shift position and CVT state (shift indicator, back-up camera trigger)',
      'Cruise control status and indicator requests',
      'Malfunction indicator lamp (MIL) request',
    ],
    consumes: [
      'Vehicle speed, acceleration and ABS/VSC state from the skid control ECU',
      'Engine output reduction requests during TRAC / VSC',
      'A/C operating state from the A/C amplifier',
      'Electrical load information from the power steering ECU',
      'Airbag deployment signal (fuel pump cut)',
    ],
    silentDtc: [
      {
        code: 'U0100',
        meaning: 'Lost communication with ECM/PCM',
        storedBy: ['Skid control ECU', 'Power steering ECU', 'Main body ECU', 'A/C amplifier', 'Combination meter', 'Radio & display receiver'],
      },
    ],
    sources: ['ncfEngine', 'ncfCvt', 'ncfCruise', 'ewdCan', 'ewdEngine', 'rmFailSafe', 'rmDiagnosis', 'routingEngine'],
    pos: { s: [1430, 480], p: [1250, 365] },
    size: [200, 92],
  },
  {
    id: 'skid',
    name: 'Skid Control ECU (Brake Actuator Assembly)',
    short: 'Skid Control ECU',
    kind: 'ecu',
    domain: 'chassis',
    location: 'Engine compartment, passenger side (integrated with the brake actuator)',
    role:
      'ABS, EBD, Brake Assist, TRAC and VSC. Reads the four wheel-speed sensors directly, takes yaw rate, acceleration and steering angle from CAN, modulates brake pressure with the actuator solenoids, and asks the ECM to cut engine output when the car slides.',
    facts: [
      'Its CAN branch is the only one that joins at the No. 2 CAN junction connector.',
      'Also sends a hard-wired speed pulse (SP1) to the combination meter.',
      'Its speed data drives the speedometer, EPS assist map and the radio’s fuel-consumption screen.',
    ],
    can: [{ connector: 'A41', canh: '25', canl: '14', colorH: 'V', colorL: 'W', jc: 'No. 2 J/C A39-5 / A39-16', bus: 'V bus' }],
    io: [
      { name: 'Front speed sensors LH / RH', dir: 'in', kind: 'sensor', pins: 'FL± / FR±' },
      { name: 'Rear speed sensors LH / RH', dir: 'in', kind: 'sensor', pins: 'RL± / RR±' },
      { name: 'Master cylinder pressure sensor', dir: 'in', kind: 'sensor', note: 'inside the actuator' },
      { name: 'Stop light switch', dir: 'in', kind: 'switch', pins: 'STP' },
      { name: 'VSC OFF switch', dir: 'in', kind: 'switch', pins: 'CSW' },
      { name: 'Solenoid valves', dir: 'out', kind: 'actuator', note: 'inside the actuator' },
      { name: 'Pump motor', dir: 'out', kind: 'actuator', note: 'inside the actuator' },
      { name: 'Speed signal to combination meter', dir: 'out', kind: 'display', pins: 'SP1 A41-11 → E43-5' },
    ],
    publishes: [
      'Wheel speeds and vehicle speed',
      'ABS / VSC / TRAC operating state and warning-lamp requests',
      'Engine output control request (to the ECM)',
    ],
    consumes: [
      'Yaw rate and acceleration (airbag sensor assembly)',
      'Steering angle (steering sensor)',
      'Throttle, accelerator position and engine speed (ECM)',
      'Parking brake switch state (main body ECU)',
    ],
    silentDtc: [
      {
        code: 'U0129',
        meaning: 'Lost communication with brake system control module',
        storedBy: ['ECM', 'Power steering ECU', 'Combination meter', 'Radio & display receiver'],
      },
    ],
    sources: ['ncfBrake', 'ncfVsc', 'ewdCan', 'ewdBrake', 'rmFailSafe', 'rmDiagnosis', 'routingEngine'],
    pos: { s: [1150, 690], p: [1250, 635] },
    size: ECU,
  },
  {
    id: 'meter',
    name: 'Combination Meter Assembly',
    short: 'Combination Meter',
    kind: 'ecu',
    domain: 'body',
    location: 'Instrument panel, in front of the driver',
    role:
      'The driver’s display and the other end of the V bus (second 120 Ω terminator). Its meter ECU turns CAN data into gauges, warning lights, the multi-information display and chimes. It is also the turn-signal and hazard flasher.',
    terminator: true,
    facts: [
      'Reads the ambient temperature sensor directly and shares it with the A/C amplifier over CAN.',
      'The turn-signal switch and hazard switch are wired straight into the meter.',
      'Uses the skid control ECU’s distance data for the maintenance reminder.',
    ],
    can: [{ connector: 'E43', canh: '32', canl: '31', colorH: 'LG', colorL: 'W', jc: 'No. 3 J/C E55-4 / E55-15', bus: 'V bus' }],
    io: [
      { name: 'Fuel sender gauge (fuel pump & gage tube)', dir: 'in', kind: 'sensor' },
      { name: 'Ambient temperature sensor', dir: 'in', kind: 'sensor' },
      { name: 'Engine oil pressure switch', dir: 'in', kind: 'switch' },
      { name: 'Brake fluid level warning switch', dir: 'in', kind: 'switch' },
      { name: 'Washer fluid level warning switch', dir: 'in', kind: 'switch' },
      { name: 'Generator L terminal (charge warning)', dir: 'in', kind: 'sensor' },
      { name: 'Turn signal switch (headlight dimmer switch assy)', dir: 'in', kind: 'switch', pins: 'E43-29, E47-9/10' },
      { name: 'Hazard warning switch', dir: 'in', kind: 'switch', pins: 'E47-3' },
      { name: 'Light control rheostat', dir: 'in', kind: 'switch' },
      { name: 'Steering pad DISP switch (via spiral cable)', dir: 'in', kind: 'switch' },
      { name: 'Speed pulse from skid control ECU', dir: 'in', kind: 'sensor', pins: 'SP1 E43-5' },
      { name: 'Gauges, warning & indicator lights', dir: 'out', kind: 'indicator' },
      { name: 'Multi-information display (segment or dot LCD)', dir: 'out', kind: 'display' },
      { name: 'Meter buzzer', dir: 'out', kind: 'actuator' },
      { name: 'Turn signal lamps (flasher output)', dir: 'out', kind: 'actuator' },
    ],
    publishes: ['Ambient temperature', 'Vehicle speed for A/C ambient-temperature correction', 'Display language and units settings'],
    consumes: [
      'Engine speed, coolant temperature, MIL, cruise indicators (ECM)',
      'Vehicle speed and ABS / VSC / slip warnings (skid control ECU)',
      'SRS warning and seatbelt status (airbag sensor)',
      'EPS warning (power steering ECU)',
      'Door, light, key and tire-pressure states (main body ECU)',
    ],
    silentDtc: [
      {
        code: 'U0155',
        meaning: 'Lost communication with instrument panel cluster',
        storedBy: ['Main body ECU', 'A/C amplifier', 'Certification ECU (smart key)'],
      },
    ],
    sources: ['ncfMeter', 'ncfCan', 'ewdCan', 'ewdMeter', 'ewdTurn', 'rmFailSafe', 'routingDash'],
    pos: { s: [150, 480], p: [1110, 380] },
    size: [200, 92],
  },
  {
    id: 'body',
    name: 'Main Body ECU (Multiplex Network Body ECU)',
    short: 'Main Body ECU',
    kind: 'ecu',
    domain: 'body',
    location: 'Driver side of the instrument panel, mounted to the driver-side junction block',
    role:
      'The body-electrical hub: exterior and interior lighting, daytime running lights, door locks, illuminated entry and the theft deterrent. It is a gateway — master of the door LIN bus, and the relay that puts keyless-entry receiver and TPMS data onto CAN.',
    gateway: 'Door LIN bus (driver power window, sliding roof) and the PRG / RDA serial line',
    facts: [
      'Daytime running lights need engine speed from the ECM and the parking-brake state.',
      'Forwards the parking-brake switch signal to the skid control ECU over CAN.',
      'Holds the customizable body settings that Techstream can change.',
    ],
    can: [{ connector: 'E31', canh: '14', canl: '13', colorH: 'B', colorL: 'W', jc: 'No. 3 J/C E55-8 / E55-19', bus: 'V bus' }],
    io: [
      { name: 'Headlight dimmer switch (HEAD / TAIL / HF / HU / FFOG)', dir: 'in', kind: 'switch' },
      { name: 'Door courtesy switches', dir: 'in', kind: 'switch', pins: 'FRCY / LCTY / RCTY' },
      { name: 'Door lock position switches', dir: 'in', kind: 'switch', pins: 'LSFL / LSFR' },
      { name: 'Door control switch (master switch lock / unlock)', dir: 'in', kind: 'switch', pins: 'UL1' },
      { name: 'Hood courtesy switch (theft deterrent)', dir: 'in', kind: 'switch' },
      { name: 'Key unlock warning switch', dir: 'in', kind: 'switch', pins: 'KSW', excludes: ['smartKey'] },
      { name: 'Parking brake switch', dir: 'in', kind: 'switch' },
      { name: 'Automatic light control sensor (if equipped)', dir: 'in', kind: 'sensor' },
      { name: 'Door lock motors ×4', dir: 'out', kind: 'actuator' },
      { name: 'Headlight, taillight & DRL relays', dir: 'out', kind: 'actuator' },
      { name: 'Interior / dome lights', dir: 'out', kind: 'actuator' },
      { name: 'Security indicator & horn', dir: 'out', kind: 'indicator' },
      { name: 'Driver power window motor (LIN)', dir: 'out', kind: 'ecu', pins: 'LIN2 → H9-9' },
      { name: 'Sliding roof ECU (LIN)', dir: 'out', kind: 'ecu', requires: ['roof'] },
      { name: 'Door control receiver & TPMS ECU (serial)', dir: 'in', kind: 'ecu', pins: 'PRG E31-4 · RDA E31-16' },
    ],
    publishes: [
      'Door open / lock status, light switch position, parking brake',
      'Tire-pressure warning (relayed from the TPMS ECU)',
      'Destination and dimming information for displays',
    ],
    consumes: ['Engine speed (DRL logic)', 'Airbag deployment (door unlock)', 'Vehicle speed (auto door lock)'],
    silentDtc: [
      {
        code: 'U0140 / U0142',
        meaning: 'Lost communication with body control module',
        storedBy: ['Certification ECU', 'A/C amplifier', 'Combination meter', 'Radio & display receiver'],
      },
    ],
    sources: ['ncfDrl', 'ncfEntry', 'ncfWireless', 'ncfLin', 'ewdCan', 'ewdDoorLock', 'ewdInteriorLight', 'rmFailSafe', 'rmDiagnosis'],
    pos: { s: [390, 690], p: [1040, 305] },
    size: ECU,
  },
  {
    id: 'airbag',
    name: 'Airbag Sensor Assembly (center airbag sensor)',
    short: 'Airbag Sensor',
    kind: 'ecu',
    domain: 'safety',
    location: 'Center of the floor, under the front of the console',
    role:
      'Decides when to fire airbags and pretensioners. It also houses the car’s yaw-rate and acceleration sensors, so it streams yaw rate and G-forces to the skid control ECU for VSC — a safety module doubling as a chassis sensor.',
    facts: [
      'Reports a deployment to the ECM over CAN so the fuel pump stops.',
      'Reads the driver seat belt buckle switch and reports belt status for the reminder.',
      'Connected to CAN but stores no CAN communication DTCs of its own.',
    ],
    can: [{ connector: 'E14', canh: '13', canl: '22', colorH: 'V', colorL: 'W', jc: 'No. 3 J/C E55-5 / E55-16', bus: 'V bus' }],
    io: [
      { name: 'Yaw-rate & acceleration sensors (built in)', dir: 'in', kind: 'sensor' },
      { name: 'Safing sensor (built in)', dir: 'in', kind: 'sensor' },
      { name: 'Front airbag sensors LH / RH', dir: 'in', kind: 'sensor', pins: '+SL/−SL · +SR/−SR' },
      { name: 'Side, door-side & rear-side airbag sensors LH / RH', dir: 'in', kind: 'sensor', note: 'daisy-chained per side' },
      { name: 'Driver seat belt buckle switch', dir: 'in', kind: 'switch' },
      { name: 'Occupant detection ECU (dedicated lines)', dir: 'in', kind: 'ecu' },
      { name: 'Driver airbag (via spiral cable)', dir: 'out', kind: 'actuator' },
      { name: 'Front passenger airbag', dir: 'out', kind: 'actuator' },
      { name: 'Driver knee airbag', dir: 'out', kind: 'actuator' },
      { name: 'Front seat side airbags LH / RH', dir: 'out', kind: 'actuator' },
      { name: 'Curtain shield airbags LH / RH', dir: 'out', kind: 'actuator' },
      { name: 'Front passenger seat cushion airbag', dir: 'out', kind: 'actuator' },
      { name: 'Seat belt pretensioners LH / RH', dir: 'out', kind: 'actuator' },
      { name: 'Passenger AIRBAG ON / OFF indicator', dir: 'out', kind: 'indicator' },
    ],
    publishes: ['Yaw rate, longitudinal and lateral acceleration', 'Seat belt status and SRS warning', 'Airbag deployment signal'],
    consumes: ['Passenger occupancy classification (occupant detection ECU, dedicated line)'],
    silentDtc: [
      { code: 'U0151', meaning: 'Lost communication with restraints control module', storedBy: ['Main body ECU', 'Combination meter'] },
      { code: 'U0124', meaning: 'Lost communication with lateral acceleration sensor module', storedBy: ['Skid control ECU'] },
    ],
    sources: ['ncfAirbag', 'ncfBrake', 'ewdCan', 'ewdSrs', 'ewdSeatbelt', 'rmFailSafe', 'rmDiagnosis', 'routingDash'],
    pos: { s: [915, 290], p: [935, 500] },
    size: ECU,
  },
  {
    id: 'steer',
    name: 'Steering Sensor (Spiral Cable with Sensor)',
    short: 'Steering Sensor',
    kind: 'sensor',
    domain: 'chassis',
    location: 'Behind the steering wheel, built into the spiral cable',
    role:
      'A smart sensor that sits directly on CAN: it reads steering-wheel angle and direction from a magnet in a detection gear and broadcasts it for VSC.',
    facts: ['A sensor with its own CAN transceiver — no ECU in between.', 'Its only customer that cares about losing it is the skid control ECU (DTC U0126).'],
    can: [{ connector: 'E50', canh: '3', canl: '2', colorH: 'SB', colorL: 'W', jc: 'No. 3 J/C E55-10 / E55-21', bus: 'V bus' }],
    io: [{ name: 'Magnet & detection gear (angle and direction)', dir: 'in', kind: 'sensor' }],
    publishes: ['Steering angle, direction and rate'],
    consumes: [],
    silentDtc: [{ code: 'U0126', meaning: 'Lost communication with steering angle sensor module', storedBy: ['Skid control ECU'] }],
    sources: ['ncfSteeringSensor', 'ewdCan', 'rmDiagnosis'],
    pos: { s: [565, 290], p: [985, 395] },
    size: ECU,
  },
  {
    id: 'eps',
    name: 'Power Steering ECU Assembly',
    short: 'Power Steering ECU',
    kind: 'ecu',
    domain: 'chassis',
    location: 'On the steering column, behind the instrument panel',
    role:
      'Column-mounted electric power steering. Reads the torque sensor, takes vehicle speed (skid control ECU) and engine speed (ECM) from CAN to pick the assist level, and drives the assist motor.',
    facts: [
      'If vehicle-speed data disappears, it keeps assisting as if the car were doing 70 km/h (43 mph) and lights the EPS warning.',
      'Sends an electric-load control signal to the A/C amplifier when battery voltage sags.',
    ],
    can: [{ connector: 'E40', canh: '7', canl: '8', colorH: 'GR', colorL: 'W', jc: 'No. 3 J/C E55-9 / E55-20', bus: 'V bus' }],
    io: [
      { name: 'Torque sensor (in column)', dir: 'in', kind: 'sensor' },
      { name: 'Power steering motor', dir: 'out', kind: 'actuator' },
      { name: 'DLC3 TS terminal (test mode)', dir: 'in', kind: 'switch', pins: 'E40-6 ↔ DLC3-12' },
    ],
    publishes: ['EPS warning request', 'Electric load control signal', 'Steering torque status'],
    consumes: ['Vehicle speed (skid control ECU)', 'Engine speed (ECM)'],
    silentDtc: [{ code: 'U0131', meaning: 'Lost communication with power steering control module', storedBy: ['A/C amplifier', 'Combination meter'] }],
    sources: ['ncfEps', 'ewdCan', 'ewdEps', 'rmFailSafe', 'rmDiagnosis'],
    pos: { s: [740, 290], p: [1050, 420] },
    size: ECU,
  },
  {
    id: 'ac',
    name: 'Air Conditioning Amplifier Assembly',
    short: 'A/C Amplifier',
    kind: 'ecu',
    domain: 'body',
    location: 'Behind the center of the instrument panel',
    role:
      'Automatic climate control. Reads cabin, solar, evaporator and refrigerant-pressure sensors, drives the variable-capacity compressor’s control valve, the blower and three damper servos, and is master of the A/C LIN bus to the control panel.',
    gateway: 'A/C LIN bus (air conditioning control panel)',
    facts: [
      'Servo motors share a separate “bus connector” harness instead of individual wires.',
      'Without ECM data it falls back to an assumed 80 °C (176 °F) coolant temperature.',
      'Also times the rear defogger and heated mirrors.',
    ],
    can: [{ connector: 'E37', canh: '11', canl: '12', colorH: 'Y', colorL: 'W', jc: 'No. 3 J/C E55-2 / E55-13', bus: 'V bus' }],
    io: [
      { name: 'Air conditioning control panel (LIN)', dir: 'in', kind: 'ecu', pins: 'LIN1' },
      { name: 'Room temperature sensor', dir: 'in', kind: 'sensor' },
      { name: 'Solar sensor', dir: 'in', kind: 'sensor' },
      { name: 'Evaporator temperature sensor (No. 1 cooler thermistor)', dir: 'in', kind: 'sensor', pins: 'TE' },
      { name: 'A/C pressure sensor', dir: 'in', kind: 'sensor', pins: 'PRE' },
      { name: 'ECO switch (if equipped)', dir: 'in', kind: 'switch' },
      { name: 'Compressor control valve', dir: 'out', kind: 'actuator', pins: 'SOL+' },
      { name: 'Blower motor', dir: 'out', kind: 'actuator', pins: 'SI' },
      { name: 'Air mix, mode & recirculation servos (bus connector)', dir: 'out', kind: 'actuator' },
      { name: 'Rear defogger & mirror heaters', dir: 'out', kind: 'actuator', pins: 'RDFG' },
    ],
    publishes: ['A/C operating state (engine idle-up, CVT and fan coordination)', 'Set temperature and mode for displays'],
    consumes: ['Engine coolant temperature and engine speed (ECM)', 'Ambient temperature and vehicle speed (meter)', 'Electric load control (EPS)', 'Dimming and destination (main body ECU)'],
    silentDtc: [{ code: 'U0164', meaning: 'Lost communication with HVAC control module', storedBy: ['Main body ECU', 'Radio & display receiver'] }],
    sources: ['ncfAc', 'ncfAcBus', 'ncfLin', 'ewdCan', 'ewdAc', 'rmFailSafe', 'rmDiagnosis'],
    pos: { s: [565, 690], p: [1115, 560] },
    size: ECU,
  },
  {
    id: 'radio',
    name: 'Radio and Display Receiver Assembly (Entune Audio, 6.1-in)',
    short: 'Radio & Display',
    kind: 'ecu',
    domain: 'infotainment',
    location: 'Center stack',
    role:
      'The Entune Audio head unit and 6.1-inch touchscreen. Beyond audio it is a CAN display: rear camera view, fuel-consumption history and vehicle customization screens all depend on data from other ECUs.',
    excludes: ['nav'],
    facts: [
      'Rear camera video arrives on a dedicated analog pair, not on CAN.',
      'Has hard-wired reverse (REV) and vehicle speed (SPD) inputs.',
      'Turns the camera on and shows its image whenever the park/neutral position switch reports R.',
    ],
    can: [{ connector: 'E29', canh: '9', canl: '10', colorH: 'G', colorL: 'W', jc: 'No. 3 J/C E55-3 / E55-14', bus: 'V bus' }],
    io: [
      { name: 'Steering pad audio & phone switches', dir: 'in', kind: 'switch' },
      { name: 'Microphone', dir: 'in', kind: 'sensor' },
      { name: 'AUX audio input (No. 1 stereo jack adapter)', dir: 'in', kind: 'switch' },
      { name: 'Rear television camera (CV+ / CV− video, CB+ power)', dir: 'in', kind: 'sensor' },
      { name: 'Reverse signal (REV)', dir: 'in', kind: 'switch' },
      { name: 'Vehicle speed signal (SPD)', dir: 'in', kind: 'sensor' },
      { name: 'Speakers', dir: 'out', kind: 'actuator' },
      { name: '6.1-in touchscreen', dir: 'out', kind: 'display' },
    ],
    publishes: ['Customization requests to body ECUs'],
    consumes: ['Engine and vehicle speed data (fuel consumption)', 'Shift position (rear camera)', 'A/C set temperature', 'Destination / language (main body ECU)'],
    sources: ['ncfAudio', 'ncfRearCamera', 'ewdCan', 'ewdAudio', 'rmFailSafe', 'edmunds'],
    pos: { s: [740, 690], p: [1065, 525] },
    size: ECU,
  },
  {
    id: 'nav',
    name: 'Navigation Receiver Assembly (Entune Premium Audio)',
    short: 'Navigation Receiver',
    kind: 'ecu',
    domain: 'infotainment',
    location: 'Center stack',
    role: 'Replaces the radio & display receiver on cars with integrated navigation. Same CAN position, same branch pins, more screens.',
    requires: ['nav'],
    can: [{ connector: 'E67', canh: '9', canl: '10', colorH: 'G', colorL: 'W', jc: 'No. 3 J/C E55-3 / E55-14', bus: 'V bus' }],
    io: [
      { name: 'Steering pad switches', dir: 'in', kind: 'switch' },
      { name: 'Microphone', dir: 'in', kind: 'sensor' },
      { name: 'GPS antenna', dir: 'in', kind: 'antenna' },
      { name: 'Rear television camera video', dir: 'in', kind: 'sensor' },
      { name: 'Speakers', dir: 'out', kind: 'actuator' },
      { name: 'Touchscreen', dir: 'out', kind: 'display' },
    ],
    consumes: ['Vehicle speed and engine data', 'Shift position', 'A/C status', 'Destination'],
    sources: ['ewdCan', 'ewdAudio', 'rmCanDescription', 'edmunds'],
    pos: { s: [740, 690], p: [1065, 525] },
    size: ECU,
  },
  {
    id: 'cert',
    name: 'Certification ECU (Smart Key ECU Assembly)',
    short: 'Certification ECU',
    kind: 'ecu',
    domain: 'body',
    location: 'Passenger side of the instrument panel',
    role:
      'Smart key brain (Driver Convenience package). Finds the key with in-car and door-handle antennas, authorizes push-button start and is master of the certification LIN bus to the ID code box and steering lock ECU.',
    requires: ['smartKey'],
    gateway: 'Certification LIN bus (ID code box, steering lock ECU)',
    can: [{ connector: 'E59', canh: '14', canl: '15', colorH: 'P', colorL: 'W', jc: 'No. 3 J/C E55-6 / E55-17', bus: 'V bus' }],
    io: [
      { name: 'Engine (push start) switch', dir: 'in', kind: 'switch' },
      { name: 'Door outside handle antennas & touch sensors', dir: 'in', kind: 'antenna' },
      { name: 'Indoor & rear electrical key antennas', dir: 'out', kind: 'antenna' },
      { name: 'Smart door control receiver', dir: 'in', kind: 'ecu', pins: 'DATA E58-17' },
      { name: 'ID code box (LIN)', dir: 'out', kind: 'ecu', pins: 'E59-17 → E56-2' },
      { name: 'Steering lock ECU (LIN)', dir: 'out', kind: 'ecu', pins: 'E59-17 → E61-5' },
    ],
    publishes: ['Key verification result, power mode, lock / unlock requests', 'Smart-key warnings for the meter'],
    consumes: ['Door status (main body ECU)', 'Engine speed (ECM)'],
    silentDtc: [{ code: 'U0120 / U0327', meaning: 'Lost communication with / incompatible security module', storedBy: ['Main body ECU'] }],
    sources: ['ncfSmartKey', 'ncfLin', 'ewdCan', 'ewdSmartKey', 'rmFailSafe', 'rmCertLin', 'edmunds'],
    pos: { s: [915, 690], p: [1075, 640] },
    size: ECU,
  },

  // ─────────────────────────── Junctions & ports ───────────────────────────
  {
    id: 'jc3',
    name: 'No. 3 CAN Junction Connector',
    short: 'No. 3 CAN junction connector',
    kind: 'junction',
    domain: 'diagnostic',
    location: 'Center of the instrument panel',
    role:
      'A passive splice block — no electronics. The main bus passes through it and eight branch lines (DLC3 and seven ECUs) are joined here. Each branch uses a CANH pin in 1–11 and its CANL partner 11 pins higher.',
    facts: [
      'Pins 4 / 15: main line to the combination meter (terminator).',
      'Pins 1 / 12: main line to the No. 2 CAN junction connector (through inline connector AE4).',
      'Pins 2/13 A/C · 3/14 audio · 5/16 airbag · 6/17 certification · 8/19 body · 9/20 EPS · 10/21 steering · 11/22 DLC3.',
    ],
    sources: ['ewdCan', 'rmCanDescription', 'rmOpenMain', 'routingDash'],
    pos: { s: [660, 480], p: [1090, 500] },
    size: [680, 46],
  },
  {
    id: 'jc2',
    name: 'No. 2 CAN Junction Connector',
    short: 'No. 2 CAN J/C',
    kind: 'junction',
    domain: 'diagnostic',
    location: 'Passenger side of the upper instrument panel',
    role: 'The second splice block: the main bus continues from the No. 3 J/C to the ECM, and the skid control ECU branches off here.',
    facts: ['Pins 4 / 15: from No. 3 J/C', 'Pins 5 / 16: skid control ECU branch', 'Pins 6 / 17: main line to the ECM (terminator)'],
    sources: ['ewdCan', 'rmShort', 'routingDash'],
    pos: { s: [1150, 480], p: [1140, 610] },
    size: [140, 46],
  },
  {
    id: 'dlc3',
    name: 'DLC3 (Data Link Connector 3, OBD-II)',
    short: 'DLC3 · OBD-II',
    kind: 'port',
    domain: 'diagnostic',
    location: 'Under the driver side of the instrument panel',
    role:
      'The 16-pin diagnostic port. Pins 6 and 14 tap straight into the V bus so a scan tool can talk to every CAN ECU; pin 7 is a K-line for the two ECUs that are not on CAN.',
    facts: [
      'Pin 6 CANH (R) · pin 14 CANL (W) · pin 4 CG · pin 5 SG · pin 16 BAT',
      'Pin 7 SIL: transponder key ECU and occupant detection ECU',
      'Pin 12 TS (power steering) · pin 13 TC (ECM) · pin 9 TAC (ECM)',
      'Resistance 6 ↔ 14 with the battery disconnected: 54–69 Ω normal.',
    ],
    can: [{ connector: 'E13', canh: '6', canl: '14', colorH: 'R', colorL: 'W', jc: 'No. 3 J/C E55-11 / E55-22', bus: 'V bus' }],
    sources: ['ewdDlc3', 'ewdCan', 'ncfCanDetails', 'rmOpenMain', 'rmShort'],
    pos: { s: [390, 290], p: [1010, 330] },
    size: ECU,
  },

  // ───────────────────────────── LE Eco local CAN ─────────────────────────────
  {
    id: 'jc1',
    name: 'No. 1 CAN Junction Connector (local bus)',
    short: 'No. 1 CAN J/C',
    kind: 'junction',
    domain: 'diagnostic',
    location: 'Left side of the instrument panel',
    role: 'LE Eco only. A plain splice (A35 / A36 / A37) that joins the ECM’s second CAN port to the Valvematic controller and the generator control ECU. Separate from the V bus.',
    requires: ['eco'],
    sources: ['ewdCan', 'ewdEngineEco'],
    pos: { s: [1430, 640], p: [1100, 335] },
    size: [130, 40],
  },
  {
    id: 'vvl',
    name: 'Continuously Variable Valve Lift Controller Assembly (Valvematic)',
    short: 'Valvematic Ctrl',
    kind: 'ecu',
    domain: 'powertrain',
    location: 'On the 2ZR-FAE engine',
    role: 'Drives the Valvematic motor that varies intake valve lift; reports to the ECM over the local CAN bus.',
    requires: ['eco'],
    can: [{ connector: 'B40', canh: '4 (CAN+)', canl: '2 (CAN−)', colorH: 'L', colorL: 'GR', jc: 'No. 1 J/C A36-1 / A36-2', bus: 'Local CAN' }],
    io: [
      { name: 'Valvematic motor', dir: 'out', kind: 'actuator' },
      { name: 'Motor position sensors', dir: 'in', kind: 'sensor' },
    ],
    silentDtc: [{ code: 'U011B', meaning: 'Lost communication with rocker arm control module “A”', storedBy: ['ECM (2ZR-FAE)'] }],
    sources: ['ncfValvematic', 'ewdCan', 'ewdEngineEco', 'rmDiagnosis'],
    pos: { s: [1322, 800], p: [1300, 455] },
    size: [144, 64],
  },
  {
    id: 'genecu',
    name: 'Generator Control ECU Assembly',
    short: 'Generator Ctrl ECU',
    kind: 'ecu',
    domain: 'powertrain',
    location: 'Engine compartment',
    role: 'LE Eco charging control: reads battery current and temperature, gets driving conditions from the ECM over local CAN, and sends a voltage request to the generator over its own LIN line.',
    requires: ['eco'],
    gateway: 'LIN to generator regulator',
    can: [{ connector: 'A24', canh: '3 (CA3P)', canl: '2 (CA3N)', colorH: 'R', colorL: 'GR', jc: 'No. 1 J/C A37-1 / A37-2', bus: 'Local CAN' }],
    io: [
      { name: 'Battery current & temperature sensors', dir: 'in', kind: 'sensor' },
      { name: 'Generator regulator (LIN1)', dir: 'out', kind: 'ecu', pins: 'A24-6 → B37-1' },
    ],
    sources: ['ncfCharging', 'ewdCan', 'ewdChargingEco'],
    pos: { s: [1500, 800], p: [1400, 640] },
    size: [150, 64],
  },
  {
    id: 'gen',
    name: 'Generator with Regulator Assembly',
    short: 'Generator',
    kind: 'device',
    domain: 'powertrain',
    location: 'Front of the engine',
    role: 'LIN responder on the LE Eco: the regulator follows voltage requests from the generator control ECU.',
    requires: ['eco'],
    sources: ['ewdChargingEco', 'ncfCharging'],
    pos: { s: [1500, 930], p: [1330, 560] },
    size: SMALL,
  },

  // ───────────────────────────── LIN responders ─────────────────────────────
  {
    id: 'pwm',
    name: 'Power Window Regulator Motor Assembly (driver)',
    short: 'Driver Window Motor',
    kind: 'device',
    domain: 'body',
    location: 'Driver door',
    role:
      'A motor with its own ECU: two Hall ICs count motor pulses so it knows the window position for one-touch auto up/down and jam protection. Talks to the main body ECU over the door LIN bus.',
    facts: ['If it stops answering for 10 s, the main body ECU stores B2321.', 'LIN pin H9-9, routed through junction block terminal 3C-52.'],
    io: [
      { name: 'Hall ICs ×2', dir: 'in', kind: 'sensor' },
      { name: 'Window motor', dir: 'out', kind: 'actuator' },
    ],
    silentDtc: [{ code: 'B2321', meaning: 'D-door motor ECU communication stop', storedBy: ['Main body ECU'] }],
    sources: ['ncfPowerWindow', 'ncfLinDiagram', 'ewdPowerWindow', 'rmDoorLin'],
    pos: { s: [300, 880], p: [870, 300] },
    size: SMALL,
  },
  {
    id: 'roof',
    name: 'Sliding Roof Drive Gear Sub-Assembly (sliding roof ECU)',
    short: 'Sliding Roof ECU',
    kind: 'device',
    domain: 'body',
    location: 'Roof, above the front seats',
    role: 'Moonroof motor with built-in ECU on the door LIN bus (LE Premium / Driver Convenience package).',
    requires: ['roof'],
    silentDtc: [{ code: 'B1273', meaning: 'Sliding roof ECU communication stop', storedBy: ['Main body ECU'] }],
    sources: ['ncfLinDiagram', 'ewdSunroof', 'rmLinDtc', 'pressroom'],
    pos: { s: [460, 880], p: [800, 500] },
    size: SMALL,
  },
  {
    id: 'acpanel',
    name: 'Air Conditioning Control Assembly',
    short: 'A/C Control Panel',
    kind: 'device',
    domain: 'body',
    location: 'Center stack, below the display',
    role: 'Buttons and dials for the automatic climate control. Sends every press to the A/C amplifier over the A/C LIN bus and receives indicator states back.',
    sources: ['ncfAc', 'ncfLinDiagram', 'ewdAc'],
    pos: { s: [620, 880], p: [1015, 530] },
    size: SMALL,
  },
  {
    id: 'idbox',
    name: 'ID Code Box (Immobiliser Code ECU)',
    short: 'ID Code Box',
    kind: 'ecu',
    domain: 'body',
    location: 'Instrument panel, near the steering column',
    role: 'Smart key cars: compares key ID codes with the certification ECU over LIN, then unlocks the ECM’s immobiliser on its dedicated IMI / IMO lines.',
    requires: ['smartKey'],
    silentDtc: [{ code: 'B2789', meaning: 'No response from ID BOX', storedBy: ['Certification ECU'] }],
    sources: ['ncfSmartKey', 'ncfImmobiliser', 'ewdSmartKey', 'rmCertLin'],
    pos: { s: [940, 880], p: [1085, 455] },
    size: SMALL,
  },
  {
    id: 'slock',
    name: 'Steering Lock ECU (Steering Lock Actuator Assembly)',
    short: 'Steering Lock ECU',
    kind: 'device',
    domain: 'body',
    location: 'Steering column',
    role: 'Smart key cars: locks and unlocks the steering column on command from the certification ECU (LIN).',
    requires: ['smartKey'],
    silentDtc: [{ code: 'B2786', meaning: 'No response from steering lock ECU', storedBy: ['Certification ECU'] }],
    sources: ['ncfSmartKey', 'ewdSmartKey', 'rmCertLin'],
    pos: { s: [1100, 880], p: [1025, 450] },
    size: SMALL,
  },

  // ─────────────────────── Serial / dedicated-line ECUs ───────────────────────
  {
    id: 'immo',
    name: 'Transponder Key ECU Assembly',
    short: 'Transponder Key ECU',
    kind: 'ecu',
    domain: 'body',
    location: 'Instrument panel, by the ignition key cylinder',
    role:
      'Base LE immobiliser (no smart key). Reads the chip in the key through the coil around the key cylinder, then authorizes the ECM over a dedicated two-wire link. It is not on CAN; Techstream reaches it on the DLC3 K-line.',
    excludes: ['smartKey'],
    io: [
      { name: 'Transponder key coil around key cylinder', dir: 'in', kind: 'antenna', pins: 'ANT1 / ANT2' },
      { name: 'ECM immobiliser link', dir: 'out', kind: 'ecu', pins: 'EFII / EFIO ↔ IMO / IMI' },
      { name: 'Security indicator', dir: 'out', kind: 'indicator' },
      { name: 'DLC3 K-line', dir: 'in', kind: 'ecu', pins: 'E25-9 ↔ DLC3-7 (SIL)' },
    ],
    sources: ['ncfImmobiliser', 'ewdImmobiliser', 'ewdDlc3'],
    pos: { s: [1265, 290], p: [1020, 455] },
    size: ECU,
  },
  {
    id: 'ods',
    name: 'Occupant Detection ECU',
    short: 'Occupant Detection',
    kind: 'ecu',
    domain: 'safety',
    location: 'Under the front passenger seat',
    role: 'Classifies the front passenger from two seat-frame weight sensors and the buckle switch, and tells the airbag sensor whether the passenger airbags may deploy. Dedicated lines, not CAN.',
    io: [
      { name: 'Occupant classification sensors LH / RH', dir: 'in', kind: 'sensor', pins: 'SVC / SIG / SGD' },
      { name: 'Front passenger seat belt buckle switch', dir: 'in', kind: 'switch' },
      { name: 'Airbag sensor assembly (dedicated)', dir: 'out', kind: 'ecu' },
      { name: 'DLC3 K-line', dir: 'in', kind: 'ecu', pins: 'DIA ↔ DLC3-7' },
    ],
    sources: ['ncfOcs', 'ewdSeatbelt', 'ewdDlc3'],
    pos: { s: [1090, 290], p: [850, 610] },
    size: ECU,
  },
  {
    id: 'rcv',
    name: 'Door Control Receiver',
    short: 'Door Control Receiver',
    kind: 'device',
    domain: 'body',
    location: 'Rear of the cabin',
    role: 'Keyless-entry radio receiver. Passes key-fob lock / unlock / panic commands to the main body ECU on the shared PRG / RDA serial lines.',
    excludes: ['smartKey'],
    sources: ['ncfWireless', 'ewdWireless', 'ewdTpms'],
    pos: { s: [150, 690], p: [430, 625] },
    size: SMALL,
  },
  {
    id: 'tpms',
    name: 'Tire Pressure Warning ECU and Receiver',
    short: 'TPMS ECU & Receiver',
    kind: 'ecu',
    domain: 'chassis',
    location: 'Right C-pillar area, behind the rear seat',
    role:
      'Listens for the four tire-valve transmitters, compares pressure with the threshold learned at reset, and reports warnings to the main body ECU, which puts them on CAN for the meter.',
    io: [
      { name: 'Tire pressure valve transmitters ×4 (radio)', dir: 'in', kind: 'antenna' },
      { name: 'TPMS reset switch', dir: 'in', kind: 'switch' },
      { name: 'Main body ECU serial', dir: 'out', kind: 'ecu', pins: 'PRG / RDA' },
    ],
    sources: ['ncfTpms', 'ewdTpms', 'rmFailSafe', 'routingBody'],
    pos: { s: [150, 830], p: [455, 660] },
    size: SMALL,
  },
  {
    id: 'camera',
    name: 'Rear Television Camera Assembly',
    short: 'Rear Camera',
    kind: 'device',
    domain: 'infotainment',
    location: 'Luggage compartment door',
    role: 'Backup camera on the luggage compartment door. Analog video (CV+ / CV−) runs on a shielded pair straight to the head unit, which also powers it (CB+) and switches it on in reverse.',
    sources: ['ncfRearCamera', 'ewdAudio', 'pressroom'],
    pos: { s: [780, 880], p: [150, 500] },
    size: SMALL,
  },
  {
    id: 'fob',
    name: 'Door Control Transmitter (key fob)',
    short: 'Key Fob',
    kind: 'device',
    domain: 'body',
    location: 'In your pocket',
    role: 'Sends lock, unlock, panic and trunk commands by radio to the door control receiver.',
    excludes: ['smartKey'],
    sources: ['ncfWireless'],
    pos: { s: [150, 590], p: [700, 240] },
    size: [120, 46],
  },
  {
    id: 'valves',
    name: 'Tire Pressure Warning Valve and Transmitter ×4',
    short: 'Tire Valves ×4',
    kind: 'sensor',
    domain: 'chassis',
    location: 'Inside each road wheel',
    role: 'Battery-powered sensors in each valve stem; transmit pressure, temperature and an ID code by radio.',
    sources: ['ncfTpms'],
    pos: { s: [150, 950], p: [400, 712] },
    size: [176, 46],
  },
];

export const NODE_BY_ID: Record<string, NetNode> = Object.fromEntries(NODES.map((n) => [n.id, n]));

export function isPresent(n: { requires?: Option[]; excludes?: Option[] }, opts: Record<Option, boolean>): boolean {
  if (n.requires && !n.requires.every((o) => opts[o])) return false;
  if (n.excludes && n.excludes.some((o) => opts[o])) return false;
  return true;
}
