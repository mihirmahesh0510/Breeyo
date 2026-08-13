import type { VitalRangeCheck, VitalRangeStatus } from '../emr.js';

export interface VitalRange {
  min: number;
  max: number;
  unit: string;
}

export type VitalRanges = Record<string, VitalRange>;

export const VITALS_NORMAL_RANGES: Record<string, VitalRanges> = {
  dog: {
    temperatureC: { min: 38.0, max: 39.2, unit: '°C' },
    heartRateBpm: { min: 60, max: 140, unit: 'bpm' },
    respiratoryRate: { min: 10, max: 30, unit: 'breaths/min' },
  },
  cat: {
    temperatureC: { min: 38.0, max: 39.5, unit: '°C' },
    heartRateBpm: { min: 140, max: 220, unit: 'bpm' },
    respiratoryRate: { min: 20, max: 30, unit: 'breaths/min' },
  },
  rabbit: {
    temperatureC: { min: 38.5, max: 40.0, unit: '°C' },
    heartRateBpm: { min: 120, max: 150, unit: 'bpm' },
    respiratoryRate: { min: 30, max: 60, unit: 'breaths/min' },
  },
  bird: {
    temperatureC: { min: 40.0, max: 42.0, unit: '°C' },
    heartRateBpm: { min: 200, max: 600, unit: 'bpm' },
    respiratoryRate: { min: 15, max: 30, unit: 'breaths/min' },
  },
};

export function checkVitalRange(
  species: string,
  vital: string,
  value: number,
): VitalRangeCheck {
  const speciesRanges = VITALS_NORMAL_RANGES[species.toLowerCase()];
  if (!speciesRanges) {
    return { vital, value, status: 'normal', normalMin: 0, normalMax: 0, unit: '' };
  }

  const range = speciesRanges[vital];
  if (!range) {
    return { vital, value, status: 'normal', normalMin: 0, normalMax: 0, unit: '' };
  }

  let status: VitalRangeStatus;

  if (value >= range.min && value <= range.max) {
    status = 'normal';
  } else {
    // Calculate how far outside the range
    const rangeSpan = range.max - range.min;
    const threshold = rangeSpan * 0.1;

    if (value < range.min) {
      status = range.min - value <= threshold ? 'slightlyAbnormal' : 'criticallyAbnormal';
    } else {
      status = value - range.max <= threshold ? 'slightlyAbnormal' : 'criticallyAbnormal';
    }
  }

  return {
    vital,
    value,
    status,
    normalMin: range.min,
    normalMax: range.max,
    unit: range.unit,
  };
}
