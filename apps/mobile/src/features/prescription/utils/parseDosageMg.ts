/**
 * Extracts a numeric mg value from a free-text dosage entry, e.g. "250mg" -> 250.
 * Bare numbers (no unit) are treated as mg for backward compatibility.
 * Non-mg units (e.g. "5ml") or unparseable input return null so the
 * species-dosage-range check can be skipped rather than crash.
 *
 * Kept in its own module (rather than inline in MedicationForm.tsx) so it can be
 * unit-tested without pulling in `react-native` / JSX at import time.
 */
export function parseDosageMg(input: string): number | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  const match = trimmed.match(/^(\d+(?:\.\d+)?)\s*([a-zA-Z]*)/);
  if (!match) return null;

  const value = parseFloat(match[1]);
  if (Number.isNaN(value)) return null;

  const unit = (match[2] || '').toLowerCase();
  if (unit === '' || unit === 'mg') return value;
  return null;
}
