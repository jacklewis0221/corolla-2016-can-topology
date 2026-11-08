// Trouble-code definitions and guided procedures. Step titles, numbers, specs and branch logic follow
// the Toyota repair manual pages cited on each procedure (RM30N0U, 2014–2015 Corolla). Steps marked
// `console: true` are the concept tool's own additions and are labelled that way in the UI.

import type { SourceKey } from '../../data/sources';

export type FixId = 'plugs' | 'pcv' | 'branch' | 'battery' | 'tpms' | 'acLeak';

export type Hook =
  | 'otherDtcs'
  | 'manual'
  | 'pcvHose'
  | 'freezeMisfire'
  | 'misfireCounts'
  | 'plugInspect'
  | 'confirmCodes'
  | 'canCheck'
  | 'skidDtc'
  | 'probeA41'
  | 'batteryRest'
  | 'crankTest'
  | 'batteryTester'
  | 'charging'
  | 'tpmsDrop'
  | 'tpmsIds'
  | 'tpmsRegister'
  | 'tpmsInit'
  | 'tpmsConfirm'
  | 'acPre'
  | 'acVacuum'
  | 'acCharge'
  | 'info';

export interface ProcStep {
  key: string;
  n?: string;
  title: string;
  what: string;
  spec?: string;
  hook: Hook;
  next?: string;
  ok?: string;
  ng?: string;
  okLabel?: string;
  ngLabel?: string;
  /** What the manual says to do on the branch this vehicle does not take. */
  otherBranch?: string;
  repair?: { label: string; detail: string; fix: FixId };
  needsControl?: boolean;
  console?: boolean;
  end?: boolean;
}

export interface Procedure {
  id: string;
  title: string;
  src: SourceKey[];
  start: string;
  steps: ProcStep[];
  basis: 'rm' | 'console';
  intro: string;
}

export interface DtcDef {
  code: string;
  title: string;
  ecu: string;
  system: string;
  detect: string;
  areas: string[];
  mil: string;
  src: SourceKey[];
  proc?: string;
  notes?: string[];
}

