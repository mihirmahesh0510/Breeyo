import type { SpeciesDosage, PrescriptionItem, DosageWarning } from '@breeyo/types';

export class DosageService {
  /**
   * Validates entered dosage against species-specific mg/kg ranges.
   * D-28: Soft warning if outside range — vet can override.
   * Returns null if within range, DosageWarning if outside.
   */
  validateDosage(
    enteredDoseMg: number,
    petWeightKg: number,
    speciesDosage: SpeciesDosage,
  ): DosageWarning | null {
    if (petWeightKg <= 0 || enteredDoseMg <= 0) {
      return null;
    }

    let outOfRange = false;
    let recommendedMinMg: number;
    let recommendedMaxMg: number;
    let enteredDosePerKg: number | undefined;

    if (speciesDosage.isFixedDose) {
      recommendedMinMg = Number(speciesDosage.fixedDoseMin ?? 0);
      recommendedMaxMg = Number(speciesDosage.fixedDoseMax ?? 0);

      if (enteredDoseMg < recommendedMinMg || enteredDoseMg > recommendedMaxMg) {
        outOfRange = true;
      }
    } else {
      const minPerKg = Number(speciesDosage.minDoseMgPerKg);
      const maxPerKg = Number(speciesDosage.maxDoseMgPerKg);
      enteredDosePerKg = enteredDoseMg / petWeightKg;
      recommendedMinMg = minPerKg * petWeightKg;
      recommendedMaxMg = maxPerKg * petWeightKg;

      if (enteredDosePerKg < minPerKg || enteredDosePerKg > maxPerKg) {
        outOfRange = true;
      }
    }

    if (!outOfRange) {
      return null;
    }

    const message = speciesDosage.isFixedDose
      ? `Dose outside recommended range. Recommended: ${recommendedMinMg}-${recommendedMaxMg}mg (fixed dose)`
      : `Dose outside recommended range. Recommended: ${Number(speciesDosage.minDoseMgPerKg)}-${Number(speciesDosage.maxDoseMgPerKg)}mg/kg (${Math.round(recommendedMinMg)}-${Math.round(recommendedMaxMg)}mg for ${petWeightKg}kg)`;

    return {
      level: 'warning',
      message,
      enteredDose: enteredDoseMg,
      enteredDosePerKg,
      recommendedMinMg,
      recommendedMaxMg,
    };
  }

  /**
   * Generates owner-friendly dosage instructions from a prescription item.
   * D-35: Clinical record keeps both clinical + owner-friendly language.
   * Example: "1 tablet (250mg) by mouth twice daily for 7 days"
   */
  generateOwnerInstructions(prescription: PrescriptionItem): string {
    const { dosage, formulation, route, frequency, duration } = prescription;

    const routeText = this.friendlyRoute(route);
    const durationText = this.friendlyDuration(duration);
    const formText = formulation ? ` ${formulation}` : '';

    return `${dosage}${formText} ${routeText} ${frequency.toLowerCase()} ${durationText}`.trim();
  }

  private friendlyRoute(route: string): string {
    const routeMap: Record<string, string> = {
      'Oral': 'by mouth',
      'Injectable (IV)': 'intravenously',
      'Injectable (IM)': 'intramuscularly',
      'Injectable (SC)': 'subcutaneously',
      'Topical': 'applied to skin',
      'Eye Drops': 'in the eye(s)',
      'Ear Drops': 'in the ear(s)',
      'Inhalation': 'by inhalation',
      'Rectal': 'rectally',
    };
    return routeMap[route] || route.toLowerCase();
  }

  private friendlyDuration(duration: string): string {
    if (duration === 'Until finished') return 'until all medication is finished';
    if (duration === 'As needed (PRN)') return 'as needed';
    if (duration === 'Ongoing/Chronic') return 'ongoing';
    return `for ${duration}`;
  }
}
