'use client';

import type { OwnerPortalPetSummary } from '@breeyo/types';
import styles from './PetSwitcher.module.css';

export interface PetSwitcherProps {
  pets: OwnerPortalPetSummary[];
  selectedPetId: string | null;
  onSelect: (petId: string) => void;
}

/**
 * D-58: multi-pet owners switch pet context without leaving the shared
 * portal shell -- Records and Invoices re-scope to the newly selected pet,
 * but the tab bar, trust banner, and help actions stay mounted throughout.
 *
 * D-49: an unpaid-invoice dot lets an owner scanning across pets see at a
 * glance which one has a balance due, without opening Invoices first.
 *
 * `PortalShell` only renders this at all for a multi-pet owner -- a
 * single-pet owner never sees a switcher with one option.
 */
export function PetSwitcher({ pets, selectedPetId, onSelect }: PetSwitcherProps) {
  if (pets.length <= 1) {
    return null;
  }

  return (
    <div className={styles.switcher} role="group" aria-label="Switch pet">
      {pets.map((pet) => {
        const isActive = pet.petId === selectedPetId;
        return (
          <button
            key={pet.petId}
            type="button"
            className={isActive ? `${styles.petButton} ${styles.petButtonActive}` : styles.petButton}
            aria-pressed={isActive}
            onClick={() => onSelect(pet.petId)}
          >
            {pet.name}
            {pet.hasUnpaidInvoice ? (
              <span className={styles.unpaidDot} aria-label={`${pet.name} has an unpaid invoice`} />
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