export const DTC_DEFS: Record<string, DtcDef> = {
  P0301: {
    code: 'P0301',
    title: 'Cylinder 1 Misfire Detected',
    ecu: 'ecm',
    system: 'Engine and ECT · SFI system',
    detect:
      'Misfiring is detected in a specific cylinder that could damage the three-way catalytic converter (the MIL blinks) or that raises exhaust emissions (the MIL comes on). 2-trip detection logic.',
    areas: [
      'Open or short in engine wire harness',
      'Connector connection',
      'Vacuum hose connections',
      'Ignition system',
      'Fuel injector assembly',
      'Fuel pressure',
      'Mass air flow meter sub-assembly',
      'Engine coolant temperature sensor',
      'Compression pressure',
      'Valve timing',
      'PCV valve and hose',
      'PCV hose connections',
      'Intake system',
      'ECM',
    ],
    mil: 'Blinks (catalyst-damaging misfire) or comes on',
    src: ['rmP0300'],
    proc: 'misfire',
  },
  P0171: {
    code: 'P0171',
    title: 'System Too Lean (Bank 1)',
    ecu: 'ecm',
    system: 'Engine and ECT · SFI system',
    detect:
      'With a warm engine and stable air-fuel ratio feedback, the fuel trim is considerably in error to the lean side. 2-trip detection logic.',
    areas: [
      'Intake system',
      'Fuel injector assembly',
      'Mass air flow meter sub-assembly',
      'Engine coolant temperature sensor',
      'Fuel pressure',
      'Gas leak from exhaust system',
      'Open or short in air fuel ratio sensor (sensor 1) circuit',
      'Air fuel ratio sensor (sensor 1)',
      'PCV valve and hose',
      'PCV hose connections',
      'Wire harness or connector',
      'ECM',
    ],
    mil: 'Comes on',
    src: ['rmP0171'],
    proc: 'lean',
  },
  U0129: {
    code: 'U0129',
    title: 'Lost Communication with Brake System Control Module',
    ecu: 'ecm',
    system: 'CAN communication system',
    detect:
      'A receiving ECU stops getting skid control ECU data — for example, the ECM after 2.22 s and the power steering ECU after 2.34 s without it.',
    areas: [
      'Skid control ECU (brake actuator assembly) branch line or connector',
      'Power source circuit of the skid control ECU',
      'Skid control ECU ground circuit',
      'Skid control ECU (brake actuator assembly)',
    ],
    mil: 'Depends on the storing ECU',
    src: ['rmDiagnosis', 'rmStopSkid', 'rmFailSafe'],
    proc: 'canSkid',
  },
  C2123: {
    code: 'C2123/23',
    title: 'No Signal from Transmitter ID3',
    ecu: 'tpms',
    system: 'Tire pressure warning system',
    detect:
      'No transmitter ID is received for 20 minutes or more while the vehicle speed is above 37 km/h (23 mph), or with no speed signal for 20 minutes. Clears only with the Techstream.',
    areas: ['Tire pressure warning valve and transmitter', 'Tire pressure warning ECU and receiver'],
    mil: 'Tire pressure warning light blinks for 1 minute, then stays on',
    src: ['rmC2121', 'ownersManual'],
    proc: 'tpms',
    notes: [
      'Toyota lists the usual causes: devices on similar radio frequencies nearby or in the car, a mistyped ID during registration, or a wheel / transmitter from another vehicle.',
      'IDs are not tied to wheel positions — the manual identifies the dead transmitter by deflating each tire at least 40 kPa (5.8 psi) and watching which ID does not change.',
    ],
  },
  B1423: {
    code: 'B1423/23',
    title: 'Pressure Sensor Circuit',
    ecu: 'ac',
    system: 'Air conditioning system (automatic A/C)',
    detect:
      'Open or short in the air conditioner pressure sensor circuit, or refrigerant pressure on the high side is extremely low (176 kPa / 26 psi or less) or extremely high (3,025 kPa / 439 psi or more).',
    areas: [
      'Air conditioner pressure sensor',
      'Harness or connector between the pressure sensor and the A/C amplifier',
      'Air conditioning amplifier assembly',
      'Cooler expansion valve (blocked, stuck)',
      'Cooler condenser assembly (blocked or dirty)',
      'Cooler dryer',
      'Cooling fan system',
      'Air conditioning system (leaks, blocked)',
    ],
    mil: 'No MIL (body DTC)',
    src: ['rmB1423'],
    proc: 'acLow',
  },
  C1241: {
    code: 'C1241',
    title: 'Low Power Supply Voltage Malfunction',
    ecu: 'skid',
    system: 'Vehicle stability control system',
    detect:
      'For example: at 3 km/h (2 mph) or more, the skid control ECU’s IG1 terminal voltage stays below 9.5 V for 10 s or more. ABS is prohibited while it is set, and the DTC clears itself when IG1 voltage returns to normal.',
    areas: [
      'ECU-IG NO. 2 fuse',
      'Battery',
      'Charging system',
      'Power source circuit',
      'Internal power supply circuit of the skid control ECU',
    ],
    mil: 'ABS and slip indicators',
    src: ['rmC1241'],
    proc: 'battery',
  },
};

