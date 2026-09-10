import type { CarrierId } from '@qqe/shared';

/**
 * Round half away from zero: 745.5 -> 746, -745.5 -> -746.
 * JS Math.round rounds .5 toward +Infinity, which is wrong for negatives.
 */
export function roundHalfAwayFromZero(x: number): number {
  return Math.sign(x) * Math.round(Math.abs(x));
}

/**
 * Convert a CAD major-unit amount (e.g. 12.34) to USD integer cents at the
 * fixed rate, rounding half away from zero. Applied PER COMPONENT — never
 * to a total with components derived afterwards.
 */
export function cadMajorToUsdMinor(majorUnits: number, fxRate: number): number {
  return roundHalfAwayFromZero(majorUnits * 100 * fxRate);
}

/** 1 kg = 2.20462262 lb — exact constant, returned UNROUNDED. */
export function kgToLb(kg: number): number {
  return kg * 2.20462262;
}

/** 1 in = 2.54 cm exactly — returned UNROUNDED. */
export function cmToIn(cm: number): number {
  return cm / 2.54;
}

/**
 * Chargeable-weight rule: round UP to the nearest 0.5 kg multiple.
 * A value already on a multiple is unchanged: 6.0 stays 6.0, 6.01 becomes 6.5.
 */
export function roundUpToHalfKg(x: number): number {
  return Math.ceil(x * 2) / 2;
}