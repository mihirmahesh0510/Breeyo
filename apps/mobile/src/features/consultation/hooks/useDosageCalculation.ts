import { useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../../../lib/api';
import { useAuth } from '../../../providers/AuthProvider';
import type {
  DrugEntry,
  DosageWarning,
  PrescriptionItem,
} from '@breeyo/types';

interface ValidateDosageApiResponse {
  data: {
    warning: DosageWarning | null;
  };
}

export function useDosageCalculation() {
  const { accessToken } = useAuth();
  const queryClient = useQueryClient();

  const validateDosage = useCallback(
    async (
      enteredDoseMg: number,
      petWeightKg: number,
      drugId: string,
      species: string,
    ): Promise<DosageWarning | null> => {
      // Try local validation first from cached drug data
      const cachedDrugs = queryClient.getQueryData<{ data: DrugEntry[] }>([
        'drugs',
      ]);
      if (cachedDrugs?.data) {
        const drug = cachedDrugs.data.find((d) => d.id === drugId);
        if (drug) {
          const speciesDosage = drug.dosageRanges.find(
            (r) => r.species.toLowerCase() === species.toLowerCase(),
          );
          if (speciesDosage) {
            let minMg: number;
            let maxMg: number;

            if (speciesDosage.isFixedDose) {
              minMg = speciesDosage.fixedDoseMin ?? 0;
              maxMg = speciesDosage.fixedDoseMax ?? Infinity;
            } else {
              minMg = speciesDosage.minDoseMgPerKg * petWeightKg;
              maxMg = speciesDosage.maxDoseMgPerKg * petWeightKg;
            }

            if (enteredDoseMg < minMg || enteredDoseMg > maxMg) {
              const dosePerKg =
                petWeightKg > 0 ? enteredDoseMg / petWeightKg : undefined;
              return {
                level: 'warning',
                message: `Recommended: ${speciesDosage.minDoseMgPerKg}-${speciesDosage.maxDoseMgPerKg} mg/kg (${minMg.toFixed(0)}-${maxMg.toFixed(0)}mg for ${petWeightKg}kg)`,
                enteredDose: enteredDoseMg,
                enteredDosePerKg: dosePerKg,
                recommendedMinMg: minMg,
                recommendedMaxMg: maxMg,
              };
            }
            return null;
          }
        }
      }

      // Fallback to server-side validation
      if (!accessToken) return null;
      try {
        const response = await apiClient<ValidateDosageApiResponse>(
          '/api/v1/consultations/validate-dosage',
          {
            method: 'POST',
            token: accessToken,
            body: JSON.stringify({
              enteredDoseMg,
              petWeightKg,
              drugId,
              species,
            }),
          },
        );
        return response.data.warning;
      } catch {
        // If validation API fails, allow the prescription to continue
        return null;
      }
    },
    [accessToken, queryClient],
  );

  const generateInstructions = useCallback(
    (prescription: Partial<PrescriptionItem>): string => {
      const parts: string[] = [];

      // Dosage part: "1 tablet (250mg)" or "250mg"
      if (prescription.formulation && prescription.strength) {
        parts.push(
          `${prescription.dosage || '1'} ${prescription.formulation} (${prescription.strength})`,
        );
      } else if (prescription.dosage) {
        // Free-text dosage (e.g. "250mg" or "5ml") already carries its own unit;
        // only append "mg" when the vet entered a bare number.
        const hasUnit = /[a-zA-Z]/.test(prescription.dosage);
        parts.push(hasUnit ? prescription.dosage : `${prescription.dosage}mg`);
      }

      // Route
      if (prescription.route) {
        const routeMap: Record<string, string> = {
          Oral: 'by mouth',
          'Injectable (IV)': 'intravenously',
          'Injectable (IM)': 'intramuscularly',
          'Injectable (SC)': 'subcutaneously',
          Topical: 'applied topically',
          'Eye Drops': 'in eye(s)',
          'Ear Drops': 'in ear(s)',
          Inhalation: 'via inhalation',
          Rectal: 'rectally',
        };
        parts.push(routeMap[prescription.route] || prescription.route);
      }

      // Frequency
      if (prescription.frequency) {
        parts.push(prescription.frequency.toLowerCase());
      }

      // Duration
      if (prescription.duration) {
        const dur = prescription.duration.toLowerCase();
        if (
          dur !== 'as needed (prn)' &&
          dur !== 'ongoing/chronic' &&
          dur !== 'until finished'
        ) {
          parts.push(`for ${dur}`);
        } else {
          parts.push(dur);
        }
      }

      return parts.join(' ') || '';
    },
    [],
  );

  return {
    validateDosage,
    generateInstructions,
  };
}
