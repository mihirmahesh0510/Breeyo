export const DURATION_OPTIONS = [
  { value: '3 days', label: '3 days', days: 3 },
  { value: '5 days', label: '5 days', days: 5 },
  { value: '7 days', label: '7 days', days: 7 },
  { value: '10 days', label: '10 days', days: 10 },
  { value: '14 days', label: '14 days', days: 14 },
  { value: '30 days', label: '30 days', days: 30 },
  { value: 'Until finished', label: 'Until finished', days: null },
  { value: 'As needed (PRN)', label: 'As needed (PRN)', days: null },
  { value: 'Ongoing/Chronic', label: 'Ongoing/Chronic', days: null },
  { value: 'Custom', label: 'Custom', days: null },
] as const;
