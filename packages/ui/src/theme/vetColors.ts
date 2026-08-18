// These five hues are deliberately NOT semantic tokens so vet identity can
// never be mistaken for status, warning or CTA. Permitted uses are a 4px
// left rail, an 8px legend dot, and the border of the vet-initials chip;
// never a fill, background, text colour, badge or CTA.

export const vetColors = [
  '#1565C0',
  '#6A1B9A',
  '#00695C',
  '#AD1457',
  '#4E342E',
] as const;

export type VetColor = (typeof vetColors)[number];

export function vetColorForIndex(index: number): VetColor {
  return vetColors[((index % vetColors.length) + vetColors.length) % vetColors.length];
}

export function vetColorForId(
  vetId: string,
  sortedVetIds: readonly string[],
): VetColor | null {
  if (sortedVetIds.length <= 1) {
    return null;
  }
  return vetColorForIndex(sortedVetIds.indexOf(vetId));
}
