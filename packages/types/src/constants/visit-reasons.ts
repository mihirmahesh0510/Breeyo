export const VISIT_REASONS = [
  { value: 'vaccination', label: 'Vaccination' },
  { value: 'sick_visit', label: 'Sick Visit' },
  { value: 'follow_up', label: 'Follow-up' },
  { value: 'deworming', label: 'Deworming' },
  { value: 'grooming', label: 'Grooming' },
  { value: 'other', label: 'Other' },
] as const;

export type VisitReason = (typeof VISIT_REASONS)[number]['value'];
