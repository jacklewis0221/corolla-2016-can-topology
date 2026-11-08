import type { SourceKey } from './sources';
import type { Option } from './nodes';

export interface Hop {
  edge: string;
  reverse?: boolean;
  delay?: number; // seconds after step start
}

export interface Broadcast {
  from: string;
  msg: number | null;
  to: string[];
  bus?: 'v' | 'local';
  delay?: number;
}

export interface Step {
  title: string;
  body: string;
  focus: string[];
  hops?: Hop[];
  broadcasts?: Broadcast[];
  frame?: { msg: number; values: Record<string, number> };
  wired?: string[];
  note?: string;
  silent?: string;
  sources: SourceKey[];
}

export interface Scenario {
  id: string;
  title: string;
  tagline: string;
  preset: 'base' | 'plus' | 'eco';
  requires?: Option[];
  steps: Step[];
}

export const SCENARIOS: Scenario[] = [
  {
    id: 'start',
    title: 'Start the engine',
    tagline: 'Immobiliser handshake, then the first broadcast',
    preset: 'base',
    steps: [
      {
        title: 'Key in, ignition ON',
        body: 'Turning the key powers the transponder key coil wrapped around the key cylinder. The chip in the key head answers with its ID code by short-range radio.',
        focus: ['immo'],
        wired: ['Transponder key coil · ANT1 / ANT2'],
        sources: ['ncfImmobiliser', 'ewdImmobiliser'],
      },
      {
        title: 'Code check with the ECM',
        body: 'If the ID matches, the transponder key ECU and the ECM run a code exchange on their own two wires (EFII / EFIO ↔ IMO / IMI). Only then does the ECM unset the immobiliser and allow fuel and spark.',
        focus: ['immo', 'ecm'],
        hops: [{ edge: 'ser-immo' }, { edge: 'ser-immo', reverse: true, delay: 1.1 }],
        sources: ['ewdImmobiliser', 'ncfImmobiliser'],
      },
      {
        title: 'Crank and fire',
        body: 'Everything that makes the engine run is wired straight to the ECM: crank, cam and air-flow sensors in; injectors, ignition coils, throttle motor and starter out. CAN only carries the results.',
        focus: ['ecm'],
        wired: ['Crank & cam position sensors', 'Mass air flow meter', 'Injectors ×4', 'Ignition coils ×4', 'Starter'],
        sources: ['ncfEngine', 'ewdEngine'],
      },
      {
        title: 'Engine speed goes out to everyone',
        body: 'The ECM broadcasts engine speed in frame 0x1C4. It is not addressed to anyone: the tachometer, power steering, A/C amplifier, skid control ECU and main body ECU each pick it off the bus.',
        focus: ['ecm', 'meter', 'eps', 'ac', 'skid', 'body'],
        broadcasts: [{ from: 'ecm', msg: 0x1c4, to: ['meter', 'eps', 'ac', 'skid', 'body'] }],
        frame: { msg: 0x1c4, values: { RPM: 750, ENGINE_RUNNING: 1, MILREQ: 0 } },
        note: 'If the ECM goes silent, the tachometer drops to 0 rpm and the meter stores U0100.',
        sources: ['openpilotFingerprint', 'opendbc', 'opendbcRef', 'rmFailSafe'],
      },
      {
        title: 'Daytime running lights on',
        body: 'The main body ECU turns on the DRLs once CAN says the engine is running and its own parking-brake switch input says the brake is released.',
        focus: ['body'],
        wired: ['Parking brake switch', 'Headlight / DRL relays'],
        note: 'Without ECM data the DRL control does not operate; the main body ECU stores U0100.',
        sources: ['ncfDrl', 'rmFailSafe'],
      },
    ],
  },
  {
    id: 'reverse',
    title: 'Shift into reverse',
    tagline: 'One shift lever, three networks',
    preset: 'base',
    steps: [
      {
        title: 'Lever into R',
        body: 'The lever turns the park/neutral position switch on the transaxle. Its R contact feeds the back-up lights directly and tells the ECM the new position.',
        focus: ['ecm'],
        wired: ['Park/neutral position switch → ECM', 'Back-up lights (direct from the switch)'],
        sources: ['ncfCvt', 'ewdBackup'],
      },
      {
        title: 'Shift position broadcast',
        body: 'The ECM broadcasts the shift position — GEAR = 16 means R. The meter lights its R indicator; the main body ECU uses shift position for automatic door locks; the head unit uses it for the camera.',
        focus: ['ecm', 'meter', 'radio', 'body'],
        broadcasts: [{ from: 'ecm', msg: 0x3bc, to: ['meter', 'radio', 'body'] }],
        frame: { msg: 0x3bc, values: { GEAR: 16, DRIVE_ENGAGED: 0 } },
        sources: ['opendbc', 'ncfCvt', 'rmFailSafe'],
      },
      {
        title: 'Camera on screen',
        body: 'The radio & display receiver powers the rear camera (CB+) and switches the screen to its analog video (CV+ / CV−). Video stays on its own shielded pair — an image is far more data than a 500 kbit/s bus carries.',
        focus: ['radio', 'camera'],
        hops: [{ edge: 'vid-radio' }],
        note: 'If the ECM stops talking, the screen does not change to the camera view (U0100 in the receiver).',
        sources: ['ncfRearCamera', 'ewdAudio', 'rmFailSafe'],
      },
    ],
  },
  {
    id: 'door',
    title: 'Open the driver’s door',
    tagline: 'A switch, a light and a warning',
    preset: 'base',
    steps: [
      {
        title: 'Door opens',
        body: 'Opening the door releases the courtesy switch in the jamb. It is wired to the main body ECU (FLCY) through the driver-side junction block the ECU is mounted to.',
        focus: ['body'],
        wired: ['Driver door courtesy switch · FLCY'],
        sources: ['ewdInteriorLight', 'ncfEntry'],
      },
      {
        title: 'Interior lights on',
        body: 'The main body ECU fades the interior lights on (illuminated entry). This is a hard-wired output — no network involved.',
        focus: ['body'],
        wired: ['Dome & interior lights'],
        sources: ['ncfEntry', 'ewdInteriorLight'],
      },
      {
        title: 'Door status broadcast',
        body: 'It also broadcasts door status. The combination meter shows the door-open warning; with the key still in the cylinder, the key unlock warning switch (also wired to the main body ECU) triggers the key reminder chime.',
        focus: ['body', 'meter'],
        broadcasts: [{ from: 'body', msg: 0x620, to: ['meter'] }],
        frame: { msg: 0x620, values: { DOOR_OPEN_FL: 1, PARKING_BRAKE: 1 } },
        sources: ['opendbc', 'ncfMeter', 'ewdKeyReminder'],
      },
    ],
  },
  {
    id: 'ac',
    title: 'Turn on the A/C',
    tagline: 'LIN button press to engine idle-up',
    preset: 'base',
    steps: [
      {
        title: 'Press A/C',
        body: 'The control panel switches nothing itself. The A/C amplifier is the LIN master: it sends a header, and the panel answers in the same frame with its button states.',
        focus: ['acpanel', 'ac'],
        hops: [{ edge: 'lin-ac', reverse: true }],
        sources: ['ncfLinDiagram', 'ncfAc', 'cssLin'],
      },
      {
        title: 'Sensors and compressor',
        body: 'The amplifier reads the evaporator thermistor and refrigerant pressure, then drives the variable-capacity compressor’s control valve, the blower and the damper servos.',
        focus: ['ac'],
        wired: ['Evaporator temp · TE', 'A/C pressure · PRE', 'Compressor valve · SOL+', 'Blower · SI'],
        sources: ['ncfAc', 'ewdAc'],
      },
      {
        title: 'Tell the engine',
        body: 'The A/C state goes out on CAN. The ECM raises idle for the compressor load, coordinates the CVT and speeds up the cooling fan through the cooling fan ECU (a hard-wired duty signal).',
        focus: ['ac', 'ecm'],
        broadcasts: [{ from: 'ac', msg: 0x380, to: ['ecm'] }],
        frame: { msg: 0x380, values: { BLWON: 1, FAN_AC: 1, ECOSW: 0 } },
        sources: ['ncfCvt', 'ncfAc', 'rmFailSafe', 'ewdCoolingFan'],
      },
      {
        title: 'Data the A/C needs back',
        body: 'Coolant temperature and engine speed come from the ECM; ambient temperature and vehicle speed from the combination meter, which reads the outside thermistor.',
        focus: ['ac', 'ecm', 'meter'],
        broadcasts: [
          { from: 'ecm', msg: 0x1c4, to: ['ac'] },
          { from: 'meter', msg: null, to: ['ac'], delay: 0.9 },
        ],
        note: 'Without ECM data the amplifier assumes 80 °C (176 °F) coolant and 0 rpm, and stores U0100.',
        sources: ['ncfAc', 'rmFailSafe'],
      },
    ],
  },
  {
    id: 'vsc',
    title: 'Skid on a slippery curve',
    tagline: 'Sensor fusion across three modules',
    preset: 'base',
    steps: [
      {
        title: 'The car starts to rotate',
        body: 'The yaw-rate and G sensors inside the airbag sensor assembly and the steering sensor stream their readings. The skid control ECU compares where the driver is steering with how the car is actually turning.',
        focus: ['airbag', 'steer', 'skid'],
        broadcasts: [
          { from: 'airbag', msg: 0x024, to: ['skid', 'ecm'] },
          { from: 'steer', msg: 0x025, to: ['skid'], delay: 0.5 },
        ],
        frame: { msg: 0x024, values: { YAW_RATE: 18, ACCEL_X: -1.2, ACCEL_Y: 4.5 } },
        sources: ['ncfVsc', 'ncfBrake', 'opendbc'],
      },
      {
        title: 'Brake one wheel',
        body: 'Sensing oversteer or understeer, it brakes individual wheels through the actuator’s solenoid valves and pump to swing the car back onto its line. Wheel speeds come straight from four hard-wired sensors.',
        focus: ['skid'],
        wired: ['Wheel speed sensors ×4', 'Solenoid valves', 'Pump motor'],
        sources: ['ncfVsc', 'ncfBrake'],
      },
      {
        title: 'Ask the engine to back off',
        body: 'At the same time it sends an engine-output reduction request on CAN, and the ECM closes the electronic throttle.',
        focus: ['skid', 'ecm'],
        broadcasts: [{ from: 'skid', msg: null, to: ['ecm'] }],
        sources: ['ncfVsc', 'ncfBrake', 'ncfEngine'],
      },
      {
        title: 'Slip indicator blinks',
        body: 'The slip indicator in the meter blinks while VSC or TRAC is working — commanded by the skid control ECU over CAN.',
        focus: ['skid', 'meter'],
        broadcasts: [{ from: 'skid', msg: 0x3b7, to: ['meter'] }],
        frame: { msg: 0x3b7, values: { SLP_WL: 1 } },
        sources: ['ncfBrake', 'opendbcRef'],
      },
    ],
  },
  {
    id: 'eps',
    title: 'Steering assist',
    tagline: 'Speed-sensitive EPS and its fail-safe',
    preset: 'base',
    steps: [
      {
        title: 'Driver turns the wheel',
        body: 'A torque sensor in the steering column measures how hard the driver is turning.',
        focus: ['eps'],
        wired: ['Torque sensor (column)', 'Assist motor'],
        sources: ['ncfEps'],
      },
      {
        title: 'How fast are we going?',
        body: 'Vehicle speed from the skid control ECU and engine speed from the ECM set the assist: light at parking speed, firmer on the highway.',
        focus: ['skid', 'ecm', 'eps'],
        broadcasts: [
          { from: 'skid', msg: 0x0b4, to: ['eps', 'meter'] },
          { from: 'ecm', msg: 0x1c4, to: ['eps'], delay: 0.6 },
        ],
        frame: { msg: 0x0b4, values: { SPEED: 60, ENCODER: 0 } },
        sources: ['ncfEps', 'rmFailSafe', 'opendbc', 'opendbcChecksum'],
      },
      {
        title: 'Load control',
        body: 'When the power steering ECU detects battery voltage dropping, it sends an electric-load control signal: the A/C amplifier limits electrical usage and the ECM raises idle.',
        focus: ['eps', 'ac', 'ecm'],
        broadcasts: [{ from: 'eps', msg: null, to: ['ac', 'ecm'] }],
        sources: ['ncfEps', 'rmFailSafe'],
      },
      {
        title: 'If speed data disappears',
        body: 'Unplug the skid control ECU and the power steering ECU no longer knows the speed. It holds the assist that suits 70 km/h (43 mph): heavy when parking, light on the highway.',
        focus: ['eps', 'meter'],
        silent: 'skid',
        note: 'The EPS warning light comes on and U0129 is stored in the power steering ECU, ECM, meter and head unit.',
        sources: ['rmFailSafe', 'rmDiagnosis'],
      },
    ],
  },
  {
    id: 'tpms',
    title: 'Low tire pressure',
    tagline: 'Radio → serial → CAN → warning light',
    preset: 'base',
    steps: [
      {
        title: 'The tire reports',
        body: 'Each valve stem holds a battery-powered sensor that radios pressure, temperature and its ID code.',
        focus: ['valves', 'tpms'],
        hops: [{ edge: 'rf-valves' }],
        sources: ['ncfTpms'],
      },
      {
        title: 'Receiver judges the pressure',
        body: 'The tire pressure warning ECU & receiver compares the pressure with the threshold it learned when the reset switch was last pressed, then reports to the main body ECU on the PRG / RDA serial lines.',
        focus: ['tpms', 'body'],
        hops: [{ edge: 'ser-tpms' }],
        sources: ['ncfTpms', 'ewdTpms'],
      },
      {
        title: 'Warning light on',
        body: 'The main body ECU puts the warning on CAN and the combination meter lights the tire pressure warning light.',
        focus: ['body', 'meter'],
        broadcasts: [{ from: 'body', msg: null, to: ['meter'] }],
        note: 'If the main body ECU goes silent, the meter turns the light on anyway, to be safe (U0142).',
        sources: ['rmFailSafe', 'ncfTpms'],
      },
    ],
  },
  {
    id: 'belt',
    title: 'Seat belt reminder',
    tagline: 'From buckle switch to chime',
    preset: 'base',
    steps: [
      {
        title: 'Buckles are read',
        body: 'The driver’s buckle switch is wired to the airbag sensor. On the passenger side the occupant detection ECU combines two seat-weight sensors with the buckle switch and reports on its dedicated line.',
        focus: ['airbag', 'ods'],
        hops: [{ edge: 'ser-ods' }],
        wired: ['Driver buckle switch → airbag sensor'],
        sources: ['ncfAirbag', 'ncfOcs', 'ewdSeatbelt'],
      },
      {
        title: 'Belt status on the bus',
        body: 'The airbag sensor broadcasts belt status (Toyota field DBKLAB for the driver), and the combination meter runs the reminder light and buzzer.',
        focus: ['airbag', 'meter'],
        broadcasts: [{ from: 'airbag', msg: 0x3b1, to: ['meter'] }],
        frame: { msg: 0x3b1, values: { DBKLAB: 1 } },
        sources: ['opendbcRef', 'ncfMeter', 'ncfAirbag'],
      },
    ],
  },
  {
    id: 'scan',
    title: 'Plug in a scan tool',
    tagline: 'Diagnostics over the same wires',
    preset: 'base',
    steps: [
      {
        title: 'Connect to the DLC3',
        body: 'The 16-pin DLC3 under the dash is a branch of the V bus: pins 6 and 14 are CANH and CANL, pin 16 is battery power, pins 4 and 5 are grounds.',
        focus: ['dlc3'],
        sources: ['ewdDlc3', 'ncfCanDetails'],
      },
      {
        title: 'Request and response',
        body: 'Diagnostic requests are ordinary CAN frames with reserved IDs. 0x7E0 asks the ECM, which answers on 0x7E8; the skid control ECU (0x7B0) and power steering ECU (0x7A1) work the same way.',
        focus: ['dlc3', 'ecm'],
        broadcasts: [
          { from: 'dlc3', msg: 0x7e0, to: ['ecm'] },
          { from: 'ecm', msg: 0x7e8, to: ['dlc3'], delay: 1.7 },
        ],
        sources: ['openpilotFingerprint', 'opendbcFingerprints'],
      },
      {
        title: 'The non-CAN modules',
        body: 'The transponder key ECU and the occupant detection ECU are not on CAN. Techstream reaches them on the single-wire K-line at pin 7.',
        focus: ['dlc3', 'immo', 'ods'],
        hops: [{ edge: 'kl-immo' }, { edge: 'kl-ods', delay: 0.3 }],
        sources: ['ewdDlc3'],
      },
      {
        title: 'CAN Bus Check',
        body: 'Techstream’s CAN Bus Check lists every ECU it hears. Watch it for about two minutes: one missing ECU points to a communication stop at that ECU; many missing ECUs point to the main line.',
        focus: ['dlc3', 'ecm', 'skid', 'meter', 'body', 'airbag', 'steer', 'eps', 'ac', 'radio'],
        sources: ['rmDiagnosis'],
      },
    ],
  },
  {
    id: 'eco',
    title: 'LE Eco local bus',
    tagline: 'A private CAN for the Valvematic engine',
    preset: 'eco',
    requires: ['eco'],
    steps: [
      {
        title: 'A second CAN port',
        body: 'On the LE Eco the ECM has a second CAN port. A local bus through the No. 1 CAN junction connector links it to the Valvematic controller and the generator control ECU — separate from the V bus.',
        focus: ['ecm', 'jc1', 'vvl', 'genecu'],
        broadcasts: [{ from: 'ecm', msg: null, to: ['vvl', 'genecu'], bus: 'local' }],
        sources: ['ewdCan', 'ewdEngineEco'],
      },
      {
        title: 'Variable valve lift',
        body: 'The Valvematic controller drives the motor that varies intake valve lift; the ECM monitors it with shaft, action-angle and motor-position sensors.',
        focus: ['vvl', 'ecm'],
        broadcasts: [{ from: 'vvl', msg: null, to: ['ecm'], bus: 'local' }],
        note: 'If the controller stops answering for 0.99 s, the ECM stores U011B — a local-bus fault that never appears on the V bus.',
        sources: ['ncfValvematic', 'rmDiagnosis'],
      },
      {
        title: 'Smart charging',
        body: 'The generator control ECU watches battery current and temperature and sends a voltage request to the generator over its own LIN line.',
        focus: ['genecu', 'gen'],
        hops: [{ edge: 'lin-gen' }],
        sources: ['ncfCharging', 'ewdChargingEco'],
      },
    ],
  },
];