export const PROCEDURES: Record<string, Procedure> = {
  misfire: {
    id: 'misfire',
    title: 'P0300–P0304 · Random / Multiple Cylinder Misfire Detected',
    src: ['rmP0300'],
    basis: 'rm',
    start: 's1',
    intro:
      'Follows the repair manual flow for misfire DTCs on the 2ZR-FE. Steps 4–5 cover the catalyst over-temperature fuel cut and are summarized here.',
    steps: [
      {
        key: 's1',
        n: '1',
        title: 'Check any other DTCs output',
        what: 'Read every ECM code. Only misfire codes → continue. Other codes too → troubleshoot those first.',
        hook: 'otherDtcs',
        ok: 's2',
        okLabel: 'A · misfire DTCs only',
        ngLabel: 'B · other DTCs too',
        otherBranch: 'Go to the DTC chart and fix the other codes first.',
      },
      {
        key: 's2',
        n: '2',
        title: 'Check PCV hose connections',
        what: 'Look for disconnected or cracked PCV hoses.',
        hook: 'pcvHose',
        ok: 's3',
        otherBranch: 'Repair or replace the PCV hose.',
      },
      {
        key: 's3',
        n: '3',
        title: 'Read Misfire RPM and Misfire Load',
        what: 'Data List › Gas Misfire. They record the engine speed and load when the misfire was detected.',
        hook: 'freezeMisfire',
        next: 's4',
      },
      {
        key: 's4',
        n: '4–5',
        title: 'Read Catalyst OT MF F/C, then prohibit it with the active test',
        what: 'The ECM can cut fuel to a misfiring cylinder to protect the catalyst. The manual has you check that value and temporarily prohibit the fuel cut so the misfire can be reproduced.',
        hook: 'info',
        next: 's6',
        needsControl: true,
      },
      {
        key: 's6',
        n: '6',
        title: 'Read cylinder misfire counts',
        what: 'Idle, then drive at the recorded Misfire RPM and Load and read Cylinder #1–#4 Misfire Count. If it is hard to reproduce, use Misfire Margin — above 30 % is normal.',
        hook: 'misfireCounts',
        ok: 's7',
        okLabel: 'A · 1 or 2 cylinders',
        ngLabel: 'B · 3+ cylinders equally',
        otherBranch: 'Check the intake system, fuel pressure, coolant temperature and MAF (steps 18–21).',
      },
      {
        key: 's7',
        n: '7',
        title: 'Inspect spark plug',
        what: 'Remove and inspect the spark plug of the misfiring cylinder.',
        hook: 'plugInspect',
        ng: 'r1',
        otherBranch: 'Plug OK → step 8, spark test.',
      },
      {
        key: 'r1',
        title: 'Replace spark plug',
        what: 'Replace the plug, then perform “Inspection After Repair”.',
        hook: 'info',
        repair: {
          label: 'Replace spark plugs',
          detail: 'All four plugs are at 118,640 mi; Toyota’s schedule replaces them at 120,000 mi, so the console suggests the full set.',
          fix: 'plugs',
        },
        next: 's33',
      },
      {
        key: 's33',
        n: '33',
        title: 'Confirm whether the malfunction has been repaired',
        what: 'Clear the DTCs, drive under the recorded misfire conditions, and check that no misfire DTC returns.',
        hook: 'confirmCodes',
        end: true,
      },
    ],
  },
  lean: {
    id: 'lean',
    title: 'P0171 / P0172 · System Too Lean / Too Rich (Bank 1)',
    src: ['rmP0171'],
    basis: 'rm',
    start: 's1',
    intro:
      'Follows the repair manual flow for fuel-trim DTCs on the 2ZR-FE. The injection-volume active test (step 4) and the 2,500 rpm trim comparison are available as supporting checks.',
    steps: [
      {
        key: 's1',
        n: '1',
        title: 'Check any other DTCs output',
        what: 'Only P0171 / P0172 → continue. Other codes too → troubleshoot those first.',
        hook: 'otherDtcs',
        ok: 's2',
        okLabel: 'A · P0171 only',
        ngLabel: 'B · other DTCs too',
        otherBranch: 'Go to the DTC chart.',
      },
      {
        key: 's2',
        n: '2',
        title: 'Check PCV hose connections',
        what: 'Inspect the PCV hoses for disconnection and cracks. Unmetered air entering here leans the mixture.',
        hook: 'pcvHose',
        ng: 'r1',
        otherBranch: 'OK → step 3, check the intake system.',
      },
      {
        key: 'r1',
        title: 'Repair or replace PCV hose',
        what: 'Replace the cracked hose and clamps.',
        hook: 'info',
        repair: { label: 'Replace PCV hose', detail: 'The last visit (126,880 mi) already noted hardened PCV hoses.', fix: 'pcv' },
        next: 's20',
      },
      {
        key: 's20',
        n: '20',
        title: 'Confirm whether the malfunction has been repaired',
        what: 'Clear the DTCs, let fuel trim relearn, drive, and check that P0171 does not return.',
        hook: 'confirmCodes',
        end: true,
      },
    ],
  },
  canSkid: {
    id: 'canSkid',
    title: 'Brake Actuator (Skid Control ECU) Communication Stop Mode',
    src: ['rmStopSkid', 'rmDiagnosis'],
    basis: 'rm',
    start: 's0',
    intro:
      'U0129 stored by several ECUs, with the skid control ECU missing from the CAN bus check, matches “Brake Actuator (Skid Control ECU) Communication Stop Mode” in the DTC combination table.',
    steps: [
      {
        key: 's0',
        title: 'CAN bus check',
        what: 'List which ECUs answer on the bus. The skid control ECU (ABS/VSC/TRAC) is missing, and the ECM, power steering ECU, meter and navigation receiver all store U0129.',
        hook: 'canCheck',
        next: 's1',
        console: true,
      },
      {
        key: 's1',
        n: '1',
        title: 'Check DTC (brake control system)',
        what: 'Chassis / ABS/VSC/TRAC / Trouble Codes. OK when C1241 (low supply voltage) is not output.',
        hook: 'skidDtc',
        ok: 's2',
        otherBranch: 'C1241 output → follow the C1241 procedure.',
      },
      {
        key: 's2',
        n: '2',
        title: 'Check for open in CAN bus lines (skid control ECU branch line)',
        what: 'Turn the ignition off and wait, disconnect the negative battery cable, unplug A41, and measure the harness side between A41-25 (CANH) and A41-14 (CANL).',
        spec: '54–69 Ω with the battery cable disconnected',
        hook: 'probeA41',
        ng: 'r1',
        otherBranch: 'Within spec → replace the skid control ECU (brake actuator assembly).',
      },
      {
        key: 'r1',
        title: 'Repair or replace CAN branch line or connector (skid control ECU)',
        what: 'Repair the A41 branch wiring.',
        hook: 'info',
        repair: {
          label: 'Repair A41 CAN branch',
          detail: 'Branch pinched behind the new bumper cover; terminals 25 and 14 re-pinned and the harness re-routed.',
          fix: 'branch',
        },
        next: 'c1',
      },
      {
        key: 'c1',
        title: 'Clear U0129 and re-run the CAN bus check',
        what: 'Clear the codes in every ECU that stored U0129, cycle the ignition and confirm the skid control ECU answers and the warning lights go out.',
        hook: 'confirmCodes',
        end: true,
        console: true,
      },
    ],
  },
  battery: {
    id: 'battery',
    title: 'Concern: slow crank, ABS and slip lights came on briefly',
    src: ['rmC1241'],
    basis: 'console',
    start: 'b0',
    intro:
      'No DTC is stored. Toyota notes that C1241 clears itself once the skid control ECU’s supply voltage recovers — which fits lights that came on and went out. This is the console’s own workflow built around that fact; only the 11–14 V check comes from the manual.',
    steps: [
      {
        key: 'b0',
        title: 'Read codes in all ECUs',
        what: 'No DTCs. C1241 would not stay stored after the voltage recovered.',
        hook: 'otherDtcs',
        next: 'b1',
        console: true,
      },
      {
        key: 'b1',
        n: '1',
        title: 'Check battery',
        what: 'Measure battery voltage with the engine off.',
        spec: 'Standard voltage: 11–14 V (C1241 procedure, step 1)',
        hook: 'batteryRest',
        next: 'b2',
      },
      {
        key: 'b2',
        title: 'Record a cranking test',
        what: 'Crank and start while the adapter samples pin 16. A dip below 9.5 V matches the C1241 threshold.',
        hook: 'crankTest',
        next: 'b3',
        console: true,
      },
      {
        key: 'b3',
        title: 'Battery tester (shop tool)',
        what: 'Conductance test of the 6-year-old battery.',
        hook: 'batteryTester',
        next: 'b4',
        console: true,
      },
      {
        key: 'b4',
        title: 'Charging voltage with the engine running',
        what: 'Rules out the charging system before replacing the battery.',
        hook: 'charging',
        next: 'r1',
        console: true,
      },
      {
        key: 'r1',
        title: 'Replace 12 V battery',
        what: 'Replace the battery and re-test.',
        hook: 'info',
        repair: { label: 'Replace 12 V battery', detail: 'Battery fitted at 84,300 mi in December 2020.', fix: 'battery' },
        next: 'b5',
      },
      {
        key: 'b5',
        title: 'Repeat the cranking test',
        what: 'Cranking voltage should stay well above 9.5 V.',
        hook: 'crankTest',
        end: true,
        console: true,
      },
    ],
  },
  tpms: {
    id: 'tpms',
    title: 'C2121/21–C2124/24 · No Signal from Transmitter ID1–ID4',
    src: ['rmC2121'],
    basis: 'rm',
    start: 's1',
    intro: 'Follows the repair manual flow for a missing tire-pressure transmitter.',
    steps: [
      {
        key: 's1',
        n: '1',
        title: 'Check frequency receiving condition',
        what: 'Make sure no facility or device using similar radio frequencies is nearby, and none is installed in the car.',
        hook: 'manual',
        ok: 's2',
        otherBranch: 'Interference found → check for user-installed devices.',
      },
      {
        key: 's2',
        n: '2',
        title: 'Identify transmitter corresponding to DTC',
        what: 'Set all tires to spec, then drop each tire at least 40 kPa (5.8 psi) within 30 s while watching the ID values. The ID that never changes belongs to the faulty transmitter.',
        hook: 'tpmsDrop',
        next: 's3',
      },
      {
        key: 's3',
        n: '3',
        title: 'Check transmitter ID',
        what: 'Compare “Registered ID 3 Code” with the number printed on the transmitter you identified.',
        hook: 'tpmsIds',
        ok: 's4',
        okLabel: 'IDs match',
        ngLabel: 'IDs differ',
        otherBranch: 'IDs differ → register the correct ID (step 5).',
      },
      {
        key: 's4',
        n: '4',
        title: 'Replace tire pressure warning valve and transmitter',
        what: 'Fit a new valve and transmitter in the identified wheel.',
        hook: 'info',
        repair: {
          label: 'Replace RR valve & transmitter',
          detail: 'Original 2015 transmitter; the internal battery is not serviceable.',
          fix: 'tpms',
        },
        next: 's5',
      },
      {
        key: 's5',
        n: '5',
        title: 'Registration of transmitter ID',
        what: 'Write the new transmitter’s ID into the TPMS ECU with the console.',
        hook: 'tpmsRegister',
        next: 's6',
        needsControl: true,
      },
      {
        key: 's6',
        n: '6',
        title: 'Perform initialization',
        what: 'With pressures at spec, run initialization so the ECU learns the new baseline.',
        hook: 'tpmsInit',
        next: 's7',
        needsControl: true,
      },
      {
        key: 's7',
        n: '7',
        title: 'Confirm tire inflation pressure (data list)',
        what: 'All four ID values should now read.',
        hook: 'tpmsConfirm',
        end: true,
      },
    ],
  },
  acLow: {
    id: 'acLow',
    title: 'B1423/23 · Pressure Sensor Circuit (automatic A/C)',
    src: ['rmB1423'],
    basis: 'rm',
    start: 's1',
    intro:
      'The repair manual path this vehicle follows: circuit checks pass, the sensor signal is out of range because the refrigerant is low, and the system will not hold vacuum.',
    steps: [
      {
        key: 's1',
        n: '1',
        title: 'Check harness and connector (power source circuit)',
        what: 'Check the pressure sensor’s supply circuit.',
        hook: 'manual',
        ok: 's2',
        otherBranch: 'NG → step 18, harness between amplifier and sensor.',
      },
      {
        key: 's2',
        n: '2',
        title: 'Check harness and connector (ground circuit)',
        what: 'Check the pressure sensor’s ground circuit.',
        hook: 'manual',
        ok: 's3',
        otherBranch: 'NG → step 17.',
      },
      {
        key: 's3',
        n: '3',
        title: 'Inspect air conditioner pressure sensor (sensor signal circuit)',
        what: 'With the amplifier removed but connected, measure E37-9 (PRE) to body ground, ignition ON, A/C off. Out of range can also mean the refrigerant amount is wrong.',
        spec: '0.74–4.62 V',
        hook: 'acPre',
        ng: 's11',
        otherBranch: 'Within spec → step 4.',
      },
      {
        key: 's11',
        n: '11',
        title: 'Check harness and connector (amplifier – pressure sensor)',
        what: 'Check the wiring between the A/C amplifier and the pressure sensor.',
        hook: 'manual',
        ok: 's12',
        otherBranch: 'NG → repair or replace harness or connector.',
      },
      {
        key: 's12',
        n: '12',
        title: 'Inspect for air conditioning system leak',
        what: 'Install a manifold gauge set, recover the refrigerant, evacuate, and check that vacuum holds.',
        hook: 'acVacuum',
        ng: 's16',
        otherBranch: 'Vacuum holds → step 13, charge the system.',
      },
      {
        key: 's16',
        n: '16',
        title: 'Repair air conditioning system leak',
        what: 'Repair or replace the leaking part.',
        hook: 'info',
        repair: { label: 'Replace condenser (leak)', detail: 'UV dye traces at the condenser’s lower inlet fitting.', fix: 'acLeak' },
        next: 's13',
      },
      {
        key: 's13',
        title: 'Charge system with refrigerant',
        what: 'Evacuate and charge to the specified amount.',
        hook: 'acCharge',
        next: 's14',
      },
      {
        key: 's14',
        title: 'Recheck for DTC',
        what: 'Clear B1423/23, run the A/C and confirm the code does not return and the vent air is cold.',
        hook: 'confirmCodes',
        end: true,
      },
    ],
  },
};
