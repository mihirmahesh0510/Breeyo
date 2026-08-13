import type { VaccinationInterval } from '../vaccination.js';

export const VACCINATION_INTERVALS: readonly VaccinationInterval[] = [
  // Dog vaccines
  { vaccineName: 'DHPPi', species: 'DOG', intervalDays: 21, minAgeDays: 42, maxAgeDays: 120, isBooster: false },
  { vaccineName: 'DHPPi', species: 'DOG', intervalDays: 365, minAgeDays: 120, maxAgeDays: null, isBooster: true },
  { vaccineName: 'Anti-Rabies', species: 'DOG', intervalDays: 365, minAgeDays: 90, maxAgeDays: null, isBooster: false },
  { vaccineName: 'Kennel Cough (Bordetella)', species: 'DOG', intervalDays: 365, minAgeDays: 56, maxAgeDays: null, isBooster: false },
  { vaccineName: 'Canine Coronavirus', species: 'DOG', intervalDays: 21, minAgeDays: 42, maxAgeDays: 120, isBooster: false },
  { vaccineName: 'Leptospirosis', species: 'DOG', intervalDays: 365, minAgeDays: 56, maxAgeDays: null, isBooster: false },
  // Cat vaccines
  { vaccineName: 'FVRCP (Tricat)', species: 'CAT', intervalDays: 21, minAgeDays: 56, maxAgeDays: 120, isBooster: false },
  { vaccineName: 'FVRCP (Tricat)', species: 'CAT', intervalDays: 365, minAgeDays: 120, maxAgeDays: null, isBooster: true },
  { vaccineName: 'Anti-Rabies', species: 'CAT', intervalDays: 365, minAgeDays: 90, maxAgeDays: null, isBooster: false },
  { vaccineName: 'FeLV', species: 'CAT', intervalDays: 365, minAgeDays: 56, maxAgeDays: null, isBooster: false },
] as const;

export const DEWORMING_INTERVALS = {
  puppy: { intervalDays: 14, minAgeDays: 14, maxAgeDays: 90 },
  kittenPuppy3to6months: { intervalDays: 30, minAgeDays: 90, maxAgeDays: 180 },
  adult: { intervalDays: 90, minAgeDays: 180, maxAgeDays: null },
} as const;

export function calculateNextDueDate(
  vaccineName: string,
  species: string,
  petAgeDays: number,
  administeredDate: Date,
): Date | null {
  const intervals = VACCINATION_INTERVALS.filter(
    (v) => v.vaccineName === vaccineName && v.species === species,
  );

  // Find the matching interval for the pet's age
  const interval = intervals.find((v) => {
    if (petAgeDays < v.minAgeDays) return false;
    if (v.maxAgeDays !== null && petAgeDays > v.maxAgeDays) return false;
    return true;
  });

  // If no age-specific match, use the booster interval
  const effectiveInterval = interval ?? intervals.find((v) => v.isBooster);

  if (!effectiveInterval) return null;

  const nextDue = new Date(administeredDate);
  nextDue.setDate(nextDue.getDate() + effectiveInterval.intervalDays);
  return nextDue;
}
