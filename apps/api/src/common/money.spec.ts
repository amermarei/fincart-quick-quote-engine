import { describe, expect, it } from 'vitest';
import { cadMajorToUsdMinor, cmToIn, kgToLb, roundHalfAwayFromZero } from './money';

describe('roundHalfAwayFromZero', () => {
  it('rounds positive halves up (745.5 -> 746)', () => {
    expect(roundHalfAwayFromZero(745.5)).toBe(746);
  });

  it('rounds negative halves away from zero (-745.5 -> -746)', () => {
    expect(roundHalfAwayFromZero(-745.5)).toBe(-746);
  });

  it('leaves integers and non-half fractions unchanged', () => {
    expect(roundHalfAwayFromZero(745.4)).toBe(745);
    expect(roundHalfAwayFromZero(746)).toBe(746);
  });
});

describe('cadMajorToUsdMinor — per-component conversion', () => {
  const FX = 0.73;

  it('converts and rounds each component separately', () => {
    // 12.34 CAD -> 12.34*100*0.73 = 900.82 -> 901
    expect(cadMajorToUsdMinor(12.34, FX)).toBe(901);
    // 1.61 CAD -> 1.61*100*0.73 = 117.53 -> 118
    expect(cadMajorToUsdMinor(1.61, FX)).toBe(118);
  });

  it('per-component sums differ from a converted total (never derive components)', () => {
    const components = cadMajorToUsdMinor(12.34, FX) + cadMajorToUsdMinor(1.61, FX);
    const convertedTotal = cadMajorToUsdMinor(12.34 + 1.61, FX);
    expect(components).toBe(1019);
    expect(convertedTotal).toBe(1018); // 13.95*73 = 1018.35 -> 1018
  });
});

describe('unit conversion constants', () => {
  it('uses exactly 1 kg = 2.20462262 lb, unrounded', () => {
    expect(kgToLb(1)).toBe(2.20462262);
    expect(kgToLb(5)).toBe(11.0231131);
  });

  it('uses exactly 1 in = 2.54 cm, unrounded', () => {
    expect(cmToIn(2.54)).toBe(1);
    expect(cmToIn(30)).toBeCloseTo(11.811023622047244, 10);
  });
});