'use client';

// D-23: the calendar's default view is all vets combined, colour-coded and
// labelled, with a filter to narrow to one vet. Hidden entirely for a
// solo-vet clinic -- zero chroma cost for the majority persona (UI-SPEC §
// Vet identity palette).
import type { ClinicVet } from '../../src/lib/useSchedule';
import styles from './schedule.module.css';

// D-23's deterministic vet-hue assignment (packages/ui/src/theme/vetColors.ts's
// `vetColorForIndex`), reimplemented as a tiny pure index computation rather
// than imported: `@breeyo/ui`'s package entrypoint (`src/index.ts`) barrels
// together atoms/molecules/organisms that pull in `react-native-paper` and
// other React Native-only dependencies, so nothing may be imported from it
// into `apps/web/app/schedule/*.tsx` except `portal.css` (already imported
// in the root layout). The `--vet-hue-1`..`--vet-hue-5` custom properties
// are read here via the `vetHue{n}` CSS module classes instead.
const VET_HUE_CLASSES = [styles.vetHue0, styles.vetHue1, styles.vetHue2, styles.vetHue3, styles.vetHue4];

export function vetHueClassName(vetId: string, sortedVetIds: readonly string[]): string | null {
  if (sortedVetIds.length <= 1) {
    return null;
  }
  const index = sortedVetIds.indexOf(vetId);
  if (index === -1) {
    return null;
  }
  return VET_HUE_CLASSES[index % VET_HUE_CLASSES.length];
}

export interface VetLegendProps {
  vets: ClinicVet[];
  selectedVetId: string | null;
  onSelect: (vetId: string | null) => void;
}

export function VetLegend({ vets, selectedVetId, onSelect }: VetLegendProps) {
  // Solo-vet clinics never see a legend or filter -- there is nothing to
  // disambiguate (UI-SPEC § Vet identity palette).
  if (vets.length <= 1) {
    return null;
  }

  const sortedVetIds = vets.map((vet) => vet.id);

  return (
    <div className={styles.legendRow} role="group" aria-label="Filter by vet">
      <button
        type="button"
        className={`${styles.legendItem} ${selectedVetId === null ? styles.legendItemSelected : ''}`}
        onClick={() => onSelect(null)}
        aria-pressed={selectedVetId === null}
      >
        All Vets
      </button>
      {vets.map((vet) => {
        const hueClass = vetHueClassName(vet.id, sortedVetIds);
        return (
          <button
            key={vet.id}
            type="button"
            className={`${styles.legendItem} ${selectedVetId === vet.id ? styles.legendItemSelected : ''}`}
            onClick={() => onSelect(vet.id)}
            aria-pressed={selectedVetId === vet.id}
          >
            {hueClass ? <span className={`${styles.legendDot} ${hueClass}`} aria-hidden="true" /> : null}
            {vet.name}
          </button>
        );
      })}
    </div>
  );
}
