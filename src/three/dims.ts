/**
 * Exterior dimensions of the 2016 Corolla LE (US), from Toyota's 2016 Corolla brochure:
 * overall length 182.6 in, width 69.9 in, height 57.3 in, wheelbase 106.3 in,
 * track 59.8 / 59.9 in, ground clearance 5.5 in, P205/55R16 tires on 16-in. wheels.
 * Toyota does not publish the front / rear overhang split; 0.93 m at the front is an estimate.
 *
 * Car coordinates are metres: +X toward the front bumper, +Y up from the ground,
 * Z across the car with the driver (left, US) side negative. The origin is mid-length on the ground.
 */
const IN = 0.0254;

export const DIM = {
  length: 182.6 * IN,
  width: 69.9 * IN,
  height: 57.3 * IN,
  wheelbase: 106.3 * IN,
  trackF: 59.8 * IN,
  trackR: 59.9 * IN,
  clearance: 5.5 * IN,
  tireR: (16 * IN + 2 * 0.55 * 0.205) / 2,
  tireW: 0.205,
  rimR: 8 * IN,
};

export const X_FRONT = DIM.length / 2;
export const X_REAR = -DIM.length / 2;
export const FRONT_OVERHANG = 0.93;
export const AXLE_F = X_FRONT - FRONT_OVERHANG;
export const AXLE_R = AXLE_F - DIM.wheelbase;
export const HALF_W = DIM.width / 2;

export const WHEELS: { id: 'fl' | 'fr' | 'rl' | 'rr'; x: number; z: number }[] = [
  { id: 'fl', x: AXLE_F, z: -DIM.trackF / 2 },
  { id: 'fr', x: AXLE_F, z: DIM.trackF / 2 },
  { id: 'rl', x: AXLE_R, z: -DIM.trackR / 2 },
  { id: 'rr', x: AXLE_R, z: DIM.trackR / 2 },
];

/**
 * The 2D in-car view (1600 × 1000 drawing, front to the right, driver side on top) is not to scale.
 * Map it piecewise between bumpers and axles so a module keeps its place relative to the wheels.
 */
const D = {
  rear: 112,
  rearAxle: 405,
  frontAxle: 1301,
  front: 1494,
  centre: 500,
  halfWidth: 210,
};

export function fromDrawing(px: number, py: number): [number, number] {
  let x: number;
  if (px <= D.rearAxle) x = X_REAR + ((px - D.rear) / (D.rearAxle - D.rear)) * (AXLE_R - X_REAR);
  else if (px <= D.frontAxle) x = AXLE_R + ((px - D.rearAxle) / (D.frontAxle - D.rearAxle)) * (AXLE_F - AXLE_R);
  else x = AXLE_F + ((px - D.frontAxle) / (D.front - D.frontAxle)) * (X_FRONT - AXLE_F);
  const z = ((py - D.centre) / D.halfWidth) * HALF_W;
  return [x, z];
}
